using ScratchCard.Application.Common.Interfaces;
using ScratchCard.Domain.Enums;

namespace ScratchCard.Application.Services;

/// <summary>
/// Adapts the existing <see cref="ITillLineAiClassifier"/> (older Sale/Tender/… taxonomy) to the
/// canonical fields. Mappings are chosen to be <b>cash-correct</b>: where the old taxonomy can't
/// distinguish (e.g. a lottery prize vs a generic payout), it maps to a field with the same cash
/// direction so reconciliation stays right; genuinely ambiguous lines stay Unmapped for the human.
/// </summary>
public sealed class TillCanonicalAiClassifierAdapter : ITillCanonicalAiClassifier
{
    private readonly ITillLineAiClassifier _inner;

    public TillCanonicalAiClassifierAdapter(ITillLineAiClassifier inner) => _inner = inner;

    public async Task<IReadOnlyDictionary<int, TillCanonicalField>> ClassifyAsync(
        IReadOnlyCollection<TillLineDescriptor> items, CancellationToken cancellationToken = default)
    {
        var decisions = await _inner.ClassifyAsync(items, cancellationToken);
        var result = new Dictionary<int, TillCanonicalField>();
        foreach (var (id, decision) in decisions)
        {
            var field = MapDecision(decision);
            if (field != TillCanonicalField.Unmapped)
            {
                result[id] = field;
            }
        }
        return result;
    }

    private static TillCanonicalField MapDecision(TillLineAiDecision d) => d.Category switch
    {
        TillLineAiCategory.Tender => MapTender(d.TenderKind),
        TillLineAiCategory.Sale => MapSale(d.SaleKind),
        TillLineAiCategory.Discount => TillCanonicalField.Discount,
        TillLineAiCategory.Refund => TillCanonicalField.Refund,
        // Both PaidOut and lottery-prize payouts are cash-out → mapping to PaidOut keeps the
        // drawer maths correct even though we lose the lottery attribution.
        TillLineAiCategory.Payout => TillCanonicalField.PaidOut,
        TillLineAiCategory.Summary => TillCanonicalField.SubtotalIgnore,
        // Expense covers shorts/drive-offs/no-sale with different cash impacts → leave for the human.
        _ => TillCanonicalField.Unmapped,
    };

    private static TillCanonicalField MapTender(string? kind) => (kind ?? string.Empty).ToLowerInvariant() switch
    {
        "cash" => TillCanonicalField.Cash,
        "card" => TillCanonicalField.Card,
        "credit_card" => TillCanonicalField.CardCredit,
        "debit_card" => TillCanonicalField.CardDebit,
        "fuel_card" => TillCanonicalField.Card,
        "mobile" => TillCanonicalField.MobilePay,
        "voucher" => TillCanonicalField.Voucher,
        "cheque" => TillCanonicalField.Cheque,
        "account" => TillCanonicalField.AccountCredit,
        _ => TillCanonicalField.Unmapped,
    };

    private static TillCanonicalField MapSale(string? kind) => (kind ?? string.Empty).ToLowerInvariant() switch
    {
        "fuel" => TillCanonicalField.FuelSales,
        "lottery" => TillCanonicalField.LotterySales,
        "scratchcard" => TillCanonicalField.ScratchcardSales,
        "paypoint" => TillCanonicalField.PayPoint,
        "tobacco" => TillCanonicalField.DeptTobacco,
        "alcohol" => TillCanonicalField.DeptAlcohol,
        "grocery" => TillCanonicalField.DeptGrocery,
        "hot_food" => TillCanonicalField.DeptFoodToGo,
        "newspaper" => TillCanonicalField.DeptNewsMag,
        _ => TillCanonicalField.DeptOther,
    };
}
