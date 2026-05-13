using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.DTOs.Common;

namespace ScratchCard.Application.Services;

internal static class CloseAttachmentStorage
{
    private const int MaxAttachmentSizeBytes = 10 * 1024 * 1024;

    internal sealed record AttachmentInput(string? FileName, string? Base64, string? ContentType);
    internal sealed record SavedAttachment(
        string OriginalFileName,
        string StoredFileName,
        string StoredPath,
        string? ContentType,
        long FileSizeBytes);

    public static IReadOnlyCollection<AttachmentInput> BuildInputs(
        IReadOnlyCollection<CloseAttachmentUploadRequest>? attachments,
        string? legacyAttachmentFileName,
        string? legacyAttachmentBase64,
        string? legacyAttachmentContentType = null)
    {
        if (attachments is not null && attachments.Count > 0)
        {
            return attachments
                .Select(x => new AttachmentInput(x.FileName, x.Base64, x.ContentType))
                .ToArray();
        }

        if (!string.IsNullOrWhiteSpace(legacyAttachmentBase64))
        {
            return
            [
                new AttachmentInput(legacyAttachmentFileName, legacyAttachmentBase64, legacyAttachmentContentType)
            ];
        }

        return [];
    }

    public static async Task<IReadOnlyCollection<SavedAttachment>> SaveShiftAttachmentsAsync(
        IReadOnlyCollection<AttachmentInput> inputs,
        Guid shopId,
        DateOnly businessDate,
        string shiftName,
        CancellationToken cancellationToken)
    {
        if (inputs.Count == 0)
        {
            return [];
        }

        var sectionFolder = "ShiftCloseAttachments";
        var safeShiftName = SanitizeToken(shiftName, fallback: "shift", maxLength: 80);
        var saved = new List<SavedAttachment>(inputs.Count);

        foreach (var input in inputs)
        {
            if (string.IsNullOrWhiteSpace(input.Base64))
            {
                continue;
            }

            var parsed = ParseAttachment(input.FileName, input.Base64, input.ContentType);
            var fileGuid = Guid.NewGuid().ToString("N");
            var storedFileName = $"{fileGuid}_{businessDate:yyyyMMdd}_{safeShiftName}{parsed.Extension}";
            var storedPath = await SaveBytesAsync(
                parsed.Bytes,
                storedFileName,
                sectionFolder,
                shopId,
                businessDate,
                cancellationToken);

            saved.Add(new SavedAttachment(
                parsed.OriginalFileName,
                storedFileName,
                storedPath,
                parsed.ContentType,
                parsed.Bytes.Length));
        }

        return saved;
    }

    public static async Task<IReadOnlyCollection<SavedAttachment>> SaveDayAttachmentsAsync(
        IReadOnlyCollection<AttachmentInput> inputs,
        Guid shopId,
        DateOnly businessDate,
        CancellationToken cancellationToken)
    {
        if (inputs.Count == 0)
        {
            return [];
        }

        const string sectionFolder = "DayCloseAttachments";
        var saved = new List<SavedAttachment>(inputs.Count);

        foreach (var input in inputs)
        {
            if (string.IsNullOrWhiteSpace(input.Base64))
            {
                continue;
            }

            var parsed = ParseAttachment(input.FileName, input.Base64, input.ContentType);
            var fileGuid = Guid.NewGuid().ToString("N");
            var storedFileName = $"{fileGuid}_{businessDate:yyyyMMdd}{parsed.Extension}";
            var storedPath = await SaveBytesAsync(
                parsed.Bytes,
                storedFileName,
                sectionFolder,
                shopId,
                businessDate,
                cancellationToken);

            saved.Add(new SavedAttachment(
                parsed.OriginalFileName,
                storedFileName,
                storedPath,
                parsed.ContentType,
                parsed.Bytes.Length));
        }

        return saved;
    }

    public static void TryDelete(string? storedPath)
    {
        if (string.IsNullOrWhiteSpace(storedPath))
        {
            return;
        }

        try
        {
            if (File.Exists(storedPath))
            {
                File.Delete(storedPath);
            }
        }
        catch
        {
            // Attachment cleanup failures must not block business operations.
        }
    }

    private static async Task<string> SaveBytesAsync(
        byte[] bytes,
        string storedFileName,
        string sectionFolder,
        Guid shopId,
        DateOnly businessDate,
        CancellationToken cancellationToken)
    {
        var rootPath = ResolveProjectRootPath();
        var folderPath = Path.Combine(
            rootPath,
            "SignatureUploads",
            sectionFolder,
            shopId.ToString("N"),
            businessDate.ToString("yyyyMMdd"));

        Directory.CreateDirectory(folderPath);

        var fullPath = Path.Combine(folderPath, storedFileName);
        await File.WriteAllBytesAsync(fullPath, bytes, cancellationToken);
        return fullPath;
    }

    private sealed record ParsedAttachment(
        string OriginalFileName,
        string Extension,
        byte[] Bytes,
        string? ContentType);

    private static ParsedAttachment ParseAttachment(
        string? rawFileName,
        string rawBase64,
        string? rawContentType)
    {
        var bytes = ParseAttachmentBytes(rawBase64);
        var safeOriginalFileName = BuildSafeOriginalFileName(rawFileName);
        var extension = ResolveExtension(safeOriginalFileName, rawContentType);
        var contentType = NormalizeContentType(rawContentType);

        return new ParsedAttachment(safeOriginalFileName, extension, bytes, contentType);
    }

    private static byte[] ParseAttachmentBytes(string attachmentBase64)
    {
        const string marker = "base64,";
        var markerIndex = attachmentBase64.IndexOf(marker, StringComparison.OrdinalIgnoreCase);
        var payload = markerIndex >= 0 ? attachmentBase64[(markerIndex + marker.Length)..] : attachmentBase64;
        payload = payload.Trim();

        byte[] bytes;
        try
        {
            bytes = Convert.FromBase64String(payload);
        }
        catch (FormatException)
        {
            throw new AppException("validation_failed", "AttachmentBase64 is not valid base64 content.", 400);
        }

        if (bytes.Length == 0)
        {
            throw new AppException("validation_failed", "Attachment file is empty.", 400);
        }

        if (bytes.Length > MaxAttachmentSizeBytes)
        {
            throw new AppException("validation_failed", "Attachment exceeds 10MB size limit.", 400);
        }

        return bytes;
    }

    private static string BuildSafeOriginalFileName(string? rawFileName)
    {
        var candidate = string.IsNullOrWhiteSpace(rawFileName) ? "close-attachment.bin" : rawFileName.Trim();
        var sanitized = string.Concat(candidate.Where(ch => !Path.GetInvalidFileNameChars().Contains(ch))).Trim();

        if (string.IsNullOrWhiteSpace(sanitized))
        {
            return "close-attachment.bin";
        }

        if (sanitized.Length <= 260)
        {
            return sanitized;
        }

        return sanitized[..260].TrimEnd();
    }

    private static string ResolveExtension(string safeOriginalFileName, string? rawContentType)
    {
        var extension = Path.GetExtension(safeOriginalFileName);
        if (!string.IsNullOrWhiteSpace(extension) && extension.Length <= 10)
        {
            return extension.ToLowerInvariant();
        }

        var contentType = NormalizeContentType(rawContentType);
        return contentType?.ToLowerInvariant() switch
        {
            "image/jpeg" => ".jpg",
            "image/png" => ".png",
            "image/webp" => ".webp",
            "application/pdf" => ".pdf",
            "text/plain" => ".txt",
            _ => ".bin"
        };
    }

    private static string? NormalizeContentType(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType))
        {
            return null;
        }

        var trimmed = contentType.Trim();
        return trimmed.Length <= 120 ? trimmed : trimmed[..120].TrimEnd();
    }

    private static string SanitizeToken(string? rawValue, string fallback, int maxLength)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
        {
            return fallback;
        }

        var filtered = new string(rawValue
            .Trim()
            .Select(ch => char.IsLetterOrDigit(ch) ? ch : '_')
            .ToArray());

        filtered = string.Join("_", filtered.Split('_', StringSplitOptions.RemoveEmptyEntries));
        if (string.IsNullOrWhiteSpace(filtered))
        {
            return fallback;
        }

        if (filtered.Length <= maxLength)
        {
            return filtered;
        }

        return filtered[..maxLength].TrimEnd('_');
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
