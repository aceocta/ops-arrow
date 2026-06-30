using FluentValidation;
using Microsoft.Extensions.DependencyInjection;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.Services;

namespace ScratchCard.Application;

public static class DependencyInjection
{
    public static IServiceCollection AddApplication(this IServiceCollection services)
    {
        services.AddValidatorsFromAssembly(typeof(DependencyInjection).Assembly);

        services.AddScoped<ISerialCalculationService, SerialCalculationService>();
        services.AddScoped<IAuthService, AuthService>();
        services.AddScoped<IInvitationService, InvitationService>();
        services.AddScoped<IUserService, UserService>();
        services.AddScoped<ICompanyService, CompanyService>();
        services.AddScoped<IAdminCustomerService, AdminCustomerService>();
        services.AddScoped<IShopNotificationWorker, ShopNotificationWorker>();
        services.AddScoped<ICompanySignupService, CompanySignupService>();
        services.AddScoped<IShopService, ShopService>();
        services.AddScoped<ITillLabelResolver, TillLabelResolver>();
        services.AddScoped<ITillCanonicalAiClassifier, TillCanonicalAiClassifierAdapter>();
        services.AddScoped<ITillReconciliationService, TillReconciliationService>();
        services.AddScoped<ITillSettlementService, TillSettlementService>();
        services.AddScoped<ITillAccountingService, TillAccountingService>();
        services.AddScoped<ITillFieldOverrideService, TillFieldOverrideService>();
        services.AddScoped<ITillFieldDefinitionService, TillFieldDefinitionService>();
        services.AddScoped<ITillGroupDefinitionService, TillGroupDefinitionService>();
        services.AddScoped<IProductCategoryService, ProductCategoryService>();
        services.AddScoped<IProductExpiryService, ProductExpiryService>();
        services.AddScoped<ICoinPodService, CoinPodService>();
        services.AddScoped<ITillShopFieldService, TillShopFieldService>();
        services.AddScoped<ITillReportDefaultsService, TillReportDefaultsService>();
        services.AddScoped<IStaffPayRateService, StaffPayRateService>();
        services.AddScoped<IShiftSwapService, ShiftSwapService>();
        services.AddScoped<ISubscriptionCalculationService, SubscriptionCalculationService>();
        services.AddScoped<IInvoiceService, InvoiceService>();
        services.AddScoped<ISubscriptionBillingService, SubscriptionBillingService>();
        services.AddScoped<ISubscriptionService, SubscriptionService>();
        services.AddScoped<IShopSubscriptionService, ShopSubscriptionService>();
        services.AddScoped<ISubscriptionPlanAdminService, SubscriptionPlanAdminService>();
        services.AddScoped<IFeatureAdminService, FeatureAdminService>();
        services.AddScoped<IFeatureGateService, FeatureGateService>();
        services.AddScoped<ISubscriptionAccessService, SubscriptionAccessService>();
        services.AddScoped<IShopMembershipService, ShopMembershipService>();
        services.AddScoped<IConfigurationService, ConfigurationService>();
        services.AddScoped<IShopConfigurationService, ShopConfigurationService>();
        services.AddScoped<IGameService, GameService>();
        services.AddScoped<IDeliveryService, DeliveryService>();
        services.AddScoped<ITillRuleEngine, TillRuleEngine>();
        services.AddScoped<ITillService, TillService>();
        services.AddScoped<IShopPaymentTypeService, ShopPaymentTypeService>();
        services.AddScoped<ITillReportService, TillReportService>();
        services.AddScoped<IPackService, PackService>();
        services.AddScoped<IBusinessDayService, BusinessDayService>();
        services.AddScoped<IShiftService, ShiftService>();
        services.AddScoped<IShiftSalesService, ShiftSalesService>();
        services.AddScoped<IPrizePayoutService, PrizePayoutService>();
        services.AddScoped<IReportService, ReportService>();
        services.AddScoped<IOwnerOverviewService, OwnerOverviewService>();
        services.AddScoped<IRotaService, RotaService>();
        services.AddScoped<ILeaveService, LeaveService>();
        services.AddScoped<INotificationLogService, NotificationLogService>();
        services.AddScoped<ILookupService, LookupService>();
        services.AddScoped<ITemperatureLogService, TemperatureLogService>();
        services.AddScoped<IRefusalRegisterService, RefusalRegisterService>();
        services.AddScoped<IVisitorLogService, VisitorLogService>();
        services.AddScoped<IShopChecklistService, ShopChecklistService>();
        services.AddScoped<IComplianceCheckService, ComplianceCheckService>();

        return services;
    }
}
