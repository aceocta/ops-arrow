using Microsoft.AspNetCore.Identity;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Infrastructure.Services;

public class PasswordHashService : IPasswordHashService
{
    private readonly IPasswordHasher<User> _hasher;

    public PasswordHashService(IPasswordHasher<User> hasher)
    {
        _hasher = hasher;
    }

    public string HashPassword(string password) =>
        _hasher.HashPassword(null!, password);

    public bool VerifyPassword(string hashedPassword, string providedPassword)
    {
        var result = _hasher.VerifyHashedPassword(null!, hashedPassword, providedPassword);
        return result != PasswordVerificationResult.Failed;
    }
}
