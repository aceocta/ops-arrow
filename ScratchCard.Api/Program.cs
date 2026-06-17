using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using ScratchCard.Api.Middleware;
using ScratchCard.Application;
using ScratchCard.Infrastructure;
using ScratchCard.Infrastructure.Persistence;
using System.Security.Claims;
using System.Text.Json.Serialization;
using System.Text;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new JsonStringEnumConverter());
    });

builder.Services.AddEndpointsApiExplorer();

builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "ScratchCard Management API",
        Version = "v1"
    });
});

builder.Services.AddCors(options =>
{
    // Default origins baked in; extra ones can be added per-environment via the
    // "Cors:AllowedOrigins" config array (e.g. env var Cors__AllowedOrigins__0=https://...)
    // so a new front-end host doesn't require a code change.
    var defaultOrigins = new[]
    {
        "http://localhost:4200",
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:8081",
        "https://gaming-lent-startup.ngrok-free.dev",
        "https://wa-ops-arrow-uat-dvdrbjf9fraydwdd.canadacentral-01.azurewebsites.net",
        "https://opsarrow.co.uk",
        "https://www.opsarrow.co.uk",
        "https://app.opsarrow.co.uk",
        "https://opsarrow.com",
        "https://app.opsarrow.com",
        "http://ops-arrow-env.eba-xacrpuqg.eu-west-2.elasticbeanstalk.com",
        "https://ops-arrow-env.eba-xacrpuqg.eu-west-2.elasticbeanstalk.com",
        "https://app.opsarrow.co.uk",
        "https://admin.opsarrow.co.uk"

    };
    var configuredOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? Array.Empty<string>();
    var allowedOrigins = defaultOrigins.Concat(configuredOrigins)
        .Where(o => !string.IsNullOrWhiteSpace(o))
        .Select(o => o.TrimEnd('/'))
        .Distinct(StringComparer.OrdinalIgnoreCase)
        .ToArray();

    options.AddPolicy("AllowFrontend", policy =>
    {
        policy
            .WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        var issuer = builder.Configuration["Jwt:Issuer"] ?? "ScratchCard.Api";
        var audience = builder.Configuration["Jwt:Audience"] ?? "ScratchCard.Mobile";
        var secret = builder.Configuration["Jwt:Secret"] ?? string.Empty;

        if (string.IsNullOrWhiteSpace(secret) || secret.Length < 32)
        {
            throw new InvalidOperationException("Jwt:Secret must be configured with at least 32 characters.");
        }

        // Reject known-weak / previously-committed placeholder signing keys. The signing key must be a
        // dedicated high-entropy secret supplied per environment (e.g. the Jwt__Secret env var / Key
        // Vault) — never a reused OAuth client secret or a value that has lived in source control.
        var weakSecrets = new[] { "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" };
        if (weakSecrets.Contains(secret) || secret.StartsWith("GOCSPX-", StringComparison.Ordinal))
        {
            throw new InvalidOperationException(
                "Jwt:Secret is set to a known-weak / reused value. Configure a dedicated random signing key via Jwt__Secret (env var or Key Vault).");
        }

        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secret));

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = issuer,
            ValidAudience = audience,
            IssuerSigningKey = key,
            ClockSkew = TimeSpan.FromMinutes(2),
            NameClaimType = ClaimTypes.Name,
            RoleClaimType = ClaimTypes.Role
        };

        // Token-version revocation: every access token carries the user's security stamp ("sst").
        // A signature-valid, unexpired token is still rejected here when the stamp no longer
        // matches (user deactivated, shop role changed, password reset, account deleted) or when
        // the claim is missing (tokens minted before this feature shipped — those callers get a
        // 401 once and silently re-auth via the anonymous /api/auth/refresh-token endpoint).
        // Stamp lookups are cached in IMemoryCache (~90s TTL) inside ISecurityStampService.
        options.Events = new JwtBearerEvents
        {
            OnTokenValidated = async context =>
            {
                var principal = context.Principal;
                var userIdValue = principal?.FindFirst(ClaimTypes.NameIdentifier)?.Value
                    ?? principal?.FindFirst("sub")?.Value;
                var stampValue = principal?.FindFirst("sst")?.Value;

                if (!Guid.TryParse(userIdValue, out var userId) || !Guid.TryParse(stampValue, out var stamp))
                {
                    context.Fail("Token is missing required security claims.");
                    return;
                }

                var stampService = context.HttpContext.RequestServices
                    .GetRequiredService<ScratchCard.Application.Common.Interfaces.ISecurityStampService>();
                var isValid = await stampService.ValidateAsync(userId, stamp, context.HttpContext.RequestAborted);
                if (!isValid)
                {
                    context.Fail("Token has been revoked.");
                }
            }
        };
    });

builder.Services.AddAuthorization();
builder.Services.AddMemoryCache();

// Per-shop rate-limit policies. The "till-parse" policy throttles the expensive OCR + AI path
// (10/min/shop, burst of 3). Other endpoints stay unlimited. Partition by shopId from the form
// field, falling back to the caller IP for unauthenticated callers.
builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy("till-parse", httpContext =>
    {
        var shopId = httpContext.Request.HasFormContentType
            ? httpContext.Request.Form["shopId"].ToString()
            : null;
        var key = !string.IsNullOrWhiteSpace(shopId)
            ? $"shop:{shopId}"
            : $"ip:{httpContext.Connection.RemoteIpAddress}";
        return System.Threading.RateLimiting.RateLimitPartition.GetTokenBucketLimiter(
            key,
            _ => new System.Threading.RateLimiting.TokenBucketRateLimiterOptions
            {
                TokenLimit = 10,
                TokensPerPeriod = 10,
                ReplenishmentPeriod = TimeSpan.FromMinutes(1),
                QueueLimit = 3,
                QueueProcessingOrder = System.Threading.RateLimiting.QueueProcessingOrder.OldestFirst,
                AutoReplenishment = true
            });
    });
});

builder.Services.AddApplication();
builder.Services.AddInfrastructure(builder.Configuration);

var app = builder.Build();

app.UseMiddleware<GlobalExceptionMiddleware>();
app.UseMiddleware<LoggingScopeMiddleware>();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

// Migrate + seed on startup. Wrapped so a transient DB/connectivity problem logs loudly but does
// NOT crash the process — otherwise the app never starts and nginx returns 502 with no diagnostics.
// Set "FailFastOnSeedError=true" to keep the old crash-on-failure behaviour.
{
    var seedStopwatch = System.Diagnostics.Stopwatch.StartNew();
    try
    {
        await app.Services.SeedDatabaseAsync();
        seedStopwatch.Stop();
        app.Logger.LogInformation(
            "Database migrate + seed completed in {ElapsedMs} ms.",
            seedStopwatch.ElapsedMilliseconds);
    }
    catch (Exception ex)
    {
        seedStopwatch.Stop();
        app.Logger.LogError(ex, "Database migrate + seed FAILED after {ElapsedMs} ms. The API will start anyway; check the connection string and database reachability.", seedStopwatch.ElapsedMilliseconds);
        if (builder.Configuration.GetValue<bool>("FailFastOnSeedError"))
        {
            throw;
        }
    }
}

// Liveness probe — no DB, no auth. Use this to tell "app is up" from "DB is down".
app.MapGet("/api/health", () => Results.Ok(new { status = "ok", utc = DateTimeOffset.UtcNow }));

app.UseCors("AllowFrontend");

app.UseAuthentication();

app.UseMiddleware<SubscriptionAccessMiddleware>();

app.UseAuthorization();

app.UseRateLimiter();

app.MapControllers();

app.Run();