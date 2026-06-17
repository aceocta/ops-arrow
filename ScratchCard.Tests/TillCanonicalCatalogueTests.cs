using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Enums;
using Xunit;

namespace ScratchCard.Tests;

// The canonical catalogue drives the reconciliation engine: each field's CashDirection + AffectsDrawer
// is exactly what TillReconciliationMath consumes to build the drawer. These pin the built-in defaults
// (no runtime catalogue loaded) so a catalogue edit can't silently change cash behaviour.
public class TillCanonicalCatalogueTests
{
    [Fact]
    public void Cash_is_drawer_affecting_cash_in()
    {
        var meta = TillCanonicalCatalogue.MetaByCode("Cash");
        Assert.Equal(TillCashDirection.In, meta.CashDirection);
        Assert.True(meta.AffectsDrawer);
        Assert.Equal(TillFieldGroup.Tender, meta.Group);
    }

    [Fact]
    public void Cashback_is_drawer_affecting_cash_out()
    {
        var meta = TillCanonicalCatalogue.MetaByCode("Cashback");
        Assert.Equal(TillCashDirection.Out, meta.CashDirection);
        Assert.True(meta.AffectsDrawer);
    }

    [Fact]
    public void Card_does_not_affect_the_cash_drawer()
    {
        var meta = TillCanonicalCatalogue.MetaByCode("Card");
        Assert.Equal(TillCashDirection.None, meta.CashDirection);
        Assert.False(meta.AffectsDrawer);
    }

    [Fact]
    public void Prize_payouts_are_cash_out_and_drawer_affecting()
    {
        var meta = TillCanonicalCatalogue.MetaByCode("LotteryPrizes");
        Assert.Equal(TillCashDirection.Out, meta.CashDirection);
        Assert.True(meta.AffectsDrawer);
    }

    [Fact]
    public void Counter_sales_are_cash_in_but_not_drawer_affecting_by_default()
    {
        // Lottery/scratchcard sales arrive via the Cash tender already, so they don't double-count
        // the retail drawer unless a shop opts into a separate counter drawer.
        var meta = TillCanonicalCatalogue.MetaByCode("LotterySales");
        Assert.Equal(TillCashDirection.In, meta.CashDirection);
        Assert.False(meta.AffectsDrawer);
    }

    [Fact]
    public void Lottery_commission_is_income()
    {
        var meta = TillCanonicalCatalogue.MetaByCode("LotteryCommission");
        Assert.True(meta.IsCommissionIncome);
        Assert.Equal(TillFieldGroup.Income, meta.Group);
    }

    [Fact]
    public void Lookup_is_case_insensitive()
        => Assert.Equal("Cash", TillCanonicalCatalogue.MetaByCode("cash").Code);

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("NotARealField")]
    public void Unknown_or_blank_code_falls_back_to_unmapped(string? code)
    {
        var meta = TillCanonicalCatalogue.MetaByCode(code);
        Assert.Equal(nameof(TillCanonicalField.Unmapped), meta.Code);
        Assert.False(meta.AffectsDrawer);
        Assert.Equal(TillFieldGroup.Control, meta.Group);
    }

    [Fact]
    public void Meta_by_enum_matches_meta_by_code()
        => Assert.Equal(
            TillCanonicalCatalogue.MetaByCode("Cash"),
            TillCanonicalCatalogue.Meta(TillCanonicalField.Cash));
}
