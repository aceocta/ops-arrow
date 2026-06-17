using Microsoft.EntityFrameworkCore;
using ScratchCard.Infrastructure.Persistence;

namespace ScratchCard.Tests.Integration;

// EF Core InMemory harness for integration tests. Each call gets an isolated database (unique name)
// so tests don't bleed into one another. InMemory is not relational (no FK/constraint enforcement),
// which is fine here — these tests exercise service logic + LINQ aggregation, not DB constraints.
internal static class TestDb
{
    public static ApplicationDbContext Create(string name)
    {
        var options = new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseInMemoryDatabase(databaseName: name)
            .EnableSensitiveDataLogging()
            // InMemory raises a warning for relational-only config (e.g. filtered indexes) during
            // model build; ignore it so the shared production model loads unchanged.
            .ConfigureWarnings(w => w.Ignore(Microsoft.EntityFrameworkCore.Diagnostics.InMemoryEventId.TransactionIgnoredWarning))
            .Options;
        return new ApplicationDbContext(options);
    }
}
