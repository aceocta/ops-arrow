using ScratchCard.Domain.Constants;
using ScratchCard.Domain.Enums;
using Xunit;

namespace ScratchCard.Tests;

// The agency rule is the core money-classification invariant: provider throughput (PayPoint,
// Lottery, Post Office, ATM, …) is a balance-sheet LIABILITY, never turnover. Getting this wrong
// overstates VAT-able sales. These tests pin the built-in defaults (no runtime override loaded).
public class TillAccountingCatalogueTests
{
    [Theory]
    [InlineData("PayPoint")]
    [InlineData("Payzone")]
    [InlineData("LotterySales")]
    [InlineData("LotteryPrizes")]
    [InlineData("ScratchcardSales")]
    [InlineData("ScratchcardPrizes")]
    [InlineData("PostOffice")]
    [InlineData("Atm")]
    public void Agency_throughput_is_a_liability(string code)
    {
        Assert.Equal(LedgerCategory.Liability, TillAccountingCatalogue.LedgerForCode(code));
    }

    [Fact]
    public void Unknown_code_is_ignored()
    {
        Assert.Equal(LedgerCategory.Ignore, TillAccountingCatalogue.LedgerForCode("NotARealField"));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    public void Blank_code_is_ignored(string? code)
    {
        Assert.Equal(LedgerCategory.Ignore, TillAccountingCatalogue.LedgerForCode(code));
    }
}
