namespace ScratchCard.Application.DTOs.Admin;

/// <summary>Row shown in the PlatformAdmin customers list. A "customer" is a Company.</summary>
public class CustomerListItemDto
{
    public Guid Id { get; set; }
    public string CompanyName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public string Status { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public int ShopCount { get; set; }
    public int UserCount { get; set; }
    public string SubscriptionStatus { get; set; } = string.Empty;
    public DateTimeOffset CreatedOn { get; set; }
}

public class ShopSummaryDto
{
    public Guid Id { get; set; }
    public string ShopName { get; set; } = string.Empty;
    public string City { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public string SubscriptionStatus { get; set; } = string.Empty;
}

public class CustomerUserDto
{
    public Guid UserId { get; set; }
    public string FullName { get; set; } = string.Empty;
    public string Email { get; set; } = string.Empty;
    public string RoleName { get; set; } = string.Empty;
    public string ShopName { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTimeOffset? LastLoginOn { get; set; }
}

public class CustomerSubscriptionDto
{
    /// <summary>Rolled-up status across the company's shop subscriptions.</summary>
    public string Status { get; set; } = "None";
    public int ActiveShopSubscriptionCount { get; set; }
    public int TotalShopSubscriptionCount { get; set; }
    public string? PlanName { get; set; }
}

public class CustomerDetailDto
{
    public Guid Id { get; set; }
    public string CompanyName { get; set; } = string.Empty;
    public string? RegistrationNumber { get; set; }
    public string Email { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public string? AddressLine1 { get; set; }
    public string? AddressLine2 { get; set; }
    public string? City { get; set; }
    public string? PostCode { get; set; }
    public string Country { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public bool IsActive { get; set; }
    public DateTimeOffset CreatedOn { get; set; }

    public IReadOnlyCollection<ShopSummaryDto> Shops { get; set; } = [];
    public IReadOnlyCollection<CustomerUserDto> Users { get; set; } = [];
    public CustomerSubscriptionDto Subscription { get; set; } = new();
}

/// <summary>
/// PlatformAdmin edit payload for a customer's company details. Separate from the mobile-facing
/// UpdateCompanyRequest so the two flows can evolve independently.
/// </summary>
public class AdminUpdateCustomerRequest
{
    public string CompanyName { get; set; } = string.Empty;
    public string? RegistrationNumber { get; set; }
    public string Email { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public string? AddressLine1 { get; set; }
    public string? AddressLine2 { get; set; }
    public string? City { get; set; }
    public string? PostCode { get; set; }
    public string? Country { get; set; }
    public bool IsActive { get; set; }
}
