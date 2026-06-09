using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.DTOs.Rota;

public class ShiftSwapRequestDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public ShiftSwapType Type { get; set; }
    public ShiftSwapStatus Status { get; set; }

    public Guid RequesterUserId { get; set; }
    public string RequesterName { get; set; } = string.Empty;
    public Guid FromShiftId { get; set; }
    public string FromShiftLabel { get; set; } = string.Empty;

    public Guid? TargetUserId { get; set; }
    public Guid? TargetRotaStaffMemberId { get; set; }
    public bool TargetIsExternal { get; set; }
    public string TargetName { get; set; } = string.Empty;
    public Guid? ToShiftId { get; set; }
    public string? ToShiftLabel { get; set; }

    public string? Note { get; set; }
    public DateTimeOffset CreatedOn { get; set; }
    /// <summary>True when the current caller is the peer who can accept/decline this request.</summary>
    public bool CanRespond { get; set; }
}

public class CreateShiftSwapRequest
{
    public Guid ShopId { get; set; }
    public ShiftSwapType Type { get; set; }
    public Guid FromShiftId { get; set; }
    public Guid? TargetUserId { get; set; }
    public Guid? TargetRotaStaffMemberId { get; set; }
    public Guid? ToShiftId { get; set; }
    public string? Note { get; set; }
}
