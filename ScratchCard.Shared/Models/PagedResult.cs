namespace ScratchCard.Shared.Models;

public class PagedResult<T>
{
    public IReadOnlyCollection<T> Items { get; set; } = [];
    public int TotalCount { get; set; }
}
