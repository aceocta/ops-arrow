using System.Globalization;
using System.Text;
using Microsoft.EntityFrameworkCore;
using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Application.Common.Services;
using ScratchCard.Application.DTOs.StoreSales;
using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Entities;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

public sealed class TillAccountingService : ITillAccountingService
{
    private static readonly string[] ManagementRoles = [RoleNames.CompanyOwner, RoleNames.Manager];

    private readonly IRepository<TillReconciliation> _reconciliations;
    private readonly IShopMembershipService _shopMembership;
    private readonly IFeatureGateService _featureGate;

    public TillAccountingService(
        IRepository<TillReconciliation> reconciliations,
        IShopMembershipService shopMembership,
        IFeatureGateService featureGate)
    {
        _reconciliations = reconciliations;
        _shopMembership = shopMembership;
        _featureGate = featureGate;
    }

    public async Task<AccountingSummaryDto> GetSummaryAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        await _shopMembership.EnsureCurrentUserShopRoleAsync(shopId, ManagementRoles, cancellationToken);
        await _featureGate.EnsureFeatureAsync(shopId, FeatureKeys.StoreSales, cancellationToken);
        var recs = await _reconciliations.Query()
            .Include(r => r.Lines)
            .Where(r => r.ShopId == shopId && r.BusinessDate >= from && r.BusinessDate <= to)
            .ToListAsync(cancellationToken);

        var summary = new AccountingSummaryDto { ShopId = shopId, From = from, To = to };

        // Aggregate verified line amounts per canonical field.
        var byField = recs.SelectMany(r => r.Lines)
            .GroupBy(l => l.CanonicalField)
            .ToDictionary(g => g.Key, g => g.Sum(l => l.VerifiedAmount));

        // VAT buckets accumulate from Sales-ledger lines.
        var vatBuckets = new Dictionary<string, VatRateRowDto>();

        foreach (var (field, amount) in byField)
        {
            var meta = TillCanonicalCatalogue.Meta(field);
            var ledger = TillAccountingCatalogue.LedgerFor(field);
            if (ledger == LedgerCategory.Ignore) continue;

            summary.Lines.Add(new AccountingLineDto
            {
                Field = field,
                FieldName = meta.DisplayName,
                Ledger = ledger,
                VatBucket = TillAccountingCatalogue.VatBucket(meta.Vat),
                Amount = amount,
            });

            switch (ledger)
            {
                case LedgerCategory.Bank:
                    summary.TendersTotal += amount;
                    break;
                case LedgerCategory.Income:
                    summary.CommissionIncome += amount;
                    break;
                case LedgerCategory.Liability:
                    summary.AgencyLiabilities += amount;
                    break;
                case LedgerCategory.Expense:
                    summary.Expenses += amount;
                    break;
                case LedgerCategory.Sales:
                    // Refunds are stored positive but reduce sales.
                    var signed = field == TillCanonicalField.Refund ? -amount : amount;
                    summary.TurnoverExAgency += signed;
                    AccrueVat(vatBuckets, meta.Vat, signed);
                    break;
            }
        }

        summary.CashOverShort = recs.Sum(r => r.CashVariance);
        summary.VatByRate = vatBuckets.Values.OrderBy(v => v.Bucket).ToList();
        summary.Lines = summary.Lines.OrderBy(l => (int)l.Ledger).ThenBy(l => l.FieldName).ToList();
        return summary;
    }

    public async Task<byte[]> ExportCsvAsync(Guid shopId, DateOnly from, DateOnly to, CancellationToken cancellationToken = default)
    {
        var s = await GetSummaryAsync(shopId, from, to, cancellationToken);
        var sb = new StringBuilder();
        string Esc(string v) => v.Contains(',') || v.Contains('"') || v.Contains('\n') ? $"\"{v.Replace("\"", "\"\"")}\"" : v;
        string Money(decimal d) => d.ToString("0.00", CultureInfo.InvariantCulture);

        sb.AppendLine($"Till accounting journal,{s.From:yyyy-MM-dd},{s.To:yyyy-MM-dd}");
        sb.AppendLine();
        sb.AppendLine("Section,Field,Ledger,VAT,Amount");
        foreach (var l in s.Lines)
        {
            sb.AppendLine($"{Esc(l.Ledger.ToString())},{Esc(l.FieldName)},{Esc(l.Ledger.ToString())},{Esc(l.VatBucket)},{Money(l.Amount)}");
        }
        sb.AppendLine();
        sb.AppendLine("VAT analysis,Bucket,Net,VAT,Gross");
        foreach (var v in s.VatByRate)
        {
            sb.AppendLine($",{Esc(v.Bucket)},{Money(v.Net)},{Money(v.Vat)},{Money(v.Gross)}");
        }
        sb.AppendLine();
        sb.AppendLine("Totals,Label,Amount");
        sb.AppendLine($",Turnover (ex-agency),{Money(s.TurnoverExAgency)}");
        sb.AppendLine($",Tenders,{Money(s.TendersTotal)}");
        sb.AppendLine($",Commission income,{Money(s.CommissionIncome)}");
        sb.AppendLine($",Agency liabilities,{Money(s.AgencyLiabilities)}");
        sb.AppendLine($",Expenses,{Money(s.Expenses)}");
        sb.AppendLine($",Cash over/short,{Money(s.CashOverShort)}");

        return Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(sb.ToString())).ToArray();
    }

    private static void AccrueVat(Dictionary<string, VatRateRowDto> buckets, TillVatTreatment vat, decimal gross)
    {
        var bucketName = TillAccountingCatalogue.VatBucket(vat);
        if (!buckets.TryGetValue(bucketName, out var row))
        {
            row = new VatRateRowDto { Bucket = bucketName };
            buckets[bucketName] = row;
        }
        var rate = TillAccountingCatalogue.VatRate(vat);
        decimal vatAmount = rate is > 0 ? Math.Round(gross * rate.Value / (100m + rate.Value), 2) : 0m;
        row.Gross += gross;
        row.Vat += vatAmount;
        row.Net += gross - vatAmount;
    }
}
