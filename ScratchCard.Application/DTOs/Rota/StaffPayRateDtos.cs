namespace ScratchCard.Application.DTOs.Rota;

public class StaffPayRateDto
{
    public Guid Id { get; set; }
    public Guid ShopId { get; set; }
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }
    public string StaffName { get; set; } = string.Empty;
    public bool IsExternal { get; set; }
    public decimal HourlyRate { get; set; }
    public DateOnly EffectiveFrom { get; set; }
    public string? Notes { get; set; }
}

public class SetStaffPayRateRequest
{
    public Guid ShopId { get; set; }
    public Guid? UserId { get; set; }
    public Guid? RotaStaffMemberId { get; set; }
    public decimal HourlyRate { get; set; }
    public DateOnly EffectiveFrom { get; set; }
    public string? Notes { get; set; }
}
