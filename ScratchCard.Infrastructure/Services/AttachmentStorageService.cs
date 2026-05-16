using Azure;
using Azure.Storage.Blobs;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Interfaces;

namespace ScratchCard.Infrastructure.Services;

public sealed class AttachmentStorageOptions
{
    public bool UseBlobStorage { get; set; } = true;
    public string? ContainerName { get; set; }
    public string RootFolder { get; set; } = "SignatureUploads";
}

public sealed class AttachmentStorageService : IAttachmentStorageService
{
    private const string BlobPathPrefix = "blob://";
    private readonly AttachmentStorageOptions _options;
    private readonly string? _blobConnectionString;
    private readonly SemaphoreSlim _blobContainerInitLock = new(1, 1);
    private BlobContainerClient? _blobContainerClient;
    private bool _blobContainerInitialized;

    public AttachmentStorageService(IConfiguration configuration, IOptions<AttachmentStorageOptions> options)
    {
        _options = options.Value ?? new AttachmentStorageOptions();
        _blobConnectionString = configuration.GetConnectionString("AttachmentBlobStorage");

        if (_options.UseBlobStorage && string.IsNullOrWhiteSpace(_blobConnectionString))
        {
            throw new InvalidOperationException(
                "AttachmentStorage is enabled but ConnectionStrings:AttachmentBlobStorage is missing.");
        }
    }

    public async Task<string> SaveAsync(byte[] content, string relativePath, CancellationToken cancellationToken = default)
    {
        var normalizedRelativePath = NormalizeRelativePath(relativePath);
        if (string.IsNullOrWhiteSpace(normalizedRelativePath))
        {
            throw new ArgumentException("Attachment relative path is required.", nameof(relativePath));
        }

        if (ShouldUseBlobStorage())
        {
            var blobName = normalizedRelativePath;
            var containerClient = await GetContainerClientAsync(cancellationToken);
            var blobClient = containerClient.GetBlobClient(blobName);

            using var stream = new MemoryStream(content, writable: false);
            await blobClient.UploadAsync(stream, overwrite: true, cancellationToken);

            return BuildBlobStoredPath(containerClient.Name, blobName);
        }

        var fullPath = ResolveLocalPath(normalizedRelativePath);
        var directoryPath = Path.GetDirectoryName(fullPath);
        if (!string.IsNullOrWhiteSpace(directoryPath))
        {
            Directory.CreateDirectory(directoryPath);
        }

        await File.WriteAllBytesAsync(fullPath, content, cancellationToken);
        return fullPath;
    }

    public async Task<byte[]?> ReadAsync(string? storedPath, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(storedPath))
        {
            return null;
        }

        if (TryParseBlobStoredPath(storedPath, out var containerName, out var blobName))
        {
            if (string.IsNullOrWhiteSpace(_blobConnectionString))
            {
                return null;
            }

            try
            {
                var containerClient = new BlobContainerClient(_blobConnectionString, containerName);
                var blobClient = containerClient.GetBlobClient(blobName);
                if (!await blobClient.ExistsAsync(cancellationToken))
                {
                    return null;
                }

                using var output = new MemoryStream();
                await blobClient.DownloadToAsync(output, cancellationToken);
                return output.ToArray();
            }
            catch (RequestFailedException ex) when (ex.Status == 404)
            {
                return null;
            }
        }

        var localPath = ResolveLocalStoredPath(storedPath);
        if (!File.Exists(localPath))
        {
            return null;
        }

        return await File.ReadAllBytesAsync(localPath, cancellationToken);
    }

    public async Task DeleteIfExistsAsync(string? storedPath, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(storedPath))
        {
            return;
        }

        try
        {
            if (TryParseBlobStoredPath(storedPath, out var containerName, out var blobName))
            {
                if (string.IsNullOrWhiteSpace(_blobConnectionString))
                {
                    return;
                }

                var containerClient = new BlobContainerClient(_blobConnectionString, containerName);
                var blobClient = containerClient.GetBlobClient(blobName);
                await blobClient.DeleteIfExistsAsync(cancellationToken: cancellationToken);
                return;
            }

            var localPath = ResolveLocalStoredPath(storedPath);
            if (File.Exists(localPath))
            {
                File.Delete(localPath);
            }
        }
        catch
        {
            // Attachment cleanup failures must not block business operations.
        }
    }

    private bool ShouldUseBlobStorage()
    {
        return _options.UseBlobStorage;
    }

    private async Task<BlobContainerClient> GetContainerClientAsync(CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(_blobConnectionString))
        {
            throw new InvalidOperationException("Attachment blob storage connection string is missing.");
        }

        if (_blobContainerClient is not null && _blobContainerInitialized)
        {
            return _blobContainerClient;
        }

        await _blobContainerInitLock.WaitAsync(cancellationToken);
        try
        {
            if (_blobContainerClient is null)
            {
                var containerName = NormalizeContainerName(_options.ContainerName);
                _blobContainerClient = new BlobContainerClient(_blobConnectionString, containerName);
            }

            if (!_blobContainerInitialized)
            {
                await _blobContainerClient.CreateIfNotExistsAsync(cancellationToken: cancellationToken);
                _blobContainerInitialized = true;
            }

            return _blobContainerClient;
        }
        finally
        {
            _blobContainerInitLock.Release();
        }
    }

    private string ResolveLocalStoredPath(string storedPath)
    {
        var normalized = storedPath.Trim();
        if (normalized.StartsWith("file://", StringComparison.OrdinalIgnoreCase))
        {
            normalized = normalized["file://".Length..];
        }

        if (Path.IsPathRooted(normalized))
        {
            return normalized;
        }

        return ResolveLocalPath(NormalizeRelativePath(normalized));
    }

    private string ResolveLocalPath(string normalizedRelativePath)
    {
        var rootPath = ResolveProjectRootPath();
        var rootFolder = NormalizeRelativePath(_options.RootFolder);
        var combinedRelativePath = string.IsNullOrWhiteSpace(rootFolder)
            ? normalizedRelativePath
            : $"{rootFolder}/{normalizedRelativePath}";
        var localRelativePath = combinedRelativePath.Replace('/', Path.DirectorySeparatorChar);
        return Path.Combine(rootPath, localRelativePath);
    }

    private static string BuildBlobStoredPath(string containerName, string blobName)
    {
        return $"{BlobPathPrefix}{containerName}/{blobName}";
    }

    private static bool TryParseBlobStoredPath(string storedPath, out string containerName, out string blobName)
    {
        containerName = string.Empty;
        blobName = string.Empty;

        if (!storedPath.StartsWith(BlobPathPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var value = storedPath[BlobPathPrefix.Length..].TrimStart('/');
        var separatorIndex = value.IndexOf('/');
        if (separatorIndex <= 0 || separatorIndex == value.Length - 1)
        {
            return false;
        }

        containerName = value[..separatorIndex];
        blobName = value[(separatorIndex + 1)..];
        return true;
    }

    private static string NormalizeContainerName(string? containerName)
    {
        if (string.IsNullOrWhiteSpace(containerName))
        {
            throw new InvalidOperationException(
                "AttachmentStorage:ContainerName is required when blob storage is enabled.");
        }

        var candidate = containerName.Trim().ToLowerInvariant();

        var normalized = new string(candidate
            .Select(ch => char.IsLetterOrDigit(ch) ? char.ToLowerInvariant(ch) : '-')
            .ToArray());

        while (normalized.Contains("--", StringComparison.Ordinal))
        {
            normalized = normalized.Replace("--", "-", StringComparison.Ordinal);
        }

        normalized = normalized.Trim('-');
        if (normalized.Length > 63)
        {
            normalized = normalized[..63].TrimEnd('-');
        }

        if (normalized.Length < 3)
        {
            throw new InvalidOperationException(
                "AttachmentStorage:ContainerName is invalid. It must be at least 3 valid characters.");
        }

        return normalized;
    }

    private static string NormalizeRelativePath(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
        {
            return string.Empty;
        }

        return string.Join('/',
            path.Trim()
                .Replace('\\', '/')
                .Split('/', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
    }

    private static string ResolveProjectRootPath()
    {
        var current = new DirectoryInfo(Directory.GetCurrentDirectory());
        while (current is not null)
        {
            var solutionPath = Path.Combine(current.FullName, "ScratchCard.slnx");
            if (File.Exists(solutionPath))
            {
                return current.FullName;
            }

            current = current.Parent;
        }

        return Directory.GetCurrentDirectory();
    }
}
