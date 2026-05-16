namespace ScratchCard.Application.Common.Interfaces;

public interface IAttachmentStorageService
{
    Task<string> SaveAsync(byte[] content, string relativePath, CancellationToken cancellationToken = default);
    Task<byte[]?> ReadAsync(string? storedPath, CancellationToken cancellationToken = default);
    Task DeleteIfExistsAsync(string? storedPath, CancellationToken cancellationToken = default);
}
