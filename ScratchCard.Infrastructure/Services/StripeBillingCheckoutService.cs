using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Domain.Entities;
using Stripe;
using Stripe.Checkout;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// Creates a Stripe Checkout Session for a specific shop + plan. The session URL is opened by
/// the mobile app in an external browser. Stripe collects payment and sends a webhook (via
/// RevenueCat in our current setup); the existing ApplyRevenueCatEventAsync then activates the
/// ShopSubscription.
/// </summary>
public sealed class StripeBillingCheckoutService : IBillingCheckoutService
{
    private readonly IRepository<Shop> _shopRepository;
    private readonly IRepository<SubscriptionPlan> _planRepository;
    private readonly StripeOptions _options;

    public StripeBillingCheckoutService(
        IRepository<Shop> shopRepository,
        IRepository<SubscriptionPlan> planRepository,
        IOptions<StripeOptions> options)
    {
        _shopRepository = shopRepository;
        _planRepository = planRepository;
        _options = options.Value;

        if (!string.IsNullOrWhiteSpace(_options.SecretKey))
        {
            // Stripe.net uses a static API key; setting it here makes the whole process talk to
            // the same Stripe account. Safe to call repeatedly.
            StripeConfiguration.ApiKey = _options.SecretKey;
        }
    }

    public async Task<BillingCheckoutSession> CreateCheckoutSessionAsync(BillingCheckoutRequest request, CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(_options.SecretKey))
        {
            throw new AppException("billing_not_configured", "Stripe is not configured on this environment.", 503);
        }

        var shop = await _shopRepository.GetByIdAsync(request.ShopId, cancellationToken)
            ?? throw new AppException("shop_not_found", "Shop not found.", 404);

        var plan = await _planRepository.GetByIdAsync(request.PlanId, cancellationToken)
            ?? throw new AppException("plan_not_found", "Plan not found.", 404);

        if (!_options.PriceIds.TryGetValue(plan.Name, out var priceId) || string.IsNullOrWhiteSpace(priceId))
        {
            throw new AppException(
                "stripe_price_not_configured",
                $"Stripe Price ID for plan '{plan.Name}' is not configured. Add it to appsettings under Stripe:PriceIds.",
                500);
        }

        var sessionOptions = new SessionCreateOptions
        {
            Mode = "subscription",
            LineItems =
            [
                new SessionLineItemOptions { Price = priceId, Quantity = 1 },
            ],
            SuccessUrl = _options.SuccessUrl,
            CancelUrl = _options.CancelUrl,
            CustomerEmail = string.IsNullOrWhiteSpace(request.CustomerEmail) ? null : request.CustomerEmail,
            // The metadata is forwarded by Stripe → RevenueCat → our webhook so we can resolve the
            // ShopSubscription row. ShopId here also flows into the RevenueCat appUserId via the
            // ClientReferenceId field (RevenueCat reads it as the App User ID for the purchase).
            ClientReferenceId = shop.Id.ToString(),
            SubscriptionData = new SessionSubscriptionDataOptions
            {
                Metadata = new Dictionary<string, string>
                {
                    ["shop_id"] = shop.Id.ToString(),
                    ["shop_name"] = shop.ShopName,
                    ["plan_id"] = plan.Id.ToString(),
                    ["plan_name"] = plan.Name,
                },
            },
            Metadata = new Dictionary<string, string>
            {
                ["shop_id"] = shop.Id.ToString(),
                ["plan_id"] = plan.Id.ToString(),
            },
        };

        var service = new SessionService();
        var session = await service.CreateAsync(sessionOptions, cancellationToken: cancellationToken);

        return new BillingCheckoutSession
        {
            Url = session.Url,
            ProviderSessionId = session.Id,
        };
    }
}
