using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Domain.Entities;
using Stripe;
using Stripe.Checkout;

namespace ScratchCard.Infrastructure.Services;

/// <summary>
/// Creates Stripe Checkout Sessions, Customer Portal sessions, and manages the lifecycle of
/// resulting subscriptions. App-to-Web flow: mobile opens Checkout in the external browser,
/// Stripe charges the card, our direct Stripe webhook updates the ShopSubscription.
/// </summary>
public sealed class StripeBillingCheckoutService : IBillingCheckoutService
{
    private readonly IRepository<Shop> _shopRepository;
    private readonly IRepository<Company> _companyRepository;
    private readonly IRepository<SubscriptionPlan> _planRepository;
    private readonly IUnitOfWork _unitOfWork;
    private readonly StripeOptions _options;
    private readonly ILogger<StripeBillingCheckoutService> _logger;

    public StripeBillingCheckoutService(
        IRepository<Shop> shopRepository,
        IRepository<Company> companyRepository,
        IRepository<SubscriptionPlan> planRepository,
        IUnitOfWork unitOfWork,
        IOptions<StripeOptions> options,
        ILogger<StripeBillingCheckoutService> logger)
    {
        _shopRepository = shopRepository;
        _companyRepository = companyRepository;
        _planRepository = planRepository;
        _unitOfWork = unitOfWork;
        _options = options.Value;
        _logger = logger;

        if (!string.IsNullOrWhiteSpace(_options.SecretKey))
        {
            // Fail fast if the value looks like a PUBLISHABLE key (pk_*). The Stripe API would
            // return 401 on every call otherwise, which is hard to debug for an integrator who
            // doesn't know the prefix convention.
            if (_options.SecretKey.StartsWith("pk_", StringComparison.Ordinal))
            {
                throw new InvalidOperationException(
                    "Stripe:SecretKey must be a SECRET key (sk_test_... or sk_live_...). " +
                    "A publishable key (pk_*) was supplied — it cannot create checkout sessions or " +
                    "manage subscriptions. Update appsettings (or user-secrets) with the correct key.");
            }

            StripeConfiguration.ApiKey = _options.SecretKey;
        }
    }

    public async Task<BillingCheckoutSession> CreateCheckoutSessionAsync(BillingCheckoutRequest request, CancellationToken cancellationToken = default)
    {
        EnsureStripeConfigured();

        var shop = await _shopRepository.GetByIdAsync(request.ShopId, cancellationToken)
            ?? throw new AppException("shop_not_found", "Shop not found.", 404);

        if (shop.CompanyId is null)
        {
            throw new AppException("validation_failed", "Shop is not associated with a company.", 400);
        }

        var company = await _companyRepository.GetByIdAsync(shop.CompanyId.Value, cancellationToken)
            ?? throw new AppException("company_not_found", "Company not found.", 404);

        var plan = await _planRepository.GetByIdAsync(request.PlanId, cancellationToken)
            ?? throw new AppException("plan_not_found", "Plan not found.", 404);

        // Prefer the price ID stored on the plan entity — DB-driven mapping survives plan renames
        // and admin edits. Fall back to the appsettings dictionary keyed by plan.Name for any
        // legacy plans whose row hasn't been backfilled yet.
        var priceId = !string.IsNullOrWhiteSpace(plan.StripePriceId)
            ? plan.StripePriceId
            : (_options.PriceIds.TryGetValue(plan.Name, out var legacyPriceId) ? legacyPriceId : null);

        if (string.IsNullOrWhiteSpace(priceId))
        {
            throw new AppException(
                "stripe_price_not_configured",
                $"Stripe Price ID for plan '{plan.Name}' is not configured. Set SubscriptionPlan.StripePriceId in the database.",
                500);
        }

        // Customer-per-Company model: every shop subscription under this company is billed
        // against the same Stripe Customer (one card on file). Lazy-create on first checkout.
        var customerEmail = string.IsNullOrWhiteSpace(request.CustomerEmail) ? company.Email : request.CustomerEmail;
        var stripeCustomerId = await EnsureStripeCustomerAsync(company, customerEmail, cancellationToken);

        var sessionOptions = new SessionCreateOptions
        {
            Mode = "subscription",
            LineItems =
            [
                new SessionLineItemOptions { Price = priceId, Quantity = 1 },
            ],
            SuccessUrl = _options.SuccessUrl,
            CancelUrl = _options.CancelUrl,
            Customer = stripeCustomerId,
            // Metadata flows into the resulting Subscription so the direct Stripe webhook can
            // resolve shop and plan without needing extra round-trips.
            SubscriptionData = new SessionSubscriptionDataOptions
            {
                Metadata = new Dictionary<string, string>
                {
                    ["shop_id"] = shop.Id.ToString(),
                    ["shop_name"] = shop.ShopName,
                    ["plan_id"] = plan.Id.ToString(),
                    ["plan_name"] = plan.Name,
                    ["company_id"] = company.Id.ToString(),
                },
            },
            Metadata = new Dictionary<string, string>
            {
                ["shop_id"] = shop.Id.ToString(),
                ["plan_id"] = plan.Id.ToString(),
                ["company_id"] = company.Id.ToString(),
            },
        };

        var service = new SessionService();
        var session = await service.CreateAsync(sessionOptions, cancellationToken: cancellationToken);

        _logger.LogInformation(
            "Stripe Checkout session {SessionId} created for shop {ShopId}, plan {PlanName} ({PriceId}).",
            session.Id, shop.Id, plan.Name, priceId);

        return new BillingCheckoutSession
        {
            Url = session.Url,
            ProviderSessionId = session.Id,
        };
    }

    public async Task CancelSubscriptionAsync(string providerSubscriptionId, bool cancelAtPeriodEnd, CancellationToken cancellationToken = default)
    {
        EnsureStripeConfigured();
        if (string.IsNullOrWhiteSpace(providerSubscriptionId))
        {
            throw new AppException("validation_failed", "Stripe subscription id is required.", 400);
        }

        var service = new SubscriptionService();
        try
        {
            if (cancelAtPeriodEnd)
            {
                await service.UpdateAsync(providerSubscriptionId, new SubscriptionUpdateOptions
                {
                    CancelAtPeriodEnd = true,
                }, cancellationToken: cancellationToken);
            }
            else
            {
                await service.CancelAsync(providerSubscriptionId, new SubscriptionCancelOptions(), cancellationToken: cancellationToken);
            }

            _logger.LogInformation(
                "Stripe subscription {SubscriptionId} cancellation requested (atPeriodEnd={AtPeriodEnd}).",
                providerSubscriptionId, cancelAtPeriodEnd);
        }
        catch (StripeException ex)
        {
            _logger.LogError(ex, "Stripe cancel failed for subscription {SubscriptionId}.", providerSubscriptionId);
            throw new AppException("stripe_cancel_failed", ex.StripeError?.Message ?? ex.Message, 502);
        }
    }

    public async Task ReactivateSubscriptionAsync(string providerSubscriptionId, CancellationToken cancellationToken = default)
    {
        EnsureStripeConfigured();
        if (string.IsNullOrWhiteSpace(providerSubscriptionId))
        {
            throw new AppException("validation_failed", "Stripe subscription id is required.", 400);
        }

        var service = new SubscriptionService();
        try
        {
            await service.UpdateAsync(providerSubscriptionId, new SubscriptionUpdateOptions
            {
                CancelAtPeriodEnd = false,
            }, cancellationToken: cancellationToken);

            _logger.LogInformation("Stripe subscription {SubscriptionId} reactivated.", providerSubscriptionId);
        }
        catch (StripeException ex)
        {
            _logger.LogError(ex, "Stripe reactivate failed for subscription {SubscriptionId}.", providerSubscriptionId);
            throw new AppException("stripe_reactivate_failed", ex.StripeError?.Message ?? ex.Message, 502);
        }
    }

    public async Task PauseSubscriptionAsync(string providerSubscriptionId, CancellationToken cancellationToken = default)
    {
        EnsureStripeConfigured();
        if (string.IsNullOrWhiteSpace(providerSubscriptionId))
        {
            throw new AppException("validation_failed", "Stripe subscription id is required.", 400);
        }

        var service = new SubscriptionService();
        try
        {
            // mark_uncollectible: invoices are still created during the pause but immediately
            // written off. This preserves the audit trail (one row per cycle) without charging
            // the customer. Don't set ResumesAt — we cap pauses ourselves via a background job
            // so Stripe shouldn't auto-resume billing on its own.
            await service.UpdateAsync(providerSubscriptionId, new SubscriptionUpdateOptions
            {
                PauseCollection = new SubscriptionPauseCollectionOptions
                {
                    Behavior = "mark_uncollectible",
                },
            }, cancellationToken: cancellationToken);

            _logger.LogInformation("Stripe subscription {SubscriptionId} paused.", providerSubscriptionId);
        }
        catch (StripeException ex)
        {
            _logger.LogError(ex, "Stripe pause failed for subscription {SubscriptionId}.", providerSubscriptionId);
            throw new AppException("stripe_pause_failed", ex.StripeError?.Message ?? ex.Message, 502);
        }
    }

    public async Task ResumeSubscriptionAsync(string providerSubscriptionId, CancellationToken cancellationToken = default)
    {
        EnsureStripeConfigured();
        if (string.IsNullOrWhiteSpace(providerSubscriptionId))
        {
            throw new AppException("validation_failed", "Stripe subscription id is required.", 400);
        }

        var service = new SubscriptionService();
        try
        {
            // Clearing PauseCollection requires explicit "" wire-format; the Stripe.net helper
            // expects null + the property name listed in ExpandableFields to send empty.
            await service.UpdateAsync(providerSubscriptionId, new SubscriptionUpdateOptions
            {
                PauseCollection = null,
            }, new RequestOptions(), cancellationToken: cancellationToken);

            _logger.LogInformation("Stripe subscription {SubscriptionId} resumed.", providerSubscriptionId);
        }
        catch (StripeException ex)
        {
            _logger.LogError(ex, "Stripe resume failed for subscription {SubscriptionId}.", providerSubscriptionId);
            throw new AppException("stripe_resume_failed", ex.StripeError?.Message ?? ex.Message, 502);
        }
    }

    public async Task<string> CreatePortalSessionAsync(string stripeCustomerId, CancellationToken cancellationToken = default)
    {
        EnsureStripeConfigured();
        if (string.IsNullOrWhiteSpace(stripeCustomerId))
        {
            throw new AppException("validation_failed", "Stripe customer id is required.", 400);
        }

        var service = new Stripe.BillingPortal.SessionService();
        try
        {
            var session = await service.CreateAsync(new Stripe.BillingPortal.SessionCreateOptions
            {
                Customer = stripeCustomerId,
                ReturnUrl = _options.PortalReturnUrl,
            }, cancellationToken: cancellationToken);

            _logger.LogInformation(
                "Stripe Customer Portal session created for customer {CustomerId}.",
                stripeCustomerId);

            return session.Url;
        }
        catch (StripeException ex)
        {
            _logger.LogError(ex, "Stripe portal session creation failed for customer {CustomerId}.", stripeCustomerId);
            throw new AppException("stripe_portal_failed", ex.StripeError?.Message ?? ex.Message, 502);
        }
    }

    public async Task<StripeSubscriptionSnapshot?> GetSubscriptionAsync(string providerSubscriptionId, CancellationToken cancellationToken = default)
    {
        EnsureStripeConfigured();
        if (string.IsNullOrWhiteSpace(providerSubscriptionId))
        {
            return null;
        }

        try
        {
            var service = new SubscriptionService();
            var sub = await service.GetAsync(providerSubscriptionId, cancellationToken: cancellationToken);
            if (sub is null)
            {
                return null;
            }

            // Pull metadata + price/period info into a flat snapshot the application layer can
            // apply without referencing the Stripe SDK directly.
            var priceId = sub.Items.Data.FirstOrDefault()?.Price?.Id ?? string.Empty;
            Guid? shopId = TryParseGuidMetadata(sub.Metadata, "shop_id");
            Guid? planId = TryParseGuidMetadata(sub.Metadata, "plan_id");

            var firstItem = sub.Items.Data.FirstOrDefault();
            return new StripeSubscriptionSnapshot
            {
                Id = sub.Id,
                CustomerId = sub.CustomerId ?? string.Empty,
                PriceId = priceId,
                Status = sub.Status ?? string.Empty,
                CurrentPeriodStart = ToOffset(firstItem?.CurrentPeriodStart),
                CurrentPeriodEnd = ToOffset(firstItem?.CurrentPeriodEnd),
                TrialEnd = ToOffset(sub.TrialEnd),
                CancelAtPeriodEnd = sub.CancelAtPeriodEnd,
                CanceledAt = ToOffset(sub.CanceledAt),
                ShopId = shopId,
                PlanId = planId,
            };
        }
        catch (StripeException ex)
        {
            _logger.LogWarning(ex, "Stripe subscription lookup failed for {SubscriptionId}.", providerSubscriptionId);
            return null;
        }
    }

    private void EnsureStripeConfigured()
    {
        if (string.IsNullOrWhiteSpace(_options.SecretKey))
        {
            throw new AppException("billing_not_configured", "Stripe is not configured on this environment.", 503);
        }
    }

    private async Task<string> EnsureStripeCustomerAsync(Company company, string customerEmail, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(company.StripeCustomerId))
        {
            return company.StripeCustomerId;
        }

        var customerService = new CustomerService();
        var customer = await customerService.CreateAsync(new CustomerCreateOptions
        {
            Email = customerEmail,
            Name = company.CompanyName,
            Metadata = new Dictionary<string, string>
            {
                ["company_id"] = company.Id.ToString(),
            },
        }, cancellationToken: cancellationToken);

        company.StripeCustomerId = customer.Id;
        company.ModifiedOn = DateTimeOffset.UtcNow;
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        _logger.LogInformation(
            "Stripe Customer {CustomerId} created for company {CompanyId} ({CompanyName}).",
            customer.Id, company.Id, company.CompanyName);

        return customer.Id;
    }

    private static Guid? TryParseGuidMetadata(Dictionary<string, string>? metadata, string key)
    {
        if (metadata is null || !metadata.TryGetValue(key, out var raw)) return null;
        return Guid.TryParse(raw, out var parsed) ? parsed : null;
    }

    private static DateTimeOffset? ToOffset(DateTime? value)
    {
        if (!value.HasValue) return null;
        var v = value.Value;
        // Stripe.net returns UTC DateTime; normalise into DateTimeOffset for our domain.
        return v.Kind == DateTimeKind.Utc
            ? new DateTimeOffset(v, TimeSpan.Zero)
            : new DateTimeOffset(DateTime.SpecifyKind(v, DateTimeKind.Utc), TimeSpan.Zero);
    }
}
