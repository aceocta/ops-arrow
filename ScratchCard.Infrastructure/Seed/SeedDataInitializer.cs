using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;
using ScratchCard.Domain.Seed;
using ScratchCard.Infrastructure.Persistence;

namespace ScratchCard.Infrastructure.Seed;

public static class SeedDataInitializer
{
    public static readonly Guid DemoCompanyId = Guid.Parse("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa");
    public static readonly Guid DemoShopId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    public static readonly Guid DemoShopNorthId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    public static readonly Guid PlatformUserId = Guid.Parse("33333333-3333-3333-3333-333333333333");
    private const string PlatformUserEmail = "sukirtharan.rajadurai@gmail.com";
    private const string PlatformUserPassword = "Debug200!";
    private const string PlatformUserFirstName = "Sukirtharan";
    private const string PlatformUserLastName = "Rajadurai";
    private const string LegacyMainShiftTemplatesJson = "[{\"id\":\"main\",\"name\":\"Main Shift\",\"startTime\":\"06:00\",\"endTime\":\"23:00\",\"isActive\":true}]";
    private const string DefaultShiftTemplatesJson = "[{\"id\":\"morning\",\"name\":\"Morning Shift\",\"startTime\":\"06:00\",\"endTime\":\"14:00\",\"isActive\":true},{\"id\":\"evening\",\"name\":\"Evening Shift\",\"startTime\":\"14:00\",\"endTime\":\"22:00\",\"isActive\":true}]";

    public static async Task SeedAsync(ApplicationDbContext dbContext, CancellationToken cancellationToken = default)
    {
        await SeedRolesAsync(dbContext, cancellationToken);
        await SeedDemoCompanyAsync(dbContext, cancellationToken);
        await SeedDemoShopAsync(dbContext, cancellationToken);
        await SeedComplianceCheckTemplatesAsync(dbContext, cancellationToken);
        await SeedPlatformUserAsync(dbContext, cancellationToken);
        await SeedUserRoleAssignmentsAsync(dbContext, cancellationToken);
        await SeedFeaturesAsync(dbContext, cancellationToken);
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
            new Role { Name = RoleNames.CompanyOwner, Description = "Full shop access", IsActive = true },
            new Role { Name = RoleNames.Manager, Description = "Operational manager access", IsActive = true },
            new Role { Name = RoleNames.Cashier, Description = "Cashier access", IsActive = true },
            new Role { Name = RoleNames.SalesAssistant, Description = "Sales assistant access", IsActive = true }
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

    private static async Task SeedComplianceCheckTemplatesAsync(ApplicationDbContext dbContext, CancellationToken cancellationToken)
    {
        var shopIds = new[] { DemoShopId, DemoShopNorthId };
        var templateItems = ComplianceCheckSeedDefaults.Definitions.ToArray();
        if (templateItems.Length == 0)
        {
            return;
        }

        var now = DateTimeOffset.UtcNow;
        var hasChanges = false;

        foreach (var shopId in shopIds)
        {
            var hasGroupChanges = false;
            var existingGroups = await dbContext.ComplianceCheckGroups
                .Where(x => x.ShopId == shopId && !x.IsDeleted)
                .ToListAsync(cancellationToken);

            var existingGroupKeys = existingGroups
                .Select(x => BuildGroupTemplateKey(x.Frequency, x.GroupName))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var nextGroupOrderByFrequency = existingGroups
                .GroupBy(x => x.Frequency)
                .ToDictionary(x => x.Key, x => x.Max(g => g.DisplayOrder) + 1);

            foreach (var template in templateItems)
            {
                var groupKey = BuildGroupTemplateKey(template.Frequency, template.GroupName);
                if (existingGroupKeys.Contains(groupKey))
                {
                    continue;
                }

                var nextGroupOrder = nextGroupOrderByFrequency.TryGetValue(template.Frequency, out var groupOrder)
                    ? groupOrder
                    : 1;
                nextGroupOrderByFrequency[template.Frequency] = nextGroupOrder + 1;

                var newGroup = new ComplianceCheckGroup
                {
                    ShopId = shopId,
                    Frequency = template.Frequency,
                    GroupName = template.GroupName,
                    DisplayOrder = nextGroupOrder,
                    IsActive = true,
                    IsSystemDefault = true,
                    IsDeleted = false,
                    CreatedOn = now
                };

                await dbContext.ComplianceCheckGroups.AddAsync(newGroup, cancellationToken);
                existingGroups.Add(newGroup);
                existingGroupKeys.Add(groupKey);
                hasGroupChanges = true;
                hasChanges = true;
            }

            if (hasGroupChanges)
            {
                await dbContext.SaveChangesAsync(cancellationToken);
            }

            var groupLookupByKey = existingGroups
                .GroupBy(x => BuildGroupTemplateKey(x.Frequency, x.GroupName))
                .ToDictionary(x => x.Key, x => x.First(), StringComparer.OrdinalIgnoreCase);

            var existingItems = await dbContext.ComplianceCheckItems
                .Where(x => x.ShopId == shopId && !x.IsDeleted)
                .ToListAsync(cancellationToken);

            var groupById = existingGroups.ToDictionary(x => x.Id, x => x);
            var existingKeys = existingItems
                .Select(
                    x =>
                    {
                        if (!groupById.TryGetValue(x.ComplianceCheckGroupId, out var group))
                        {
                            return string.Empty;
                        }

                        return BuildTemplateKey(group.Frequency, group.GroupName, x.ItemName);
                    })
                .Where(x => x.Length > 0)
                .ToHashSet(StringComparer.OrdinalIgnoreCase);

            var nextDisplayOrderByGroup = existingItems
                .GroupBy(x => x.ComplianceCheckGroupId)
                .ToDictionary(x => x.Key, x => x.Max(i => i.DisplayOrder) + 1);

            foreach (var template in templateItems)
            {
                var key = BuildTemplateKey(template.Frequency, template.GroupName, template.ItemName);
                if (existingKeys.Contains(key))
                {
                    continue;
                }

                var groupKey = BuildGroupTemplateKey(template.Frequency, template.GroupName);
                if (!groupLookupByKey.TryGetValue(groupKey, out var group))
                {
                    continue;
                }

                var nextDisplayOrder = nextDisplayOrderByGroup.TryGetValue(group.Id, out var value)
                    ? value
                    : 1;
                nextDisplayOrderByGroup[group.Id] = nextDisplayOrder + 1;

                await dbContext.ComplianceCheckItems.AddAsync(
                    new ComplianceCheckItem
                    {
                        ShopId = shopId,
                        ComplianceCheckGroupId = group.Id,
                        Frequency = template.Frequency,
                        ItemName = template.ItemName,
                        Description = template.Description,
                        DisplayOrder = nextDisplayOrder,
                        IsRequired = template.IsRequired,
                        IsActive = true,
                        IsSystemDefault = true,
                        IsDeleted = false,
                        CreatedOn = now
                    },
                    cancellationToken);

                hasChanges = true;
            }
        }

        if (hasChanges)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private static async Task SeedUserRoleAssignmentsAsync(ApplicationDbContext dbContext, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var hasChanges = false;

        var rolesByName = await dbContext.Roles
            .Where(x => x.IsActive && (x.Name == RoleNames.CompanyOwner || x.Name == RoleNames.PlatformAdmin))
            .ToDictionaryAsync(x => x.Name, x => x, cancellationToken);

        if (rolesByName.TryGetValue(RoleNames.CompanyOwner, out var CompanyOwnerRole))
        {
            var ownerUserIds = await dbContext.Companies
                .AsNoTracking()
                .Where(x => !x.IsDeleted && x.OwnerUserId.HasValue)
                .Select(x => x.OwnerUserId!.Value)
                .Distinct()
                .ToListAsync(cancellationToken);

            if (ownerUserIds.Count > 0)
            {
                var existingOwnerRoles = await dbContext.UserRoles
                    .Where(x => x.RoleId == CompanyOwnerRole.Id && ownerUserIds.Contains(x.UserId))
                    .ToListAsync(cancellationToken);

                var ownerRolesByUserId = existingOwnerRoles
                    .GroupBy(x => x.UserId)
                    .ToDictionary(x => x.Key, x => x.OrderByDescending(r => r.IsActive).ThenByDescending(r => r.AssignedOn).First());

                foreach (var ownerUserId in ownerUserIds)
                {
                    if (!ownerRolesByUserId.TryGetValue(ownerUserId, out var existingRole))
                    {
                        await dbContext.UserRoles.AddAsync(new UserRole
                        {
                            UserId = ownerUserId,
                            RoleId = CompanyOwnerRole.Id,
                            IsActive = true,
                            AssignedOn = now,
                            CreatedOn = now,
                            CreatedBy = ownerUserId
                        }, cancellationToken);
                        hasChanges = true;
                        continue;
                    }

                    if (existingRole.IsActive)
                    {
                        continue;
                    }

                    existingRole.IsActive = true;
                    existingRole.AssignedOn = now;
                    existingRole.ModifiedOn = now;
                    existingRole.ModifiedBy = ownerUserId;
                    hasChanges = true;
                }
            }
        }

        if (rolesByName.TryGetValue(RoleNames.PlatformAdmin, out var platformAdminRole))
        {
            var platformUser = await dbContext.Users
                .FirstOrDefaultAsync(x => x.Email == PlatformUserEmail, cancellationToken);

            if (platformUser is not null)
            {
                var existingPlatformRole = await dbContext.UserRoles
                    .FirstOrDefaultAsync(x => x.UserId == platformUser.Id && x.RoleId == platformAdminRole.Id, cancellationToken);

                if (existingPlatformRole is null)
                {
                    await dbContext.UserRoles.AddAsync(new UserRole
                    {
                        UserId = platformUser.Id,
                        RoleId = platformAdminRole.Id,
                        IsActive = true,
                        AssignedOn = now,
                        CreatedOn = now,
                        CreatedBy = platformUser.Id
                    }, cancellationToken);
                    hasChanges = true;
                }
                else if (!existingPlatformRole.IsActive)
                {
                    existingPlatformRole.IsActive = true;
                    existingPlatformRole.AssignedOn = now;
                    existingPlatformRole.ModifiedOn = now;
                    existingPlatformRole.ModifiedBy = platformUser.Id;
                    hasChanges = true;
                }
            }
        }

        if (hasChanges)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private static string BuildGroupTemplateKey(ComplianceCheckFrequency frequency, string groupName)
    {
        return $"{frequency}:{groupName.Trim()}";
    }

    private static string BuildTemplateKey(ComplianceCheckFrequency frequency, string groupName, string itemName)
    {
        return $"{frequency}:{groupName.Trim()}:{itemName.Trim()}";
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
                WhoCanReopenShift = "Manager,CompanyOwner",
                ShiftStartTime = "06:00",
                ShiftEndTime = "22:00",
                ShiftDefaultName = "Morning Shift",
                ShiftTemplates = DefaultShiftTemplatesJson,
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
                WhoCanReopenDay = "Manager,CompanyOwner",
                RequireAllShiftsClosedBeforeDayClose = true,
                RequireNoteWhenDayDifferenceExists = true,
                EnableSafeDropManagement = false,
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
                ManualEntryNotificationRecipients = "CompanyOwner,Manager",
                CashDifferenceNotificationRecipients = "CompanyOwner,Manager",
                HighPrizePayoutNotificationRecipients = "CompanyOwner,Manager",
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

        var defaultSettingsChanged = false;
        globalPack ??= await dbContext.CfgPackSettings.FirstOrDefaultAsync(x => x.ShopId == null, cancellationToken);
        if (globalPack is not null && globalPack.ScratchCardDisplayCount == 20)
        {
            globalPack.ScratchCardDisplayCount = 24;
            globalPack.ModifiedOn = DateTimeOffset.UtcNow;
            dbContext.CfgPackSettings.Update(globalPack);
            defaultSettingsChanged = true;
        }

        globalShift ??= await dbContext.CfgShiftSettings.FirstOrDefaultAsync(x => x.ShopId == null, cancellationToken);
        if (globalShift is not null)
        {
            var normalizedTemplates = (globalShift.ShiftTemplates ?? string.Empty).Trim();
            var isLegacySingleShift =
                string.Equals(normalizedTemplates, LegacyMainShiftTemplatesJson, StringComparison.OrdinalIgnoreCase) ||
                (string.Equals(globalShift.ShiftDefaultName?.Trim(), "Main Shift", StringComparison.OrdinalIgnoreCase)
                 && string.Equals(globalShift.ShiftStartTime?.Trim(), "06:00", StringComparison.OrdinalIgnoreCase)
                 && string.Equals(globalShift.ShiftEndTime?.Trim(), "23:00", StringComparison.OrdinalIgnoreCase));

            if (isLegacySingleShift)
            {
                globalShift.ShiftStartTime = "06:00";
                globalShift.ShiftEndTime = "22:00";
                globalShift.ShiftDefaultName = "Morning Shift";
                globalShift.ShiftTemplates = DefaultShiftTemplatesJson;
                globalShift.ModifiedOn = DateTimeOffset.UtcNow;
                dbContext.CfgShiftSettings.Update(globalShift);
                defaultSettingsChanged = true;
            }
        }

        if (defaultSettingsChanged)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private static async Task SeedFeaturesAsync(ApplicationDbContext dbContext, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;
        var existing = await dbContext.Features.ToListAsync(cancellationToken);
        var byKey = existing.ToDictionary(x => x.Key, StringComparer.OrdinalIgnoreCase);
        var changed = false;

        foreach (var entry in FeatureKeys.Catalog)
        {
            if (byKey.TryGetValue(entry.Key, out var current))
            {
                // Refresh display metadata in case the catalogue text was updated. Don't touch
                // IsActive — admins may have deactivated a feature deliberately. Name/Category
                // updates are safe.
                var dirty = false;
                if (!string.Equals(current.Name, entry.Name, StringComparison.Ordinal)) { current.Name = entry.Name; dirty = true; }
                if (!string.Equals(current.Description ?? string.Empty, entry.Description ?? string.Empty, StringComparison.Ordinal)) { current.Description = entry.Description; dirty = true; }
                if (!string.Equals(current.Category ?? string.Empty, entry.Category, StringComparison.Ordinal)) { current.Category = entry.Category; dirty = true; }
                if (current.DisplayOrder != entry.DisplayOrder) { current.DisplayOrder = entry.DisplayOrder; dirty = true; }
                if (!current.IsSystem) { current.IsSystem = true; dirty = true; }
                if (dirty) { current.ModifiedOn = now; changed = true; }
                continue;
            }

            await dbContext.Features.AddAsync(new Feature
            {
                Key = entry.Key,
                Name = entry.Name,
                Description = entry.Description,
                Category = entry.Category,
                DisplayOrder = entry.DisplayOrder,
                IsActive = true,
                IsSystem = true,
                CreatedOn = now
            }, cancellationToken);
            changed = true;
        }

        if (changed)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private static async Task SeedSubscriptionPlansAsync(ApplicationDbContext dbContext, CancellationToken cancellationToken)
    {
        var now = DateTimeOffset.UtcNow;

        // --- Feature sets per tier ---
        // Starter: basic capabilities + 3 users + 30 report exports/month + email notifications.
        var starterFeatures = new[]
        {
            FeatureKeys.ScratchCardManagement, FeatureKeys.TemperatureLog, FeatureKeys.RefusalNoIdNoSale,
            FeatureKeys.ComplianceChecklist, FeatureKeys.SafeDropManagement,
            FeatureKeys.ScratchCardBasic,
            FeatureKeys.TemperatureLogBasic,
            FeatureKeys.RefusalLogBasic,
            FeatureKeys.ComplianceBasic,
            FeatureKeys.SafeDropBasic,
            FeatureKeys.NotificationsEmail,
        };

        // Growth: Starter + attachments, missed-log warnings, multi-manager review, daily/weekly/monthly
        // compliance, canister-limit alerts, push + WhatsApp notifications, basic dashboard, audit log.
        var growthFeatures = starterFeatures.Concat(new[]
        {
            FeatureKeys.ScratchCardAttachments, FeatureKeys.ScratchCardManualEntryAlerts,
            FeatureKeys.TemperatureLogMissedAlerts,
            FeatureKeys.RefusalLogAttachments, FeatureKeys.RefusalLogMultiManagerReview,
            FeatureKeys.ComplianceDailyWeeklyMonthly,
            FeatureKeys.SafeDropCanisterLimitAlerts,
            FeatureKeys.NotificationsPush, FeatureKeys.NotificationsWhatsApp,
            FeatureKeys.DashboardBasic,
            FeatureKeys.AuditLogBasic,
            FeatureKeys.StoreSales, FeatureKeys.StoreSalesBasic,
        }).ToArray();

        // Pro: Growth + advanced validation, suspicious alerts, scheduled checks, full history,
        // analytics, staff-wise reports, advanced compliance with photo evidence, advanced safe drop
        // (approval workflow + cash variance), priority notifications + support, advanced + multi-shop
        // dashboards, approval workflow, advanced reports.
        var proFeatures = growthFeatures.Concat(new[]
        {
            FeatureKeys.ScratchCardAdvancedValidation, FeatureKeys.ScratchCardManualCorrectionReasons,
            FeatureKeys.ScratchCardSuspiciousAlerts,
            FeatureKeys.TemperatureLogScheduledChecks, FeatureKeys.TemperatureLogFullHistory,
            FeatureKeys.RefusalLogAnalytics, FeatureKeys.RefusalLogStaffReports,
            FeatureKeys.ComplianceAdvanced, FeatureKeys.CompliancePhotoEvidence,
            FeatureKeys.SafeDropApprovalWorkflow, FeatureKeys.SafeDropCashVariance,
            FeatureKeys.NotificationsPriority,
            FeatureKeys.DashboardAdvanced, FeatureKeys.DashboardMultiShop,
            FeatureKeys.ApprovalWorkflow,
            FeatureKeys.ReportsAdvanced,
            FeatureKeys.SupportPriority,
            FeatureKeys.StoreSalesAi,
        }).ToArray();

        // Monthly-only catalogue. MaxUsers / ReportExportsPerMonth: null means unlimited.
        //
        // Trial length: each tier owns its own TrialDays. ShopSubscriptionService.EnsureTrialAsync
        // reads the picked plan's TrialDays at shop-creation time. Change a value below and the
        // next new shop created against that plan picks up the new length immediately (existing
        // shops keep their TrialEndsOn from when they were created).
        //
        // Stripe Price IDs are baked in here for the launch catalogue. These are the LIVE-mode
        // IDs from the Stripe Dashboard. For local/dev environments hitting Stripe test mode,
        // override per-row via the admin endpoint (PUT /api/admin/subscription-plans/{id}).
        var templates = new[]
        {
            new PlanTemplate("Starter Monthly", BillingCycle.Monthly, 19.99m, 14, starterFeatures, 3,    30,
                "Starter: Scratch Card, Temperature Log, Refusals, Compliance, Safe Drop. 3 users. 14-day trial.",
                DisplayOrder: 10, StripePriceId: "price_1TbQCJRgwX1Uk75r1ERWd3ry"),
            new PlanTemplate("Growth Monthly",  BillingCycle.Monthly, 39.99m, 30, growthFeatures, 10,   100,
                "Growth: attachments, missed-log alerts, advanced compliance schedules, dashboard, audit log. 30-day trial.",
                DisplayOrder: 20, StripePriceId: "price_1TbQESRgwX1Uk75r8MMqzMpX"),
            new PlanTemplate("Pro Monthly",     BillingCycle.Monthly, 79.99m, 30, proFeatures,    null, 500,
                "Pro: advanced validation, approval workflows, multi-shop dashboards, unlimited users. 30-day trial.",
                DisplayOrder: 30, StripePriceId: "price_1TbQG2RgwX1Uk75rgbfigobj"),
        };

        var existing = await dbContext.SubscriptionPlans.ToListAsync(cancellationToken);
        var featureByKey = await dbContext.Features
            .ToDictionaryAsync(x => x.Key, StringComparer.OrdinalIgnoreCase, cancellationToken);
        var changed = false;

        foreach (var template in templates)
        {
            var current = existing.FirstOrDefault(p =>
                string.Equals(p.Name, template.Name, StringComparison.OrdinalIgnoreCase) && p.BillingCycle == template.BillingCycle);

            if (current is null)
            {
                var plan = new SubscriptionPlan
                {
                    Name = template.Name,
                    BillingCycle = template.BillingCycle,
                    PricePerShop = template.Price,
                    TrialDays = template.TrialDays,
                    Description = template.Description,
                    MaxUsers = template.MaxUsers,
                    ReportExportsPerMonth = template.ReportExportsPerMonth,
                    StripePriceId = template.StripePriceId,
                    DisplayOrder = template.DisplayOrder,
                    IsActive = true,
                    CreatedOn = now,
                };
                await dbContext.SubscriptionPlans.AddAsync(plan, cancellationToken);

                foreach (var featureKey in template.Features.Distinct(StringComparer.OrdinalIgnoreCase))
                {
                    if (!featureByKey.TryGetValue(featureKey, out var feature)) continue;
                    plan.PlanFeatures.Add(new SubscriptionPlanFeature
                    {
                        SubscriptionPlanId = plan.Id,
                        FeatureId = feature.Id,
                        IsEnabled = true,
                        CreatedOn = now
                    });
                }
                changed = true;
                continue;
            }

            // Plan already exists. The admin endpoint (/api/admin/subscription-plans/{id}) is now
            // the source of truth for plan config (trial days, price, features, store IDs, etc.).
            // Re-seeding must NOT overwrite admin edits, so we leave existing rows untouched.
            //
            // If you need to force the templates back into the DB (e.g. catastrophic recovery),
            // delete the plan rows or hit the admin update endpoint explicitly.
        }

        // Defensive: deactivate any historical Annual SKUs so they no longer appear in the picker.
        // The app is monthly-only; this keeps old databases tidy without dropping rows that may be
        // referenced by old ShopSubscription/CompanySubscription records.
        var annualPlans = await dbContext.SubscriptionPlans
            .Where(p => p.BillingCycle == BillingCycle.Annual && p.IsActive)
            .ToListAsync(cancellationToken);

        foreach (var plan in annualPlans)
        {
            plan.IsActive = false;
            plan.ModifiedOn = now;
            changed = true;
        }

        if (changed)
        {
            await dbContext.SaveChangesAsync(cancellationToken);
        }
    }

    private sealed record PlanTemplate(
        string Name,
        BillingCycle BillingCycle,
        decimal Price,
        int TrialDays,
        IReadOnlyCollection<string> Features,
        int? MaxUsers,
        int? ReportExportsPerMonth,
        string Description,
        int DisplayOrder = 0,
        string? StripePriceId = null);

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


