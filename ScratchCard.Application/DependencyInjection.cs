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
        services.AddScoped<ICompanySignupService, CompanySignupService>();
        services.AddScoped<IShopService, ShopService>();
        services.AddScoped<ISubscriptionCalculationService, SubscriptionCalculationService>();
        services.AddScoped<IInvoiceService, InvoiceService>();
        services.AddScoped<ISubscriptionBillingService, SubscriptionBillingService>();
        services.AddScoped<ISubscriptionService, SubscriptionService>();
        services.AddScoped<ISubscriptionAccessService, SubscriptionAccessService>();
        services.AddScoped<IConfigurationService, ConfigurationService>();
        services.AddScoped<IGameService, GameService>();
        services.AddScoped<IDeliveryService, DeliveryService>();
        services.AddScoped<IPackService, PackService>();
        services.AddScoped<IBusinessDayService, BusinessDayService>();
        services.AddScoped<IShiftService, ShiftService>();
        services.AddScoped<IShiftSalesService, ShiftSalesService>();
        services.AddScoped<IPrizePayoutService, PrizePayoutService>();
        services.AddScoped<IReportService, ReportService>();
        services.AddScoped<INotificationLogService, NotificationLogService>();
        services.AddScoped<ILookupService, LookupService>();
        services.AddScoped<ITemperatureLogService, TemperatureLogService>();
        services.AddScoped<IRefusalRegisterService, RefusalRegisterService>();

        return services;
    }
}
