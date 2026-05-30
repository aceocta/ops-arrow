namespace ScratchCard.Domain.Constants;

/// <summary>
/// Canonical visit-type values for the Visitors Log. Stored as strings on the entry so new
/// types can be added without a migration. "Inspector" is special — it raises the manager alert.
/// </summary>
public static class VisitorVisitType
{
    public const string Delivery = "Delivery";
    public const string Contractor = "Contractor";
    public const string Rep = "Rep";
    public const string Inspector = "Inspector";
    public const string Other = "Other";

    public static readonly IReadOnlyList<string> All = new[]
    {
        Delivery, Contractor, Rep, Inspector, Other,
    };

    public static bool IsInspector(string? visitType) =>
        string.Equals(visitType?.Trim(), Inspector, StringComparison.OrdinalIgnoreCase);
}
