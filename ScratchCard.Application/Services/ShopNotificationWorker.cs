using System.Net;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

/// <summary>
/// Resolves recipients (PlatformAdmins + the shop's CompanyOwner) and sends shop/subscription
/// notification emails. Runs on a background worker, off the request thread — see
/// ShopNotificationBackgroundService. A failure to send to one recipient is logged and skipped;
/// it never propagates back to the originating business operation.
/// </summary>
public class ShopNotificationWorker : IShopNotificationWorker
{
    private readonly IRepository<Shop> _shopRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IRepository<UserRole> _userRoleRepository;
    private readonly IEmailSender _emailSender;
    private readonly ILogger<ShopNotificationWorker> _logger;

    public ShopNotificationWorker(
        IRepository<Shop> shopRepository,
        IRepository<ShopUser> shopUserRepository,
        IRepository<UserRole> userRoleRepository,
        IEmailSender emailSender,
        ILogger<ShopNotificationWorker> logger)
    {
        _shopRepository = shopRepository;
        _shopUserRepository = shopUserRepository;
        _userRoleRepository = userRoleRepository;
        _emailSender = emailSender;
        _logger = logger;
    }

    public async Task ProcessAsync(ShopNotificationJob job, CancellationToken cancellationToken = default)
    {
        var shop = await _shopRepository.Query()
            .AsNoTracking()
            .Include(x => x.Company)
            .FirstOrDefaultAsync(x => x.Id == job.ShopId, cancellationToken);

        if (shop is null)
        {
            _logger.LogWarning("Shop notification skipped: shop {ShopId} not found.", job.ShopId);
            return;
        }

        var companyName = shop.Company?.CompanyName ?? "your company";
        var recipients = await ResolveRecipientsAsync(shop, cancellationToken);
        if (recipients.Count == 0)
        {
            _logger.LogWarning("Shop notification for {ShopId} had no resolvable recipients.", job.ShopId);
            return;
        }

        var (subject, heading, intro) = job.Kind switch
        {
            ShopNotificationKind.ShopCreated => (
                $"New shop created: {shop.ShopName}",
                "A new shop was created",
                $"A new shop has been added to {companyName}."),
            _ => (
                $"Subscription update: {shop.ShopName}",
                "Shop subscription updated",
                $"The subscription for a shop in {companyName} has changed."),
        };

        var body = BuildHtml(heading, intro, companyName, shop.ShopName, job.Summary);

        foreach (var recipient in recipients)
        {
            try
            {
                await _emailSender.SendAsync(
                    new EmailMessage { Recipient = recipient, Subject = subject, Body = body, IsBodyHtml = true },
                    cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Failed to send shop notification to {Recipient} for shop {ShopId}.", recipient, job.ShopId);
            }
        }
    }

    private async Task<IReadOnlyList<string>> ResolveRecipientsAsync(Shop shop, CancellationToken cancellationToken)
    {
        var emails = new List<string?>();

        // Company owner(s) for this shop.
        emails.AddRange(await _shopUserRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shop.Id && x.IsActive && x.Role.Name == RoleNames.CompanyOwner)
            .Select(x => x.User.Email)
            .ToListAsync(cancellationToken));

        // Company contact email as a fallback owner address.
        if (shop.Company is not null)
        {
            emails.Add(shop.Company.Email);
        }

        // All platform administrators (global role).
        emails.AddRange(await _userRoleRepository.Query()
            .AsNoTracking()
            .Where(x => x.IsActive && x.Role.Name == RoleNames.PlatformAdmin)
            .Select(x => x.User.Email)
            .ToListAsync(cancellationToken));

        return emails
            .Where(e => !string.IsNullOrWhiteSpace(e) && e!.Contains('@'))
            .Select(e => e!.Trim())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToArray();
    }

    private static string BuildHtml(string heading, string intro, string companyName, string shopName, string summary)
    {
        var safeHeading = WebUtility.HtmlEncode(heading);
        var safeIntro = WebUtility.HtmlEncode(intro);
        var safeCompany = WebUtility.HtmlEncode(companyName);
        var safeShop = WebUtility.HtmlEncode(shopName);
        var safeSummary = WebUtility.HtmlEncode(summary);

        return """
            <!doctype html>
            <html lang="en"><head><meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" /></head>
            <body style="margin:0;padding:0;background:#f2f6fb;font-family:Arial,'Segoe UI',sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6fb;padding:28px 12px;">
                <tr><td align="center">
                  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid #d9e1ec;border-radius:14px;overflow:hidden;">
                    <tr><td style="background:#0f3d3e;padding:22px 24px;color:#ffffff;">
                      <div style="font-size:12px;letter-spacing:0.8px;text-transform:uppercase;opacity:0.85;">Ops Arrow</div>
                      <div style="font-size:22px;line-height:28px;font-weight:700;margin-top:6px;">__HEADING__</div>
                    </td></tr>
                    <tr><td style="padding:22px 24px;">
                      <p style="margin:0 0 16px;color:#4a5f6b;font-size:15px;line-height:22px;">__INTRO__</p>
                      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-collapse:collapse;">
                        <tr><td style="padding:8px 0;color:#617785;font-size:13px;width:120px;">Company</td><td style="padding:8px 0;color:#0f3d3e;font-size:14px;font-weight:600;">__COMPANY__</td></tr>
                        <tr><td style="padding:8px 0;color:#617785;font-size:13px;">Shop</td><td style="padding:8px 0;color:#0f3d3e;font-size:14px;font-weight:600;">__SHOP__</td></tr>
                        <tr><td style="padding:8px 0;color:#617785;font-size:13px;vertical-align:top;">Details</td><td style="padding:8px 0;color:#2b3f4a;font-size:14px;">__SUMMARY__</td></tr>
                      </table>
                    </td></tr>
                  </table>
                </td></tr>
              </table>
            </body></html>
            """
            .Replace("__HEADING__", safeHeading, StringComparison.Ordinal)
            .Replace("__INTRO__", safeIntro, StringComparison.Ordinal)
            .Replace("__COMPANY__", safeCompany, StringComparison.Ordinal)
            .Replace("__SHOP__", safeShop, StringComparison.Ordinal)
            .Replace("__SUMMARY__", safeSummary, StringComparison.Ordinal);
    }
}
