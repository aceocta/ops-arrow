namespace ScratchCard.Application.Common.Interfaces;

public enum ShopNotificationKind
{
    ShopCreated,
    SubscriptionChanged
}

/// <summary>
/// A lightweight notification job placed on a background queue. Carries only the shop id, the
/// kind of event, and a pre-built human summary captured at the time of the change.
/// </summary>
public sealed record ShopNotificationJob(Guid ShopId, ShopNotificationKind Kind, string Summary);

/// <summary>
/// Enqueues shop/subscription notifications for out-of-band delivery. Implementations MUST be
/// non-blocking and MUST NOT throw — notification dispatch must never block or fail the core
/// business logic (shop creation, subscription changes).
/// </summary>
public interface IShopNotificationDispatcher
{
    void Enqueue(ShopNotificationJob job);
}
