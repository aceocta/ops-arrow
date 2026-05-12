namespace ScratchCard.Domain.Constants;

public static class RoleNames
{
    public const string PlatformAdmin = "PlatformAdmin";
    public const string ShopOwner = "ShopOwner";
    public const string Manager = "Manager";
    public const string Cashier = "Cashier";

    public static readonly string[] All = [PlatformAdmin, ShopOwner, Manager, Cashier];
}
