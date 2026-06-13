using ScratchCard.Domain.Enums;

namespace ScratchCard.Domain.Constants;

/// <summary>
/// Built-in reconciliation groups (sections) — the default set every shop starts with, keyed by a
/// stable code matching the <see cref="TillFieldGroup"/> enum names. Single source of truth for the
/// seed (<c>TillGroupDefinition</c> rows) AND the runtime display fallback, so a field whose group
/// hasn't been seeded still renders with a sensible name/order. Shops add custom groups on top.
/// </summary>
public static class TillGroupCatalogue
{
    public sealed record TillGroupMeta(string Code, string DisplayName, int SortOrder);

    public static readonly IReadOnlyList<TillGroupMeta> Defaults = new[]
    {
        new TillGroupMeta(nameof(TillFieldGroup.Tender), "Tenders", 10),
        new TillGroupMeta(nameof(TillFieldGroup.Counter), "Service counters", 20),
        new TillGroupMeta(nameof(TillFieldGroup.Movement), "Cash movements", 30),
        new TillGroupMeta(nameof(TillFieldGroup.Total), "Totals", 40),
        new TillGroupMeta(nameof(TillFieldGroup.Stat), "Stats", 50),
        new TillGroupMeta(nameof(TillFieldGroup.Income), "Income", 60),
        new TillGroupMeta(nameof(TillFieldGroup.Department), "Departments", 70),
        new TillGroupMeta(nameof(TillFieldGroup.Exception), "Exceptions", 80),
        new TillGroupMeta(nameof(TillFieldGroup.Control), "Other", 90),
    };

    public static readonly IReadOnlyDictionary<string, TillGroupMeta> ByCode =
        Defaults.ToDictionary(g => g.Code, System.StringComparer.OrdinalIgnoreCase);
}
