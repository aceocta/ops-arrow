using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Rota;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public sealed class StaffPayRateService : IStaffPayRateService
{
    private static readonly string[] ManagementRoles = [RoleNames.CompanyOwner, RoleNames.Manager];

    private readonly IRepository<StaffPayRate> _rates;
    private readonly IRepository<User> _users;
    private readonly IRepository<RotaStaffMember> _members;
    private readonly IShopMembershipService _shopMembership;
    private readonly IFeatureGateService _featureGate;
    private readonly ICurrentUserService _currentUser;
    private readonly IUnitOfWork _unitOfWork;

    public StaffPayRateService(
        IRepository<StaffPayRate> rates,
        IRepository<User> users,
        IRepository<RotaStaffMember> members,
        IShopMembershipService shopMembership,
        IFeatureGateService featureGate,
        ICurrentUserService currentUser,
        IUnitOfWork unitOfWork)
    {
        _rates = rates;
        _users = users;
        _members = members;
        _shopMembership = shopMembership;
        _featureGate = featureGate;
        _currentUser = currentUser;
        _unitOfWork = unitOfWork;
    }

    private async Task EnsureAccessAsync(Guid shopId, CancellationToken ct)
    {
        await _shopMembership.EnsureCurrentUserShopRoleAsync(shopId, ManagementRoles, ct);
        await _featureGate.EnsureFeatureAsync(shopId, FeatureKeys.StaffRotaLabourCost, ct);
    }

    public async Task<IReadOnlyCollection<StaffPayRateDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(shopId, cancellationToken);

        var rows = await _rates.Query().AsNoTracking()
            .Where(r => r.ShopId == shopId && !r.IsDeleted)
            .OrderByDescending(r => r.EffectiveFrom)
            .ToListAsync(cancellationToken);

        var userIds = rows.Where(r => r.UserId.HasValue).Select(r => r.UserId!.Value).Distinct().ToList();
        var memberIds = rows.Where(r => r.RotaStaffMemberId.HasValue).Select(r => r.RotaStaffMemberId!.Value).Distinct().ToList();
        var userNames = await _users.Query().AsNoTracking().Where(u => userIds.Contains(u.Id))
            .ToDictionaryAsync(u => u.Id, u => DisplayName(u), cancellationToken);
        var memberNames = await _members.Query().AsNoTracking().Where(m => memberIds.Contains(m.Id))
            .ToDictionaryAsync(m => m.Id, m => m.Name, cancellationToken);

        return rows.Select(r => Map(r, userNames, memberNames)).ToList();
    }

    public async Task<StaffPayRateDto> SetAsync(SetStaffPayRateRequest request, CancellationToken cancellationToken = default)
    {
        await EnsureAccessAsync(request.ShopId, cancellationToken);

        if (request.UserId is null == (request.RotaStaffMemberId is null))
        {
            throw new AppException("invalid_staff", "Specify exactly one of UserId or RotaStaffMemberId.", 400);
        }
        if (request.HourlyRate < 0)
        {
            throw new AppException("invalid_rate", "Hourly rate cannot be negative.", 400);
        }

        // One rate row per staff per effective-from date — update if the same date already exists.
        var existing = await _rates.Query().FirstOrDefaultAsync(r =>
            r.ShopId == request.ShopId && !r.IsDeleted &&
            r.UserId == request.UserId && r.RotaStaffMemberId == request.RotaStaffMemberId &&
            r.EffectiveFrom == request.EffectiveFrom, cancellationToken);

        if (existing is null)
        {
            existing = new StaffPayRate
            {
                ShopId = request.ShopId,
                UserId = request.UserId,
                RotaStaffMemberId = request.RotaStaffMemberId,
                HourlyRate = request.HourlyRate,
                EffectiveFrom = request.EffectiveFrom,
                Notes = request.Notes,
                CreatedOn = DateTimeOffset.UtcNow,
                CreatedBy = _currentUser.UserId,
            };
            await _rates.AddAsync(existing, cancellationToken);
        }
        else
        {
            existing.HourlyRate = request.HourlyRate;
            existing.Notes = request.Notes;
            existing.ModifiedOn = DateTimeOffset.UtcNow;
            existing.ModifiedBy = _currentUser.UserId;
            _rates.Update(existing);
        }

        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var name = request.UserId is { } uid
            ? await _users.Query().AsNoTracking().Where(u => u.Id == uid).Select(u => DisplayName(u)).FirstOrDefaultAsync(cancellationToken)
            : await _members.Query().AsNoTracking().Where(m => m.Id == request.RotaStaffMemberId).Select(m => m.Name).FirstOrDefaultAsync(cancellationToken);

        return new StaffPayRateDto
        {
            Id = existing.Id,
            ShopId = existing.ShopId,
            UserId = existing.UserId,
            RotaStaffMemberId = existing.RotaStaffMemberId,
            StaffName = name ?? "Staff",
            IsExternal = existing.RotaStaffMemberId.HasValue,
            HourlyRate = existing.HourlyRate,
            EffectiveFrom = existing.EffectiveFrom,
            Notes = existing.Notes,
        };
    }

    public async Task DeleteAsync(Guid id, CancellationToken cancellationToken = default)
    {
        var rate = await _rates.Query().FirstOrDefaultAsync(r => r.Id == id && !r.IsDeleted, cancellationToken)
            ?? throw new AppException("rate_not_found", "Pay rate not found.", 404);
        await EnsureAccessAsync(rate.ShopId, cancellationToken);
        rate.IsDeleted = true;
        rate.ModifiedOn = DateTimeOffset.UtcNow;
        rate.ModifiedBy = _currentUser.UserId;
        _rates.Update(rate);
        await _unitOfWork.SaveChangesAsync(cancellationToken);
    }

    private static string DisplayName(User u) =>
        string.IsNullOrWhiteSpace($"{u.FirstName} {u.LastName}".Trim()) ? u.Email : $"{u.FirstName} {u.LastName}".Trim();

    private static StaffPayRateDto Map(StaffPayRate r, IReadOnlyDictionary<Guid, string> userNames, IReadOnlyDictionary<Guid, string> memberNames) => new()
    {
        Id = r.Id,
        ShopId = r.ShopId,
        UserId = r.UserId,
        RotaStaffMemberId = r.RotaStaffMemberId,
        StaffName = r.UserId is { } uid && userNames.TryGetValue(uid, out var un) ? un
            : r.RotaStaffMemberId is { } mid && memberNames.TryGetValue(mid, out var mn) ? mn : "Staff",
        IsExternal = r.RotaStaffMemberId.HasValue,
        HourlyRate = r.HourlyRate,
        EffectiveFrom = r.EffectiveFrom,
        Notes = r.Notes,
    };
}
