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
    public string? AppleProductId { get; set; }
    public string? GoogleProductId { get; set; }
    public bool IsActive { get; set; }
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
    public IReadOnlyCollection<string> IncludedFeatures { get; set; } = [];
    public int? MaxUsers { get; set; }
    public int? ReportExportsPerMonth { get; set; }
}

public class SelectShopSubscriptionPlanRequest
{
    public Guid ShopId { get; set; }
    public Guid PlanId { get; set; }
}

public class ShopIapReceiptRequest
{
    public Guid ShopId { get; set; }
    public string Platform { get; set; } = string.Empty;
    public string ProductId { get; set; } = string.Empty;
    public string TransactionId { get; set; } = string.Empty;
    public string? PurchaseToken { get; set; }
    public string? OriginalTransactionId { get; set; }
    public string? ReceiptData { get; set; }
}

public class RevenueCatWebhookPayload
{
    public RevenueCatWebhookEvent? Event { get; set; }
    public string? ApiVersion { get; set; }
}

public class RevenueCatWebhookEvent
{
    public string? Id { get; set; }
    public string? Type { get; set; }
    public string? AppUserId { get; set; }
    public string? OriginalAppUserId { get; set; }
    public string? ProductId { get; set; }
    public string? PeriodType { get; set; }
    public string? Store { get; set; }
    public string? Environment { get; set; }
    public long? PurchasedAtMs { get; set; }
    public long? ExpirationAtMs { get; set; }
    public long? EventTimestampMs { get; set; }
    public IReadOnlyCollection<string>? EntitlementIds { get; set; }
    public string? CancelReason { get; set; }
    public string? NewProductId { get; set; }
}

public class UpdateSubscriptionPlanRequest
{
    public string? Name { get; set; }
    public decimal? PricePerShop { get; set; }
    public int? TrialDays { get; set; }
    public string? Description { get; set; }
    public IReadOnlyCollection<string>? IncludedFeatures { get; set; }
    /// <summary>Pass null to leave unchanged, or an int / -1 to set to unlimited.</summary>
    public int? MaxUsers { get; set; }
    /// <summary>Pass null to leave unchanged, or -1 to set to unlimited.</summary>
    public int? ReportExportsPerMonth { get; set; }
    public string? AppleProductId { get; set; }
    public string? GoogleProductId { get; set; }
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
