using Microsoft.EntityFrameworkCore;
using Moq;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.BusinessDays;
using ScratchCard.Application.Services;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;
using ScratchCard.Infrastructure.Persistence;
using ScratchCard.Infrastructure.Repositories;
using Xunit;

namespace ScratchCard.Tests.Integration;

// End-to-end day close against the real ApplicationDbContext (InMemory): seeds shifts/sales/payouts,
// runs CloseAsync through real EF repositories, and asserts the persisted cash figures + summary.
// Cross-cutting services (membership, feature gate, audit, dispatchers) are mocked; the data layer
// and the close arithmetic are real.
public class BusinessDayCloseIntegrationTests
{
    private static BusinessDayService BuildService(ApplicationDbContext db, Guid userId)
    {
        var currentUser = new Mock<ICurrentUserService>();
        currentUser.SetupGet(x => x.UserId).Returns(userId);

        var membership = new Mock<IShopMembershipService>();
        membership
            .Setup(x => x.EnsureCurrentUserShopRoleAsync(It.IsAny<Guid>(), It.IsAny<IEnumerable<string>>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        var features = new Mock<IFeatureGateService>();
        features
            .Setup(x => x.HasFeatureAsync(It.IsAny<Guid>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .ReturnsAsync(false); // no safe-drop cash-variance feature → variance left null

        var audit = new Mock<IAuditService>();
        audit
            .Setup(x => x.LogAsync(It.IsAny<string>(), It.IsAny<Guid?>(), It.IsAny<string>(), It.IsAny<Guid?>(),
                It.IsAny<string>(), It.IsAny<string>(), It.IsAny<string>(), It.IsAny<CancellationToken>()))
            .Returns(Task.CompletedTask);

        return new BusinessDayService(
            new Repository<BusinessDay>(db),
            new Repository<Shift>(db),
            new Repository<RotaShift>(db),
            new Repository<Canister>(db),
            new Repository<ShiftOpeningSerial>(db),
            new Repository<ShiftScratchCardSale>(db),
            new Repository<PrizePayout>(db),
            new Repository<ScratchCardDayCloseSummary>(db),
            new Repository<CanisterDrop>(db),
            new Repository<TemperatureMonitoringUnit>(db),
            new Repository<TemperatureReading>(db),
            new Repository<ComplianceCheckItem>(db),
            new Repository<ComplianceCheckEntry>(db),
            new Repository<UserPushToken>(db),
            new Repository<BusinessDayCloseAttachment>(db),
            new Repository<CfgDayCloseSettings>(db),
            new Repository<CompanySubscription>(db),
            new Repository<ShopUser>(db),
            new Repository<Shop>(db),
            Mock.Of<IShopConfigurationService>(),
            Mock.Of<INotificationService>(),
            audit.Object,
            currentUser.Object,
            Mock.Of<IDayCloseNotificationDispatcher>(),
            Mock.Of<IDayCloseAttachmentDispatcher>(),
            Mock.Of<IAttachmentStorageService>(),
            features.Object,
            membership.Object,
            new UnitOfWork(db));
    }

    [Fact]
    public async Task CloseAsync_computes_expected_cash_and_persists_summary()
    {
        using var db = TestDb.Create(nameof(CloseAsync_computes_expected_cash_and_persists_summary));
        var shopId = Guid.NewGuid();
        var dayId = Guid.NewGuid();
        var shiftId = Guid.NewGuid();

        db.Set<BusinessDay>().Add(new BusinessDay { Id = dayId, ShopId = shopId, BusinessDate = new DateOnly(2026, 6, 16), Status = BusinessDayStatus.Open });
        db.Set<Shift>().Add(new Shift { Id = shiftId, BusinessDayId = dayId, ShopId = shopId, Status = ShiftStatus.Closed, SyncStatus = SyncStatus.Synced });
        db.Set<ShiftScratchCardSale>().AddRange(
            new ShiftScratchCardSale { Id = Guid.NewGuid(), ShiftId = shiftId, SalesAmount = 600m, SoldQuantity = 6 },
            new ShiftScratchCardSale { Id = Guid.NewGuid(), ShiftId = shiftId, SalesAmount = 400m, SoldQuantity = 4 });
        db.Set<PrizePayout>().Add(new PrizePayout { Id = Guid.NewGuid(), BusinessDayId = dayId, ShiftId = shiftId, PrizeAmount = 150m });
        await db.SaveChangesAsync();

        var svc = BuildService(db, Guid.NewGuid());
        var result = await svc.CloseAsync(dayId, new CloseBusinessDayRequest { LottoPayout = 50m, ScratchCardPayout = 40m, TillPayout = 850m });

        // ExpectedCash = sales(1000) − prize(150) = 850; Difference = till(850) − 850 = 0 (balanced).
        Assert.Equal(BusinessDayStatus.Closed.ToString(), result.Status);
        Assert.Equal(850m, result.ExpectedCash);
        Assert.Equal(0m, result.Difference);

        var summary = await db.Set<ScratchCardDayCloseSummary>().FirstAsync(s => s.BusinessDayId == dayId);
        Assert.Equal(50m, summary.LottoPayout);
        Assert.Equal(40m, summary.ScratchCardPayout);
        Assert.Equal(850m, summary.TillPayout);
        Assert.Null(summary.CashVariance); // feature off
    }

    [Fact]
    public async Task CloseAsync_records_a_till_shortfall_as_negative_difference()
    {
        using var db = TestDb.Create(nameof(CloseAsync_records_a_till_shortfall_as_negative_difference));
        var shopId = Guid.NewGuid();
        var dayId = Guid.NewGuid();
        var shiftId = Guid.NewGuid();

        db.Set<BusinessDay>().Add(new BusinessDay { Id = dayId, ShopId = shopId, BusinessDate = new DateOnly(2026, 6, 16), Status = BusinessDayStatus.Open });
        db.Set<Shift>().Add(new Shift { Id = shiftId, BusinessDayId = dayId, ShopId = shopId, Status = ShiftStatus.Closed, SyncStatus = SyncStatus.Synced });
        db.Set<ShiftScratchCardSale>().Add(new ShiftScratchCardSale { Id = Guid.NewGuid(), ShiftId = shiftId, SalesAmount = 500m, SoldQuantity = 5 });
        await db.SaveChangesAsync();

        var svc = BuildService(db, Guid.NewGuid());
        // ExpectedCash = 500 − 0 = 500; counted till = 480 → 20 short.
        var result = await svc.CloseAsync(dayId, new CloseBusinessDayRequest { TillPayout = 480m });

        Assert.Equal(500m, result.ExpectedCash);
        Assert.Equal(-20m, result.Difference);
    }

    [Fact]
    public async Task CloseAsync_blocks_when_a_shift_is_still_open()
    {
        using var db = TestDb.Create(nameof(CloseAsync_blocks_when_a_shift_is_still_open));
        var shopId = Guid.NewGuid();
        var dayId = Guid.NewGuid();

        db.Set<BusinessDay>().Add(new BusinessDay { Id = dayId, ShopId = shopId, BusinessDate = new DateOnly(2026, 6, 16), Status = BusinessDayStatus.Open });
        db.Set<Shift>().Add(new Shift { Id = Guid.NewGuid(), BusinessDayId = dayId, ShopId = shopId, Status = ShiftStatus.Open, SyncStatus = SyncStatus.Synced });
        await db.SaveChangesAsync();

        var svc = BuildService(db, Guid.NewGuid());

        var ex = await Assert.ThrowsAsync<AppException>(
            () => svc.CloseAsync(dayId, new CloseBusinessDayRequest { TillPayout = 0m }));
        Assert.Equal(ErrorCodes.BusinessDayHasOpenShifts, ex.Code);

        var day = await db.Set<BusinessDay>().FirstAsync(d => d.Id == dayId);
        Assert.Equal(BusinessDayStatus.Open, day.Status); // not closed
    }
}
