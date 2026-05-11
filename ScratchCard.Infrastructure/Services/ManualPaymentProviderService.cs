using ScratchCard.Application.Common.Services;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Infrastructure.Services;

public class ManualPaymentProviderService : IPaymentProviderService
{
    public Task<string> CreateCustomerAsync(Guid companyId, string email, string name, CancellationToken cancellationToken = default)
        => Task.FromResult($"manual-customer-{companyId:N}");

    public Task<string> CreateCheckoutSessionAsync(Guid companySubscriptionId, decimal amount, string currency, CancellationToken cancellationToken = default)
        => Task.FromResult($"manual-checkout-{companySubscriptionId:N}");

    public Task<PaymentStatus> GetPaymentStatusAsync(string providerTransactionId, CancellationToken cancellationToken = default)
        => Task.FromResult(PaymentStatus.Pending);

    public Task CancelSubscriptionAsync(string providerSubscriptionId, CancellationToken cancellationToken = default)
        => Task.CompletedTask;

    public Task HandleWebhookAsync(string payload, CancellationToken cancellationToken = default)
        => Task.CompletedTask;
}
