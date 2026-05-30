using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Lookups;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class LookupService : ILookupService
{
    private readonly IRepository<Role> _roleRepository;
    private readonly ICurrentUserService _currentUserService;
    private readonly IMemoryCache _cache;

    private static readonly TimeSpan RolesTtl = TimeSpan.FromMinutes(15);
    private const string RolesCacheKeyAll = "lookup:roles:all";
    private const string RolesCacheKeyNonAdmin = "lookup:roles:non-admin";

    public LookupService(IRepository<Role> roleRepository, ICurrentUserService currentUserService, IMemoryCache cache)
    {
        _roleRepository = roleRepository;
        _currentUserService = currentUserService;
        _cache = cache;
    }

    public async Task<IReadOnlyCollection<RoleOptionDto>> GetRolesAsync(CancellationToken cancellationToken = default)
    {
        var includePlatformAdmin = _currentUserService.IsInRole(RoleNames.PlatformAdmin);
        var cacheKey = includePlatformAdmin ? RolesCacheKeyAll : RolesCacheKeyNonAdmin;

        if (_cache.TryGetValue<IReadOnlyCollection<RoleOptionDto>>(cacheKey, out var cached) && cached is not null)
        {
            return cached;
        }

        var query = _roleRepository.Query()
            .AsNoTracking()
            .Where(x => x.IsActive);

        if (!includePlatformAdmin)
        {
            query = query.Where(x => x.Name != RoleNames.PlatformAdmin);
        }

        var roles = await query
            .OrderBy(x => x.Name)
            .Select(x => new RoleOptionDto
            {
                Id = x.Id,
                Name = x.Name,
                Description = x.Description
            })
            .ToListAsync(cancellationToken);

        _cache.Set(cacheKey, (IReadOnlyCollection<RoleOptionDto>)roles, RolesTtl);
        return roles;
    }
}
