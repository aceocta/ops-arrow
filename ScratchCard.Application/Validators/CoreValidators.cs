using FluentValidation;
using ScratchCard.Application.DTOs.BusinessDays;
using ScratchCard.Application.DTOs.Common;
using ScratchCard.Application.DTOs.Companies;
using ScratchCard.Application.DTOs.Deliveries;
using ScratchCard.Application.DTOs.Games;
using ScratchCard.Application.DTOs.Invitations;
using ScratchCard.Application.DTOs.Auth;
using ScratchCard.Application.DTOs.Packs;
using ScratchCard.Application.DTOs.PrizePayouts;
using ScratchCard.Application.DTOs.Reports;
using ScratchCard.Application.DTOs.RefusalRegister;
using ScratchCard.Application.DTOs.ShiftSales;
using ScratchCard.Application.DTOs.Shifts;
using ScratchCard.Application.DTOs.Shops;
using ScratchCard.Application.DTOs.TemperatureLogs;

namespace ScratchCard.Application.Validators;

public class CreateInvitationRequestValidator : AbstractValidator<CreateInvitationRequest>
{
    public CreateInvitationRequestValidator()
    {
        RuleFor(x => x.ShopId).NotEmpty();
        RuleFor(x => x.RoleId).NotEmpty();
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.ExpiryHours).InclusiveBetween(1, 168);
    }
}

public class PasswordLoginRequestValidator : AbstractValidator<PasswordLoginRequest>
{
    public PasswordLoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.Password).NotEmpty();
    }
}

public class PasswordSignupRequestValidator : AbstractValidator<PasswordSignupRequest>
{
    public PasswordSignupRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(320);
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8);
        RuleFor(x => x.FirstName).MaximumLength(100);
        RuleFor(x => x.LastName).MaximumLength(100);
    }
}

public class DevLoginRequestValidator : AbstractValidator<DevLoginRequest>
{
    public DevLoginRequestValidator()
    {
        RuleFor(x => x.Email).NotEmpty().EmailAddress();
        RuleFor(x => x.FirstName).MaximumLength(100);
        RuleFor(x => x.LastName).MaximumLength(100);
        RuleFor(x => x.Role).NotEmpty().MaximumLength(50);
    }
}

public class AcceptInvitationRequestValidator : AbstractValidator<AcceptInvitationRequest>
{
    public AcceptInvitationRequestValidator()
    {
        RuleFor(x => x.Token).NotEmpty();
        RuleFor(x => x.FirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.LastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8);
    }
}

public class CreateShopRequestValidator : AbstractValidator<CreateShopRequest>
{
    public CreateShopRequestValidator()
    {
        RuleFor(x => x.CompanyName)
            .MaximumLength(200)
            .When(x => !string.IsNullOrWhiteSpace(x.CompanyName));
        RuleFor(x => x.ShopName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.AddressLine1).NotEmpty().MaximumLength(200);
        RuleFor(x => x.AddressLine2).MaximumLength(200);
        RuleFor(x => x.City).NotEmpty().MaximumLength(100);
        RuleFor(x => x.PostCode).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Country).NotEmpty().MaximumLength(100);
    }
}

public class CreateCompanyRequestValidator : AbstractValidator<CreateCompanyRequest>
{
    public CreateCompanyRequestValidator()
    {
        RuleFor(x => x.CompanyName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.RegistrationNumber).MaximumLength(100);
    }
}

public class CompanySignupRequestValidator : AbstractValidator<CompanySignupRequest>
{
    public CompanySignupRequestValidator()
    {
        RuleFor(x => x.CompanyName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.OwnerFirstName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.OwnerLastName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.OwnerEmail).NotEmpty().EmailAddress().MaximumLength(320);
        RuleFor(x => x.PhoneNumber).MaximumLength(50);
        RuleFor(x => x.FirstShopName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.AddressLine1).NotEmpty().MaximumLength(200);
        RuleFor(x => x.AddressLine2).MaximumLength(200);
        RuleFor(x => x.City).NotEmpty().MaximumLength(100);
        RuleFor(x => x.PostCode).NotEmpty().MaximumLength(20);
        RuleFor(x => x.Country).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Password).NotEmpty().MinimumLength(8);
    }
}

public class UpdateCompanyRequestValidator : AbstractValidator<UpdateCompanyRequest>
{
    public UpdateCompanyRequestValidator()
    {
        RuleFor(x => x.CompanyName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.RegistrationNumber).MaximumLength(100);
    }
}

public class CreateGameRequestValidator : AbstractValidator<CreateGameRequest>
{
    public CreateGameRequestValidator()
    {
        RuleFor(x => x.ShopId).NotEmpty();
        RuleFor(x => x.GameName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.GameCode).NotEmpty().MaximumLength(30);
        RuleFor(x => x.DefaultTicketPrice).GreaterThan(0);
        RuleFor(x => x.DefaultTicketsPerPack).GreaterThan(0);
        RuleFor(x => x.DefaultStartSerialNumber).NotEmpty();
        RuleFor(x => x.DefaultEndSerialNumber).NotEmpty();
        RuleFor(x => x.DefaultSellingOrder).IsInEnum().NotEqual((ScratchCard.Domain.Enums.SellingOrder)0);
        RuleFor(x => x.CommissionRate).InclusiveBetween(0, 100);
    }
}

public class CreateDeliveryRequestValidator : AbstractValidator<CreateDeliveryRequest>
{
    public CreateDeliveryRequestValidator()
    {
        RuleFor(x => x.ShopId).NotEmpty();
        RuleFor(x => x.SupplierName).NotEmpty().MaximumLength(200);
        RuleFor(x => x.DeliveryReference).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Packs).NotEmpty();
        RuleForEach(x => x.Packs).SetValidator(new CreateDeliveryPackRequestValidator());
    }
}

public class CreateDeliveryPackRequestValidator : AbstractValidator<CreateDeliveryPackRequest>
{
    public CreateDeliveryPackRequestValidator()
    {
        RuleFor(x => x.GameCode).MaximumLength(30);
        RuleFor(x => x.GameName).MaximumLength(100);
        RuleFor(x => x)
            .Must(x => (x.GameId.HasValue && x.GameId.Value != Guid.Empty) || !string.IsNullOrWhiteSpace(x.GameCode))
            .WithMessage("Each pack must include either gameId or gameCode.");
        RuleFor(x => x.PackNumber).NotEmpty().MaximumLength(50);
        RuleFor(x => x.DisplayNumber).GreaterThanOrEqualTo(0).When(x => x.DisplayNumber.HasValue);
        RuleFor(x => x.TicketPrice).GreaterThan(0);
        RuleFor(x => x.TotalTickets).GreaterThan(0);
        RuleFor(x => x.StartSerialNumber).NotEmpty();
        RuleFor(x => x.EndSerialNumber).NotEmpty();
        RuleFor(x => x.SellingOrder).IsInEnum().When(x => x.SellingOrder != (ScratchCard.Domain.Enums.SellingOrder)0);
    }
}

public class ParseDeliveryNoteRequestValidator : AbstractValidator<ParseDeliveryNoteRequest>
{
    public ParseDeliveryNoteRequestValidator()
    {
        RuleFor(x => x.ShopId).NotEmpty();
        RuleFor(x => x.ImageBytes).NotEmpty();
        RuleFor(x => x.ContentType).NotEmpty().MaximumLength(100);
        RuleFor(x => x.FileName).NotEmpty().MaximumLength(260);
    }
}

public class ActivatePackRequestValidator : AbstractValidator<ActivatePackRequest>
{
    public ActivatePackRequestValidator()
    {
        RuleFor(x => x.OpeningSerialNumber).NotEmpty();
        RuleFor(x => x.SellingOrder).IsInEnum().When(x => x.SellingOrder != (ScratchCard.Domain.Enums.SellingOrder)0);
    }
}

public class CreateManualPackRequestValidator : AbstractValidator<CreateManualPackRequest>
{
    public CreateManualPackRequestValidator()
    {
        RuleFor(x => x.ShopId).NotEmpty();
        RuleFor(x => x.GameId).NotEmpty();
        RuleFor(x => x.PackNumber).NotEmpty().MaximumLength(50);
        RuleFor(x => x.DisplayNumber).GreaterThanOrEqualTo(0).When(x => x.DisplayNumber.HasValue);
        RuleFor(x => x.TicketPrice).GreaterThan(0);
        RuleFor(x => x.TotalTickets).GreaterThan(0);
        RuleFor(x => x.StartSerialNumber).NotEmpty();
        RuleFor(x => x.EndSerialNumber).NotEmpty();
        RuleFor(x => x.SellingOrder).IsInEnum().When(x => x.SellingOrder != (ScratchCard.Domain.Enums.SellingOrder)0);
    }
}

public class UpdatePackDetailsRequestValidator : AbstractValidator<UpdatePackDetailsRequest>
{
    public UpdatePackDetailsRequestValidator()
    {
        RuleFor(x => x.PackNumber).NotEmpty().MaximumLength(50);
        RuleFor(x => x.DisplayNumber).GreaterThanOrEqualTo(0).When(x => x.DisplayNumber.HasValue);
        RuleFor(x => x.TicketPrice).GreaterThan(0);
        RuleFor(x => x.TotalTickets).GreaterThan(0);
        RuleFor(x => x.StartSerialNumber).NotEmpty();
        RuleFor(x => x.EndSerialNumber).NotEmpty();
        RuleFor(x => x.SellingOrder).IsInEnum().When(x => x.SellingOrder != (ScratchCard.Domain.Enums.SellingOrder)0);
    }
}

public class OpenBusinessDayRequestValidator : AbstractValidator<OpenBusinessDayRequest>
{
    public OpenBusinessDayRequestValidator()
    {
        RuleFor(x => x.ShopId).NotEmpty();
    }
}

public class CloseBusinessDayRequestValidator : AbstractValidator<CloseBusinessDayRequest>
{
    public CloseBusinessDayRequestValidator()
    {
        RuleFor(x => x.LottoPayout).GreaterThanOrEqualTo(0);
        RuleFor(x => x.ScratchCardPayout).GreaterThanOrEqualTo(0);
        RuleFor(x => x.TillPayout).GreaterThanOrEqualTo(0);
        RuleFor(x => x.Notes).MaximumLength(1000);
        RuleFor(x => x.AttachmentFileName).MaximumLength(260);
        RuleFor(x => x.AttachmentBase64).MaximumLength(15_000_000);
        RuleFor(x => x.Attachments).Must(x => x is null || x.Count <= 10).WithMessage("A maximum of 10 attachments is allowed.");
        RuleForEach(x => x.Attachments!).SetValidator(new CloseAttachmentUploadRequestValidator());
    }
}

public class OpenShiftRequestValidator : AbstractValidator<OpenShiftRequest>
{
    public OpenShiftRequestValidator()
    {
        RuleFor(x => x.BusinessDayId).NotEmpty();
        RuleFor(x => x.ShopId).NotEmpty();
        RuleFor(x => x.ShiftName).MaximumLength(100);
        RuleForEach(x => x.OpeningSerialConfirmations).SetValidator(new OpenShiftPackSerialConfirmationRequestValidator());
    }
}

public class OpenShiftPackSerialConfirmationRequestValidator : AbstractValidator<OpenShiftPackSerialConfirmationRequest>
{
    public OpenShiftPackSerialConfirmationRequestValidator()
    {
        RuleFor(x => x.PackId).NotEmpty();
        RuleFor(x => x.OpeningSerialNumber).NotEmpty().MaximumLength(30);
    }
}

public class StartScheduledShiftRequestValidator : AbstractValidator<StartScheduledShiftRequest>
{
    public StartScheduledShiftRequestValidator()
    {
        RuleForEach(x => x.OpeningSerialConfirmations).SetValidator(new OpenShiftPackSerialConfirmationRequestValidator());
    }
}

public class DeleteShiftRequestValidator : AbstractValidator<DeleteShiftRequest>
{
    public DeleteShiftRequestValidator()
    {
        RuleFor(x => x.Reason).MaximumLength(500);
    }
}

public class FinalizeShiftRequestValidator : AbstractValidator<FinalizeShiftRequest>
{
    public FinalizeShiftRequestValidator()
    {
        RuleFor(x => x.AttachmentFileName).MaximumLength(260);
        RuleFor(x => x.AttachmentBase64).MaximumLength(15_000_000);
        RuleFor(x => x.Attachments).Must(x => x is null || x.Count <= 10).WithMessage("A maximum of 10 attachments is allowed.");
        RuleForEach(x => x.Attachments!).SetValidator(new CloseAttachmentUploadRequestValidator());
        RuleFor(x => x.Entries).NotEmpty();
        RuleForEach(x => x.Entries).SetValidator(new ShiftClosePackEntryRequestValidator());
    }
}

public class CloseAttachmentUploadRequestValidator : AbstractValidator<CloseAttachmentUploadRequest>
{
    public CloseAttachmentUploadRequestValidator()
    {
        RuleFor(x => x.FileName).NotEmpty().MaximumLength(260);
        RuleFor(x => x.Base64).NotEmpty().MaximumLength(15_000_000);
        RuleFor(x => x.ContentType).MaximumLength(120);
    }
}

public class ShiftClosePackEntryRequestValidator : AbstractValidator<ShiftClosePackEntryRequest>
{
    public ShiftClosePackEntryRequestValidator()
    {
        RuleFor(x => x.PackId).NotEmpty();
        RuleFor(x => x.ClosingSerialNumber).NotEmpty();
    }
}

public class CreatePrizePayoutRequestValidator : AbstractValidator<CreatePrizePayoutRequest>
{
    public CreatePrizePayoutRequestValidator()
    {
        RuleFor(x => x.ShopId).NotEmpty();
        RuleFor(x => x.BusinessDayId).NotEmpty();
        RuleFor(x => x.ShiftId).NotEmpty();
        RuleFor(x => x.PrizeAmount).GreaterThan(0);
        RuleFor(x => x.PaymentMethod).NotEmpty();
    }
}

public class CreateTemperatureMonitoringUnitRequestValidator : AbstractValidator<CreateTemperatureMonitoringUnitRequest>
{
    public CreateTemperatureMonitoringUnitRequestValidator()
    {
        RuleFor(x => x.ShopId).NotEmpty();
        RuleFor(x => x.UnitName).NotEmpty().MaximumLength(120);
        RuleFor(x => x.EquipmentType).IsInEnum();
        RuleFor(x => x.MinTemperatureCelsius).LessThan(x => x.MaxTemperatureCelsius);
    }
}

public class UpdateTemperatureMonitoringUnitRequestValidator : AbstractValidator<UpdateTemperatureMonitoringUnitRequest>
{
    public UpdateTemperatureMonitoringUnitRequestValidator()
    {
        RuleFor(x => x.UnitName).NotEmpty().MaximumLength(120);
        RuleFor(x => x.EquipmentType).IsInEnum();
        RuleFor(x => x.MinTemperatureCelsius).LessThan(x => x.MaxTemperatureCelsius);
    }
}

public class RecordTemperatureReadingRequestValidator : AbstractValidator<RecordTemperatureReadingRequest>
{
    public RecordTemperatureReadingRequestValidator()
    {
        RuleFor(x => x.ShopId).NotEmpty();
        RuleFor(x => x.TemperatureMonitoringUnitId).NotEmpty();
        RuleFor(x => x.ReadingDate).NotEqual(default(DateOnly));
        RuleFor(x => x.TemperatureCelsius).InclusiveBetween(-100m, 100m);
        RuleFor(x => x.Notes).MaximumLength(500);
        RuleFor(x => x.ActionTaken).MaximumLength(500);
        RuleFor(x => x.CheckedByInitials).MaximumLength(20);
    }
}

public class SignOffTemperatureDailyLogRequestValidator : AbstractValidator<SignOffTemperatureDailyLogRequest>
{
    public SignOffTemperatureDailyLogRequestValidator()
    {
        RuleFor(x => x.ShopId).NotEmpty();
        RuleFor(x => x.SignoffDate).NotEqual(default(DateOnly));
        RuleFor(x => x.SignedByInitials).MaximumLength(20);
        RuleFor(x => x.Notes).MaximumLength(1000);
    }
}

public class CreateRefusalRegisterEntryRequestValidator : AbstractValidator<CreateRefusalRegisterEntryRequest>
{
    public CreateRefusalRegisterEntryRequestValidator()
    {
        RuleFor(x => x.ShopId).NotEmpty();
        RuleFor(x => x.RefusalDate).NotEqual(default(DateOnly));
        RuleFor(x => x.RefusalTime).NotEqual(default(TimeOnly));
        RuleFor(x => x.Product).NotEmpty().MaximumLength(120);
        RuleFor(x => x.PersonDescription).NotEmpty().MaximumLength(300);
        RuleFor(x => x.Observations).MaximumLength(1000);
        RuleFor(x => x.StaffMemberInitials).MaximumLength(20);
        RuleFor(x => x.SignatureDataUrl).NotEmpty().MaximumLength(5000000);
    }
}

public class UpdateRefusalRegisterEntryRequestValidator : AbstractValidator<UpdateRefusalRegisterEntryRequest>
{
    public UpdateRefusalRegisterEntryRequestValidator()
    {
        RuleFor(x => x.RefusalTime).NotEqual(default(TimeOnly));
        RuleFor(x => x.Product).NotEmpty().MaximumLength(120);
        RuleFor(x => x.PersonDescription).NotEmpty().MaximumLength(300);
        RuleFor(x => x.Observations).MaximumLength(1000);
        RuleFor(x => x.StaffMemberInitials).MaximumLength(20);
        RuleFor(x => x.SignatureDataUrl).MaximumLength(5000000);
    }
}

public class SignOffRefusalRegisterDailyRequestValidator : AbstractValidator<SignOffRefusalRegisterDailyRequest>
{
    public SignOffRefusalRegisterDailyRequestValidator()
    {
        RuleFor(x => x.ShopId).NotEmpty();
        RuleFor(x => x.SignoffDate).NotEqual(default(DateOnly));
        RuleFor(x => x.SignedByInitials).MaximumLength(20);
        RuleFor(x => x.Notes).MaximumLength(1000);
        RuleFor(x => x.SignatureDataUrl).NotEmpty().MaximumLength(5000000);
    }
}

public class ReopenRefusalRegisterDailyRequestValidator : AbstractValidator<ReopenRefusalRegisterDailyRequest>
{
    public ReopenRefusalRegisterDailyRequestValidator()
    {
        RuleFor(x => x.ShopId).NotEmpty();
        RuleFor(x => x.SignoffDate).NotEqual(default(DateOnly));
    }
}

public class ReviewRefusalRegisterEntryRequestValidator : AbstractValidator<ReviewRefusalRegisterEntryRequest>
{
    public ReviewRefusalRegisterEntryRequestValidator()
    {
        RuleFor(x => x.Notes).MaximumLength(1000);
        RuleFor(x => x.SignatureDataUrl).MaximumLength(5000000);
    }
}

public class ReviewRefusalRegisterEntriesRequestValidator : AbstractValidator<ReviewRefusalRegisterEntriesRequest>
{
    public ReviewRefusalRegisterEntriesRequestValidator()
    {
        RuleFor(x => x.ShopId).NotEmpty();
        RuleFor(x => x.EntryIds).NotEmpty();
        RuleForEach(x => x.EntryIds).NotEmpty();
        RuleFor(x => x.Notes).MaximumLength(1000);
        RuleFor(x => x.SignatureDataUrl).NotEmpty().MaximumLength(5000000);
    }
}

public class SendReportEmailRequestValidator : AbstractValidator<SendReportEmailRequest>
{
    public SendReportEmailRequestValidator()
    {
        RuleFor(x => x.RecipientEmail)
            .EmailAddress()
            .When(x => !string.IsNullOrWhiteSpace(x.RecipientEmail));

        RuleFor(x => x.Subject)
            .NotEmpty()
            .MaximumLength(200);

        RuleFor(x => x.Body)
            .NotEmpty()
            .MaximumLength(5_000_000);

        RuleFor(x => x.AttachmentFileName)
            .MaximumLength(260);

        RuleFor(x => x.AttachmentBase64)
            .MaximumLength(15_000_000);
    }
}
