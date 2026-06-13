using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A reconciliation group (section) a till field can belong to — e.g. "Tenders", "Cash movements",
/// "Totals". Data-driven so shops can define their own beyond the built-in set. Built-in groups have
/// a null <see cref="ShopId"/> (global, seeded from the <c>TillFieldGroup</c> enum, read-only);
/// custom groups belong to one shop. <see cref="Code"/> is the stable identity referenced by
/// <see cref="TillFieldDefinition.GroupCode"/> / <see cref="TillFieldOverride.GroupCode"/>; renaming
/// changes only <see cref="DisplayName"/>, so existing reconciliations re-label automatically.
/// </summary>
public class TillGroupDefinition : SoftDeletableAuditableEntity
{
    /// <summary>Null = global built-in (all shops); set = a custom group owned by that shop.</summary>
    public Guid? ShopId { get; set; }
    public string Code { get; set; } = string.Empty;
    public string DisplayName { get; set; } = string.Empty;
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
    public bool IsBuiltIn { get; set; }

    public Shop? Shop { get; set; }
}
