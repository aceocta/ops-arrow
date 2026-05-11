using ScratchCard.Application.DTOs.Auth;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Common.Interfaces;

public interface IJwtTokenService
{
    AuthTokenResponseDto CreateToken(User user, IReadOnlyCollection<string> roles);
}
