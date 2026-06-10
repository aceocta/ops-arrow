using ScratchCard.Domain.Common;

namespace ScratchCard.Domain.Entities;

/// <summary>
/// A global alias that maps a normalized till label to a canonical field <see cref="Code"/>. Stored
/// as data so the alias dictionary can be edited without a deploy. Seeded from the built-in alias
/// dictionary on first run; loaded into the resolver's runtime cache alongside the definitions.
/// </summary>
public class TillFieldAlias : AuditableEntity
{
    public string NormalizedAlias { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
}
