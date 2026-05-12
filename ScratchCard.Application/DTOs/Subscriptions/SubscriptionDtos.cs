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
