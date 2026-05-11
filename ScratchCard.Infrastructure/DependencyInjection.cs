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

        services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
        services.AddScoped<IPasswordHashService, PasswordHashService>();

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

        services.AddScoped(typeof(IRepository<>), typeof(Repository<>));
        services.AddScoped<IUnitOfWork, UnitOfWork>();

        services.AddScoped<IInvitationTokenService, InvitationTokenService>();
        services.AddScoped<IAuditService, AuditService>();
        services.AddScoped<INotificationService, NotificationService>();
        services.AddScoped<IPaymentProviderService, ManualPaymentProviderService>();
        services.AddScoped<IDeliveryNoteAiParser, OpenAiDeliveryNoteParser>();
        services.AddScoped<SmtpEmailSender>();
        services.AddScoped<ConfiguredEmailSender>();
        services.AddScoped<IEmailSender>(provider => provider.GetRequiredService<ConfiguredEmailSender>());
        services.AddScoped<ISmsSender, NoopSmsSender>();

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
