namespace ScratchCard.Application.Common.Models;

public class TillOcrResult
{
    // Full extracted text, retained locally for audit/debugging. Never leaves our infrastructure.
    public string RawText { get; set; } = string.Empty;
    public IReadOnlyCollection<TillOcrLine> Lines { get; set; } = [];
}

public class TillOcrLine
{
    public string Description { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string? TypeCode { get; set; }
}
