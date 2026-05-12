using Microsoft.AspNetCore.Mvc;
using ScratchCard.Shared.Models;

namespace ScratchCard.Api.Controllers;

[ApiController]
public abstract class BaseApiController : ControllerBase
{
    protected IActionResult Success<T>(T data, string? message = null)
        => Ok(ApiResponse<T>.Ok(data, message));

    protected IActionResult CreatedSuccess<T>(string actionName, object? routeValues, T data)
        => CreatedAtAction(actionName, routeValues, ApiResponse<T>.Ok(data));
}
