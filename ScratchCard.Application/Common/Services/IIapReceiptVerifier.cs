namespace ScratchCard.Application.Common.Services;

/// <summary>
/// Verifies an in-app-purchase receipt against the store (App Store Server API / Google Play
/// Developer API) or a signed source of truth like RevenueCat. The current default implementation
/// (<see cref="ScratchCard.Application.Services.NoopIapReceiptVerifier"/>) returns <c>true</c>; it
/// MUST be replaced with a real implementation before production launch.
/// </summary>
public interface IIapReceiptVerifier
{
    Task<IapReceiptVerification> VerifyAsync(IapReceiptVerificationRequest request, CancellationToken cancellationToken = default);
}

public class IapReceiptVerificationRequest
{
    public string Platform { get; set; } = string.Empty; // "ios" | "android"
    public string ProductId { get; set; } = string.Empty;
    public string TransactionId { get; set; } = string.Empty;
    public string? PurchaseToken { get; set; }
    public string? OriginalTransactionId { get; set; }
    public string? ReceiptData { get; set; }
}

public class IapReceiptVerification
{
    public bool IsValid { get; set; }
    public string? Reason { get; set; }
    public DateTimeOffset? PurchaseDate { get; set; }
    public DateTimeOffset? ExpiresDate { get; set; }
    /// <summary>Normalised product identifier as returned by the store.</summary>
    public string? ResolvedProductId { get; set; }
}
