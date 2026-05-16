using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using System.Net;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Models;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Invitations;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class InvitationService : IInvitationService
{
    private const string DefaultInvitationAcceptBaseUrl = "https://wa-ops-arrow-uat-dvdrbjf9fraydwdd.canadacentral-01.azurewebsites.net";
    private readonly IRepository<UserInvitation> _invitationRepository;
    private readonly IRepository<Role> _roleRepository;
    private readonly IRepository<User> _userRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly IPasswordHashService _passwordHashService;
    private readonly IInvitationTokenService _tokenService;
    private readonly IEmailSender _emailSender;
    private readonly IAuditService _auditService;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;
    private readonly string _invitationAcceptBaseUrl;

    public InvitationService(
        IRepository<UserInvitation> invitationRepository,
        IRepository<Role> roleRepository,
        IRepository<User> userRepository,
        IRepository<ShopUser> shopUserRepository,
        IPasswordHashService passwordHashService,
        IInvitationTokenService tokenService,
        IEmailSender emailSender,
        IAuditService auditService,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork,
        IConfiguration configuration)
    {
        _invitationRepository = invitationRepository;
        _roleRepository = roleRepository;
        _userRepository = userRepository;
        _shopUserRepository = shopUserRepository;
        _passwordHashService = passwordHashService;
        _tokenService = tokenService;
        _emailSender = emailSender;
        _auditService = auditService;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
        _invitationAcceptBaseUrl =
            configuration["Invitation:InvitationAcceptBaseUrl"]?.Trim()
            ?? configuration["InvitationAcceptBaseUrl"]?.Trim()
            ?? DefaultInvitationAcceptBaseUrl;
    }

    public async Task<InvitationDto> SendInvitationAsync(CreateInvitationRequest request, CancellationToken cancellationToken = default)
    {
        var inviterId = _currentUserService.UserId ?? throw new AppException("unauthorized", "User context missing.", 401);
        var canSendInvitation =
            _currentUserService.IsInRole(RoleNames.PlatformAdmin) ||
            _currentUserService.IsInRole(RoleNames.ShopOwner) ||
            _currentUserService.IsInRole(RoleNames.Manager);
        if (!canSendInvitation)
        {
            throw new AppException("forbidden", "Only PlatformAdmin, ShopOwner, or Manager can send invitations.", 403);
        }

        var role = await _roleRepository.Query()
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == request.RoleId && x.IsActive, cancellationToken)
            ?? throw new AppException("role_not_found", "Role not found.", 404);

        var (token, tokenHash) = _tokenService.GenerateInvitationToken();
        var invitation = new UserInvitation
        {
            ShopId = request.ShopId,
            Email = request.Email.Trim().ToLowerInvariant(),
            RoleId = request.RoleId,
            InvitationTokenHash = tokenHash,
            Status = InvitationStatus.Pending,
            ExpiresOn = DateTimeOffset.UtcNow.AddHours(request.ExpiryHours),
            InvitedByUserId = inviterId,
            CreatedBy = inviterId,
            CreatedOn = DateTimeOffset.UtcNow
        };

        await _invitationRepository.AddAsync(invitation, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var invitationLink = BuildInvitationAcceptLink(token);
        await _emailSender.SendAsync(
            BuildInvitationEmailMessage(
                recipient: invitation.Email,
                subject: "Ops Arrow Invitation",
                heading: "You are invited to Ops Arrow",
                intro: "You have been invited to join a shop on Ops Arrow.",
                buttonLabel: "Accept Invitation",
                invitationLink: invitationLink,
                expiryHours: request.ExpiryHours),
            cancellationToken);

        await _auditService.LogAsync(
            nameof(UserInvitation),
            invitation.Id,
            "InvitationCreated",
            request.ShopId,
            newValue: $"{invitation.Email}:{role.Name}",
            cancellationToken: cancellationToken);

        return invitation.ToDto(role.Name);
    }

    public async Task<ValidateInvitationResponse> ValidateInvitationAsync(string token, CancellationToken cancellationToken = default)
    {
        var hash = _tokenService.ComputeHash(token);

        var invitation = await _invitationRepository.Query()
            .Include(x => x.Role)
            .FirstOrDefaultAsync(x => x.InvitationTokenHash == hash, cancellationToken)
            ?? throw new AppException("invitation_not_found", "Invitation token is invalid.", 404);

        if (invitation.Status is InvitationStatus.Accepted or InvitationStatus.Cancelled)
        {
            throw new AppException(ErrorCodes.InvitationAlreadyUsed, "Invitation is no longer available.");
        }

        if (invitation.ExpiresOn <= DateTimeOffset.UtcNow)
        {
            invitation.Status = InvitationStatus.Expired;
            _invitationRepository.Update(invitation);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            throw new AppException(ErrorCodes.InvitationExpired, "Invitation has expired.");
        }

        return new ValidateInvitationResponse
        {
            IsValid = true,
            Email = invitation.Email,
            ShopId = invitation.ShopId,
            RoleName = invitation.Role.Name,
            ExpiresOn = invitation.ExpiresOn
        };
    }

    public async Task<InvitationDto> AcceptInvitationAsync(AcceptInvitationRequest request, CancellationToken cancellationToken = default)
    {
        var hash = _tokenService.ComputeHash(request.Token);
        var invitation = await _invitationRepository.Query()
            .Include(x => x.Role)
            .FirstOrDefaultAsync(x => x.InvitationTokenHash == hash, cancellationToken)
            ?? throw new AppException("invitation_not_found", "Invitation token is invalid.", 404);

        if (invitation.Status != InvitationStatus.Pending)
        {
            throw new AppException(ErrorCodes.InvitationAlreadyUsed, "Invitation has already been used.");
        }

        if (invitation.ExpiresOn <= DateTimeOffset.UtcNow)
        {
            invitation.Status = InvitationStatus.Expired;
            _invitationRepository.Update(invitation);
            await _unitOfWork.SaveChangesAsync(cancellationToken);
            throw new AppException(ErrorCodes.InvitationExpired, "Invitation has expired.");
        }

        if (string.IsNullOrWhiteSpace(request.FirstName))
        {
            throw new AppException("validation_failed", "First name is required.", 400);
        }

        if (string.IsNullOrWhiteSpace(request.LastName))
        {
            throw new AppException("validation_failed", "Last name is required.", 400);
        }

        if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 8)
        {
            throw new AppException("validation_failed", "Password must be at least 8 characters.", 400);
        }

        var now = DateTimeOffset.UtcNow;
        var passwordHash = _passwordHashService.HashPassword(request.Password);

        var user = await _userRepository.Query()
            .FirstOrDefaultAsync(x => x.Email == invitation.Email, cancellationToken);

        if (user is null)
        {
            user = new User
            {
                Email = invitation.Email,
                FirstName = request.FirstName.Trim(),
                LastName = request.LastName.Trim(),
                ExternalProvider = "DirectSignup",
                ExternalProviderUserId = $"direct-{Guid.NewGuid():N}",
                PasswordHash = passwordHash,
                IsActive = true,
                LastLoginOn = now,
                CreatedOn = now
            };

            await _userRepository.AddAsync(user, cancellationToken);
        }
        else
        {
            user.FirstName = request.FirstName.Trim();
            user.LastName = request.LastName.Trim();
            user.PasswordHash = passwordHash;
            user.LastLoginOn = now;
            _userRepository.Update(user);
        }

        var shopUserExists = await _shopUserRepository.Query()
            .AnyAsync(x => x.ShopId == invitation.ShopId && x.UserId == user.Id, cancellationToken);

        if (!shopUserExists)
        {
            await _shopUserRepository.AddAsync(new ShopUser
            {
                ShopId = invitation.ShopId,
                UserId = user.Id,
                RoleId = invitation.RoleId,
                IsActive = true,
                JoinedOn = DateTimeOffset.UtcNow,
                InvitedByUserId = invitation.InvitedByUserId,
                CreatedOn = DateTimeOffset.UtcNow,
                CreatedBy = invitation.InvitedByUserId
            }, cancellationToken);
        }

        invitation.Status = InvitationStatus.Accepted;
        invitation.AcceptedOn = DateTimeOffset.UtcNow;
        invitation.AcceptedByUserId = user.Id;

        _invitationRepository.Update(invitation);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(UserInvitation),
            invitation.Id,
            "InvitationAccepted",
            invitation.ShopId,
            newValue: invitation.Email,
            cancellationToken: cancellationToken);

        return invitation.ToDto(invitation.Role.Name);
    }

    public async Task<InvitationDto> ResendInvitationAsync(Guid invitationId, CancellationToken cancellationToken = default)
    {
        var invitation = await _invitationRepository.Query()
            .Include(x => x.Role)
            .FirstOrDefaultAsync(x => x.Id == invitationId, cancellationToken)
            ?? throw new AppException("invitation_not_found", "Invitation was not found.", 404);

        if (invitation.Status != InvitationStatus.Pending)
        {
            throw new AppException(ErrorCodes.InvitationAlreadyUsed, "Only pending invitations can be resent.");
        }

        var (token, hash) = _tokenService.GenerateInvitationToken();
        invitation.InvitationTokenHash = hash;
        invitation.ExpiresOn = DateTimeOffset.UtcNow.AddHours(72);
        invitation.ModifiedOn = DateTimeOffset.UtcNow;
        invitation.ModifiedBy = _currentUserService.UserId;

        _invitationRepository.Update(invitation);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var invitationLink = BuildInvitationAcceptLink(token);
        await _emailSender.SendAsync(
            BuildInvitationEmailMessage(
                recipient: invitation.Email,
                subject: "Ops Arrow Invitation (Resent)",
                heading: "Your invitation was resent",
                intro: "Use the button below to complete your account setup in Ops Arrow.",
                buttonLabel: "Accept Invitation",
                invitationLink: invitationLink,
                expiryHours: 72),
            cancellationToken);

        await _auditService.LogAsync(
            nameof(UserInvitation),
            invitation.Id,
            "InvitationResent",
            invitation.ShopId,
            cancellationToken: cancellationToken);

        return invitation.ToDto(invitation.Role.Name);
    }

    public async Task CancelInvitationAsync(Guid invitationId, CancellationToken cancellationToken = default)
    {
        var invitation = await _invitationRepository.GetByIdAsync(invitationId, cancellationToken)
            ?? throw new AppException("invitation_not_found", "Invitation was not found.", 404);

        if (invitation.Status != InvitationStatus.Pending)
        {
            throw new AppException(ErrorCodes.InvitationAlreadyUsed, "Only pending invitations can be cancelled.");
        }

        invitation.Status = InvitationStatus.Cancelled;
        invitation.CancelledOn = DateTimeOffset.UtcNow;
        invitation.CancelledByUserId = _currentUserService.UserId;
        invitation.ModifiedOn = DateTimeOffset.UtcNow;
        invitation.ModifiedBy = _currentUserService.UserId;

        _invitationRepository.Update(invitation);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        await _auditService.LogAsync(
            nameof(UserInvitation),
            invitation.Id,
            "InvitationCancelled",
            invitation.ShopId,
            cancellationToken: cancellationToken);
    }

    public async Task<IReadOnlyCollection<InvitationDto>> ListInvitationsAsync(Guid shopId, CancellationToken cancellationToken = default)
    {
        var invitations = await _invitationRepository.Query()
            .AsNoTracking()
            .Where(x => x.ShopId == shopId)
            .Include(x => x.Role)
            .OrderByDescending(x => x.CreatedOn)
            .ToListAsync(cancellationToken);

        return invitations.Select(x => x.ToDto(x.Role.Name)).ToArray();
    }

    private string BuildInvitationAcceptLink(string token)
    {
        var escapedToken = Uri.EscapeDataString(token);
        return $"{_invitationAcceptBaseUrl.TrimEnd('/')}/api/invitations/accept?token={escapedToken}";
    }

    private static EmailMessage BuildInvitationEmailMessage(
        string recipient,
        string subject,
        string heading,
        string intro,
        string buttonLabel,
        string invitationLink,
        int expiryHours)
    {
        var safeHeading = WebUtility.HtmlEncode(heading);
        var safeIntro = WebUtility.HtmlEncode(intro);
        var safeButtonLabel = WebUtility.HtmlEncode(buttonLabel);
        var safeLink = WebUtility.HtmlEncode(invitationLink);
        var safeRecipient = WebUtility.HtmlEncode(recipient);
        var safeExpiry = WebUtility.HtmlEncode(expiryHours.ToString());

        var html = """
            <!doctype html>
            <html lang="en">
            <head>
              <meta charset="utf-8" />
              <meta name="viewport" content="width=device-width, initial-scale=1" />
              <title>Ops Arrow Invitation</title>
            </head>
            <body style="margin:0;padding:0;background:#f2f6fb;font-family:Arial,'Segoe UI',sans-serif;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f6fb;padding:28px 12px;">
                <tr>
                  <td align="center">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;background:#ffffff;border:1px solid #d9e1ec;border-radius:14px;overflow:hidden;">
                      <tr>
                        <td style="background:linear-gradient(135deg,#0f3d3e,#1f6f7a);padding:26px 24px;color:#ffffff;">
                          <div style="font-size:12px;letter-spacing:0.8px;text-transform:uppercase;opacity:0.9;">Ops Arrow</div>
                          <div style="font-size:24px;line-height:30px;font-weight:700;margin-top:8px;">__HEADING__</div>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:24px;">
                          <p style="margin:0 0 12px;color:#2b3f4a;font-size:15px;line-height:22px;">Hello <strong>__RECIPIENT__</strong>,</p>
                          <p style="margin:0 0 18px;color:#4a5f6b;font-size:15px;line-height:22px;">__INTRO__</p>
                          <p style="margin:0 0 20px;color:#4a5f6b;font-size:14px;line-height:21px;">This link expires in <strong>__EXPIRY_HOURS__ hours</strong>.</p>
                          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 18px;">
                            <tr>
                              <td align="center" bgcolor="#0f3d3e" style="border-radius:10px;">
                                <a href="__INVITATION_LINK__" style="display:inline-block;padding:12px 22px;color:#ffffff;text-decoration:none;font-weight:700;font-size:15px;">__BUTTON_LABEL__</a>
                              </td>
                            </tr>
                          </table>
                          <p style="margin:0 0 8px;color:#617785;font-size:13px;line-height:20px;">If the button does not work, copy and paste this link into your browser:</p>
                          <p style="margin:0;word-break:break-all;color:#0f3d3e;font-size:13px;line-height:20px;">__INVITATION_LINK__</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </body>
            </html>
            """
            .Replace("__HEADING__", safeHeading, StringComparison.Ordinal)
            .Replace("__RECIPIENT__", safeRecipient, StringComparison.Ordinal)
            .Replace("__INTRO__", safeIntro, StringComparison.Ordinal)
            .Replace("__EXPIRY_HOURS__", safeExpiry, StringComparison.Ordinal)
            .Replace("__BUTTON_LABEL__", safeButtonLabel, StringComparison.Ordinal)
            .Replace("__INVITATION_LINK__", safeLink, StringComparison.Ordinal);

        return new EmailMessage
        {
            Recipient = recipient,
            Subject = subject,
            Body = html,
            IsBodyHtml = true
        };
    }
}
