using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Configurations;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class ConfigurationService : IConfigurationService
{
    private readonly IRepository<AppConfiguration> _configurationRepository;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public ConfigurationService(
        IRepository<AppConfiguration> configurationRepository,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _configurationRepository = configurationRepository;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyCollection<ConfigurationItemDto>> GetAsync(Guid? shopId, CancellationToken cancellationToken = default)
    {
        var query = _configurationRepository.Query().AsNoTracking().Where(x => x.IsActive);
        query = shopId.HasValue ? query.Where(x => x.ShopId == shopId || x.ShopId == null) : query.Where(x => x.ShopId == null);

        var list = await query.OrderBy(x => x.GroupName).ThenBy(x => x.ConfigKey).ToListAsync(cancellationToken);
        return list.Select(x => x.ToDto()).ToArray();
    }

    public async Task UpdateAsync(UpdateConfigurationRequest request, CancellationToken cancellationToken = default)
    {
        var keys = request.Items.Select(x => x.ConfigKey).ToArray();
        var existing = await _configurationRepository.Query()
            .Where(x => x.ShopId == request.ShopId && keys.Contains(x.ConfigKey))
            .ToListAsync(cancellationToken);

        var byKey = existing.ToDictionary(x => x.ConfigKey, StringComparer.OrdinalIgnoreCase);

        foreach (var item in request.Items)
        {
            if (byKey.TryGetValue(item.ConfigKey, out var entity))
            {
                entity.ConfigValue = item.ConfigValue;
                entity.ModifiedOn = DateTimeOffset.UtcNow;
                entity.ModifiedBy = _currentUserService.UserId;
                _configurationRepository.Update(entity);
            }
            else
            {
                await _configurationRepository.AddAsync(new AppConfiguration
                {
                    ShopId = request.ShopId,
                    ConfigKey = item.ConfigKey,
                    ConfigValue = item.ConfigValue,
                    DataType = "string",
                    GroupName = "Custom",
                    IsActive = true,
                    CreatedOn = DateTimeOffset.UtcNow,
                    CreatedBy = _currentUserService.UserId
                }, cancellationToken);
            }
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync(
            nameof(AppConfiguration),
            null,
            "ConfigurationUpdated",
            request.ShopId,
            cancellationToken: cancellationToken);
    }
}
