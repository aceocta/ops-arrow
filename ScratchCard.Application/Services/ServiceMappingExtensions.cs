using ScratchCard.Application.DTOs.BusinessDays;
using ScratchCard.Application.DTOs.Companies;
using ScratchCard.Application.DTOs.Configurations;
using ScratchCard.Application.DTOs.Deliveries;
using ScratchCard.Application.DTOs.Games;
using ScratchCard.Application.DTOs.Invitations;
using ScratchCard.Application.DTOs.Notifications;
using ScratchCard.Application.DTOs.Packs;
using ScratchCard.Application.DTOs.PrizePayouts;
using ScratchCard.Application.DTOs.RefusalRegister;
using ScratchCard.Application.DTOs.Shifts;
using ScratchCard.Application.DTOs.ShiftSales;
using ScratchCard.Application.DTOs.Shops;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Application.DTOs.TemperatureLogs;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

internal static class ServiceMappingExtensions
{
    public static InvitationDto ToDto(this UserInvitation invitation, string roleName) => new()
    {
        Id = invitation.Id,
        ShopId = invitation.ShopId,
        Email = invitation.Email,
        RoleId = invitation.RoleId,
        RoleName = roleName,
        Status = invitation.Status,
        ExpiresOn = invitation.ExpiresOn,
        AcceptedOn = invitation.AcceptedOn,
        CancelledOn = invitation.CancelledOn
    };

    public static ShopDto ToDto(this Shop shop) => new()
    {
        Id = shop.Id,
        CompanyId = shop.CompanyId,
        CompanyName = shop.Company?.CompanyName,
        ShopName = shop.ShopName,
        AddressLine1 = shop.AddressLine1,
        AddressLine2 = shop.AddressLine2,
        City = shop.City,
        PostCode = shop.PostCode,
        Country = shop.Country,
        IsActive = shop.IsActive
    };

    public static CompanyDto ToDto(this Company company) => new()
    {
        Id = company.Id,
        CompanyName = company.CompanyName,
        RegistrationNumber = company.RegistrationNumber,
        OwnerUserId = company.OwnerUserId,
        Email = company.Email,
        PhoneNumber = company.PhoneNumber,
        AddressLine1 = company.AddressLine1,
        AddressLine2 = company.AddressLine2,
        City = company.City,
        PostCode = company.PostCode,
        Country = company.Country,
        IsActive = company.IsActive
    };

    public static SubscriptionPlanDto ToDto(this SubscriptionPlan plan) => new()
    {
        Id = plan.Id,
        Name = plan.Name,
        BillingCycle = plan.BillingCycle,
        PricePerShop = plan.PricePerShop,
        TrialDays = plan.TrialDays,
        Description = plan.Description,
        IsActive = plan.IsActive
    };

    public static SubscriptionInvoiceLineDto ToDto(this SubscriptionInvoiceLine line) => new()
    {
        Id = line.Id,
        Description = line.Description,
        Quantity = line.Quantity,
        UnitPrice = line.UnitPrice,
        DiscountAmount = line.DiscountAmount,
        LineTotal = line.LineTotal
    };

    public static SubscriptionInvoiceDto ToDto(this SubscriptionInvoice invoice) => new()
    {
        Id = invoice.Id,
        CompanyId = invoice.CompanyId,
        CompanySubscriptionId = invoice.CompanySubscriptionId,
        InvoiceNumber = invoice.InvoiceNumber,
        BillingCycle = invoice.BillingCycle,
        ActiveShopCount = invoice.ActiveShopCount,
        PricePerShop = invoice.PricePerShop,
        SubTotalAmount = invoice.SubTotalAmount,
        DiscountAmount = invoice.DiscountAmount,
        TaxAmount = invoice.TaxAmount,
        TotalAmount = invoice.TotalAmount,
        Status = invoice.Status,
        DueDate = invoice.DueDate,
        PaidOn = invoice.PaidOn,
        CreatedOn = invoice.CreatedOn,
        Lines = invoice.Lines.Select(x => x.ToDto()).ToArray()
    };

    public static SubscriptionDiscountRuleDto ToDto(this SubscriptionDiscountRule rule) => new()
    {
        Id = rule.Id,
        SubscriptionPlanId = rule.SubscriptionPlanId,
        MinShopCount = rule.MinShopCount,
        MaxShopCount = rule.MaxShopCount,
        DiscountType = rule.DiscountType,
        DiscountValue = rule.DiscountValue,
        IsActive = rule.IsActive,
        Description = rule.Description
    };

    public static ConfigurationItemDto ToDto(this AppConfiguration item) => new()
    {
        Id = item.Id,
        ShopId = item.ShopId,
        ConfigKey = item.ConfigKey,
        ConfigValue = item.ConfigValue,
        DataType = item.DataType,
        GroupName = item.GroupName,
        Description = item.Description,
        IsActive = item.IsActive
    };

    public static GameDto ToDto(this ShopScratchCardGame game) => new()
    {
        Id = game.Id,
        ShopId = game.ShopId,
        GameName = game.MasterGame.GameName,
        GameCode = game.MasterGame.GameCode,
        DefaultTicketPrice = game.MasterGame.TicketPrice,
        DefaultTicketsPerPack = game.MasterGame.TicketsPerPack,
        DefaultStartSerialNumber = game.DefaultStartSerialNumber,
        DefaultEndSerialNumber = game.DefaultEndSerialNumber,
        DefaultSellingOrder = game.DefaultSellingOrder,
        CommissionRate = 0,
        IsActive = game.IsActive
    };

    public static PackDto ToDto(this ScratchCardPack pack) => new()
    {
        Id = pack.Id,
        ShopId = pack.ShopId,
        GameId = pack.GameId,
        GameName = pack.Game?.GameName ?? string.Empty,
        PackNumber = pack.PackNumber,
        DisplayNumber = pack.DisplayNumber,
        TicketPrice = pack.TicketPrice,
        TotalTickets = pack.TotalTickets,
        StartSerialNumber = pack.StartSerialNumber,
        EndSerialNumber = pack.EndSerialNumber,
        SellingOrder = pack.SellingOrder,
        CurrentSerialNumber = pack.CurrentSerialNumber,
        Status = pack.Status,
        ReceivedDate = pack.ReceivedDate,
        IsManuallyAdded = pack.IsManuallyAdded
    };

    public static DeliveryDto ToDto(this Delivery delivery) => new()
    {
        Id = delivery.Id,
        ShopId = delivery.ShopId,
        DeliveryDate = delivery.DeliveryDate,
        SupplierName = delivery.SupplierName,
        DeliveryReference = delivery.DeliveryReference,
        Notes = delivery.Notes,
        Packs = delivery.DeliveryPacks
            .Select(dp => new DeliveryPackDto
            {
                PackId = dp.ScratchCardPackId,
                PackNumber = dp.ScratchCardPack.PackNumber,
                GameName = dp.ScratchCardPack.Game.GameName
            })
            .ToArray()
    };

    public static BusinessDayDto ToDto(this BusinessDay day) => new()
    {
        Id = day.Id,
        ShopId = day.ShopId,
        BusinessDate = day.BusinessDate,
        Status = day.Status.ToString(),
        TotalSalesAmount = day.TotalSalesAmount,
        TotalPrizePayout = day.TotalPrizePayout,
        ExpectedCash = day.ExpectedCash,
        ActualCash = day.ActualCash,
        Difference = day.Difference,
        ScratchCardDayCloseSummary = day.ScratchCardDayCloseSummary is null
            ? null
            : new ScratchCardDayCloseSummaryDto
            {
                LottoPayout = day.ScratchCardDayCloseSummary.LottoPayout,
                ScratchCardPayout = day.ScratchCardDayCloseSummary.ScratchCardPayout,
                TillPayout = day.ScratchCardDayCloseSummary.TillPayout
            }
    };

    public static ShiftDto ToDto(this Shift shift) => new()
    {
        Id = shift.Id,
        BusinessDayId = shift.BusinessDayId,
        ShopId = shift.ShopId,
        ShiftName = shift.ShiftName,
        StartTime = shift.StartTime,
        EndTime = shift.EndTime,
        Status = shift.Status.ToString(),
        SyncStatus = shift.SyncStatus.ToString(),
        IsAutoCreated = ShiftMetadata.IsAutoCreated(shift.Notes),
        AutoTemplateId = ShiftMetadata.TryGetAutoTemplateId(shift.Notes, out var templateId) && !string.IsNullOrWhiteSpace(templateId)
            ? templateId
            : null
    };

    public static PrizePayoutDto ToDto(this PrizePayout payout) => new()
    {
        Id = payout.Id,
        ShiftId = payout.ShiftId,
        PackId = payout.PackId,
        TicketNumber = payout.TicketNumber,
        PrizeAmount = payout.PrizeAmount,
        ApprovalStatus = payout.ApprovalStatus.ToString(),
        PaidOn = payout.PaidOn
    };

    public static NotificationLogDto ToDto(this NotificationLog log) => new()
    {
        Id = log.Id,
        NotificationType = log.NotificationType.ToString(),
        Channel = log.Channel.ToString(),
        Recipient = log.Recipient,
        Subject = log.Subject,
        Status = log.Status.ToString(),
        SentOn = log.SentOn,
        FailedReason = log.FailedReason
    };

    public static ShiftSalesEntryDto ToDto(this ShiftScratchCardSale sale) => new()
    {
        Id = sale.Id,
        PackId = sale.PackId,
        PackNumber = sale.Pack.PackNumber,
        OpeningSerialNumber = sale.OpeningSerialNumber,
        ClosingSerialNumber = sale.ClosingSerialNumber,
        OriginalScannedSerialNumber = sale.OriginalScannedSerialNumber,
        EntryMethod = sale.EntryMethod,
        SoldQuantity = sale.SoldQuantity,
        TicketPrice = sale.TicketPrice,
        SalesAmount = sale.SalesAmount,
        RemainingTickets = sale.RemainingTickets,
        IsFlaggedForReview = sale.IsFlaggedForReview,
        NotificationSent = sale.NotificationSent
    };

    public static TemperatureMonitoringUnitDto ToDto(this TemperatureMonitoringUnit unit) => new()
    {
        Id = unit.Id,
        ShopId = unit.ShopId,
        UnitName = unit.UnitName,
        EquipmentType = unit.EquipmentType,
        MinTemperatureCelsius = unit.MinTemperatureCelsius,
        MaxTemperatureCelsius = unit.MaxTemperatureCelsius,
        IsActive = unit.IsActive,
        Location = unit.Location,
        Notes = unit.Notes
    };

    public static TemperatureReadingDto ToDto(this TemperatureReading reading) => new()
    {
        Id = reading.Id,
        ShopId = reading.ShopId,
        TemperatureMonitoringUnitId = reading.TemperatureMonitoringUnitId,
        UnitName = reading.TemperatureMonitoringUnit?.UnitName ?? string.Empty,
        EquipmentType = reading.TemperatureMonitoringUnit?.EquipmentType ?? Domain.Enums.TemperatureEquipmentType.Other,
        MinTemperatureCelsius = reading.TemperatureMonitoringUnit?.MinTemperatureCelsius ?? 0,
        MaxTemperatureCelsius = reading.TemperatureMonitoringUnit?.MaxTemperatureCelsius ?? 0,
        ReadingDate = reading.ReadingDate,
        ReadingTime = reading.ReadingTime,
        TemperatureCelsius = reading.TemperatureCelsius,
        IsOutOfRange = reading.IsOutOfRange,
        CheckedByInitials = reading.CheckedByInitials,
        Notes = reading.Notes,
        ActionTaken = reading.ActionTaken,
        RecordedOn = reading.RecordedOn,
        RecordedByName = reading.RecordedByName
    };

    public static TemperatureDailySignoffDto ToDto(this TemperatureDailySignoff signoff) => new()
    {
        Id = signoff.Id,
        ShopId = signoff.ShopId,
        SignoffDate = signoff.SignoffDate,
        SignedOn = signoff.SignedOn,
        SignedByUserId = signoff.SignedByUserId,
        SignedByInitials = signoff.SignedByInitials,
        SignedByName = signoff.SignedByName,
        Notes = signoff.Notes
    };

    public static RefusalRegisterEntryDto ToDto(this RefusalRegisterEntry entry) => new()
    {
        Id = entry.Id,
        ShopId = entry.ShopId,
        SequenceNo = entry.SequenceNo,
        RefusalDate = entry.RefusalDate,
        RefusalTime = entry.RefusalTime,
        Product = entry.Product,
        PersonDescription = entry.PersonDescription,
        Observations = entry.Observations,
        StaffMemberInitials = entry.StaffMemberInitials,
        SignatureImagePath = entry.SignatureImagePath,
        RecordedOn = entry.RecordedOn,
        RecordedByName = entry.RecordedByName,
        ReviewedOn = entry.ReviewedOn,
        ReviewedByUserId = entry.ReviewedByUserId,
        ReviewedByName = entry.ReviewedByName,
        ReviewNotes = entry.ReviewNotes,
        ReviewSignatureImagePath = entry.ReviewSignatureImagePath
    };

    public static RefusalRegisterDailySignoffDto ToDto(this RefusalRegisterDailySignoff signoff) => new()
    {
        Id = signoff.Id,
        ShopId = signoff.ShopId,
        SignoffDate = signoff.SignoffDate,
        SignedOn = signoff.SignedOn,
        SignedByUserId = signoff.SignedByUserId,
        SignedByInitials = signoff.SignedByInitials,
        SignedByName = signoff.SignedByName,
        Notes = signoff.Notes,
        SignatureImagePath = signoff.SignatureImagePath
    };
}
