namespace ScratchCard.Application.Common.Exceptions;

public class AppException : Exception
{
    public AppException(string code, string message, int statusCode = 400) : base(message)
    {
        Code = code;
        StatusCode = statusCode;
    }

    public string Code { get; }
    public int StatusCode { get; }
}
