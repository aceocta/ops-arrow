using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;
using ScratchCard.Infrastructure.Persistence;

namespace ScratchCard.Infrastructure.Seed;

public static class SeedDataInitializer
{
    public static readonly Guid DemoCompanyId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    public static readonly Guid DemoShopId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    public static readonly Guid DemoShopNorthId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    public static readonly Guid PlatformUserId = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private const string PlatformUserEmail = "platform.user@scratchcard.local";
    private const string PlatformUserPassword = "Platform@123";
    private const string PlatformUserFirstName = "Platform";
    private const string PlatformUserLastName = "User";

    public static async Task SeedAsync(ApplicationDbContext dbContext, CancellationToken cancellationToken = default)
    {
        await SeedRolesAsync(dbContext, cancellationToken);
        await SeedDemoCompanyAsync(dbContext, cancellationToken);
        await SeedDemoShopAsync(dbContext, cancellationToken);
        await SeedPlatformUserAsync(dbContext, cancellationToken);
        await SeedSubscriptionPlansAsync(dbContext, cancellationToken);
        await SeedSubscriptionDiscountRulesAsync(dbContext, cancellationToken);
        await SeedDefaultConfigurationsAsync(dbContext, cancellationToken);
        await SeedDemoGamesAsync(dbContext, cancellationToken);
    }

    private static async Task SeedDemoCompanyAsync(ApplicationDbContext dbContext, CancellationToken cancellationToken)
    {
        if (await dbContext.Companies.AnyAsync(x => x.Id == DemoCompanyId, cancellationToken))
        {
            return;
        }

        await dbContext.Companies.AddAsync(new Company
        {
            Id = DemoCompanyId,
            CompanyName = "Demo Scratch Company",
            RegistrationNumber = "DEMO-001",
            IsActive = true,
            CreatedOn = DateTimeOffset.UtcNow
        }, cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static async Task SeedRolesAsync(ApplicationDbContext dbContext, CancellationToken cancellationToken)
    {
        var roles = new[]
        {
            new Role { Name = RoleNames.PlatformAdmin, Description = "Platform-wide billing/configuration administration", IsActive = true },
            new Role { Name = RoleNames.ShopOwner, Description = "Full shop access", IsActive = true },
            new Role { Name = RoleNames.Manager, Description = "Operational manager access", IsActive = true },
            new Role { Name = RoleNames.Cashier, Description = "Cashier access", IsActive = true }
        };

        var existingRoleNames = await dbContext.Roles
            .Select(x => x.Name)
            .ToListAsync(cancellationToken);

        var missingRoles = roles
            .Where(role => !existingRoleNames.Contains(role.Name, StringComparer.OrdinalIgnoreCase))
            .ToArray();

        if (missingRoles.Length == 0)
        {
            return;
        }

        await dbContext.Roles.AddRangeAsync(missingRoles, cancellationToken);

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static async Task SeedPlatformUserAsync(ApplicationDbContext dbContext, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var hasChanges = false;
        var passwordHasher = new PasswordHasher<User>();

        var platformAdminRole = await dbContext.Roles
            .FirstOrDefaultAsync(x => x.Name == RoleNames.PlatformAdmin && x.IsActive, cancellationToken);
        if (platformAdminRole is null)
        {
            return;
        }

        var platformUser = await dbContext.Users
            .FirstOrDefaultAsync(x => x.Email == PlatformUserEmail, cancellationToken);

        if (platformUser is null)
        {
            var newPlatformUser = new User
            {
                Id = PlatformUserId,
                Email = PlatformUserEmail,
                FirstName = PlatformUserFirstName,
                LastName = PlatformUserLastName,
                ExternalProvider = "Seed",
                ExternalProviderUserId = $"seed-{PlatformUserId:N}",
                IsActive = true,
                LastLoginOn = now,
                CreatedOn = now
            };
            newPlatformUser.PasswordHash = passwordHasher.HashPassword(newPlatformUser, PlatformUserPassword);
            platformUser = newPlatformUser;

            await dbContext.Users.AddAsync(platformUser, cancellationToken);
            hasChanges = true;
        }
        else
        {
            if (!platformUser.IsActive)
            {
                platformUser.IsActive = true;
                hasChanges = true;
            }

            if (string.IsNullOrWhiteSpace(platformUser.FirstName))
            {
                platformUser.FirstName = PlatformUserFirstName;
                hasChanges = true;
            }

            if (string.IsNullOrWhiteSpace(platformUser.LastName))
            {
                platformUser.LastName = PlatformUserLastName;
                hasChanges = true;
            }

            if (string.IsNullOrWhiteSpace(platformUser.ExternalProvider))
            {
                platformUser.ExternalProvider = "Seed";
                hasChanges = true;
            }

            if (string.IsNullOrWhiteSpace(platformUser.ExternalProviderUserId))
            {
                platformUser.ExternalProviderUserId = $"seed-{platformUser.Id:N}";
                hasChanges = true;
            }

            if (string.IsNullOrWhiteSpace(platformUser.PasswordHash))
            {
                platformUser.PasswordHash = passwordHasher.HashPassword(platformUser, PlatformUserPassword);
                hasChanges = true;
            }

            if (hasChanges)
            {
                platformUser.ModifiedOn = now;
                platformUser.ModifiedBy = platformUser.Id;
            }
        }

        var platformShopUser = await dbContext.ShopUsers
            .FirstOrDefaultAsync(x => x.ShopId == DemoShopId && x.UserId == platformUser.Id, cancellationToken);
        if (platformShopUser is null)
        {
            await dbContext.ShopUsers.AddAsync(new ShopUser
            {
                ShopId = DemoShopId,
                UserId = platformUser.Id,
                RoleId = platformAdminRole.Id,
                IsActive = true,
                JoinedOn = now,
                CreatedOn = now,
                CreatedBy = platformUser.Id
            }, cancellationToken);
            hasChanges = true;
        }
        else
        {
            var shopUserChanged = false;

            if (!platformShopUser.IsActive)
            {
                platformShopUser.IsActive = true;
                shopUserChanged = true;
            }

            if (platformShopUser.RoleId != platformAdminRole.Id)
            {
                platformShopUser.RoleId = platformAdminRole.Id;
                shopUserChanged = true;
            }

            if (shopUserChanged)
            {
                platformShopUser.ModifiedOn = now;
                platformShopUser.ModifiedBy = platformUser.Id;
                hasChanges = true;
            }
        }

        if (hasChanges)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private static async Task SeedDemoShopAsync(ApplicationDbContext dbContext, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var hasChanges = false;

        var centralShop = await dbContext.Shops.FirstOrDefaultAsync(x => x.Id == DemoShopId, cancellationToken);
        if (centralShop is null)
        {
            await dbContext.Shops.AddAsync(new Shop
            {
                Id = DemoShopId,
                CompanyId = DemoCompanyId,
                ShopName = "Demo Scratch Shop - Central",
                AddressLine1 = "221B Baker Street",
                City = "London",
                PostCode = "NW1 6XE",
                Country = "UK",
                IsActive = true,
                CreatedOn = now
            }, cancellationToken);
            hasChanges = true;
        }
        else if (centralShop.CompanyId != DemoCompanyId)
        {
            centralShop.CompanyId = DemoCompanyId;
            centralShop.ModifiedOn = now;
            hasChanges = true;
        }

        var northShop = await dbContext.Shops.FirstOrDefaultAsync(x => x.Id == DemoShopNorthId, cancellationToken);
        if (northShop is null)
        {
            await dbContext.Shops.AddAsync(new Shop
            {
                Id = DemoShopNorthId,
                CompanyId = DemoCompanyId,
                ShopName = "Demo Scratch Shop - North",
                AddressLine1 = "10 King Street",
                City = "Manchester",
                PostCode = "M2 6AG",
                Country = "UK",
                IsActive = true,
                CreatedOn = now
            }, cancellationToken);
            hasChanges = true;
        }

        if (hasChanges)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private static async Task SeedDemoGamesAsync(ApplicationDbContext dbContext, CancellationToken cancellationToken)
    {
        if (await dbContext.ShopScratchCardGames.AnyAsync(x => x.ShopId == DemoShopId && !x.IsDeleted, cancellationToken))
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        var masterGames = new[]
        {
            new ScratchCardGame
            {
                GameName = "Lucky 7",
                GameCode = "L7",
                TicketPrice = 2,
                TicketsPerPack = 100,
                IsActive = true,
                CreatedOn = now
            },
            new ScratchCardGame
            {
                GameName = "Diamond Win",
                GameCode = "DW",
                TicketPrice = 5,
                TicketsPerPack = 100,
                IsActive = true,
                CreatedOn = now
            }
        };

        foreach (var game in masterGames)
        {
            var existingMaster = await dbContext.ScratchCardGames
                .FirstOrDefaultAsync(x => x.GameCode == game.GameCode && !x.IsDeleted, cancellationToken);
            if (existingMaster is null)
            {
                await dbContext.ScratchCardGames.AddAsync(game, cancellationToken);
                existingMaster = game;
            }

            var existingAssignment = await dbContext.ShopScratchCardGames
                .FirstOrDefaultAsync(
                    x => x.ShopId == DemoShopId && x.MasterGameId == existingMaster.Id && !x.IsDeleted,
                    cancellationToken);
            if (existingAssignment is not null)
            {
                continue;
            }

            await dbContext.ShopScratchCardGames.AddAsync(new ShopScratchCardGame
            {
                ShopId = DemoShopId,
                MasterGameId = existingMaster.Id,
                IsActive = true,
                DefaultStartSerialNumber = "000",
                DefaultEndSerialNumber = "099",
                DefaultSellingOrder = game.GameCode == "DW" ? SellingOrder.Descending : SellingOrder.Ascending,
                CreatedOn = now
            }, cancellationToken);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static async Task SeedDefaultConfigurationsAsync(ApplicationDbContext dbContext, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var hasChanges = false;

        var globalGeneral = await dbContext.CfgGeneralSettings
            .FirstOrDefaultAsync(x => x.ShopId == null, cancellationToken);
        if (globalGeneral is null)
        {
            await dbContext.CfgGeneralSettings.AddAsync(new CfgGeneralSettings
            {
                ShopId = null,
                Currency = "GBP",
                TimeZone = "Europe/London",
                BusinessDateCutOffTime = "23:59",
                EnableAuditLog = true,
                IsActive = true,
                CreatedOn = now
            }, cancellationToken);
            hasChanges = true;
        }

        var globalPack = await dbContext.CfgPackSettings
            .FirstOrDefaultAsync(x => x.ShopId == null, cancellationToken);
        if (globalPack is null)
        {
            await dbContext.CfgPackSettings.AddAsync(new CfgPackSettings
            {
                ShopId = null,
                DefaultSellingOrder = "Ascending",
                PackSellingOrder = "Ascending",
                ScratchCardDisplayCount = 24,
                AllowLeadingZeros = true,
                PreventDuplicatePackNumbers = true,
                RequirePackActivationBeforeSale = true,
                AllowMultipleActivePacksForSameGame = true,
                AutoCompletePackWhenFinalSerialReached = true,
                AllowPackPause = true,
                AllowPackReturn = true,
                AllowIssueMarking = true,
                IsActive = true,
                CreatedOn = now
            }, cancellationToken);
            hasChanges = true;
        }

        var globalSales = await dbContext.CfgSalesSettings
            .FirstOrDefaultAsync(x => x.ShopId == null, cancellationToken);
        if (globalSales is null)
        {
            await dbContext.CfgSalesSettings.AddAsync(new CfgSalesSettings
            {
                ShopId = null,
                AllowBackdatedSales = false,
                MaximumBackdateDays = 1,
                AllowFutureDatedSales = false,
                RequireManagerApprovalForCorrection = true,
                IsActive = true,
                CreatedOn = now
            }, cancellationToken);
            hasChanges = true;
        }

        var globalShift = await dbContext.CfgShiftSettings
            .FirstOrDefaultAsync(x => x.ShopId == null, cancellationToken);
        if (globalShift is null)
        {
            await dbContext.CfgShiftSettings.AddAsync(new CfgShiftSettings
            {
                ShopId = null,
                RequireShiftClose = true,
                AllowShiftReopen = true,
                WhoCanReopenShift = "Manager,ShopOwner",
                ShiftStartTime = "06:00",
                ShiftEndTime = "23:00",
                ShiftDefaultName = "Main Shift",
                ShiftTemplates = "[{\"id\":\"main\",\"name\":\"Main Shift\",\"startTime\":\"06:00\",\"endTime\":\"23:00\",\"isActive\":true}]",
                EnforceShiftTimeWindow = false,
                AllowCustomShiftName = true,
                RequireReasonForManualClosingSerial = false,
                NotifyOnManualClosingSerialEntry = true,
                NotifyOnScannedSerialEdit = true,
                IsActive = true,
                CreatedOn = now
            }, cancellationToken);
            hasChanges = true;
        }

        var globalDayClose = await dbContext.CfgDayCloseSettings
            .FirstOrDefaultAsync(x => x.ShopId == null, cancellationToken);
        if (globalDayClose is null)
        {
            await dbContext.CfgDayCloseSettings.AddAsync(new CfgDayCloseSettings
            {
                ShopId = null,
                RequireDayEndClose = true,
                AllowDayReopen = true,
                WhoCanReopenDay = "Manager,ShopOwner",
                RequireAllShiftsClosedBeforeDayClose = true,
                RequireNoteWhenDayDifferenceExists = true,
                IsActive = true,
                CreatedOn = now
            }, cancellationToken);
            hasChanges = true;
        }

        var globalPrizePayout = await dbContext.CfgPrizePayoutSettings
            .FirstOrDefaultAsync(x => x.ShopId == null, cancellationToken);
        if (globalPrizePayout is null)
        {
            await dbContext.CfgPrizePayoutSettings.AddAsync(new CfgPrizePayoutSettings
            {
                ShopId = null,
                RequirePackNumberForPayout = true,
                RequireTicketNumberForPayout = true,
                CashierPayoutLimit = 200m,
                ManagerApprovalAboveLimit = true,
                PreventDuplicatePayoutForSameTicket = true,
                AllowedPayoutMethods = "Cash,Card,Transfer",
                IsActive = true,
                CreatedOn = now
            }, cancellationToken);
            hasChanges = true;
        }

        var globalNotification = await dbContext.CfgNotificationSettings
            .FirstOrDefaultAsync(x => x.ShopId == null, cancellationToken);
        if (globalNotification is null)
        {
            await dbContext.CfgNotificationSettings.AddAsync(new CfgNotificationSettings
            {
                ShopId = null,
                NotificationChannels = "Email",
                ManualEntryNotificationRecipients = "ShopOwner,Manager",
                CashDifferenceNotificationRecipients = "ShopOwner,Manager",
                HighPrizePayoutNotificationRecipients = "ShopOwner,Manager",
                SendNotificationOnShiftFinalize = true,
                IsActive = true,
                CreatedOn = now
            }, cancellationToken);
            hasChanges = true;
        }

        var globalBarcode = await dbContext.CfgBarcodeSettings
            .FirstOrDefaultAsync(x => x.ShopId == null, cancellationToken);
        if (globalBarcode is null)
        {
            await dbContext.CfgBarcodeSettings.AddAsync(new CfgBarcodeSettings
            {
                ShopId = null,
                EnableMobileCameraBarcodeScanning = true,
                AllowManualEntryIfScanFails = true,
                BarcodeContains = "PackAndSerial",
                PackNumberStartPosition = 0,
                PackNumberLength = 6,
                SerialNumberStartPosition = 6,
                BarcodeSerialNumberLength = 3,
                RemovePrefix = string.Empty,
                RemoveSuffix = string.Empty,
                IsActive = true,
                CreatedOn = now
            }, cancellationToken);
            hasChanges = true;
        }

        var globalOffline = await dbContext.CfgOfflineSettings
            .FirstOrDefaultAsync(x => x.ShopId == null, cancellationToken);
        if (globalOffline is null)
        {
            await dbContext.CfgOfflineSettings.AddAsync(new CfgOfflineSettings
            {
                ShopId = null,
                EnableOfflineShiftClose = true,
                AllowOfflinePrizePayout = true,
                AllowOfflineShiftReconciliation = true,
                AutoSyncWhenOnline = true,
                ConflictRequiresManagerReview = true,
                IsActive = true,
                CreatedOn = now
            }, cancellationToken);
            hasChanges = true;
        }

        var globalSubscription = await dbContext.CfgSubscriptionSettings
            .FirstOrDefaultAsync(x => x.ShopId == null, cancellationToken);
        if (globalSubscription is null)
        {
            await dbContext.CfgSubscriptionSettings.AddAsync(new CfgSubscriptionSettings
            {
                ShopId = null,
                DefaultTrialDays = 30,
                TrialEndingReminderDays = 7,
                PaymentGracePeriodDays = 7,
                BulkDiscountEnabled = true,
                IsActive = true,
                CreatedOn = now
            }, cancellationToken);
            hasChanges = true;
        }

        if (hasChanges)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }

        var scratchCardDisplayCountChanged = false;
        globalPack ??= await dbContext.CfgPackSettings.FirstOrDefaultAsync(x => x.ShopId == null, cancellationToken);
        if (globalPack is not null && globalPack.ScratchCardDisplayCount == 20)
        {
            globalPack.ScratchCardDisplayCount = 24;
            globalPack.ModifiedOn = DateTimeOffset.UtcNow;
            dbContext.CfgPackSettings.Update(globalPack);
            scratchCardDisplayCountChanged = true;
        }

        if (scratchCardDisplayCountChanged)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private static async Task SeedSubscriptionPlansAsync(ApplicationDbContext dbContext, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var existing = await dbContext.SubscriptionPlans
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        if (!existing.Any(x => x.BillingCycle == BillingCycle.Trial))
        {
            await dbContext.SubscriptionPlans.AddAsync(new SubscriptionPlan
            {
                Name = "1 Month Free Trial",
                BillingCycle = BillingCycle.Trial,
                PricePerShop = 0,
                TrialDays = 30,
                Description = "Default free trial for new companies",
                IsActive = true,
                CreatedOn = now
            }, cancellationToken);
        }

        if (!existing.Any(x => x.BillingCycle == BillingCycle.Monthly))
        {
            await dbContext.SubscriptionPlans.AddAsync(new SubscriptionPlan
            {
                Name = "Monthly Plan",
                BillingCycle = BillingCycle.Monthly,
                PricePerShop = 20,
                TrialDays = 0,
                Description = "Monthly subscription per active shop",
                IsActive = true,
                CreatedOn = now
            }, cancellationToken);
        }

        if (!existing.Any(x => x.BillingCycle == BillingCycle.Annual))
        {
            await dbContext.SubscriptionPlans.AddAsync(new SubscriptionPlan
            {
                Name = "Annual Plan",
                BillingCycle = BillingCycle.Annual,
                PricePerShop = 200,
                TrialDays = 0,
                Description = "Annual subscription per active shop",
                IsActive = true,
                CreatedOn = now
            }, cancellationToken);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

    private static async Task SeedSubscriptionDiscountRulesAsync(ApplicationDbContext dbContext, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var existingRules = await dbContext.SubscriptionDiscountRules
            .AsNoTracking()
            .ToListAsync(cancellationToken);

        if (!existingRules.Any(x =>
                x.SubscriptionPlanId == null &&
                x.MinShopCount == 10 &&
                x.MaxShopCount == 19 &&
                x.DiscountType == DiscountType.Percentage &&
                x.DiscountValue == 10))
        {
            await dbContext.SubscriptionDiscountRules.AddAsync(new SubscriptionDiscountRule
            {
                SubscriptionPlanId = null,
                MinShopCount = 10,
                MaxShopCount = 19,
                DiscountType = DiscountType.Percentage,
                DiscountValue = 10,
                IsActive = true,
                Description = "10% discount for 10 to 19 shops",
                CreatedOn = now
            }, cancellationToken);
        }

        if (!existingRules.Any(x =>
                x.SubscriptionPlanId == null &&
                x.MinShopCount == 20 &&
                x.MaxShopCount == null &&
                x.DiscountType == DiscountType.Percentage &&
                x.DiscountValue == 20))
        {
            await dbContext.SubscriptionDiscountRules.AddAsync(new SubscriptionDiscountRule
            {
                SubscriptionPlanId = null,
                MinShopCount = 20,
                MaxShopCount = null,
                DiscountType = DiscountType.Percentage,
                DiscountValue = 20,
                IsActive = true,
                Description = "20% discount for 20+ shops",
                CreatedOn = now
            }, cancellationToken);
        }

        await dbContext.SaveChangesAsync(cancellationToken);
    }

}
