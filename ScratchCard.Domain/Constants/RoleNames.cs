namespace ScratchCard.Domain.Constants;

public static class RoleNames
{
    public const string PlatformAdmin = "PlatformAdmin";
    public const string CompanyOwner = "CompanyOwner";
    public const string Manager = "Manager";
    public const string Cashier = "Cashier";
    public const string SalesAssistant = "SalesAssistant";

    // Kept for back-compat with existing string interpolations. Currently equivalent to
    // CompanyOwner. Prefer the explicit RoleNames.CompanyOwner in new code; prefer the
    // grouped constants below when authoring [Authorize] attributes.
    public const string OwnerRoles = CompanyOwner;

    // --- Convenience groups for [Authorize(Roles = ...)] ---
    // These exist to stop the copy-paste of long role lists across controllers. Each one
    // preserves the exact role set currently in use; intentional changes (e.g. adding
    // PlatformAdmin to OwnerAndManager) should be a separate, deliberate commit.

    /// <summary>Owner + Manager. Used for shop-management operations (open/close/reopen days, etc.).</summary>
    public const string OwnerAndManager = $"{CompanyOwner},{Manager}";

    /// <summary>PlatformAdmin + Owner + Manager. Standard "management" gate; includes the platform support hatch.</summary>
    public const string ManagementAndAbove = $"{PlatformAdmin},{CompanyOwner},{Manager}";

    /// <summary>PlatformAdmin + Owner. Top-level admin operations (subscription edits, role assignments).</summary>
    public const string OwnerAndPlatform = $"{PlatformAdmin},{CompanyOwner}";

    /// <summary>All shop roles except PlatformAdmin. Operations a regular cashier needs (record sales, log temperatures).</summary>
    public const string OperationalRoles = $"{CompanyOwner},{Manager},{Cashier},{SalesAssistant}";

    /// <summary>Every authenticated role including PlatformAdmin. Use for read endpoints that any signed-in user can hit.</summary>
    public const string AllAuthenticated = $"{PlatformAdmin},{CompanyOwner},{Manager},{Cashier},{SalesAssistant}";

    public static readonly string[] OwnerRoleNames = [CompanyOwner];

    public static readonly string[] All = [PlatformAdmin, CompanyOwner, Manager, Cashier, SalesAssistant];
}
