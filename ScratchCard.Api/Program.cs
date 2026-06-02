using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi;
using ScratchCard.Api.Middleware;
using ScratchCard.Application;
using ScratchCard.Infrastructure;
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
    options.AddPolicy("AllowFrontend", policy =>
    {
        policy
            .WithOrigins(
                "http://localhost:4200",
                "http://localhost:5173",
                "http://localhost:8081",
                "https://gaming-lent-startup.ngrok-free.dev",
                "https://wa-ops-arrow-uat-dvdrbjf9fraydwdd.canadacentral-01.azurewebsites.net",
                "https://opsarrow.co.uk"
            )
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

//if (builder.Configuration.GetValue<bool>("SeedOnStartup"))
//{
{
    var seedStopwatch = System.Diagnostics.Stopwatch.StartNew();
    await app.Services.SeedDatabaseAsync();
    seedStopwatch.Stop();
    app.Logger.LogInformation(
        "Database migrate + seed completed in {ElapsedMs} ms.",
        seedStopwatch.ElapsedMilliseconds);
}
//}

app.UseCors("AllowFrontend");

app.UseAuthentication();

app.UseMiddleware<SubscriptionAccessMiddleware>();

app.UseAuthorization();

app.UseRateLimiter();

app.MapControllers();

app.Run();