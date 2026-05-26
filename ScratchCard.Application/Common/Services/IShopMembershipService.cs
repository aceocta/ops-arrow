namespace ScratchCard.Application.Common.Services;

/// <summary>
/// Per-shop role lookups. Mirrors what <c>RequireShopRoleAttribute</c> does, but callable from
/// inside services where the shop ID is only known after a DB lookup (e.g. "approve this prize
/// payout by id" — the controller filter has no shop ID at action-filter time).
///
/// Platform admins bypass; not a member of the shop returns <c>null</c>.
/// </summary>
public interface IShopMembershipService
{
    /// <summary>Returns the active role name of <paramref name="userId"/> at <paramref name="shopId"/>, or null if not a member / inactive.</summary>
    Task<string?> GetShopRoleAsync(Guid userId, Guid shopId, CancellationToken cancellationToken = default);

    /// <summary>
    /// Throws an <c>AppException</c> with HTTP 403 if the current user does not hold one of the
    /// specified roles at the given shop. Platform admins always pass. If the current user can't
    /// be resolved, throws 401.
    /// </summary>
    Task EnsureCurrentUserShopRoleAsync(Guid shopId, IEnumerable<string> allowedRoles, CancellationToken cancellationToken = default);
}
