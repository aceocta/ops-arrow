using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;

namespace ScratchCard.Application.Services;

public class InvoiceService : IInvoiceService
{
    private readonly IRepository<SubscriptionInvoice> _invoiceRepository;
    private readonly IRepository<ShopUser> _shopUserRepository;
    private readonly ICurrentUserService _currentUserService;

    public InvoiceService(
        IRepository<SubscriptionInvoice> invoiceRepository,
        IRepository<ShopUser> shopUserRepository,
        ICurrentUserService currentUserService)
    {
        _invoiceRepository = invoiceRepository;
        _shopUserRepository = shopUserRepository;
        _currentUserService = currentUserService;
    }

    public async Task<IReadOnlyCollection<SubscriptionInvoiceDto>> ListAsync(Guid companyId, CancellationToken cancellationToken = default)
    {
        await EnsureCompanyAccessAsync(companyId, cancellationToken);

        var invoices = await _invoiceRepository.Query()
            .AsNoTracking()
            .Where(x => x.CompanyId == companyId)
            .Include(x => x.Lines)
            .OrderByDescending(x => x.CreatedOn)
            .ToListAsync(cancellationToken);

        return invoices.Select(x => x.ToDto()).ToArray();
    }

    public async Task<SubscriptionInvoiceDto> GetAsync(Guid invoiceId, CancellationToken cancellationToken = default)
    {
        var invoice = await _invoiceRepository.Query()
            .AsNoTracking()
            .Include(x => x.Lines)
            .FirstOrDefaultAsync(x => x.Id == invoiceId, cancellationToken)
            ?? throw new AppException("invoice_not_found", "Invoice not found.", 404);

        await EnsureCompanyAccessAsync(invoice.CompanyId, cancellationToken);
        return invoice.ToDto();
    }

    private async Task EnsureCompanyAccessAsync(Guid companyId, CancellationToken cancellationToken)
    {
        if (_currentUserService.IsInRole(RoleNames.PlatformAdmin))
        {
            return;
        }

        if (!_currentUserService.UserId.HasValue)
        {
            throw new AppException("unauthorized", "User context is missing.", 401);
        }

        var hasAccess = await _shopUserRepository.Query()
            .AsNoTracking()
            .AnyAsync(
                x => x.UserId == _currentUserService.UserId.Value &&
                     x.IsActive &&
                     x.Shop.CompanyId == companyId,
                cancellationToken);

        if (!hasAccess)
        {
            throw new AppException(ErrorCodes.UnauthorizedRole, "You do not have access to this company.", 403);
        }
    }
}
