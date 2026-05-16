using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Invitations;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class InvitationService : IInvitationService
{
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
        IUnitOfWork unitOfWork)
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

        var invitationLink = $"https://gaming-lent-startup.ngrok-free.dev/api/invitations/accept?token={token}";
        await _emailSender.SendAsync(
            invitation.Email,
            "Scratch Card Invitation",
            $"You were invited to join a shop. Use this link to accept: {invitationLink}",
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

        var invitationLink = $"https://scratchcard.app/invitations/accept?token={token}";
        await _emailSender.SendAsync(
            invitation.Email,
            "Scratch Card Invitation (Resent)",
            $"Use this new invitation link: {invitationLink}",
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
}
