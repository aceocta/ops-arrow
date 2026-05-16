using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Configurations;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class ConfigurationService : IConfigurationService
{
    private const string GeneralGroup = "General Settings";
    private const string PackGroup = "Pack Settings";
    private const string SalesGroup = "Sales Settings";
    private const string ShiftGroup = "Shift Settings";
    private const string DayCloseGroup = "Day Close Settings";
    private const string PrizePayoutGroup = "Prize Payout Settings";
    private const string NotificationGroup = "Notification Settings";
    private const string BarcodeGroup = "Barcode Settings";
    private const string OfflineGroup = "Offline Settings";
    private const string SubscriptionGroup = "Subscription Settings";

    private readonly IRepository<CfgGeneralSettings> _generalRepository;
    private readonly IRepository<CfgPackSettings> _packRepository;
    private readonly IRepository<CfgSalesSettings> _salesRepository;
    private readonly IRepository<CfgShiftSettings> _shiftRepository;
    private readonly IRepository<CfgDayCloseSettings> _dayCloseRepository;
    private readonly IRepository<CfgPrizePayoutSettings> _prizePayoutRepository;
    private readonly IRepository<CfgNotificationSettings> _notificationRepository;
    private readonly IRepository<CfgBarcodeSettings> _barcodeRepository;
    private readonly IRepository<CfgOfflineSettings> _offlineRepository;
    private readonly IRepository<CfgSubscriptionSettings> _subscriptionRepository;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public ConfigurationService(
        IRepository<CfgGeneralSettings> generalRepository,
        IRepository<CfgPackSettings> packRepository,
        IRepository<CfgSalesSettings> salesRepository,
        IRepository<CfgShiftSettings> shiftRepository,
        IRepository<CfgDayCloseSettings> dayCloseRepository,
        IRepository<CfgPrizePayoutSettings> prizePayoutRepository,
        IRepository<CfgNotificationSettings> notificationRepository,
        IRepository<CfgBarcodeSettings> barcodeRepository,
        IRepository<CfgOfflineSettings> offlineRepository,
        IRepository<CfgSubscriptionSettings> subscriptionRepository,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _generalRepository = generalRepository;
        _packRepository = packRepository;
        _salesRepository = salesRepository;
        _shiftRepository = shiftRepository;
        _dayCloseRepository = dayCloseRepository;
        _prizePayoutRepository = prizePayoutRepository;
        _notificationRepository = notificationRepository;
        _barcodeRepository = barcodeRepository;
        _offlineRepository = offlineRepository;
        _subscriptionRepository = subscriptionRepository;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<IReadOnlyCollection<ConfigurationItemDto>> GetAsync(Guid? shopId, CancellationToken cancellationToken = default)
    {
        var (globalGeneral, shopGeneral) = await LoadRowsAsync(_generalRepository, shopId, cancellationToken);
        var (globalPack, shopPack) = await LoadRowsAsync(_packRepository, shopId, cancellationToken);
        var (globalSales, shopSales) = await LoadRowsAsync(_salesRepository, shopId, cancellationToken);
        var (globalShift, shopShift) = await LoadRowsAsync(_shiftRepository, shopId, cancellationToken);
        var (globalDayClose, shopDayClose) = await LoadRowsAsync(_dayCloseRepository, shopId, cancellationToken);
        var (globalPrizePayout, shopPrizePayout) = await LoadRowsAsync(_prizePayoutRepository, shopId, cancellationToken);
        var (globalNotification, shopNotification) = await LoadRowsAsync(_notificationRepository, shopId, cancellationToken);
        var (globalBarcode, shopBarcode) = await LoadRowsAsync(_barcodeRepository, shopId, cancellationToken);
        var (globalOffline, shopOffline) = await LoadRowsAsync(_offlineRepository, shopId, cancellationToken);
        var (globalSubscription, shopSubscription) = await LoadRowsAsync(_subscriptionRepository, shopId, cancellationToken);

        var fallbackBusinessStartTime = Resolve(shopShift?.ShiftStartTime, globalShift?.ShiftStartTime, "06:00");
        var fallbackBusinessEndTime = Resolve(
            shopGeneral?.BusinessDateCutOffTime,
            globalGeneral?.BusinessDateCutOffTime,
            Resolve(shopShift?.ShiftEndTime, globalShift?.ShiftEndTime, "21:59"));

        var items = new List<ConfigurationItemDto>();

        AddItem(items, shopId, GeneralGroup, "Currency", Resolve(shopGeneral?.Currency, globalGeneral?.Currency, "GBP"), "string", "Default currency");
        AddItem(items, shopId, GeneralGroup, ConfigurationKeys.TimeZone, Resolve(shopGeneral?.TimeZone, globalGeneral?.TimeZone, "Europe/London"), "string", "Default timezone");
        AddItem(items, shopId, GeneralGroup, ConfigurationKeys.BusinessStartTime, Resolve(shopGeneral?.BusinessStartTime, globalGeneral?.BusinessStartTime, fallbackBusinessStartTime), "string", "Business day start time (HH:mm).");
        AddItem(items, shopId, GeneralGroup, ConfigurationKeys.BusinessEndTime, Resolve(shopGeneral?.BusinessEndTime, globalGeneral?.BusinessEndTime, fallbackBusinessEndTime), "string", "Business day end time (HH:mm). Overnight windows are supported.");
        AddItem(items, shopId, GeneralGroup, "BusinessDateCutOffTime", Resolve(shopGeneral?.BusinessDateCutOffTime, globalGeneral?.BusinessDateCutOffTime, "23:59"), "string", "Business date cutoff");
        AddItem(items, shopId, GeneralGroup, "EnableAuditLog", ToConfigString(Resolve(shopGeneral?.EnableAuditLog, globalGeneral?.EnableAuditLog, true)), "bool", "Audit logs enabled");

        AddItem(items, shopId, PackGroup, "DefaultSellingOrder", Resolve(shopPack?.DefaultSellingOrder, globalPack?.DefaultSellingOrder, "Ascending"), "string", null);
        AddItem(items, shopId, PackGroup, ConfigurationKeys.PackSellingOrder, Resolve(shopPack?.PackSellingOrder, globalPack?.PackSellingOrder, "Ascending"), "string", string.Empty);
        AddItem(items, shopId, PackGroup, ConfigurationKeys.ScratchCardDisplayCount, ToConfigString(Resolve(shopPack?.ScratchCardDisplayCount, globalPack?.ScratchCardDisplayCount, 24)), "int", "Number of scratch-card display positions available in this shop.");
        AddItem(items, shopId, PackGroup, "AllowLeadingZeros", ToConfigString(Resolve(shopPack?.AllowLeadingZeros, globalPack?.AllowLeadingZeros, true)), "bool", null);
        AddItem(items, shopId, PackGroup, "PreventDuplicatePackNumbers", ToConfigString(Resolve(shopPack?.PreventDuplicatePackNumbers, globalPack?.PreventDuplicatePackNumbers, true)), "bool", null);
        AddItem(items, shopId, PackGroup, "RequirePackActivationBeforeSale", ToConfigString(Resolve(shopPack?.RequirePackActivationBeforeSale, globalPack?.RequirePackActivationBeforeSale, true)), "bool", null);
        AddItem(items, shopId, PackGroup, "AllowMultipleActivePacksForSameGame", ToConfigString(Resolve(shopPack?.AllowMultipleActivePacksForSameGame, globalPack?.AllowMultipleActivePacksForSameGame, true)), "bool", null);
        AddItem(items, shopId, PackGroup, "AutoCompletePackWhenFinalSerialReached", ToConfigString(Resolve(shopPack?.AutoCompletePackWhenFinalSerialReached, globalPack?.AutoCompletePackWhenFinalSerialReached, true)), "bool", null);
        AddItem(items, shopId, PackGroup, "AllowPackPause", ToConfigString(Resolve(shopPack?.AllowPackPause, globalPack?.AllowPackPause, true)), "bool", null);
        AddItem(items, shopId, PackGroup, "AllowPackReturn", ToConfigString(Resolve(shopPack?.AllowPackReturn, globalPack?.AllowPackReturn, true)), "bool", null);
        AddItem(items, shopId, PackGroup, "AllowIssueMarking", ToConfigString(Resolve(shopPack?.AllowIssueMarking, globalPack?.AllowIssueMarking, true)), "bool", null);

        AddItem(items, shopId, SalesGroup, "AllowBackdatedSales", ToConfigString(Resolve(shopSales?.AllowBackdatedSales, globalSales?.AllowBackdatedSales, false)), "bool", null);
        AddItem(items, shopId, SalesGroup, "MaximumBackdateDays", ToConfigString(Resolve(shopSales?.MaximumBackdateDays, globalSales?.MaximumBackdateDays, 1)), "int", null);
        AddItem(items, shopId, SalesGroup, "AllowFutureDatedSales", ToConfigString(Resolve(shopSales?.AllowFutureDatedSales, globalSales?.AllowFutureDatedSales, false)), "bool", null);
        AddItem(items, shopId, SalesGroup, "RequireManagerApprovalForCorrection", ToConfigString(Resolve(shopSales?.RequireManagerApprovalForCorrection, globalSales?.RequireManagerApprovalForCorrection, true)), "bool", null);

        AddItem(items, shopId, ShiftGroup, "RequireShiftClose", ToConfigString(Resolve(shopShift?.RequireShiftClose, globalShift?.RequireShiftClose, true)), "bool", null);
        AddItem(items, shopId, ShiftGroup, "AllowShiftReopen", ToConfigString(Resolve(shopShift?.AllowShiftReopen, globalShift?.AllowShiftReopen, true)), "bool", null);
        AddItem(items, shopId, ShiftGroup, "WhoCanReopenShift", Resolve(shopShift?.WhoCanReopenShift, globalShift?.WhoCanReopenShift, "Manager,ShopOwner"), "string", null);
        AddItem(items, shopId, ShiftGroup, ConfigurationKeys.ShiftStartTime, Resolve(shopShift?.ShiftStartTime, globalShift?.ShiftStartTime, "06:00"), "string", "Configured shift opening window start time (HH:mm)");
        AddItem(items, shopId, ShiftGroup, ConfigurationKeys.ShiftEndTime, Resolve(shopShift?.ShiftEndTime, globalShift?.ShiftEndTime, "23:00"), "string", "Configured shift opening window end time (HH:mm)");
        AddItem(items, shopId, ShiftGroup, ConfigurationKeys.ShiftDefaultName, Resolve(shopShift?.ShiftDefaultName, globalShift?.ShiftDefaultName, "Main Shift"), "string", "Default shift name used when custom names are not allowed");
        AddItem(items, shopId, ShiftGroup, ConfigurationKeys.ShiftTemplates, Resolve(shopShift?.ShiftTemplates, globalShift?.ShiftTemplates, "[{\"id\":\"main\",\"name\":\"Main Shift\",\"startTime\":\"06:00\",\"endTime\":\"23:00\",\"isActive\":true}]"), "json", "Shop shift templates. Supports multiple shifts and overnight windows (end time earlier than start means next day).");
        AddItem(items, shopId, ShiftGroup, ConfigurationKeys.EnforceShiftTimeWindow, ToConfigString(Resolve(shopShift?.EnforceShiftTimeWindow, globalShift?.EnforceShiftTimeWindow, false)), "bool", "Allow opening shifts only inside configured start/end time window");
        AddItem(items, shopId, ShiftGroup, ConfigurationKeys.AllowCustomShiftName, ToConfigString(Resolve(shopShift?.AllowCustomShiftName, globalShift?.AllowCustomShiftName, true)), "bool", "Allow manually entering shift name when opening a shift");
        AddItem(items, shopId, ShiftGroup, "RequireReasonForManualClosingSerial", ToConfigString(Resolve(shopShift?.RequireReasonForManualClosingSerial, globalShift?.RequireReasonForManualClosingSerial, false)), "bool", null);
        AddItem(items, shopId, ShiftGroup, "NotifyOnManualClosingSerialEntry", ToConfigString(Resolve(shopShift?.NotifyOnManualClosingSerialEntry, globalShift?.NotifyOnManualClosingSerialEntry, true)), "bool", null);
        AddItem(items, shopId, ShiftGroup, "NotifyOnScannedSerialEdit", ToConfigString(Resolve(shopShift?.NotifyOnScannedSerialEdit, globalShift?.NotifyOnScannedSerialEdit, true)), "bool", null);

        AddItem(items, shopId, DayCloseGroup, "RequireDayEndClose", ToConfigString(Resolve(shopDayClose?.RequireDayEndClose, globalDayClose?.RequireDayEndClose, true)), "bool", null);
        AddItem(items, shopId, DayCloseGroup, "AllowDayReopen", ToConfigString(Resolve(shopDayClose?.AllowDayReopen, globalDayClose?.AllowDayReopen, true)), "bool", null);
        AddItem(items, shopId, DayCloseGroup, "WhoCanReopenDay", Resolve(shopDayClose?.WhoCanReopenDay, globalDayClose?.WhoCanReopenDay, "Manager,ShopOwner"), "string", null);
        AddItem(items, shopId, DayCloseGroup, "RequireAllShiftsClosedBeforeDayClose", ToConfigString(Resolve(shopDayClose?.RequireAllShiftsClosedBeforeDayClose, globalDayClose?.RequireAllShiftsClosedBeforeDayClose, true)), "bool", null);
        AddItem(items, shopId, DayCloseGroup, "RequireNoteWhenDayDifferenceExists", ToConfigString(Resolve(shopDayClose?.RequireNoteWhenDayDifferenceExists, globalDayClose?.RequireNoteWhenDayDifferenceExists, true)), "bool", null);

        AddItem(items, shopId, PrizePayoutGroup, "RequirePackNumberForPayout", ToConfigString(Resolve(shopPrizePayout?.RequirePackNumberForPayout, globalPrizePayout?.RequirePackNumberForPayout, true)), "bool", null);
        AddItem(items, shopId, PrizePayoutGroup, "RequireTicketNumberForPayout", ToConfigString(Resolve(shopPrizePayout?.RequireTicketNumberForPayout, globalPrizePayout?.RequireTicketNumberForPayout, true)), "bool", null);
        AddItem(items, shopId, PrizePayoutGroup, "CashierPayoutLimit", ToConfigString(Resolve(shopPrizePayout?.CashierPayoutLimit, globalPrizePayout?.CashierPayoutLimit, 200m)), "decimal", null);
        AddItem(items, shopId, PrizePayoutGroup, "ManagerApprovalAboveLimit", ToConfigString(Resolve(shopPrizePayout?.ManagerApprovalAboveLimit, globalPrizePayout?.ManagerApprovalAboveLimit, true)), "bool", null);
        AddItem(items, shopId, PrizePayoutGroup, "PreventDuplicatePayoutForSameTicket", ToConfigString(Resolve(shopPrizePayout?.PreventDuplicatePayoutForSameTicket, globalPrizePayout?.PreventDuplicatePayoutForSameTicket, true)), "bool", null);
        AddItem(items, shopId, PrizePayoutGroup, "AllowedPayoutMethods", Resolve(shopPrizePayout?.AllowedPayoutMethods, globalPrizePayout?.AllowedPayoutMethods, "Cash,Card,Transfer"), "string", null);

        AddItem(items, shopId, NotificationGroup, "NotificationChannels", Resolve(shopNotification?.NotificationChannels, globalNotification?.NotificationChannels, "Email"), "string", null);
        AddItem(items, shopId, NotificationGroup, "ManualEntryNotificationRecipients", Resolve(shopNotification?.ManualEntryNotificationRecipients, globalNotification?.ManualEntryNotificationRecipients, "ShopOwner,Manager"), "string", null);
        AddItem(items, shopId, NotificationGroup, "CashDifferenceNotificationRecipients", Resolve(shopNotification?.CashDifferenceNotificationRecipients, globalNotification?.CashDifferenceNotificationRecipients, "ShopOwner,Manager"), "string", null);
        AddItem(items, shopId, NotificationGroup, "HighPrizePayoutNotificationRecipients", Resolve(shopNotification?.HighPrizePayoutNotificationRecipients, globalNotification?.HighPrizePayoutNotificationRecipients, "ShopOwner,Manager"), "string", null);
        AddItem(items, shopId, NotificationGroup, "SendNotificationOnShiftFinalize", ToConfigString(Resolve(shopNotification?.SendNotificationOnShiftFinalize, globalNotification?.SendNotificationOnShiftFinalize, true)), "bool", null);

        AddItem(items, shopId, BarcodeGroup, "EnableMobileCameraBarcodeScanning", ToConfigString(Resolve(shopBarcode?.EnableMobileCameraBarcodeScanning, globalBarcode?.EnableMobileCameraBarcodeScanning, true)), "bool", null);
        AddItem(items, shopId, BarcodeGroup, "AllowManualEntryIfScanFails", ToConfigString(Resolve(shopBarcode?.AllowManualEntryIfScanFails, globalBarcode?.AllowManualEntryIfScanFails, true)), "bool", null);
        AddItem(items, shopId, BarcodeGroup, "BarcodeContains", Resolve(shopBarcode?.BarcodeContains, globalBarcode?.BarcodeContains, "PackAndSerial"), "string", null);
        AddItem(items, shopId, BarcodeGroup, "PackNumberStartPosition", ToConfigString(Resolve(shopBarcode?.PackNumberStartPosition, globalBarcode?.PackNumberStartPosition, 0)), "int", null);
        AddItem(items, shopId, BarcodeGroup, "PackNumberLength", ToConfigString(Resolve(shopBarcode?.PackNumberLength, globalBarcode?.PackNumberLength, 6)), "int", null);
        AddItem(items, shopId, BarcodeGroup, "SerialNumberStartPosition", ToConfigString(Resolve(shopBarcode?.SerialNumberStartPosition, globalBarcode?.SerialNumberStartPosition, 6)), "int", null);
        AddItem(items, shopId, BarcodeGroup, "SerialNumberLength", ToConfigString(Resolve(shopBarcode?.BarcodeSerialNumberLength, globalBarcode?.BarcodeSerialNumberLength, 3)), "int", null);
        AddItem(items, shopId, BarcodeGroup, "RemovePrefix", Resolve(shopBarcode?.RemovePrefix, globalBarcode?.RemovePrefix, string.Empty), "string", null);
        AddItem(items, shopId, BarcodeGroup, "RemoveSuffix", Resolve(shopBarcode?.RemoveSuffix, globalBarcode?.RemoveSuffix, string.Empty), "string", null);

        AddItem(items, shopId, OfflineGroup, "EnableOfflineShiftClose", ToConfigString(Resolve(shopOffline?.EnableOfflineShiftClose, globalOffline?.EnableOfflineShiftClose, true)), "bool", null);
        AddItem(items, shopId, OfflineGroup, "AllowOfflinePrizePayout", ToConfigString(Resolve(shopOffline?.AllowOfflinePrizePayout, globalOffline?.AllowOfflinePrizePayout, true)), "bool", null);
        AddItem(items, shopId, OfflineGroup, "AllowOfflineShiftReconciliation", ToConfigString(Resolve(shopOffline?.AllowOfflineShiftReconciliation, globalOffline?.AllowOfflineShiftReconciliation, true)), "bool", null);
        AddItem(items, shopId, OfflineGroup, "AutoSyncWhenOnline", ToConfigString(Resolve(shopOffline?.AutoSyncWhenOnline, globalOffline?.AutoSyncWhenOnline, true)), "bool", null);
        AddItem(items, shopId, OfflineGroup, "ConflictRequiresManagerReview", ToConfigString(Resolve(shopOffline?.ConflictRequiresManagerReview, globalOffline?.ConflictRequiresManagerReview, true)), "bool", null);

        AddItem(items, shopId, SubscriptionGroup, "DefaultTrialDays", ToConfigString(Resolve(shopSubscription?.DefaultTrialDays, globalSubscription?.DefaultTrialDays, 30)), "int", "Default trial length in days");
        AddItem(items, shopId, SubscriptionGroup, "TrialEndingReminderDays", ToConfigString(Resolve(shopSubscription?.TrialEndingReminderDays, globalSubscription?.TrialEndingReminderDays, 7)), "int", "Send reminder N days before trial end");
        AddItem(items, shopId, SubscriptionGroup, "PaymentGracePeriodDays", ToConfigString(Resolve(shopSubscription?.PaymentGracePeriodDays, globalSubscription?.PaymentGracePeriodDays, 7)), "int", "Grace period in days for overdue payments");
        AddItem(items, shopId, SubscriptionGroup, "BulkDiscountEnabled", ToConfigString(Resolve(shopSubscription?.BulkDiscountEnabled, globalSubscription?.BulkDiscountEnabled, true)), "bool", "Enable subscription bulk discount rules");

        return items
            .OrderBy(x => x.GroupName)
            .ThenBy(x => x.ConfigKey, StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    public async Task UpdateAsync(UpdateConfigurationRequest request, CancellationToken cancellationToken = default)
    {
        if (request.Items.Count == 0)
        {
            throw new AppException("configuration_update_empty", "No configuration updates were provided.");
        }

        var now = DateTimeOffset.UtcNow;
        var actorUserId = _currentUserService.UserId;

        var general = await LoadForUpdateAsync(_generalRepository, request.ShopId, cancellationToken);
        var pack = await LoadForUpdateAsync(_packRepository, request.ShopId, cancellationToken);
        var sales = await LoadForUpdateAsync(_salesRepository, request.ShopId, cancellationToken);
        var shift = await LoadForUpdateAsync(_shiftRepository, request.ShopId, cancellationToken);
        var dayClose = await LoadForUpdateAsync(_dayCloseRepository, request.ShopId, cancellationToken);
        var prizePayout = await LoadForUpdateAsync(_prizePayoutRepository, request.ShopId, cancellationToken);
        var notification = await LoadForUpdateAsync(_notificationRepository, request.ShopId, cancellationToken);
        var barcode = await LoadForUpdateAsync(_barcodeRepository, request.ShopId, cancellationToken);
        var offline = await LoadForUpdateAsync(_offlineRepository, request.ShopId, cancellationToken);
        var subscription = await LoadForUpdateAsync(_subscriptionRepository, request.ShopId, cancellationToken);
        var hadGeneral = general is not null;
        var hadPack = pack is not null;
        var hadSales = sales is not null;
        var hadShift = shift is not null;
        var hadDayClose = dayClose is not null;
        var hadPrizePayout = prizePayout is not null;
        var hadNotification = notification is not null;
        var hadBarcode = barcode is not null;
        var hadOffline = offline is not null;
        var hadSubscription = subscription is not null;

        var touchedGeneral = false;
        var touchedPack = false;
        var touchedSales = false;
        var touchedShift = false;
        var touchedDayClose = false;
        var touchedPrizePayout = false;
        var touchedNotification = false;
        var touchedBarcode = false;
        var touchedOffline = false;
        var touchedSubscription = false;

        foreach (var item in request.Items)
        {
            var configKey = item.ConfigKey?.Trim();
            if (string.IsNullOrWhiteSpace(configKey))
            {
                continue;
            }

            var normalizedGroup = NormalizeGroupName(item.GroupName, configKey);
            switch (normalizedGroup)
            {
                case GeneralGroup:
                    touchedGeneral = true;
                    ApplyGeneralSetting(EnsureEntity(ref general, request.ShopId, actorUserId, now), configKey, item.ConfigValue);
                    break;
                case PackGroup:
                    touchedPack = true;
                    ApplyPackSetting(EnsureEntity(ref pack, request.ShopId, actorUserId, now), configKey, item.ConfigValue);
                    break;
                case SalesGroup:
                    touchedSales = true;
                    ApplySalesSetting(EnsureEntity(ref sales, request.ShopId, actorUserId, now), configKey, item.ConfigValue);
                    break;
                case ShiftGroup:
                    touchedShift = true;
                    ApplyShiftSetting(EnsureEntity(ref shift, request.ShopId, actorUserId, now), configKey, item.ConfigValue);
                    break;
                case DayCloseGroup:
                    touchedDayClose = true;
                    ApplyDayCloseSetting(EnsureEntity(ref dayClose, request.ShopId, actorUserId, now), configKey, item.ConfigValue);
                    break;
                case PrizePayoutGroup:
                    touchedPrizePayout = true;
                    ApplyPrizePayoutSetting(EnsureEntity(ref prizePayout, request.ShopId, actorUserId, now), configKey, item.ConfigValue);
                    break;
                case NotificationGroup:
                    touchedNotification = true;
                    ApplyNotificationSetting(EnsureEntity(ref notification, request.ShopId, actorUserId, now), configKey, item.ConfigValue);
                    break;
                case BarcodeGroup:
                    touchedBarcode = true;
                    ApplyBarcodeSetting(EnsureEntity(ref barcode, request.ShopId, actorUserId, now), configKey, item.ConfigValue);
                    break;
                case OfflineGroup:
                    touchedOffline = true;
                    ApplyOfflineSetting(EnsureEntity(ref offline, request.ShopId, actorUserId, now), configKey, item.ConfigValue);
                    break;
                case SubscriptionGroup:
                    touchedSubscription = true;
                    ApplySubscriptionSetting(EnsureEntity(ref subscription, request.ShopId, actorUserId, now), configKey, item.ConfigValue);
                    break;
                default:
                    throw new AppException("configuration_group_not_supported", $"Unsupported configuration group: {normalizedGroup}");
            }
        }

        await SaveEntityAsync(_generalRepository, general, touchedGeneral, hadGeneral, cancellationToken);
        await SaveEntityAsync(_packRepository, pack, touchedPack, hadPack, cancellationToken);
        await SaveEntityAsync(_salesRepository, sales, touchedSales, hadSales, cancellationToken);
        await SaveEntityAsync(_shiftRepository, shift, touchedShift, hadShift, cancellationToken);
        await SaveEntityAsync(_dayCloseRepository, dayClose, touchedDayClose, hadDayClose, cancellationToken);
        await SaveEntityAsync(_prizePayoutRepository, prizePayout, touchedPrizePayout, hadPrizePayout, cancellationToken);
        await SaveEntityAsync(_notificationRepository, notification, touchedNotification, hadNotification, cancellationToken);
        await SaveEntityAsync(_barcodeRepository, barcode, touchedBarcode, hadBarcode, cancellationToken);
        await SaveEntityAsync(_offlineRepository, offline, touchedOffline, hadOffline, cancellationToken);
        await SaveEntityAsync(_subscriptionRepository, subscription, touchedSubscription, hadSubscription, cancellationToken);

        await _unitOfWork.SaveChangesAsync(cancellationToken);
        await _auditService.LogAsync(
            "Configuration",
            null,
            "ConfigurationUpdated",
            request.ShopId,
            cancellationToken: cancellationToken);
    }

    private static void ApplyGeneralSetting(CfgGeneralSettings target, string key, string value)
    {
        switch (key)
        {
            case "Currency":
                target.Currency = value;
                break;
            case ConfigurationKeys.TimeZone:
                target.TimeZone = value;
                break;
            case ConfigurationKeys.BusinessStartTime:
                target.BusinessStartTime = value;
                break;
            case ConfigurationKeys.BusinessEndTime:
                target.BusinessEndTime = value;
                break;
            case "BusinessDateCutOffTime":
                target.BusinessDateCutOffTime = value;
                break;
            case "EnableAuditLog":
                target.EnableAuditLog = ParseBool(value, key);
                break;
            default:
                throw new AppException("configuration_key_not_supported", $"Unsupported configuration key '{key}' in {GeneralGroup}.");
        }
    }

    private static void ApplyPackSetting(CfgPackSettings target, string key, string value)
    {
        switch (key)
        {
            case "DefaultSellingOrder":
                target.DefaultSellingOrder = value;
                break;
            case ConfigurationKeys.PackSellingOrder:
                target.PackSellingOrder = value;
                break;
            case ConfigurationKeys.ScratchCardDisplayCount:
                target.ScratchCardDisplayCount = ParseInt(value, key);
                break;
            case "AllowLeadingZeros":
                target.AllowLeadingZeros = ParseBool(value, key);
                break;
            case "PreventDuplicatePackNumbers":
                target.PreventDuplicatePackNumbers = ParseBool(value, key);
                break;
            case "RequirePackActivationBeforeSale":
                target.RequirePackActivationBeforeSale = ParseBool(value, key);
                break;
            case "AllowMultipleActivePacksForSameGame":
                target.AllowMultipleActivePacksForSameGame = ParseBool(value, key);
                break;
            case "AutoCompletePackWhenFinalSerialReached":
                target.AutoCompletePackWhenFinalSerialReached = ParseBool(value, key);
                break;
            case "AllowPackPause":
                target.AllowPackPause = ParseBool(value, key);
                break;
            case "AllowPackReturn":
                target.AllowPackReturn = ParseBool(value, key);
                break;
            case "AllowIssueMarking":
                target.AllowIssueMarking = ParseBool(value, key);
                break;
            default:
                throw new AppException("configuration_key_not_supported", $"Unsupported configuration key '{key}' in {PackGroup}.");
        }
    }

    private static void ApplySalesSetting(CfgSalesSettings target, string key, string value)
    {
        switch (key)
        {
            case "AllowBackdatedSales":
                target.AllowBackdatedSales = ParseBool(value, key);
                break;
            case "MaximumBackdateDays":
                target.MaximumBackdateDays = ParseInt(value, key);
                break;
            case "AllowFutureDatedSales":
                target.AllowFutureDatedSales = ParseBool(value, key);
                break;
            case "RequireManagerApprovalForCorrection":
                target.RequireManagerApprovalForCorrection = ParseBool(value, key);
                break;
            default:
                throw new AppException("configuration_key_not_supported", $"Unsupported configuration key '{key}' in {SalesGroup}.");
        }
    }

    private static void ApplyShiftSetting(CfgShiftSettings target, string key, string value)
    {
        switch (key)
        {
            case "RequireShiftClose":
                target.RequireShiftClose = ParseBool(value, key);
                break;
            case "AllowShiftReopen":
                target.AllowShiftReopen = ParseBool(value, key);
                break;
            case "WhoCanReopenShift":
                target.WhoCanReopenShift = value;
                break;
            case ConfigurationKeys.ShiftStartTime:
                target.ShiftStartTime = value;
                break;
            case ConfigurationKeys.ShiftEndTime:
                target.ShiftEndTime = value;
                break;
            case ConfigurationKeys.ShiftDefaultName:
                target.ShiftDefaultName = value;
                break;
            case ConfigurationKeys.ShiftTemplates:
                target.ShiftTemplates = value;
                break;
            case ConfigurationKeys.EnforceShiftTimeWindow:
                target.EnforceShiftTimeWindow = ParseBool(value, key);
                break;
            case ConfigurationKeys.AllowCustomShiftName:
                target.AllowCustomShiftName = ParseBool(value, key);
                break;
            case "RequireReasonForManualClosingSerial":
                target.RequireReasonForManualClosingSerial = ParseBool(value, key);
                break;
            case "NotifyOnManualClosingSerialEntry":
                target.NotifyOnManualClosingSerialEntry = ParseBool(value, key);
                break;
            case "NotifyOnScannedSerialEdit":
                target.NotifyOnScannedSerialEdit = ParseBool(value, key);
                break;
            default:
                throw new AppException("configuration_key_not_supported", $"Unsupported configuration key '{key}' in {ShiftGroup}.");
        }
    }

    private static void ApplyDayCloseSetting(CfgDayCloseSettings target, string key, string value)
    {
        switch (key)
        {
            case "RequireDayEndClose":
                target.RequireDayEndClose = ParseBool(value, key);
                break;
            case "AllowDayReopen":
                target.AllowDayReopen = ParseBool(value, key);
                break;
            case "WhoCanReopenDay":
                target.WhoCanReopenDay = value;
                break;
            case "RequireAllShiftsClosedBeforeDayClose":
                target.RequireAllShiftsClosedBeforeDayClose = ParseBool(value, key);
                break;
            case "RequireNoteWhenDayDifferenceExists":
                target.RequireNoteWhenDayDifferenceExists = ParseBool(value, key);
                break;
            default:
                throw new AppException("configuration_key_not_supported", $"Unsupported configuration key '{key}' in {DayCloseGroup}.");
        }
    }

    private static void ApplyPrizePayoutSetting(CfgPrizePayoutSettings target, string key, string value)
    {
        switch (key)
        {
            case "RequirePackNumberForPayout":
                target.RequirePackNumberForPayout = ParseBool(value, key);
                break;
            case "RequireTicketNumberForPayout":
                target.RequireTicketNumberForPayout = ParseBool(value, key);
                break;
            case "CashierPayoutLimit":
                target.CashierPayoutLimit = ParseDecimal(value, key);
                break;
            case "ManagerApprovalAboveLimit":
                target.ManagerApprovalAboveLimit = ParseBool(value, key);
                break;
            case "PreventDuplicatePayoutForSameTicket":
                target.PreventDuplicatePayoutForSameTicket = ParseBool(value, key);
                break;
            case "AllowedPayoutMethods":
                target.AllowedPayoutMethods = value;
                break;
            default:
                throw new AppException("configuration_key_not_supported", $"Unsupported configuration key '{key}' in {PrizePayoutGroup}.");
        }
    }

    private static void ApplyNotificationSetting(CfgNotificationSettings target, string key, string value)
    {
        switch (key)
        {
            case "NotificationChannels":
                target.NotificationChannels = value;
                break;
            case "ManualEntryNotificationRecipients":
                target.ManualEntryNotificationRecipients = value;
                break;
            case "CashDifferenceNotificationRecipients":
                target.CashDifferenceNotificationRecipients = value;
                break;
            case "HighPrizePayoutNotificationRecipients":
                target.HighPrizePayoutNotificationRecipients = value;
                break;
            case "SendNotificationOnShiftFinalize":
                target.SendNotificationOnShiftFinalize = ParseBool(value, key);
                break;
            default:
                throw new AppException("configuration_key_not_supported", $"Unsupported configuration key '{key}' in {NotificationGroup}.");
        }
    }

    private static void ApplyBarcodeSetting(CfgBarcodeSettings target, string key, string value)
    {
        switch (key)
        {
            case "EnableMobileCameraBarcodeScanning":
                target.EnableMobileCameraBarcodeScanning = ParseBool(value, key);
                break;
            case "AllowManualEntryIfScanFails":
                target.AllowManualEntryIfScanFails = ParseBool(value, key);
                break;
            case "BarcodeContains":
                target.BarcodeContains = value;
                break;
            case "PackNumberStartPosition":
                target.PackNumberStartPosition = ParseInt(value, key);
                break;
            case "PackNumberLength":
                target.PackNumberLength = ParseInt(value, key);
                break;
            case "SerialNumberStartPosition":
                target.SerialNumberStartPosition = ParseInt(value, key);
                break;
            case "BarcodeSerialNumberLength":
            case "SerialNumberLength":
                target.BarcodeSerialNumberLength = ParseInt(value, key);
                break;
            case "RemovePrefix":
                target.RemovePrefix = value;
                break;
            case "RemoveSuffix":
                target.RemoveSuffix = value;
                break;
            default:
                throw new AppException("configuration_key_not_supported", $"Unsupported configuration key '{key}' in {BarcodeGroup}.");
        }
    }

    private static void ApplyOfflineSetting(CfgOfflineSettings target, string key, string value)
    {
        switch (key)
        {
            case "EnableOfflineShiftClose":
                target.EnableOfflineShiftClose = ParseBool(value, key);
                break;
            case "AllowOfflinePrizePayout":
                target.AllowOfflinePrizePayout = ParseBool(value, key);
                break;
            case "AllowOfflineShiftReconciliation":
                target.AllowOfflineShiftReconciliation = ParseBool(value, key);
                break;
            case "AutoSyncWhenOnline":
                target.AutoSyncWhenOnline = ParseBool(value, key);
                break;
            case "ConflictRequiresManagerReview":
                target.ConflictRequiresManagerReview = ParseBool(value, key);
                break;
            default:
                throw new AppException("configuration_key_not_supported", $"Unsupported configuration key '{key}' in {OfflineGroup}.");
        }
    }

    private static void ApplySubscriptionSetting(CfgSubscriptionSettings target, string key, string value)
    {
        switch (key)
        {
            case "DefaultTrialDays":
                target.DefaultTrialDays = ParseInt(value, key);
                break;
            case "TrialEndingReminderDays":
                target.TrialEndingReminderDays = ParseInt(value, key);
                break;
            case "PaymentGracePeriodDays":
                target.PaymentGracePeriodDays = ParseInt(value, key);
                break;
            case "BulkDiscountEnabled":
                target.BulkDiscountEnabled = ParseBool(value, key);
                break;
            default:
                throw new AppException("configuration_key_not_supported", $"Unsupported configuration key '{key}' in {SubscriptionGroup}.");
        }
    }

    private static string NormalizeGroupName(string? groupName, string configKey)
    {
        if (string.IsNullOrWhiteSpace(groupName))
        {
            return InferGroupFromKey(configKey);
        }

        return groupName.Trim().ToLowerInvariant() switch
        {
            "general settings" => GeneralGroup,
            "pack settings" => PackGroup,
            "sales settings" => SalesGroup,
            "shift settings" => ShiftGroup,
            "day close settings" => DayCloseGroup,
            "prize payout settings" => PrizePayoutGroup,
            "notification settings" => NotificationGroup,
            "barcode settings" => BarcodeGroup,
            "offline settings" => OfflineGroup,
            "subscription settings" => SubscriptionGroup,
            _ => throw new AppException("configuration_group_not_supported", $"Unsupported configuration group: {groupName}")
        };
    }

    private static string InferGroupFromKey(string key)
    {
        return key switch
        {
            "Currency" => GeneralGroup,
            ConfigurationKeys.TimeZone => GeneralGroup,
            ConfigurationKeys.BusinessStartTime => GeneralGroup,
            ConfigurationKeys.BusinessEndTime => GeneralGroup,
            "BusinessDateCutOffTime" => GeneralGroup,
            "EnableAuditLog" => GeneralGroup,

            "DefaultSellingOrder" => PackGroup,
            ConfigurationKeys.PackSellingOrder => PackGroup,
            ConfigurationKeys.ScratchCardDisplayCount => PackGroup,
            "AllowLeadingZeros" => PackGroup,
            "PreventDuplicatePackNumbers" => PackGroup,
            "RequirePackActivationBeforeSale" => PackGroup,
            "AllowMultipleActivePacksForSameGame" => PackGroup,
            "AutoCompletePackWhenFinalSerialReached" => PackGroup,
            "AllowPackPause" => PackGroup,
            "AllowPackReturn" => PackGroup,
            "AllowIssueMarking" => PackGroup,

            "AllowBackdatedSales" => SalesGroup,
            "MaximumBackdateDays" => SalesGroup,
            "AllowFutureDatedSales" => SalesGroup,
            "RequireManagerApprovalForCorrection" => SalesGroup,

            "RequireShiftClose" => ShiftGroup,
            "AllowShiftReopen" => ShiftGroup,
            "WhoCanReopenShift" => ShiftGroup,
            ConfigurationKeys.ShiftStartTime => ShiftGroup,
            ConfigurationKeys.ShiftEndTime => ShiftGroup,
            ConfigurationKeys.ShiftDefaultName => ShiftGroup,
            ConfigurationKeys.ShiftTemplates => ShiftGroup,
            ConfigurationKeys.EnforceShiftTimeWindow => ShiftGroup,
            ConfigurationKeys.AllowCustomShiftName => ShiftGroup,
            "RequireReasonForManualClosingSerial" => ShiftGroup,
            "NotifyOnManualClosingSerialEntry" => ShiftGroup,
            "NotifyOnScannedSerialEdit" => ShiftGroup,

            "RequireDayEndClose" => DayCloseGroup,
            "AllowDayReopen" => DayCloseGroup,
            "WhoCanReopenDay" => DayCloseGroup,
            "RequireAllShiftsClosedBeforeDayClose" => DayCloseGroup,
            "RequireNoteWhenDayDifferenceExists" => DayCloseGroup,

            "RequirePackNumberForPayout" => PrizePayoutGroup,
            "RequireTicketNumberForPayout" => PrizePayoutGroup,
            "CashierPayoutLimit" => PrizePayoutGroup,
            "ManagerApprovalAboveLimit" => PrizePayoutGroup,
            "PreventDuplicatePayoutForSameTicket" => PrizePayoutGroup,
            "AllowedPayoutMethods" => PrizePayoutGroup,

            "NotificationChannels" => NotificationGroup,
            "ManualEntryNotificationRecipients" => NotificationGroup,
            "CashDifferenceNotificationRecipients" => NotificationGroup,
            "HighPrizePayoutNotificationRecipients" => NotificationGroup,
            "SendNotificationOnShiftFinalize" => NotificationGroup,

            "EnableMobileCameraBarcodeScanning" => BarcodeGroup,
            "AllowManualEntryIfScanFails" => BarcodeGroup,
            "BarcodeContains" => BarcodeGroup,
            "PackNumberStartPosition" => BarcodeGroup,
            "PackNumberLength" => BarcodeGroup,
            "SerialNumberStartPosition" => BarcodeGroup,
            "BarcodeSerialNumberLength" => BarcodeGroup,
            "SerialNumberLength" => BarcodeGroup,
            "RemovePrefix" => BarcodeGroup,
            "RemoveSuffix" => BarcodeGroup,

            "EnableOfflineShiftClose" => OfflineGroup,
            "AllowOfflinePrizePayout" => OfflineGroup,
            "AllowOfflineShiftReconciliation" => OfflineGroup,
            "AutoSyncWhenOnline" => OfflineGroup,
            "ConflictRequiresManagerReview" => OfflineGroup,

            "DefaultTrialDays" => SubscriptionGroup,
            "TrialEndingReminderDays" => SubscriptionGroup,
            "PaymentGracePeriodDays" => SubscriptionGroup,
            "BulkDiscountEnabled" => SubscriptionGroup,

            _ => throw new AppException("configuration_key_not_supported", $"Unsupported configuration key: {key}")
        };
    }

    private static bool ParseBool(string rawValue, string key)
    {
        var trimmed = rawValue.Trim();
        if (bool.TryParse(trimmed, out var parsedBool))
        {
            return parsedBool;
        }

        if (trimmed == "1") return true;
        if (trimmed == "0") return false;

        throw new AppException("invalid_configuration_value", $"Configuration '{key}' expects a boolean value.");
    }

    private static int ParseInt(string rawValue, string key)
    {
        if (int.TryParse(rawValue.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed))
        {
            return parsed;
        }

        throw new AppException("invalid_configuration_value", $"Configuration '{key}' expects an integer value.");
    }

    private static decimal ParseDecimal(string rawValue, string key)
    {
        if (decimal.TryParse(rawValue.Trim(), NumberStyles.Number, CultureInfo.InvariantCulture, out var parsed))
        {
            return parsed;
        }

        throw new AppException("invalid_configuration_value", $"Configuration '{key}' expects a decimal value.");
    }

    private static T Resolve<T>(T? shopValue, T? globalValue, T fallback) where T : struct
        => shopValue ?? globalValue ?? fallback;

    private static string Resolve(string? shopValue, string? globalValue, string fallback)
        => shopValue ?? globalValue ?? fallback;

    private static string ToConfigString(bool value) => value ? "true" : "false";

    private static string ToConfigString(int value) => value.ToString(CultureInfo.InvariantCulture);

    private static string ToConfigString(decimal value) => value.ToString(CultureInfo.InvariantCulture);

    private static void AddItem(
        ICollection<ConfigurationItemDto> items,
        Guid? shopId,
        string groupName,
        string configKey,
        string configValue,
        string dataType,
        string? description)
    {
        items.Add(new ConfigurationItemDto
        {
            Id = CreateStableItemId(shopId, groupName, configKey),
            ShopId = shopId,
            GroupName = groupName,
            ConfigKey = configKey,
            ConfigValue = configValue,
            DataType = dataType,
            Description = description,
            IsActive = true
        });
    }

    private static Guid CreateStableItemId(Guid? shopId, string groupName, string configKey)
    {
        using var md5 = MD5.Create();
        var input = $"{shopId?.ToString() ?? "global"}|{groupName}|{configKey}";
        var bytes = Encoding.UTF8.GetBytes(input);
        var hash = md5.ComputeHash(bytes);
        return new Guid(hash.AsSpan(0, 16));
    }

    private static async Task<(TEntity? Global, TEntity? Shop)> LoadRowsAsync<TEntity>(
        IRepository<TEntity> repository,
        Guid? shopId,
        CancellationToken cancellationToken)
        where TEntity : CfgSettingsBase
    {
        var query = repository.Query().AsNoTracking().Where(x => x.IsActive);
        if (shopId.HasValue)
        {
            query = query.Where(x => x.ShopId == null || x.ShopId == shopId.Value);
        }
        else
        {
            query = query.Where(x => x.ShopId == null);
        }

        var rows = await query.ToListAsync(cancellationToken);
        var global = rows
            .Where(x => x.ShopId == null)
            .OrderByDescending(x => x.ModifiedOn ?? x.CreatedOn)
            .FirstOrDefault();

        TEntity? shop = null;
        if (shopId.HasValue)
        {
            shop = rows
                .Where(x => x.ShopId == shopId.Value)
                .OrderByDescending(x => x.ModifiedOn ?? x.CreatedOn)
                .FirstOrDefault();
        }

        return (global, shop);
    }

    private static async Task<TEntity?> LoadForUpdateAsync<TEntity>(
        IRepository<TEntity> repository,
        Guid? shopId,
        CancellationToken cancellationToken)
        where TEntity : CfgSettingsBase
    {
        return await repository.Query()
            .Where(x => x.ShopId == shopId)
            .OrderByDescending(x => x.ModifiedOn ?? x.CreatedOn)
            .FirstOrDefaultAsync(cancellationToken);
    }

    private static TEntity EnsureEntity<TEntity>(
        ref TEntity? entity,
        Guid? shopId,
        Guid? actorUserId,
        DateTimeOffset now)
        where TEntity : CfgSettingsBase, new()
    {
        if (entity is null)
        {
            entity = new TEntity
            {
                ShopId = shopId,
                IsActive = true,
                CreatedOn = now,
                CreatedBy = actorUserId
            };
            return entity;
        }

        entity.IsActive = true;
        entity.ModifiedOn = now;
        entity.ModifiedBy = actorUserId;
        return entity;
    }

    private static async Task SaveEntityAsync<TEntity>(
        IRepository<TEntity> repository,
        TEntity? entity,
        bool touched,
        bool existedBeforeUpdate,
        CancellationToken cancellationToken)
        where TEntity : CfgSettingsBase
    {
        if (!touched || entity is null)
        {
            return;
        }

        if (!existedBeforeUpdate)
        {
            await repository.AddAsync(entity, cancellationToken);
        }
        else
        {
            repository.Update(entity);
        }
    }
}
