using ScratchCard.Application.DTOs.Auth;
using ScratchCard.Application.DTOs.BusinessDays;
using ScratchCard.Application.DTOs.Companies;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.DTOs.Configurations;
using ScratchCard.Application.DTOs.Checklists;
using ScratchCard.Application.DTOs.Deliveries;
using ScratchCard.Application.DTOs.Games;
using ScratchCard.Application.DTOs.Invitations;
using ScratchCard.Application.DTOs.Lookups;
using ScratchCard.Application.DTOs.Notifications;
using ScratchCard.Application.DTOs.Packs;
using ScratchCard.Application.DTOs.PrizePayouts;
using ScratchCard.Application.DTOs.Reports;
using ScratchCard.Application.DTOs.RefusalRegister;
using ScratchCard.Application.DTOs.Shifts;
using ScratchCard.Application.DTOs.ShiftSales;
using ScratchCard.Application.DTOs.Shops;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Application.DTOs.TemperatureLogs;
using ScratchCard.Application.DTOs.Users;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Common.Services;

public interface IAuthService
{
    Task<AuthTokenResponseDto> SignUpWithPasswordAsync(PasswordSignupRequest request, CancellationToken cancellationToken = default);
    Task<AuthTokenResponseDto> SignInWithPasswordAsync(PasswordLoginRequest request, CancellationToken cancellationToken = default);
    Task<AuthTokenResponseDto> SignInDevAsync(DevLoginRequest request, CancellationToken cancellationToken = default);
    Task RequestPasswordResetAsync(ForgotPasswordRequest request, CancellationToken cancellationToken = default);
    Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken cancellationToken = default);
    Task<AuthTokenResponseDto> RefreshTokenAsync(CancellationToken cancellationToken = default);
    Task<CurrentUserProfileDto> GetCurrentUserProfileAsync(CancellationToken cancellationToken = default);
}

public interface IInvitationService
{
    Task<InvitationDto> SendInvitationAsync(CreateInvitationRequest request, CancellationToken cancellationToken = default);
    Task<ValidateInvitationResponse> ValidateInvitationAsync(string token, CancellationToken cancellationToken = default);
    Task<InvitationDto> AcceptInvitationAsync(AcceptInvitationRequest request, CancellationToken cancellationToken = default);
    Task<InvitationDto> ResendInvitationAsync(Guid invitationId, CancellationToken cancellationToken = default);
    Task CancelInvitationAsync(Guid invitationId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<InvitationDto>> ListInvitationsAsync(Guid shopId, CancellationToken cancellationToken = default);
}

public interface IUserService
{
    Task<IReadOnlyCollection<UserDto>> ListUsersAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task UpdateRoleAsync(Guid userId, UpdateUserRoleRequest request, CancellationToken cancellationToken = default);
    Task SetActiveAsync(Guid userId, Guid shopId, bool isActive, CancellationToken cancellationToken = default);
}

public interface IShopService
{
    Task<ShopDto> CreateAsync(CreateShopRequest request, CancellationToken cancellationToken = default);
    Task<ShopDto> UpdateAsync(Guid id, UpdateShopRequest request, CancellationToken cancellationToken = default);
    Task<ShopDto> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ShopDto>> ListAsync(Guid? companyId, CancellationToken cancellationToken = default);
}

public interface ICompanyService
{
    Task<CompanyDto> CreateAsync(CreateCompanyRequest request, CancellationToken cancellationToken = default);
    Task<CompanyDto> UpdateAsync(Guid id, UpdateCompanyRequest request, CancellationToken cancellationToken = default);
    Task<CompanyDto> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<CompanyDto>> ListMineAsync(CancellationToken cancellationToken = default);
}

public interface ICompanySignupService
{
    Task<AuthTokenResponseDto> SignUpAsync(CompanySignupRequest request, CancellationToken cancellationToken = default);
}

public interface ISubscriptionService
{
    Task<IReadOnlyCollection<SubscriptionPlanDto>> GetPlansAsync(CancellationToken cancellationToken = default);
    Task<SubscriptionSummaryDto> GetSummaryAsync(Guid companyId, CancellationToken cancellationToken = default);
    Task<SubscriptionCalculationResultDto> CalculateAsync(SubscriptionCalculationRequest request, CancellationToken cancellationToken = default);
    Task<SubscriptionSummaryDto> SelectPlanAsync(SelectSubscriptionPlanRequest request, CancellationToken cancellationToken = default);
    Task<SubscriptionSummaryDto> CancelAsync(Guid companyId, bool cancelAtPeriodEnd, CancellationToken cancellationToken = default);
    Task<SubscriptionSummaryDto> ReactivateAsync(Guid companyId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<SubscriptionInvoiceDto>> ListInvoicesAsync(Guid companyId, CancellationToken cancellationToken = default);
    Task<SubscriptionInvoiceDto> GetInvoiceAsync(Guid invoiceId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<SubscriptionDiscountRuleDto>> ListDiscountRulesAsync(CancellationToken cancellationToken = default);
    Task<SubscriptionDiscountRuleDto> CreateDiscountRuleAsync(UpsertSubscriptionDiscountRuleRequest request, CancellationToken cancellationToken = default);
    Task<SubscriptionDiscountRuleDto> UpdateDiscountRuleAsync(Guid id, UpsertSubscriptionDiscountRuleRequest request, CancellationToken cancellationToken = default);
    Task DeleteDiscountRuleAsync(Guid id, CancellationToken cancellationToken = default);
    Task ProcessTrialExpiriesAsync(CancellationToken cancellationToken = default);
}

public interface ISubscriptionCalculationService
{
    Task<SubscriptionCalculationResultDto> CalculateAsync(Guid companyId, Guid planId, CancellationToken cancellationToken = default);
}

public interface IPaymentProviderService
{
    Task<string> CreateCustomerAsync(Guid companyId, string email, string name, CancellationToken cancellationToken = default);
    Task<string> CreateCheckoutSessionAsync(Guid companySubscriptionId, decimal amount, string currency, CancellationToken cancellationToken = default);
    Task<PaymentStatus> GetPaymentStatusAsync(string providerTransactionId, CancellationToken cancellationToken = default);
    Task CancelSubscriptionAsync(string providerSubscriptionId, CancellationToken cancellationToken = default);
    Task HandleWebhookAsync(string payload, CancellationToken cancellationToken = default);
}

public interface ISubscriptionBillingService
{
    Task<SubscriptionInvoiceDto> CreateInvoiceAsync(Guid companySubscriptionId, CancellationToken cancellationToken = default);
}

public interface IInvoiceService
{
    Task<IReadOnlyCollection<SubscriptionInvoiceDto>> ListAsync(Guid companyId, CancellationToken cancellationToken = default);
    Task<SubscriptionInvoiceDto> GetAsync(Guid invoiceId, CancellationToken cancellationToken = default);
}

public interface ISubscriptionAccessService
{
    Task<SubscriptionAccessResult> GetAccessResultAsync(Guid userId, CancellationToken cancellationToken = default);
}

public class SubscriptionAccessResult
{
    public bool IsAllowed { get; set; }
    public SubscriptionStatus? BlockingStatus { get; set; }
}

public interface IConfigurationService
{
    Task<IReadOnlyCollection<ConfigurationItemDto>> GetAsync(Guid? shopId, CancellationToken cancellationToken = default);
    Task UpdateAsync(UpdateConfigurationRequest request, CancellationToken cancellationToken = default);
}

public interface IShopConfigurationService
{
    Task<ShopShiftSetup> GetShiftSetupAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<ShopBusinessDaySetup> GetBusinessDaySetupAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<ShopPackSetup> GetPackSetupAsync(Guid shopId, CancellationToken cancellationToken = default);
}

public interface IGameService
{
    Task<GameDto> CreateAsync(CreateGameRequest request, CancellationToken cancellationToken = default);
    Task<GameDto> UpdateAsync(Guid id, UpdateGameRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<GameDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task DeactivateAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface IDeliveryService
{
    Task<DeliveryDto> CreateAsync(CreateDeliveryRequest request, CancellationToken cancellationToken = default);
    Task<ParseDeliveryNoteResponse> ParseDeliveryNoteAsync(ParseDeliveryNoteRequest request, CancellationToken cancellationToken = default);
    Task<DeliveryDto> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<DeliveryDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default);
}

public interface IPackService
{
    Task<PackDto> CreateManualAsync(CreateManualPackRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<PackDto>> ListAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<PackDto> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PackDto> UpdateDetailsAsync(Guid id, UpdatePackDetailsRequest request, CancellationToken cancellationToken = default);
    Task<PackDto> ActivateAsync(Guid id, ActivatePackRequest request, CancellationToken cancellationToken = default);
    Task<PackDto> PauseAsync(Guid id, UpdatePackStatusRequest request, CancellationToken cancellationToken = default);
    Task<PackDto> ReturnAsync(Guid id, UpdatePackStatusRequest request, CancellationToken cancellationToken = default);
    Task<PackDto> MarkIssueAsync(Guid id, UpdatePackStatusRequest request, CancellationToken cancellationToken = default);
    Task<PackDto> CompleteAsync(Guid id, UpdatePackStatusRequest request, CancellationToken cancellationToken = default);
}

public interface IBusinessDayService
{
    Task<BusinessDayDto> OpenAsync(OpenBusinessDayRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<BusinessDayDto>> ListAsync(Guid shopId, DateOnly? from = null, DateOnly? to = null, CancellationToken cancellationToken = default);
    Task<BusinessDayDto> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task<BusinessDayDto> CloseAsync(Guid id, CloseBusinessDayRequest request, CancellationToken cancellationToken = default);
    Task<BusinessDayDto> ReopenAsync(Guid id, ReopenBusinessDayRequest request, CancellationToken cancellationToken = default);
    Task<string?> GetCloseAttachmentDataUrlAsync(Guid attachmentId, CancellationToken cancellationToken = default);
    Task SendDayCloseNotificationsAsync(Guid businessDayId, CancellationToken cancellationToken = default);
}

public interface IShiftService
{
    Task<ShiftDto> OpenAsync(OpenShiftRequest request, CancellationToken cancellationToken = default);
    Task<ShiftDto> StartScheduledAsync(Guid id, StartScheduledShiftRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ShiftDto>> ListAsync(Guid shopId, Guid? businessDayId = null, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ShiftCloseCandidateDto>> ListCloseCandidatesAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<ShiftDto> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task<ShiftCloseResultDto> CloseAsync(Guid id, FinalizeShiftRequest request, bool isOfflineSync, CancellationToken cancellationToken = default);
    Task<ShiftDto> ReopenAsync(Guid id, ReopenShiftRequest request, CancellationToken cancellationToken = default);
    Task DeleteAsync(Guid id, DeleteShiftRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<PackDto>> GetActivePacksForShiftCloseAsync(Guid shiftId, CancellationToken cancellationToken = default);
    Task<string?> GetCloseAttachmentDataUrlAsync(Guid attachmentId, CancellationToken cancellationToken = default);
}

public interface IShiftSalesService
{
    Task<ShiftCloseResultDto> SubmitShiftCloseSalesAsync(Guid shiftId, FinalizeShiftRequest request, CancellationToken cancellationToken = default);
    Task<ShiftCloseResultDto> SyncOfflineShiftCloseAsync(OfflineSyncShiftCloseRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ShiftSalesEntryDto>> GetShiftSalesAsync(Guid shiftId, CancellationToken cancellationToken = default);
    Task SendShiftCloseNotificationsAsync(Guid shiftId, bool includeManualEntryNotifications, CancellationToken cancellationToken = default);
}

public interface IPrizePayoutService
{
    Task<PrizePayoutDto> CreateAsync(CreatePrizePayoutRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<PrizePayoutDto>> ListAsync(Guid shiftId, CancellationToken cancellationToken = default);
    Task<PrizePayoutDto> ApproveAsync(Guid id, ApprovePrizePayoutRequest request, CancellationToken cancellationToken = default);
}

public interface IReportService
{
    Task<IReadOnlyCollection<DailySalesReportRowDto>> GetDailySalesAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<DailySalesReportRowDto>> GetShiftSalesAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ManualEntryReviewRowDto>> GetManualEntryReviewAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<StockReportRowDto>> GetStockReportAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<AuditLogReportRowDto>> GetAuditLogReportAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<NotificationLogDto>> GetNotificationLogReportAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<SyncStatusReportRowDto>> GetSyncStatusReportAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    Task SendReportByEmailAsync(SendReportEmailRequest request, CancellationToken cancellationToken = default);
}

public interface INotificationLogService
{
    Task<IReadOnlyCollection<NotificationLogDto>> GetLogsAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task RetryFailedAsync(Guid notificationLogId, CancellationToken cancellationToken = default);
}

public interface ILookupService
{
    Task<IReadOnlyCollection<RoleOptionDto>> GetRolesAsync(CancellationToken cancellationToken = default);
}

public interface ITemperatureLogService
{
    Task<IReadOnlyCollection<TemperatureMonitoringUnitDto>> ListUnitsAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<TemperatureMonitoringUnitDto> CreateUnitAsync(CreateTemperatureMonitoringUnitRequest request, CancellationToken cancellationToken = default);
    Task<TemperatureMonitoringUnitDto> UpdateUnitAsync(Guid id, UpdateTemperatureMonitoringUnitRequest request, CancellationToken cancellationToken = default);
    Task<TemperatureReadingDto> RecordReadingAsync(RecordTemperatureReadingRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<TemperatureReadingDto>> ListReadingsAsync(Guid shopId, DateOnly from, DateOnly to, Guid? unitId = null, CancellationToken cancellationToken = default);
    Task<TemperatureDailyLogDto> GetDailyLogAsync(Guid shopId, DateOnly date, CancellationToken cancellationToken = default);
    Task<TemperatureDailySignoffDto> SignOffDailyAsync(SignOffTemperatureDailyLogRequest request, CancellationToken cancellationToken = default);
}

public interface IRefusalRegisterService
{
    Task<RefusalRegisterEntryDto> CreateEntryAsync(CreateRefusalRegisterEntryRequest request, CancellationToken cancellationToken = default);
    Task<RefusalRegisterEntryDto> GetEntryAsync(Guid id, CancellationToken cancellationToken = default);
    Task<string?> GetEntrySignatureDataUrlAsync(Guid id, CancellationToken cancellationToken = default);
    Task<string?> GetEntryReviewSignatureDataUrlAsync(Guid id, CancellationToken cancellationToken = default);
    Task<RefusalRegisterEntryDto> UpdateEntryAsync(Guid id, UpdateRefusalRegisterEntryRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<RefusalRegisterEntryDto>> ListEntriesAsync(Guid shopId, DateOnly date, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<RefusalRegisterEntryDto>> ListEntriesByRangeAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    Task<RefusalRegisterDailyLogDto> GetDailyLogAsync(Guid shopId, DateOnly date, CancellationToken cancellationToken = default);
    Task<RefusalRegisterEntryDto> ReviewEntryAsync(Guid id, ReviewRefusalRegisterEntryRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<RefusalRegisterEntryDto>> ReviewEntriesAsync(ReviewRefusalRegisterEntriesRequest request, CancellationToken cancellationToken = default);
    Task<RefusalRegisterDailySignoffDto> SignOffDailyAsync(SignOffRefusalRegisterDailyRequest request, CancellationToken cancellationToken = default);
    Task ReopenDailyAsync(ReopenRefusalRegisterDailyRequest request, CancellationToken cancellationToken = default);
}

public interface IShopChecklistService
{
    Task<IReadOnlyCollection<ShopChecklistGroupDto>> ListConfigurationAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<ShopChecklistGroupDto> CreateGroupAsync(CreateShopChecklistGroupRequest request, CancellationToken cancellationToken = default);
    Task<ShopChecklistGroupDto> UpdateGroupAsync(Guid id, UpdateShopChecklistGroupRequest request, CancellationToken cancellationToken = default);
    Task ReorderGroupsAsync(ReorderChecklistGroupsRequest request, CancellationToken cancellationToken = default);
    Task<ShopChecklistTaskDto> CreateTaskAsync(CreateShopChecklistTaskRequest request, CancellationToken cancellationToken = default);
    Task<ShopChecklistTaskDto> UpdateTaskAsync(Guid id, UpdateShopChecklistTaskRequest request, CancellationToken cancellationToken = default);
    Task ReorderTasksAsync(ReorderChecklistTasksRequest request, CancellationToken cancellationToken = default);
    Task<ChecklistDailyLogDto> GetDailyChecklistAsync(Guid shopId, DateOnly businessDate, Guid? shiftId = null, CancellationToken cancellationToken = default);
    Task<ChecklistTaskCompletionDto> UpsertTaskCompletionAsync(UpsertChecklistTaskCompletionRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ChecklistTaskCompletionDto>> SyncOfflineCompletionsAsync(SyncOfflineChecklistCompletionsRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ChecklistCompletionHistoryRowDto>> GetCompletionHistoryAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ChecklistPendingRequiredTaskDto>> GetPendingRequiredDayCloseTasksAsync(Guid shopId, DateOnly businessDate, CancellationToken cancellationToken = default);
}
