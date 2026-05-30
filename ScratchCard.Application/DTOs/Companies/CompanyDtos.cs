namespace ScratchCard.Application.DTOs.Companies;

public class CreateCompanyRequest
{
    public string CompanyName { get; set; } = string.Empty;
    public string? RegistrationNumber { get; set; }
}

public class UpdateCompanyRequest
{
    public string CompanyName { get; set; } = string.Empty;
    public string? RegistrationNumber { get; set; }
    public bool IsActive { get; set; } = true;
}

public class CompanyDto
{
    public Guid Id { get; set; }
    public string CompanyName { get; set; } = string.Empty;
    public string? RegistrationNumber { get; set; }
    public Guid? OwnerUserId { get; set; }
    public string Email { get; set; } = string.Empty;
    public string? PhoneNumber { get; set; }
    public string? AddressLine1 { get; set; }
    public string? AddressLine2 { get; set; }
    public string? City { get; set; }
    public string? PostCode { get; set; }
    public string Country { get; set; } = "UK";
    public bool IsActive { get; set; }
}

public class CompanySignupRequest
{
    public string CompanyName { get; set; } = string.Empty;
    public string OwnerFirstName { get; set; } = string.Empty;
    public string OwnerLastName { get; set; } = string.Empty;
    public string OwnerEmail { get; set; } = string.Empty;
    /// <summary>Optional user phone number with country code (e.g. "+447911..."). Used for WhatsApp alerts.</summary>
    public string? OwnerPhoneNumber { get; set; }
    /// <summary>Company contact phone. Independent of the user's personal phone.</summary>
    public string? PhoneNumber { get; set; }
    public string? AddressLine1 { get; set; }
    public string? AddressLine2 { get; set; }
    public string? City { get; set; }
    public string? PostCode { get; set; }
    public string Country { get; set; } = "UK";
    public string? FirstShopName { get; set; }
    public string Password { get; set; } = string.Empty;
}
