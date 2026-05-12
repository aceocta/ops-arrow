using System.Net;
using FluentValidation;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Shared.Models;

namespace ScratchCard.Api.Middleware;

public class GlobalExceptionMiddleware
{
    private readonly RequestDelegate _next;
    private readonly ILogger<GlobalExceptionMiddleware> _logger;

    public GlobalExceptionMiddleware(RequestDelegate next, ILogger<GlobalExceptionMiddleware> logger)
    {
        _next = next;
        _logger = logger;
    }

    public async Task Invoke(HttpContext context)
    {
        try
        {
            await _next(context);
        }
        catch (AppException ex)
        {
            await WriteErrorAsync(context, ex.Code, ex.Message, (HttpStatusCode)ex.StatusCode);
        }
        catch (ValidationException ex) 
        {
            var message = ex.Errors.FirstOrDefault()?.ErrorMessage ?? "Validation failed.";
            await WriteErrorAsync(context, "validation_failed", message, HttpStatusCode.BadRequest);
        }
        catch (UnauthorizedAccessException ex)
        {
            await WriteErrorAsync(context, "unauthorized", ex.Message, HttpStatusCode.Unauthorized);
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Unhandled exception occurred.");
            await WriteErrorAsync(context, "server_error", "An unexpected error occurred.", HttpStatusCode.InternalServerError);
        }
    }

    private static async Task WriteErrorAsync(HttpContext context, string code, string message, HttpStatusCode statusCode)
    {
        context.Response.StatusCode = (int)statusCode;
        context.Response.ContentType = "application/json";

        var payload = new ApiErrorResponse
        {
            Code = code,
            Message = message
        };

        await context.Response.WriteAsJsonAsync(payload);
    }
}
