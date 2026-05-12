namespace ScratchCard.Application.Common.Interfaces;

public interface ISmsSender
{
    Task SendAsync(string recipient, string message, CancellationToken cancellationToken = default);
}
