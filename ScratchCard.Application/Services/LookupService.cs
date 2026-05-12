using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Lookups;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class LookupService : ILookupService
{
    private readonly IRepository<Role> _roleRepository;

    public LookupService(IRepository<Role> roleRepository)
    {
        _roleRepository = roleRepository;
    }

    public async Task<IReadOnlyCollection<RoleOptionDto>> GetRolesAsync(CancellationToken cancellationToken = default)
    {
        return await _roleRepository.Query()
            .AsNoTracking()
            .Where(x => x.IsActive)
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
