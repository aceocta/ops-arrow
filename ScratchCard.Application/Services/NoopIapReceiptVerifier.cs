using ScratchCard.Application.Common.Services;

namespace ScratchCard.Application.Services;

/// <summary>
/// DEFAULT, DEVELOPMENT-ONLY verifier. Trusts the client-supplied receipt and reports it as
/// valid. Replace this binding in Infrastructure with a real implementation (App Store Server API
/// / Google Play Developer API / RevenueCat secure webhook) before going to production.
/// </summary>
public sealed class NoopIapReceiptVerifier : IIapReceiptVerifier
{
    public Task<IapReceiptVerification> VerifyAsync(IapReceiptVerificationRequest request, CancellationToken cancellationToken = default)
    {
        return Task.FromResult(new IapReceiptVerification
        {
            IsValid = true,
            Reason = "noop-development-verifier",
            ResolvedProductId = request.ProductId,
            PurchaseDate = DateTimeOffset.UtcNow,
        });
    }
}
