namespace ScratchCard.Application.Common.Interfaces;

/// <summary>Seeds a shop's default Till Report data (payment types + a default till). Idempotent.</summary>
public interface ITillReportDefaultsService
{
    /// <summary>Internal seed (no auth) — used during shop creation.</summary>
    Task SeedDefaultsAsync(Guid shopId, CancellationToken cancellationToken = default);

    /// <summary>Apply defaults to an existing shop, or every shop in a company. Owner/manager only.
    /// Returns the number of shops seeded.</summary>
    Task<int> ApplyAsync(Guid? shopId, Guid? companyId, CancellationToken cancellationToken = default);
}
