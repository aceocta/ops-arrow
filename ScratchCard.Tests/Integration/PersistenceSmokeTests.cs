using ScratchCard.Domain.Entities;
using ScratchCard.Infrastructure.Repositories;
using Xunit;

namespace ScratchCard.Tests.Integration;

// Smoke test: proves the production ApplicationDbContext model builds under the InMemory provider
// and the generic Repository round-trips an entity. This is the foundation the workflow integration
// tests build on — if the model can't load, those can't run either.
public class PersistenceSmokeTests
{
    [Fact]
    public async Task Repository_round_trips_a_business_day()
    {
        using var db = TestDb.Create(nameof(Repository_round_trips_a_business_day));
        var repo = new Repository<BusinessDay>(db);

        var shopId = Guid.NewGuid();
        var day = new BusinessDay
        {
            Id = Guid.NewGuid(),
            ShopId = shopId,
            BusinessDate = new DateOnly(2026, 6, 16),
            Status = Domain.Enums.BusinessDayStatus.Open,
        };
        await repo.AddAsync(day);
        await db.SaveChangesAsync();

        var loaded = await repo.GetByIdAsync(day.Id);
        Assert.NotNull(loaded);
        Assert.Equal(shopId, loaded!.ShopId);
        Assert.Equal(Domain.Enums.BusinessDayStatus.Open, loaded.Status);
    }
}
