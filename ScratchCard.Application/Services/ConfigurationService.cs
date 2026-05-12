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
        var query = _configurationRepository.Query()
            .AsNoTracking()
            .Where(x => x.IsActive);

        if (!shopId.HasValue)
        {
            var globalOnly = await query
                .Where(x => x.ShopId == null)
                .OrderBy(x => x.GroupName)
                .ThenBy(x => x.ConfigKey)
                .ToListAsync(cancellationToken);

            return globalOnly.Select(x => x.ToDto()).ToArray();
        }

        var candidateRows = await query
            .Where(x => x.ShopId == null || x.ShopId == shopId.Value)
            .ToListAsync(cancellationToken);

        var effectiveRows = candidateRows
            .GroupBy(x => x.ConfigKey, StringComparer.OrdinalIgnoreCase)
            .Select(group => group
                .OrderByDescending(x => x.ShopId == shopId.Value)
                .ThenByDescending(x => x.ModifiedOn ?? x.CreatedOn)
                .First())
            .OrderBy(x => x.GroupName)
            .ThenBy(x => x.ConfigKey)
            .ToArray();

        return effectiveRows.Select(x => x.ToDto()).ToArray();
    }

    public async Task UpdateAsync(UpdateConfigurationRequest request, CancellationToken cancellationToken = default)
    {
        var keys = request.Items.Select(x => x.ConfigKey).ToArray();
        var existing = await _configurationRepository.Query()
            .Where(x => x.ShopId == request.ShopId && keys.Contains(x.ConfigKey))
            .ToListAsync(cancellationToken);

        var byKey = existing.ToDictionary(x => x.ConfigKey, StringComparer.OrdinalIgnoreCase);

        var globalTemplates = request.ShopId.HasValue
            ? await _configurationRepository.Query()
                .AsNoTracking()
                .Where(x => x.ShopId == null && keys.Contains(x.ConfigKey))
                .ToDictionaryAsync(x => x.ConfigKey, StringComparer.OrdinalIgnoreCase, cancellationToken)
            : new Dictionary<string, AppConfiguration>(StringComparer.OrdinalIgnoreCase);

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
                var template = globalTemplates.TryGetValue(item.ConfigKey, out var source) ? source : null;
                await _configurationRepository.AddAsync(new AppConfiguration
                {
                    ShopId = request.ShopId,
                    ConfigKey = item.ConfigKey,
                    ConfigValue = item.ConfigValue,
                    DataType = template?.DataType ?? "string",
                    GroupName = template?.GroupName ?? "Custom",
                    Description = template?.Description,
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
