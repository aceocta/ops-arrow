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
    public async Task<IActionResult> Create([FromBody] CreateCompanyRequest request, CancellationToken cancellationToken)
    {
        var result = await _companyService.CreateAsync(request, cancellationToken);
        return Success(result);
    }

    [HttpPut("{id:guid}")]
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
}
