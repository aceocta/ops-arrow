using Amazon;
using Amazon.S3;
using Amazon.S3.Model;
using Azure;
using Azure.Storage.Blobs;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Interfaces;

namespace ScratchCard.Infrastructure.Services;

public sealed class AttachmentStorageOptions
{
    /// <summary>
    /// Which backend to write new attachments to: "AzureBlob", "S3", or "Local".
    /// When unset, falls back to <see cref="UseBlobStorage"/> (AzureBlob/Local) for compatibility.
    /// Reads and deletes always route by the stored path's prefix, so switching providers does not
    /// break access to files written under the previous provider.
    /// </summary>
    public string? Provider { get; set; }

    public bool UseBlobStorage { get; set; } = true;
    public string? ContainerName { get; set; }
    public string RootFolder { get; set; } = "SignatureUploads";

    // --- AWS S3 settings (used when Provider = "S3", or to read existing s3:// attachments) ---
    public string? S3BucketName { get; set; }
    public string? S3Region { get; set; }
    public string? S3AccessKeyId { get; set; }
    public string? S3SecretAccessKey { get; set; }
    /// <summary>Optional custom endpoint for S3-compatible storage (e.g. MinIO). Enables path-style.</summary>
    public string? S3ServiceUrl { get; set; }
}

public sealed class AttachmentStorageService : IAttachmentStorageService
{
    private const string BlobPathPrefix = "blob://";
    private const string S3PathPrefix = "s3://";

    private enum StorageProvider { Local, AzureBlob, S3 }

    private readonly AttachmentStorageOptions _options;
    private readonly StorageProvider _provider;
    private readonly string? _blobConnectionString;
    private readonly SemaphoreSlim _blobContainerInitLock = new(1, 1);
    private BlobContainerClient? _blobContainerClient;
    private bool _blobContainerInitialized;

    private readonly object _s3Lock = new();
    private IAmazonS3? _s3Client;

    public AttachmentStorageService(IConfiguration configuration, IOptions<AttachmentStorageOptions> options)
    {
        _options = options.Value ?? new AttachmentStorageOptions();
        _blobConnectionString = configuration.GetConnectionString("AttachmentBlobStorage");
        _provider = ResolveProvider(_options);

        if (_provider == StorageProvider.AzureBlob && string.IsNullOrWhiteSpace(_blobConnectionString))
        {
            throw new InvalidOperationException(
                "AttachmentStorage provider is AzureBlob but ConnectionStrings:AttachmentBlobStorage is missing.");
        }

        if (_provider == StorageProvider.S3 && string.IsNullOrWhiteSpace(_options.S3BucketName))
        {
            throw new InvalidOperationException(
                "AttachmentStorage provider is S3 but AttachmentStorage:S3BucketName is missing.");
        }
    }

    private static StorageProvider ResolveProvider(AttachmentStorageOptions options)
    {
        if (!string.IsNullOrWhiteSpace(options.Provider))
        {
            return options.Provider.Trim().ToLowerInvariant() switch
            {
                "s3" or "aws" or "awss3" => StorageProvider.S3,
                "azureblob" or "azure" or "blob" => StorageProvider.AzureBlob,
                "local" or "file" or "filesystem" => StorageProvider.Local,
                _ => throw new InvalidOperationException(
                    $"AttachmentStorage:Provider '{options.Provider}' is not recognised. Use AzureBlob, S3, or Local."),
            };
        }

        // Backward compatible default: the old UseBlobStorage flag.
        return options.UseBlobStorage ? StorageProvider.AzureBlob : StorageProvider.Local;
    }

    public async Task<string> SaveAsync(byte[] content, string relativePath, CancellationToken cancellationToken = default)
    {
        var normalizedRelativePath = NormalizeRelativePath(relativePath);
        if (string.IsNullOrWhiteSpace(normalizedRelativePath))
        {
            throw new ArgumentException("Attachment relative path is required.", nameof(relativePath));
        }

        if (_provider == StorageProvider.S3)
        {
            var bucket = _options.S3BucketName!;
            var key = normalizedRelativePath;
            using var stream = new MemoryStream(content, writable: false);
            await GetS3Client().PutObjectAsync(
                new PutObjectRequest
                {
                    BucketName = bucket,
                    Key = key,
                    InputStream = stream,
                    AutoCloseStream = false,
                },
                cancellationToken);

            return BuildS3StoredPath(bucket, key);
        }

        if (_provider == StorageProvider.AzureBlob)
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

        if (TryParseS3StoredPath(storedPath, out var s3Bucket, out var s3Key))
        {
            if (!IsS3Configured())
            {
                return null;
            }

            try
            {
                using var response = await GetS3Client().GetObjectAsync(s3Bucket, s3Key, cancellationToken);
                using var output = new MemoryStream();
                await response.ResponseStream.CopyToAsync(output, cancellationToken);
                return output.ToArray();
            }
            catch (AmazonS3Exception ex) when (ex.StatusCode == System.Net.HttpStatusCode.NotFound)
            {
                return null;
            }
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
            if (TryParseS3StoredPath(storedPath, out var s3Bucket, out var s3Key))
            {
                if (!IsS3Configured())
                {
                    return;
                }

                await GetS3Client().DeleteObjectAsync(s3Bucket, s3Key, cancellationToken);
                return;
            }

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

    private bool IsS3Configured()
    {
        return !string.IsNullOrWhiteSpace(_options.S3BucketName)
            || !string.IsNullOrWhiteSpace(_options.S3Region)
            || !string.IsNullOrWhiteSpace(_options.S3ServiceUrl);
    }

    private IAmazonS3 GetS3Client()
    {
        if (_s3Client is not null)
        {
            return _s3Client;
        }

        lock (_s3Lock)
        {
            if (_s3Client is not null)
            {
                return _s3Client;
            }

            var config = new AmazonS3Config();
            if (!string.IsNullOrWhiteSpace(_options.S3ServiceUrl))
            {
                // S3-compatible endpoint (e.g. MinIO/DigitalOcean Spaces) — path-style addressing.
                config.ServiceURL = _options.S3ServiceUrl;
                config.ForcePathStyle = true;
            }
            else if (!string.IsNullOrWhiteSpace(_options.S3Region))
            {
                config.RegionEndpoint = RegionEndpoint.GetBySystemName(_options.S3Region);
            }

            // Explicit keys when provided; otherwise fall back to the default AWS credential chain
            // (environment, shared config, IAM role, etc.).
            _s3Client = !string.IsNullOrWhiteSpace(_options.S3AccessKeyId) && !string.IsNullOrWhiteSpace(_options.S3SecretAccessKey)
                ? new AmazonS3Client(_options.S3AccessKeyId, _options.S3SecretAccessKey, config)
                : new AmazonS3Client(config);

            return _s3Client;
        }
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

    private static string BuildS3StoredPath(string bucketName, string key)
    {
        return $"{S3PathPrefix}{bucketName}/{key}";
    }

    private static bool TryParseS3StoredPath(string storedPath, out string bucketName, out string key)
    {
        bucketName = string.Empty;
        key = string.Empty;

        if (!storedPath.StartsWith(S3PathPrefix, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var value = storedPath[S3PathPrefix.Length..].TrimStart('/');
        var separatorIndex = value.IndexOf('/');
        if (separatorIndex <= 0 || separatorIndex == value.Length - 1)
        {
            return false;
        }

        bucketName = value[..separatorIndex];
        key = value[(separatorIndex + 1)..];
        return true;
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
