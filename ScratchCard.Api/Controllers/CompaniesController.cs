using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Companies;
using ScratchCard.Domain.Constants;

namespace ScratchCard.Api.Controllers;

[Route("api/companies")]
[Authorize]
public class CompaniesController : BaseApiController
{
    private readonly ICompanyService _companyService;
    private readonly ICompanySignupService _companySignupService;

    public CompaniesController(ICompanyService companyService, ICompanySignupService companySignupService)
    {
        _companyService = companyService;
        _companySignupService = companySignupService;
    }

    [HttpPost("signup")]
    [AllowAnonymous]
    public async Task<IActionResult> Signup([FromBody] CompanySignupRequest request, CancellationToken cancellationToken)
    {
        var result = await _companySignupService.SignUpAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPost]
    [Authorize(Roles = RoleNames.OwnerAndPlatform)]
    public async Task<IActionResult> Create([FromBody] CreateCompanyRequest request, CancellationToken cancellationToken)
    {
        var result = await _companyService.CreateAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPut("{id:guid}")]
    [Authorize(Roles = RoleNames.OwnerAndPlatform)]
    public async Task<IActionResult> Update(Guid id, [FromBody] UpdateCompanyRequest request, CancellationToken cancellationToken)
    {
        var result = await _companyService.UpdateAsync(id, request, cancellationToken);
        return Success(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        var result = await _companyService.GetAsync(id, cancellationToken);
        return Success(result);
    }

    [HttpGet("mine")]
    public async Task<IActionResult> ListMine(CancellationToken cancellationToken)
    {
        var result = await _companyService.ListMineAsync(cancellationToken);
        return Success(result);
    }

    /// <summary>
    /// Emails the requesting owner their company details plus the web-platform link to set up and manage
    /// their shop. Used from the mobile "Email me the details" button after company creation (shops are
    /// created on the web; the app sends the link by email rather than deep-linking out).
    /// Rate-limited to one email per user+company per 10 minutes (429 when exceeded).
    /// </summary>
    [HttpPost("{id:guid}/email-setup-info")]
    [Authorize(Roles = RoleNames.OwnerAndPlatform)]
    public async Task<IActionResult> EmailSetupInfo(Guid id, CancellationToken cancellationToken)
    {
        await _companyService.SendSetupInfoEmailAsync(id, cancellationToken);
        return Success(true, "Email sent.");
    }
}

