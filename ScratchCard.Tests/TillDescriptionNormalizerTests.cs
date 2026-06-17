using ScratchCard.Application.Common.Helpers;
using Xunit;

namespace ScratchCard.Tests;

// Normalisation is the basis for matching till-report lines to learned shop rules — if it drifts,
// the same product is treated as different items and reconciliation mis-classifies money.
public class TillDescriptionNormalizerTests
{
    [Theory]
    [InlineData("Unleaded 12", "Unleaded")]
    [InlineData("Unleaded 5", "Unleaded")]
    [InlineData("Lottery x 3", "Lottery")]
    [InlineData("Diesel 1.5", "Diesel")]
    [InlineData("PayPoint: 12.50", "PayPoint")] // everything after the first ':' is dropped
    public void Normalize_strips_quantity_noise(string input, string expected)
    {
        Assert.Equal(expected, TillDescriptionNormalizer.Normalize(input));
    }

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    public void Normalize_returns_empty_for_blank(string? input)
    {
        Assert.Equal(string.Empty, TillDescriptionNormalizer.Normalize(input));
    }

    [Fact]
    public void Same_product_different_quantities_normalise_equal()
    {
        Assert.Equal(
            TillDescriptionNormalizer.Normalize("Unleaded 12"),
            TillDescriptionNormalizer.Normalize("Unleaded 5"));
    }
}
