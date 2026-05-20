namespace ScratchCard.Domain.Constants;

public static class RoleNames
{
    public const string PlatformAdmin = "PlatformAdmin";
    public const string CompanyOwner = "CompanyOwner";
    public const string Manager = "Manager";
    public const string Cashier = "Cashier";
    public const string SalesAssistant = "SalesAssistant";

    public const string OwnerRoles = CompanyOwner;

    public static readonly string[] OwnerRoleNames = [CompanyOwner];

    public static readonly string[] All = [PlatformAdmin, CompanyOwner, Manager, Cashier, SalesAssistant];
}
