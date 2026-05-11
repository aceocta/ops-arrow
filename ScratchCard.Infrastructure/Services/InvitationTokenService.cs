using System.Security.Cryptography;
using System.Text;
using ScratchCard.Application.Common.Interfaces;

namespace ScratchCard.Infrastructure.Services;

public class InvitationTokenService : IInvitationTokenService
{
    public (string Token, string TokenHash) GenerateInvitationToken()
    {
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(48))
            .Replace('+', '-')
            .Replace('/', '_')
            .TrimEnd('=');

        return (token, ComputeHash(token));
    }

    public string ComputeHash(string token)
    {
        using var sha = SHA256.Create();
        var bytes = sha.ComputeHash(Encoding.UTF8.GetBytes(token));
        return Convert.ToHexString(bytes);
    }
}
