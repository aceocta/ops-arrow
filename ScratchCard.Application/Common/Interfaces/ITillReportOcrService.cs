using ScratchCard.Application.Common.Models;

namespace ScratchCard.Application.Common.Interfaces;

public interface ITillReportOcrService
{
    Task<TillOcrResult> ExtractAsync(
        byte[] content,
        string contentType,
        string fileName,
        CancellationToken cancellationToken = default);
}
