using Microsoft.EntityFrameworkCore;
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

    public LookupService(IRepository<Role> roleRepository, ICurrentUserService currentUserService)
    {
        _roleRepository = roleRepository;
        _currentUserService = currentUserService;
    }

    public async Task<IReadOnlyCollection<RoleOptionDto>> GetRolesAsync(CancellationToken cancellationToken = default)
    {
        var query = _roleRepository.Query()
            .AsNoTracking()
            .Where(x => x.IsActive);

        if (!_currentUserService.IsInRole(RoleNames.PlatformAdmin))
        {
            query = query.Where(x => x.Name != RoleNames.PlatformAdmin);
        }

        return await query
            .OrderBy(x => x.Name)
            .Select(x => new RoleOptionDto
            {
                Id = x.Id,
                Name = x.Name,
                Description = x.Description
            })
            .ToListAsync(cancellationToken);
    }
}
