using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Domain.Entities;
using ScratchCard.Infrastructure.Authentication;
using ScratchCard.Infrastructure.Persistence;
using ScratchCard.Infrastructure.Repositories;
using ScratchCard.Infrastructure.Seed;
using ScratchCard.Infrastructure.Services;

namespace ScratchCard.Infrastructure;

public static class DependencyInjection
{
    public static IServiceCollection AddInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddDbContext<ApplicationDbContext>(options =>
            options.UseSqlServer(
                configuration.GetConnectionString("DefaultConnection"),
                sql => sql.MigrationsAssembly(typeof(ApplicationDbContext).Assembly.FullName)));

        services.Configure<EmailOptions>(configuration.GetSection("Email"));
        services.Configure<GoogleAuthOptions>(configuration.GetSection("GoogleAuth"));
        services.Configure<AppJwtOptions>(configuration.GetSection("Jwt"));
        services.Configure<OpenAiOptions>(configuration.GetSection("OpenAI"));
        services.Configure<DocumentIntelligenceOptions>(configuration.GetSection("DocumentIntelligence"));
        services.Configure<AttachmentStorageOptions>(configuration.GetSection("AttachmentStorage"));
        services.Configure<FirebasePushOptions>(configuration.GetSection("FirebasePush"));
        services.Configure<MetaWhatsAppOptions>(configuration.GetSection("WhatsApp"));
        services.Configure<StripeOptions>(configuration.GetSection("Stripe"));
        services.AddScoped<IBillingCheckoutService, StripeBillingCheckoutService>();

        services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
        services.AddScoped<IPasswordHashService, PasswordHashService>();
        services.AddScoped<IAttachmentStorageService, AttachmentStorageService>();

        services.AddHttpContextAccessor();
        services.AddHttpClient("OpenAI", (provider, client) =>
        {
            var options = provider.GetRequiredService<Microsoft.Extensions.Options.IOptions<OpenAiOptions>>().Value;
            if (options.TimeoutSeconds > 0)
            {
                client.Timeout = TimeSpan.FromSeconds(options.TimeoutSeconds);
            }
        });
        services.AddHttpClient<BrevoEmailSender>();
        services.AddScoped<ICurrentUserService, CurrentUserService>();
        services.AddScoped<IJwtTokenService, JwtTokenService>();
        services.AddScoped<IRefreshTokenService, RefreshTokenService>();

        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        services.AddScoped<IInvitationTokenService, InvitationTokenService>();
        services.AddScoped<IAuditService, AuditService>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddHttpClient<IPushSender, FirebasePushSender>();
        services.AddSingleton<ShiftCloseNotificationBackgroundQueue>();
        services.AddSingleton<IShiftCloseNotificationDispatcher>(provider => provider.GetRequiredService<ShiftCloseNotificationBackgroundQueue>());
        services.AddHostedService<ShiftCloseNotificationBackgroundService>();
        services.AddSingleton<ShiftCloseAttachmentBackgroundQueue>();
        services.AddSingleton<IShiftCloseAttachmentDispatcher>(provider => provider.GetRequiredService<ShiftCloseAttachmentBackgroundQueue>());
        services.AddHostedService<ShiftCloseAttachmentBackgroundService>();
        services.AddSingleton<DayCloseNotificationBackgroundQueue>();
        services.AddSingleton<IDayCloseNotificationDispatcher>(provider => provider.GetRequiredService<DayCloseNotificationBackgroundQueue>());
        services.AddHostedService<DayCloseNotificationBackgroundService>();
        services.AddSingleton<DayCloseAttachmentBackgroundQueue>();
        services.AddSingleton<IDayCloseAttachmentDispatcher>(provider => provider.GetRequiredService<DayCloseAttachmentBackgroundQueue>());
        services.AddHostedService<DayCloseAttachmentBackgroundService>();
        services.AddSingleton<AuditLogBackgroundQueue>();
        services.AddHostedService<AuditLogBackgroundService>();
        services.AddSingleton<ShopNotificationBackgroundQueue>();
        services.AddSingleton<IShopNotificationDispatcher>(provider => provider.GetRequiredService<ShopNotificationBackgroundQueue>());
        services.AddHostedService<ShopNotificationBackgroundService>();
        services.AddHostedService<ShopTrialExpiryBackgroundService>();
        services.AddHostedService<TrialReminderBackgroundService>();
        services.AddHostedService<TemperatureMissedAlertsBackgroundService>();
        services.AddHostedService<TemperatureLogReminderBackgroundService>();
        services.AddHostedService<ShiftReminderBackgroundService>();
        services.AddHostedService<WeeklyTimesheetBackgroundService>();

        services.AddScoped<IDeliveryNoteAiParser, OpenAiDeliveryNoteParser>();
        services.AddScoped<ITillReportOcrService, AzureDocumentIntelligenceOcrService>();
        services.AddScoped<ITillLineAiClassifier, OpenAiTillLineClassifier>();
        services.AddScoped<SmtpEmailSender>();
        services.AddScoped<ConfiguredEmailSender>();
        services.AddScoped<IEmailSender>(provider => provider.GetRequiredService<ConfiguredEmailSender>());
        services.AddScoped<ISmsSender, NoopSmsSender>();

        // WhatsApp: register Meta sender when AccessToken + PhoneNumberId are both present,
        // else the no-op so feature-gated callers don't blow up in dev or fresh staging.
        var whatsAppConfig = configuration.GetSection("WhatsApp");
        var hasMetaCredentials =
            !string.IsNullOrWhiteSpace(whatsAppConfig["AccessToken"]) &&
            !string.IsNullOrWhiteSpace(whatsAppConfig["PhoneNumberId"]);
        if (hasMetaCredentials)
        {
            services.AddHttpClient<IWhatsAppSender, MetaWhatsAppSender>(client =>
            {
                client.BaseAddress = new Uri("https://graph.facebook.com/");
                client.Timeout = TimeSpan.FromSeconds(15);
            });
        }
        else
        {
            services.AddScoped<IWhatsAppSender, NoopWhatsAppSender>();
        }

        return services;
    }

    public static async Task SeedDatabaseAsync(this IServiceProvider services, CancellationToken cancellationToken = default)
    {
        using var scope = services.CreateScope();
        var dbContext = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
        await dbContext.Database.MigrateAsync(cancellationToken);
        await SeedDataInitializer.SeedAsync(dbContext, cancellationToken);
    }
}
