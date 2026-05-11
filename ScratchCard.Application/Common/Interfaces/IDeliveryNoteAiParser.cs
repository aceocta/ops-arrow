using ScratchCard.Application.Common.Models;

namespace ScratchCard.Application.Common.Interfaces;

public interface IDeliveryNoteAiParser
{
    Task<DeliveryNoteAiParseResult> ParseAsync(
        byte[] imageBytes,
        string contentType,
        string fileName,
        CancellationToken cancellationToken = default);
}
