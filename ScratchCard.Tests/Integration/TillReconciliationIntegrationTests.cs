using Microsoft.EntityFrameworkCore;
using Moq;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Application.Services;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;
using ScratchCard.Infrastructure.Persistence;
using ScratchCard.Infrastructure.Repositories;
using Xunit;

// End-to-end till reconciliation recompute against the real ApplicationDbContext (InMemory): seeds a
// reconciliation with drawer lines, runs SetCashCountAsync through real EF repositories, and asserts
// the persisted ExpectedCash / CashVariance and the status transition. RecomputeAsync + the canonical
// catalogue resolution are real; cross-cutting services are mocked.
namespace ScratchCard.Tests.Integration;

public class TillReconciliationIntegrationTests
{
    private static TillReconciliationService BuildService(ApplicationDbContext db)
    {
        var membership = new Mock<IShopMembershipService>();
        membership
            .Setup(x => x.EnsureCurrentUserShopRoleAsync(It.IsAny<Guid>(), It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var features = new Mock<IFeatureGateService>();
        features
            .Setup(x => x.EnsureFeatureAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);
        features
            .Setup(x => x.HasFeatureAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(true);

        var currentUser = new Mock<ICurrentUserService>();
        currentUser.SetupGet(x => x.UserId).Returns(Guid.NewGuid());

        return new TillReconciliationService(
            new Repository<TillReconciliation>(db),
            new Repository<TillReconciliationLine>(db),
            new Repository<TillReconciliationAttachment>(db),
            new Repository<User>(db),
            Mock.Of<ITillLabelResolver>(),
            Mock.Of<ITillCanonicalAiClassifier>(),
            Mock.Of<ITillReportOcrService>(),
            Mock.Of<IAttachmentStorageService>(),
            membership.Object,
            features.Object,
            new Repository<ShopServiceCounterConfig>(db),
            new Repository<TillFieldOverride>(db),
            new Repository<TillGroupDefinition>(db),
            new Repository<CanisterDrop>(db),
            new Repository<Till>(db),
            new Repository<BusinessDay>(db),
            new Repository<Shift>(db),
            new Repository<ShopUser>(db),
            new Repository<Shop>(db),
            Mock.Of<INotificationService>(),
            currentUser.Object,
            new UnitOfWork(db));
    }

    private static TillReconciliation SeedReconciliation(ApplicationDbContext db, decimal openingFloat, params (string code, TillCanonicalField field, decimal amount)[] lines)
    {
        var recId = Guid.NewGuid();
        var rec = new TillReconciliation
        {
            Id = recId,
            ShopId = Guid.NewGuid(),
            BusinessDate = new DateOnly(2026, 6, 16),
            Status = TillReconciliationStatus.Draft,
            OpeningFloat = openingFloat,
            Lines = lines.Select(l => new TillReconciliationLine
            {
                Id = Guid.NewGuid(),
                TillReconciliationId = recId,
                FieldCode = l.code,
                CanonicalField = l.field,
                VerifiedAmount = l.amount,
            }).ToList(),
        };
        db.Set<TillReconciliation>().Add(rec);
        db.SaveChanges();
        return rec;
    }

    [Fact]
    public async Task SetCashCount_balances_to_zero_variance()
    {
        using var db = TestDb.Create(nameof(SetCashCount_balances_to_zero_variance));
        // Opening float 50 + Cash tender 300 (cash IN, drawer-affecting) = expected 350.
        var rec = SeedReconciliation(db, openingFloat: 50m,
            ("Cash", TillCanonicalField.Cash, 300m),
            ("Card", TillCanonicalField.Card, 120m)); // card does not affect the cash drawer

        var svc = BuildService(db);
        await svc.SetCashCountAsync(new SetCashCountRequest { ReconciliationId = rec.Id, CountedCash = 350m });

        var saved = await db.Set<TillReconciliation>().AsNoTracking().FirstAsync(r => r.Id == rec.Id);
        Assert.Equal(350m, saved.ExpectedCash);
        Assert.Equal(0m, saved.CashVariance);
        Assert.Equal(TillReconciliationStatus.NeedsVerification, saved.Status);
    }

    [Fact]
    public async Task SetCashCount_short_drawer_is_negative_variance()
    {
        using var db = TestDb.Create(nameof(SetCashCount_short_drawer_is_negative_variance));
        // Float 100 + Cash 200 − Cashback 30 (cash OUT) = expected 270; counted 260 → 10 short.
        var rec = SeedReconciliation(db, openingFloat: 100m,
            ("Cash", TillCanonicalField.Cash, 200m),
            ("Cashback", TillCanonicalField.Cashback, 30m));

        var svc = BuildService(db);
        await svc.SetCashCountAsync(new SetCashCountRequest { ReconciliationId = rec.Id, CountedCash = 260m });

        var saved = await db.Set<TillReconciliation>().AsNoTracking().FirstAsync(r => r.Id == rec.Id);
        Assert.Equal(270m, saved.ExpectedCash);
        Assert.Equal(-10m, saved.CashVariance);
    }

    [Fact]
    public async Task SetCashCount_ignores_non_drawer_lines()
    {
        using var db = TestDb.Create(nameof(SetCashCount_ignores_non_drawer_lines));
        // Only the Cash tender touches the drawer; lottery sales arrive via Cash already, so the
        // expected drawer is float(0) + cash(500) = 500 regardless of the counter line.
        var rec = SeedReconciliation(db, openingFloat: 0m,
            ("Cash", TillCanonicalField.Cash, 500m),
            ("LotterySales", TillCanonicalField.LotterySales, 250m));

        var svc = BuildService(db);
        await svc.SetCashCountAsync(new SetCashCountRequest { ReconciliationId = rec.Id, CountedCash = 500m });

        var saved = await db.Set<TillReconciliation>().AsNoTracking().FirstAsync(r => r.Id == rec.Id);
        Assert.Equal(500m, saved.ExpectedCash);
        Assert.Equal(0m, saved.CashVariance);
    }
}
