using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.Subscriptions;

public class SubscriptionPlanDto
{
    public Guid Id { get; set; }
    public string Name { get; set; } = string.Empty;
    public BillingCycle BillingCycle { get; set; }
    public decimal PricePerShop { get; set; }
    public int TrialDays { get; set; }
    public string? Description { get; set; }
    public IReadOnlyCollection<string> IncludedFeatures { get; set; } = [];
    public int? MaxUsers { get; set; }
    public int? ReportExportsPerMonth { get; set; }
    public string? StripePriceId { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; }
}

/// <summary>
/// Curated plan shape for the anonymous marketing-site endpoint (GET /api/public/plans).
/// Intentionally excludes internal-only fields (plan Id, Stripe price IDs, export limits, IsActive).
/// </summary>
public class PublicPlanDto
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public decimal PricePerShop { get; set; }
    public string Currency { get; set; } = "GBP";
    public BillingCycle BillingCycle { get; set; }
    public int TrialDays { get; set; }
    public int? MaxUsers { get; set; }
    public int DisplayOrder { get; set; }
    public IReadOnlyCollection<PublicPlanFeatureCategoryDto> FeatureCategories { get; set; } = [];
}

public class PublicPlanFeatureCategoryDto
{
    public string Category { get; set; } = string.Empty;
    public IReadOnlyCollection<PublicPlanFeatureDto> Features { get; set; } = [];
}

public class PublicPlanFeatureDto
{
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
}

public class SubscriptionCalculationRequest
{
    public Guid CompanyId { get; set; }
    public Guid PlanId { get; set; }
}

public class SelectSubscriptionPlanRequest
{
    public Guid CompanyId { get; set; }
    public Guid PlanId { get; set; }
}

public class CancelSubscriptionRequest
{
    public Guid CompanyId { get; set; }
    public bool CancelAtPeriodEnd { get; set; } = true;
}

public class ReactivateSubscriptionRequest
{
    public Guid CompanyId { get; set; }
}

public class SubscriptionCalculationResultDto
{
    public string PlanName { get; set; } = string.Empty;
    public BillingCycle BillingCycle { get; set; }
    public int ActiveShopCount { get; set; }
    public decimal PricePerShop { get; set; }
    public decimal SubTotalAmount { get; set; }
    public decimal DiscountPercentage { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TotalAmount { get; set; }
}

public class SubscriptionSummaryDto
{
    public Guid CompanyId { get; set; }
    public Guid CompanySubscriptionId { get; set; }
    public Guid SubscriptionPlanId { get; set; }
    public string PlanName { get; set; } = string.Empty;
    public BillingCycle BillingCycle { get; set; }
    public SubscriptionStatus Status { get; set; }
    public int ActiveShopCount { get; set; }
    public decimal PricePerShop { get; set; }
    public decimal SubTotalAmount { get; set; }
    public decimal DiscountPercentage { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public DateTimeOffset? TrialStartedOn { get; set; }
    public DateTimeOffset? TrialEndsOn { get; set; }
    public DateTimeOffset? CurrentPeriodStartedOn { get; set; }
    public DateTimeOffset? CurrentPeriodEndsOn { get; set; }
    public int? TrialDaysRemaining { get; set; }
    public bool RequiresBillingAction { get; set; }
    public IReadOnlyCollection<string> IncludedFeatures { get; set; } = [];
}

public class SubscriptionInvoiceLineDto
{
    public Guid Id { get; set; }
    public string Description { get; set; } = string.Empty;
    public int Quantity { get; set; }
    public decimal UnitPrice { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal LineTotal { get; set; }
}

public class SubscriptionInvoiceDto
{
    public Guid Id { get; set; }
    public Guid CompanyId { get; set; }
    public Guid CompanySubscriptionId { get; set; }
    public string InvoiceNumber { get; set; } = string.Empty;
    public BillingCycle BillingCycle { get; set; }
    public int ActiveShopCount { get; set; }
    public decimal PricePerShop { get; set; }
    public decimal SubTotalAmount { get; set; }
    public decimal DiscountAmount { get; set; }
    public decimal TaxAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public InvoiceStatus Status { get; set; }
    public DateTimeOffset DueDate { get; set; }
    public DateTimeOffset? PaidOn { get; set; }
    public DateTimeOffset CreatedOn { get; set; }
    public IReadOnlyCollection<SubscriptionInvoiceLineDto> Lines { get; set; } = [];
}

public class SubscriptionDiscountRuleDto
{
    public Guid Id { get; set; }
    public Guid? SubscriptionPlanId { get; set; }
    public int MinShopCount { get; set; }
    public int? MaxShopCount { get; set; }
    public DiscountType DiscountType { get; set; }
    public decimal DiscountValue { get; set; }
    public bool IsActive { get; set; }
    public string? Description { get; set; }
}

public class UpsertSubscriptionDiscountRuleRequest
{
    public Guid? SubscriptionPlanId { get; set; }
    public int MinShopCount { get; set; }
    public int? MaxShopCount { get; set; }
    public DiscountType DiscountType { get; set; }
    public decimal DiscountValue { get; set; }
    public bool IsActive { get; set; } = true;
    public string? Description { get; set; }
}

public class ShopSubscriptionSummaryDto
{
    public Guid ShopId { get; set; }
    public Guid CompanyId { get; set; }
    public Guid ShopSubscriptionId { get; set; }
    public Guid? SubscriptionPlanId { get; set; }
    public string PlanName { get; set; } = string.Empty;
    public BillingCycle BillingCycle { get; set; }
    public SubscriptionStatus Status { get; set; }
    public decimal Price { get; set; }
    public DateTimeOffset? TrialStartedOn { get; set; }
    public DateTimeOffset? TrialEndsOn { get; set; }
    public DateTimeOffset? CurrentPeriodStartedOn { get; set; }
    public DateTimeOffset? CurrentPeriodEndsOn { get; set; }
    public int? TrialDaysRemaining { get; set; }
    public bool RequiresBillingAction { get; set; }
    /// <summary>True once the company has a Stripe customer (first checkout completed) —
    /// gates the billing-portal button, which can't open without one.</summary>
    public bool HasBillingAccount { get; set; }
    public IReadOnlyCollection<string> IncludedFeatures { get; set; } = [];
    public int? MaxUsers { get; set; }
    public int? ReportExportsPerMonth { get; set; }
    /// <summary>UTC instant the shop was paused (null unless Status = Suspended).</summary>
    public DateTimeOffset? PausedOn { get; set; }
    /// <summary>
    /// Days left before the 1-year auto-cancel kicks in. Mobile renders a banner from day 330+
    /// using this value. Null when not paused.
    /// </summary>
    public int? PauseDaysRemaining { get; set; }
}

public class SelectShopSubscriptionPlanRequest
{
    public Guid ShopId { get; set; }
    public Guid PlanId { get; set; }
}

public class FeatureDto
{
    public Guid Id { get; set; }
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Category { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; }
    public bool IsSystem { get; set; }
}

public class UpsertFeatureRequest
{
    public string Key { get; set; } = string.Empty;
    public string Name { get; set; } = string.Empty;
    public string? Description { get; set; }
    public string? Category { get; set; }
    public int DisplayOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

public class SubscriptionPlanFeatureDto
{
    public Guid Id { get; set; }
    public Guid SubscriptionPlanId { get; set; }
    public Guid FeatureId { get; set; }
    public string FeatureKey { get; set; } = string.Empty;
    public string FeatureName { get; set; } = string.Empty;
    public string? Category { get; set; }
    public bool IsEnabled { get; set; }
    public int? LimitValue { get; set; }
    public string? Notes { get; set; }
}

public class UpsertPlanFeatureRequest
{
    public Guid FeatureId { get; set; }
    public bool IsEnabled { get; set; } = true;
    public int? LimitValue { get; set; }
    public string? Notes { get; set; }
}

public class SetPlanFeaturesRequest
{
    /// <summary>Full replacement set. Anything not in this list is removed from the plan.</summary>
    public IReadOnlyCollection<UpsertPlanFeatureRequest> Features { get; set; } = [];
}

public class UpdateSubscriptionPlanRequest
{
    public string? Name { get; set; }
    public decimal? PricePerShop { get; set; }
    public int? TrialDays { get; set; }
    public string? Description { get; set; }
    /// <summary>
    /// Legacy field — feature keys to enable on the plan. Existing callers can keep sending this;
    /// the admin service translates keys into SubscriptionPlanFeature rows. For richer control
    /// (per-feature LimitValue, Notes) use the new /features endpoints on the plan.
    /// </summary>
    public IReadOnlyCollection<string>? IncludedFeatures { get; set; }
    /// <summary>Pass null to leave unchanged, or an int / -1 to set to unlimited.</summary>
    public int? MaxUsers { get; set; }
    /// <summary>Pass null to leave unchanged, or -1 to set to unlimited.</summary>
    public int? ReportExportsPerMonth { get; set; }
    /// <summary>Stripe Price ID (price_...) for this plan. Test and live modes have separate IDs.</summary>
    public string? StripePriceId { get; set; }
    public int? DisplayOrder { get; set; }
    public bool? IsActive { get; set; }
}

public class CreateBillingCheckoutRequest
{
    public Guid ShopId { get; set; }
    public Guid PlanId { get; set; }
}

public class BillingCheckoutResponse
{
    public string Url { get; set; } = string.Empty;
    public string Provider { get; set; } = "stripe";
}

public class CancelShopSubscriptionRequest
{
    public Guid ShopId { get; set; }
    public bool CancelAtPeriodEnd { get; set; } = true;
}

public class ReactivateShopSubscriptionRequest
{
    public Guid ShopId { get; set; }
}

public class PauseShopSubscriptionRequest
{
    public Guid ShopId { get; set; }
}

public class ResumeShopSubscriptionRequest
{
    public Guid ShopId { get; set; }
}

public class EnsureShopTrialRequest
{
    public Guid ShopId { get; set; }
    /// <summary>Optional plan the user has indicated they intend to subscribe to. Drives trial length.</summary>
    public Guid? IntendedPlanId { get; set; }
}

public class RefreshFromProviderRequest
{
    public Guid ShopId { get; set; }
}

public class PortalSessionRequest
{
    public Guid ShopId { get; set; }
}

public class EmailPortalLinkRequest
{
    public Guid ShopId { get; set; }
}

public class GlobalSubscriptionSettingsDto
{
    public int? DefaultTrialDays { get; set; }
    public int? TrialEndingReminderDays { get; set; }
    public int? PaymentGracePeriodDays { get; set; }
    public bool? BulkDiscountEnabled { get; set; }
}

public class UpdateGlobalSubscriptionSettingsRequest
{
    public int? DefaultTrialDays { get; set; }
    public int? TrialEndingReminderDays { get; set; }
    public int? PaymentGracePeriodDays { get; set; }
    public bool? BulkDiscountEnabled { get; set; }
}

public class ShopEntitlementsDto
{
    public Guid ShopId { get; set; }
    public Guid CompanyId { get; set; }
    public string? Tier { get; set; }
    public SubscriptionStatus Status { get; set; }
    public bool IsActive { get; set; }
    public bool IsInTrial { get; set; }
    public bool InGracePeriod { get; set; }
    public int? TrialDaysRemaining { get; set; }
    public DateTimeOffset? ExpiresAt { get; set; }
    public IReadOnlyCollection<string> Features { get; set; } = [];
    public int? MaxUsers { get; set; }
    public int? ReportExportsPerMonth { get; set; }
}
