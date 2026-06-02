using ScratchCard.Application.DTOs.Admin;
using ScratchCard.Application.DTOs.Auth;
using ScratchCard.Application.DTOs.BusinessDays;
using ScratchCard.Application.DTOs.Companies;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.DTOs.ComplianceChecks;
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
using ScratchCard.Application.DTOs.VisitorLog;
using ScratchCard.Application.DTOs.Shifts;
using ScratchCard.Application.DTOs.ShiftSales;
using ScratchCard.Application.DTOs.Shops;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Application.DTOs.TemperatureLogs;
using ScratchCard.Application.DTOs.Users;
using ScratchCard.Domain.Enums;
using ScratchCard.Shared.Models;

namespace ScratchCard.Application.Common.Services;

public interface IShopNotificationWorker
{
    Task ProcessAsync(Common.Interfaces.ShopNotificationJob job, CancellationToken cancellationToken = default);
}

public interface IAdminCustomerService
{
    Task<PagedResult<CustomerListItemDto>> ListCustomersAsync(string? search, int page, int pageSize, CancellationToken cancellationToken = default);
    Task<PagedResult<AdminShopListItemDto>> ListShopsAsync(string? search, int page, int pageSize, CancellationToken cancellationToken = default);
    Task<CustomerDetailDto> GetCustomerAsync(Guid companyId, CancellationToken cancellationToken = default);
    Task<CustomerDetailDto> UpdateCustomerAsync(Guid companyId, AdminUpdateCustomerRequest request, CancellationToken cancellationToken = default);
    Task<CustomerDetailDto> SetCustomerStatusAsync(Guid companyId, bool isActive, CancellationToken cancellationToken = default);
    Task<CustomerDetailDto> SetUserActiveAsync(Guid companyId, Guid userId, Guid shopId, bool isActive, CancellationToken cancellationToken = default);
    Task<CustomerDetailDto> AssignUserRoleAsync(Guid companyId, Guid userId, Guid shopId, Guid roleId, CancellationToken cancellationToken = default);
    Task<CustomerDetailDto> SelectShopPlanAsync(Guid companyId, Guid shopId, Guid planId, CancellationToken cancellationToken = default);
    Task<CustomerDetailDto> CancelShopSubscriptionAsync(Guid companyId, Guid shopId, bool cancelAtPeriodEnd, CancellationToken cancellationToken = default);
    Task<CustomerDetailDto> ReactivateShopSubscriptionAsync(Guid companyId, Guid shopId, CancellationToken cancellationToken = default);
    Task<InvitationDto> InviteShopUserAsync(Guid companyId, Guid shopId, string email, Guid roleId, int expiryHours, CancellationToken cancellationToken = default);
}

public interface ITillService
{
    Task<IReadOnlyCollection<TillDto>> ListAsync(Guid shopId, bool includeInactive, CancellationToken cancellationToken = default);
    Task<TillDto> CreateAsync(CreateTillRequest request, CancellationToken cancellationToken = default);
    Task<TillDto> UpdateAsync(Guid id, UpdateTillRequest request, CancellationToken cancellationToken = default);
    Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface IShopPaymentTypeService
{
    Task<IReadOnlyCollection<ShopPaymentTypeDto>> ListAsync(Guid shopId, bool includeInactive, CancellationToken cancellationToken = default);
    Task<ShopPaymentTypeDto> CreateAsync(CreateShopPaymentTypeRequest request, CancellationToken cancellationToken = default);
    Task<ShopPaymentTypeDto> UpdateAsync(Guid id, UpdateShopPaymentTypeRequest request, CancellationToken cancellationToken = default);
    Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);
    // Adds a sensible default set (Cash, Card, Credit Card, Fuel Card, Cheque) to a shop, skipping
    // any that already exist by name. Returns the full active list afterwards.
    Task<IReadOnlyCollection<ShopPaymentTypeDto>> SeedDefaultsAsync(Guid shopId, CancellationToken cancellationToken = default);
}

public interface ITillReportService
{
    Task<TillReportDto> ProcessAsync(ProcessTillReportRequest request, CancellationToken cancellationToken = default);
    Task<TillReportDto> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task<PagedResult<TillReportListItemDto>> ListAsync(Guid shopId, DateOnly? from, DateOnly? to, int page, int pageSize, CancellationToken cancellationToken = default);
    Task<TillReportDto> ReclassifyLineAsync(Guid reportId, Guid lineId, TillLineClassification classification, CancellationToken cancellationToken = default);
    Task<TillReportDto> DeleteLineAsync(Guid reportId, Guid lineId, CancellationToken cancellationToken = default);
    Task<TillReportDto> UpsertPaymentAsync(Guid reportId, Guid paymentTypeId, decimal amount, CancellationToken cancellationToken = default);
    Task<TillPaymentSummaryDto> GetPaymentSummaryAsync(Guid shopId, Guid businessDayId, CancellationToken cancellationToken = default);
    Task<TillReportScopeSummaryDto> GetDaySummaryAsync(Guid shopId, Guid businessDayId, CancellationToken cancellationToken = default);
    Task<TillReportScopeSummaryDto> GetShiftSummaryAsync(Guid shopId, Guid shiftId, CancellationToken cancellationToken = default);
    Task<TillReportDto> ConfirmAsync(Guid reportId, CancellationToken cancellationToken = default);

    Task<IReadOnlyCollection<TillCategoryRuleDto>> ListRulesAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<TillCategoryRuleDto> CreateRuleAsync(CreateTillRuleRequest request, CancellationToken cancellationToken = default);
    Task DeleteRuleAsync(Guid ruleId, CancellationToken cancellationToken = default);
}

public interface IAuthService
{
    Task<SignupEmailVerificationResponse> RequestSignupEmailVerificationAsync(SignupEmailVerificationRequest request, CancellationToken cancellationToken = default);
    Task<AuthTokenResponseDto> SignUpWithPasswordAsync(PasswordSignupRequest request, CancellationToken cancellationToken = default);
    Task<AuthTokenResponseDto> SignInWithPasswordAsync(PasswordLoginRequest request, CancellationToken cancellationToken = default);
    Task<AuthTokenResponseDto> SignInDevAsync(DevLoginRequest request, CancellationToken cancellationToken = default);
    Task RequestPasswordResetAsync(ForgotPasswordRequest request, CancellationToken cancellationToken = default);
    Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken cancellationToken = default);
    Task<AuthTokenResponseDto> RefreshTokenAsync(CancellationToken cancellationToken = default);
    /// <summary>Exchanges a (rotating) refresh token for a new access + refresh token pair.</summary>
    Task<AuthTokenResponseDto> RefreshAccessTokenAsync(string refreshToken, CancellationToken cancellationToken = default);
    /// <summary>Revokes a refresh token on logout. Best-effort and idempotent.</summary>
    Task RevokeRefreshTokenAsync(string refreshToken, CancellationToken cancellationToken = default);
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
    /// <summary>Lets a signed-in user edit their own name/phone. Phone is optional.</summary>
    Task<UserDto> UpdateMyProfileAsync(UpdateUserProfileRequest request, CancellationToken cancellationToken = default);
    /// <summary>Lets a CompanyOwner or Manager update another user's name/phone on a shop they manage.</summary>
    Task<UserDto> UpdateUserDetailsAsync(Guid userId, Guid shopId, UpdateUserProfileRequest request, CancellationToken cancellationToken = default);
}

public interface IShopService
{
    Task<ShopDto> CreateAsync(CreateShopRequest request, CancellationToken cancellationToken = default);
    Task<ShopDto> UpdateAsync(Guid id, UpdateShopRequest request, CancellationToken cancellationToken = default);
    Task<ShopDto> GetAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ShopDto>> ListAsync(Guid? companyId, CancellationToken cancellationToken = default);
    Task<ShopFeatureTogglesDto> GetFeatureTogglesAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<ShopFeatureTogglesDto> UpdateFeatureTogglesAsync(Guid shopId, UpdateShopFeatureTogglesRequest request, CancellationToken cancellationToken = default);
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

public interface IShopSubscriptionService
{
    Task<ShopSubscriptionSummaryDto> EnsureTrialAsync(Guid shopId, Guid? intendedPlanId = null, CancellationToken cancellationToken = default);
    Task<ShopSubscriptionSummaryDto?> GetSummaryAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<ShopEntitlementsDto> GetEntitlementsAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<ShopSubscriptionSummaryDto> SelectPlanAsync(SelectShopSubscriptionPlanRequest request, CancellationToken cancellationToken = default);
    Task<ShopSubscriptionSummaryDto> CancelAsync(Guid shopId, bool cancelAtPeriodEnd, CancellationToken cancellationToken = default);
    Task<ShopSubscriptionSummaryDto> ReactivateAsync(Guid shopId, CancellationToken cancellationToken = default);
    /// <summary>
    /// Temporarily pauses a shop's subscription. Stripe is told to stop collecting via
    /// pause_collection, the local ShopSubscription flips to Suspended, Shop.IsActive=false,
    /// and a PausedOn timestamp is set so the 1-year cap can be enforced by a background job.
    /// Owner can resume any time within the cap window.
    /// </summary>
    Task<ShopSubscriptionSummaryDto> PauseAsync(Guid shopId, CancellationToken cancellationToken = default);
    /// <summary>
    /// Resumes a paused shop. Clears Stripe's pause_collection, restores Status to Active (or
    /// TrialActive if the trial would still be valid), flips Shop.IsActive=true. If Stripe says
    /// the subscription no longer exists (e.g. auto-cancelled by the 1-year cap) the caller is
    /// expected to redirect the owner to the Choose Plan flow.
    /// </summary>
    Task<ShopSubscriptionSummaryDto> ResumeAsync(Guid shopId, CancellationToken cancellationToken = default);
    /// <summary>
    /// Forces a re-sync of the shop's subscription state by retrieving the current subscription
    /// from Stripe directly. Used when a webhook was lost and the user taps "Refresh
    /// subscription status" in the mobile app.
    /// </summary>
    Task<ShopSubscriptionSummaryDto> RefreshFromProviderAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task ProcessTrialExpiriesAsync(CancellationToken cancellationToken = default);
    /// <summary>
    /// Background sweep that enforces the 1-year pause cap. Auto-cancels shops paused longer
    /// than the cap and sends a heads-up email to those approaching it.
    /// </summary>
    Task ProcessPauseCapAsync(CancellationToken cancellationToken = default);
    /// <summary>
    /// Applies a normalised Stripe subscription event to the matching ShopSubscription. Called
    /// by the Stripe webhook controller after signature verification.
    /// </summary>
    Task ApplyStripeSubscriptionEventAsync(string eventType, StripeSubscriptionSnapshot snapshot, CancellationToken cancellationToken = default);
    /// <summary>
    /// Returns the Stripe Customer Portal URL for the company that owns this shop. Mobile opens
    /// it in an external browser so the owner can update card / cancel / view invoices for
    /// every shop subscription in one place.
    /// </summary>
    Task<string> CreatePortalSessionAsync(Guid shopId, CancellationToken cancellationToken = default);
}

public interface ISubscriptionPlanAdminService
{
    Task<IReadOnlyCollection<SubscriptionPlanDto>> ListAllAsync(CancellationToken cancellationToken = default);
    Task<SubscriptionPlanDto> UpdateAsync(Guid planId, UpdateSubscriptionPlanRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<SubscriptionPlanFeatureDto>> ListPlanFeaturesAsync(Guid planId, CancellationToken cancellationToken = default);
    Task<SubscriptionPlanFeatureDto> UpsertPlanFeatureAsync(Guid planId, UpsertPlanFeatureRequest request, CancellationToken cancellationToken = default);
    Task RemovePlanFeatureAsync(Guid planId, Guid featureId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<SubscriptionPlanFeatureDto>> SetPlanFeaturesAsync(Guid planId, SetPlanFeaturesRequest request, CancellationToken cancellationToken = default);
    // Re-applies the canonical feature set for the given tier name (Starter/Growth/Pro) onto the
    // plan. Seed never updates existing plans, so newly added feature keys won't reach a plan
    // without this. The merge is additive — admin-added features outside the catalogue are left
    // untouched.
    Task<IReadOnlyCollection<SubscriptionPlanFeatureDto>> SyncFromCatalogueAsync(Guid planId, string tier, CancellationToken cancellationToken = default);

    /// <summary>
    /// Reads the global subscription settings (ShopId = null) — drives the fallback trial length
    /// used when a plan has no per-plan TrialDays set.
    /// </summary>
    Task<GlobalSubscriptionSettingsDto> GetGlobalSettingsAsync(CancellationToken cancellationToken = default);

    /// <summary>
    /// Updates the global subscription settings. Send only the fields you want to change.
    /// </summary>
    Task<GlobalSubscriptionSettingsDto> UpdateGlobalSettingsAsync(UpdateGlobalSubscriptionSettingsRequest request, CancellationToken cancellationToken = default);
}

public interface IFeatureAdminService
{
    Task<IReadOnlyCollection<FeatureDto>> ListAsync(bool includeInactive, CancellationToken cancellationToken = default);
    Task<FeatureDto> CreateAsync(UpsertFeatureRequest request, CancellationToken cancellationToken = default);
    Task<FeatureDto> UpdateAsync(Guid id, UpsertFeatureRequest request, CancellationToken cancellationToken = default);
    Task DeleteAsync(Guid id, CancellationToken cancellationToken = default);
}

public interface ISubscriptionCalculationService
{
    Task<SubscriptionCalculationResultDto> CalculateAsync(Guid companyId, Guid planId, CancellationToken cancellationToken = default);
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
    Task<IReadOnlyCollection<PackDto>> ListAsync(Guid shopId, bool activeOnly = false, CancellationToken cancellationToken = default);
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
    Task<IReadOnlyCollection<CanisterDto>> ListCanistersAsync(Guid businessDayId, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<CanisterDropDto>> ListCanisterDropsAsync(Guid businessDayId, CancellationToken cancellationToken = default);
    Task<CanisterDropDto> AddCanisterDropAsync(Guid businessDayId, CreateCanisterDropRequest request, CancellationToken cancellationToken = default);
    Task<CanisterDropDto> ApproveCanisterDropAsync(Guid canisterDropId, string? notes, CancellationToken cancellationToken = default);
    Task<BusinessDayDto> CloseAsync(Guid id, CloseBusinessDayRequest request, CancellationToken cancellationToken = default);
    Task<BusinessDayDto> ReopenAsync(Guid id, ReopenBusinessDayRequest request, CancellationToken cancellationToken = default);
    Task<string?> GetCloseAttachmentDataUrlAsync(Guid attachmentId, CancellationToken cancellationToken = default);
    Task SendDayCloseNotificationsAsync(Guid businessDayId, CancellationToken cancellationToken = default);
    /// <summary>Uploads day-close attachments and persists their rows. Runs off the request (via the
    /// background queue) so the close call isn't blocked on blob uploads.</summary>
    Task ProcessDayCloseAttachmentsAsync(DayCloseAttachmentWorkItem workItem, CancellationToken cancellationToken = default);
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
    /// <summary>Per-shift sales totals for every shift on a business day, in a single grouped query
    /// (replaces fetching each shift's sales individually).</summary>
    Task<IReadOnlyCollection<ShiftSalesTotalDto>> GetDayShiftSalesTotalsAsync(Guid businessDayId, CancellationToken cancellationToken = default);
    Task SendShiftCloseNotificationsAsync(Guid shiftId, bool includeManualEntryNotifications, CancellationToken cancellationToken = default);
    /// <summary>Uploads shift-close attachments and persists their rows. Runs off the request
    /// (via the background queue) so the close call isn't blocked on blob uploads.</summary>
    Task ProcessCloseAttachmentsAsync(ShiftCloseAttachmentWorkItem workItem, CancellationToken cancellationToken = default);

    // Per-pack closing-number staging store, edited on the dedicated "Enter Closing Numbers"
    // screen and consumed by shift finalize.
    Task<ShiftPackClosingDto> UpsertClosingNumberAsync(Guid shiftId, UpsertShiftPackClosingRequest request, CancellationToken cancellationToken = default);
    /// <summary>Upserts several pack closing-serials in one call (batched queries), so the client
    /// saves all packs in a single request instead of one per pack.</summary>
    Task<IReadOnlyCollection<ShiftPackClosingDto>> UpsertClosingNumbersBatchAsync(Guid shiftId, BatchUpsertShiftPackClosingRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ShiftPackClosingDto>> ListClosingNumbersAsync(Guid shiftId, CancellationToken cancellationToken = default);
    Task DeleteClosingNumberAsync(Guid shiftId, Guid packId, CancellationToken cancellationToken = default);
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
    Task<IReadOnlyCollection<TemperatureReadingDto>> GetTemperatureLogsReportAsync(Guid shopId, DateOnly from, DateOnly to, Guid? unitId = null, CancellationToken cancellationToken = default);
    Task<TemperatureScheduleGridDto> GetTemperatureScheduleGridAsync(Guid shopId, DateOnly from, DateOnly to, Guid? unitId = null, CancellationToken cancellationToken = default);
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
    Task RegisterPushTokenAsync(RegisterPushTokenRequest request, CancellationToken cancellationToken = default);
    Task UnregisterPushTokenAsync(UnregisterPushTokenRequest request, CancellationToken cancellationToken = default);
    /// <summary>
    /// Diagnostic: fires a known-good push to every registered token of the given user and
    /// returns per-token success/failure detail (Firebase error verbatim on failure). Intended
    /// for admins / dev to verify the push pipeline end-to-end when "it just isn't working".
    /// </summary>
    Task<TestPushResultDto> SendTestPushAsync(Guid userId, CancellationToken cancellationToken = default);
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
    Task<IReadOnlyCollection<TemperatureScheduleDto>> ListSchedulesAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<TemperatureScheduleDto> CreateScheduleAsync(UpsertTemperatureScheduleRequest request, CancellationToken cancellationToken = default);
    Task<TemperatureScheduleDto> UpdateScheduleAsync(Guid id, UpsertTemperatureScheduleRequest request, CancellationToken cancellationToken = default);
    Task DeleteScheduleAsync(Guid id, CancellationToken cancellationToken = default);
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
    Task<IReadOnlyCollection<StaffRefusalSummaryDto>> GetStaffSummaryAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    Task<RefusalRegisterDailyLogDto> GetDailyLogAsync(Guid shopId, DateOnly date, CancellationToken cancellationToken = default);
    Task<RefusalRegisterEntryDto> ReviewEntryAsync(Guid id, ReviewRefusalRegisterEntryRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<RefusalRegisterEntryDto>> ReviewEntriesAsync(ReviewRefusalRegisterEntriesRequest request, CancellationToken cancellationToken = default);
    Task<RefusalRegisterDailySignoffDto> SignOffDailyAsync(SignOffRefusalRegisterDailyRequest request, CancellationToken cancellationToken = default);
    Task ReopenDailyAsync(ReopenRefusalRegisterDailyRequest request, CancellationToken cancellationToken = default);
}

public interface IVisitorLogService
{
    Task<VisitorLogEntryDto> CreateEntryAsync(CreateVisitorLogEntryRequest request, CancellationToken cancellationToken = default);
    Task<VisitorLogEntryDto> GetEntryAsync(Guid id, CancellationToken cancellationToken = default);
    Task<VisitorLogEntryDto> UpdateEntryAsync(Guid id, UpdateVisitorLogEntryRequest request, CancellationToken cancellationToken = default);
    Task<VisitorLogEntryDto> SignOutAsync(Guid id, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<VisitorLogEntryDto>> ListEntriesAsync(Guid shopId, DateOnly date, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<VisitorLogEntryDto>> ListEntriesByRangeAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<VisitorLogEntryDto>> ListOnSiteAsync(Guid shopId, CancellationToken cancellationToken = default);
    Task<VisitorLogDailyLogDto> GetDailyLogAsync(Guid shopId, DateOnly date, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<VisitorDirectoryDto>> SearchDirectoryAsync(Guid shopId, string query, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<VisitorOrganisationDto>> SearchOrganisationsAsync(string query, CancellationToken cancellationToken = default);
    Task<string?> GetEntrySignatureDataUrlAsync(Guid id, CancellationToken cancellationToken = default);
    Task<string?> GetEntryPhotoDataUrlAsync(Guid id, CancellationToken cancellationToken = default);
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

public interface IComplianceCheckService
{
    Task<IReadOnlyCollection<ComplianceCheckGroupDto>> ListConfigurationAsync(Guid shopId, ComplianceCheckFrequency? frequency = null, CancellationToken cancellationToken = default);
    Task<ComplianceCheckGroupDto> CreateGroupAsync(CreateComplianceCheckGroupRequest request, CancellationToken cancellationToken = default);
    Task<ComplianceCheckGroupDto> UpdateGroupAsync(Guid id, UpdateComplianceCheckGroupRequest request, CancellationToken cancellationToken = default);
    Task ReorderGroupsAsync(ReorderComplianceCheckGroupsRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ComplianceCheckItemDto>> ListItemsAsync(Guid shopId, ComplianceCheckFrequency? frequency = null, CancellationToken cancellationToken = default);
    Task<ComplianceCheckItemDto> CreateItemAsync(CreateComplianceCheckItemRequest request, CancellationToken cancellationToken = default);
    Task<ComplianceCheckItemDto> UpdateItemAsync(Guid id, UpdateComplianceCheckItemRequest request, CancellationToken cancellationToken = default);
    Task ReorderItemsAsync(ReorderComplianceCheckItemsRequest request, CancellationToken cancellationToken = default);
    Task<ComplianceCheckPeriodLogDto> GetPeriodLogAsync(Guid shopId, ComplianceCheckFrequency frequency, DateOnly date, CancellationToken cancellationToken = default);
    Task<ComplianceCheckEntryDto> UpsertEntryAsync(UpsertComplianceCheckEntryRequest request, CancellationToken cancellationToken = default);
    Task<ComplianceCheckEntryDto> CloseActionAsync(CloseOutComplianceActionRequest request, CancellationToken cancellationToken = default);
    Task<IReadOnlyCollection<ComplianceActionReportRowDto>> GetActionReportAsync(Guid shopId, DateOnly from, DateOnly to, bool openOnly, CancellationToken cancellationToken = default);
    Task<string?> GetAttachmentDataUrlAsync(Guid attachmentId, CancellationToken cancellationToken = default);
}
