using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Application.Common.Extensions;

public static class CurrentUserRoleExtensions
{
    public static bool IsOwner(this ICurrentUserService currentUserService)
    {
        return currentUserService.IsInRole(RoleNames.CompanyOwner);
    }

    public static bool IsOwnerOrManager(this ICurrentUserService currentUserService)
    {
        return currentUserService.IsOwner() || currentUserService.IsInRole(RoleNames.Manager);
    }
}
