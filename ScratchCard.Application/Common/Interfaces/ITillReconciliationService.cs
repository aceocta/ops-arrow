using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Common.Interfaces;

/// <summary>Phase 1 till reconciliation: capture canonical lines, count cash, compute over/short,
/// record a variance reason and sign off.</summary>
public interface ITillReconciliationService
{
    Task<TillReconciliationDto> GetOrCreateAsync(GetOrCreateReconciliationRequest request, CancellationToken cancellationToken = default);
    Task<TillReconciliationDto> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<TillReconciliationDto>> ListAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);

    Task<TillReconciliationDto> SaveLineAsync(SaveReconciliationLineRequest request, CancellationToken cancellationToken = default);
    Task<TillReconciliationDto> DeleteLineAsync(Guid lineId, CancellationToken cancellationToken = default);

    /// <summary>Undo an auto-ignored line: bring it back as Unmapped and forget the learned ignore rule.</summary>
    Task<TillReconciliationDto> RestoreLineAsync(Guid lineId, CancellationToken cancellationToken = default);

    Task<TillReconciliationDto> SetCashCountAsync(SetCashCountRequest request, CancellationToken cancellationToken = default);
    Task<TillReconciliationDto> SetVarianceReasonAsync(SetVarianceReasonRequest request, CancellationToken cancellationToken = default);
    Task<TillReconciliationDto> SetStatusAsync(Guid id, TillReconciliationStatus status, CancellationToken cancellationToken = default);

    /// <summary>Undo a photo upload — removes the attachment, its image and the lines it produced.</summary>
    Task<TillReconciliationDto> DeleteAttachmentAsync(Guid attachmentId, CancellationToken cancellationToken = default);

    /// <summary>Reopen an approved (locked) reconciliation back to editable. Management only.</summary>
    Task<TillReconciliationDto> ReopenAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Erase a reconciliation entirely (lines, photos, cash count). Management only.</summary>
    Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);

    /// <summary>Phase 2: OCR a captured photo, section + resolve its lines to canonical fields, and
    /// add them as draft (Captured) lines for the verify step.</summary>
    Task<TillReconciliationDto> IngestPhotoAsync(Guid reconciliationId, byte[] content, string contentType, string fileName, string? sourceLabel, CancellationToken cancellationToken = default);

    /// <summary>Phase 2: aggregate all of a shop's till reconciliations for a date.</summary>
    Task<TillRollupDto> GetRollupAsync(Guid shopId, DateOnly businessDate, CancellationToken cancellationToken = default);

    /// <summary>Phase 2: per-staff variance/exception analytics over a date range (loss prevention).</summary>
    Task<TillAnalyticsDto> GetAnalyticsAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);

    /// <summary>Returns a captured photo as a data URL (base64) for viewing/download.</summary>
    Task<string?> GetAttachmentContentAsync(Guid attachmentId, CancellationToken cancellationToken = default);
}
