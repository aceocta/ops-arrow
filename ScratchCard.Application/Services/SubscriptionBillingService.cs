using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Exceptions;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.Subscriptions;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public class SubscriptionBillingService : ISubscriptionBillingService
{
    private readonly IRepository<CompanySubscription> _companySubscriptionRepository;
    private readonly IRepository<SubscriptionInvoice> _invoiceRepository;
    private readonly IRepository<SubscriptionInvoiceLine> _invoiceLineRepository;
    private readonly ICurrentUserService _currentUserService;
    private readonly IUnitOfWork _unitOfWork;

    public SubscriptionBillingService(
        IRepository<CompanySubscription> companySubscriptionRepository,
        IRepository<SubscriptionInvoice> invoiceRepository,
        IRepository<SubscriptionInvoiceLine> invoiceLineRepository,
        ICurrentUserService currentUserService,
        IUnitOfWork unitOfWork)
    {
        _companySubscriptionRepository = companySubscriptionRepository;
        _invoiceRepository = invoiceRepository;
        _invoiceLineRepository = invoiceLineRepository;
        _currentUserService = currentUserService;
        _unitOfWork = unitOfWork;
    }

    public async Task<SubscriptionInvoiceDto> CreateInvoiceAsync(Guid companySubscriptionId, CancellationToken cancellationToken = default)
    {
        var subscription = await _companySubscriptionRepository.Query()
            .Include(x => x.SubscriptionPlan)
            .FirstOrDefaultAsync(x => x.Id == companySubscriptionId, cancellationToken)
            ?? throw new AppException("company_subscription_not_found", "Company subscription not found.", 404);

        var now = DateTimeOffset.UtcNow;
        var invoice = new SubscriptionInvoice
        {
            CompanyId = subscription.CompanyId,
            CompanySubscriptionId = subscription.Id,
            InvoiceNumber = $"INV-{now:yyyyMMdd}-{Guid.NewGuid():N}"[..26].ToUpperInvariant(),
            BillingCycle = subscription.BillingCycle,
            ActiveShopCount = subscription.ActiveShopCount,
            PricePerShop = subscription.PricePerShop,
            SubTotalAmount = subscription.SubTotalAmount,
            DiscountAmount = subscription.DiscountAmount,
            TaxAmount = 0,
            TotalAmount = subscription.TotalAmount,
            Status = subscription.TotalAmount <= 0 ? InvoiceStatus.Paid : InvoiceStatus.Pending,
            DueDate = now.AddDays(7),
            PaidOn = subscription.TotalAmount <= 0 ? now : null,
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        };

        await _invoiceRepository.AddAsync(invoice, cancellationToken);

        var line = new SubscriptionInvoiceLine
        {
            SubscriptionInvoice = invoice,
            Description = $"{subscription.SubscriptionPlan.Name} ({subscription.ActiveShopCount} active shop(s))",
            Quantity = Math.Max(subscription.ActiveShopCount, 1),
            UnitPrice = subscription.PricePerShop,
            DiscountAmount = subscription.DiscountAmount,
            LineTotal = subscription.TotalAmount,
            CreatedOn = now,
            CreatedBy = _currentUserService.UserId
        };

        await _invoiceLineRepository.AddAsync(line, cancellationToken);
        await _unitOfWork.SaveChangesAsync(cancellationToken);

        var persisted = await _invoiceRepository.Query()
            .AsNoTracking()
            .Include(x => x.Lines)
            .FirstAsync(x => x.Id == invoice.Id, cancellationToken);

        return persisted.ToDto();
    }
}
