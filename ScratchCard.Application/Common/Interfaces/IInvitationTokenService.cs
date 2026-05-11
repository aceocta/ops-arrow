namespace ScratchCard.Application.Common.Interfaces;

public interface IInvitationTokenService
{
    (string Token, string TokenHash) GenerateInvitationToken();
    string ComputeHash(string token);
}
