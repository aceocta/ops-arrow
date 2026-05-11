export enum EntryMethod {
  Scanned = "Scanned",
  Manual = "Manual",
  ScannedEdited = "ScannedEdited"
}

export enum SellingOrder {
  Ascending = "Ascending",
  Descending = "Descending"
}

export enum PackStatus {
  InStock = "InStock",
  Active = "Active",
  Paused = "Paused",
  Completed = "Completed",
  Returned = "Returned",
  Issue = "Issue"
}

export enum ShiftStatus {
  Open = "Open",
  Closed = "Closed",
  Reopened = "Reopened",
  Approved = "Approved"
}

export enum SyncStatus {
  Draft = "Draft",
  PendingSync = "PendingSync",
  Syncing = "Syncing",
  Synced = "Synced",
  SyncFailed = "SyncFailed",
  Conflict = "Conflict"
}

export enum TemperatureEquipmentType {
  Fridge = "Fridge",
  Freezer = "Freezer",
  CoolRoom = "CoolRoom",
  DisplayChill = "DisplayChill",
  HotFoodDisplay = "HotFoodDisplay",
  Other = "Other",
}

export enum BillingCycle {
  Trial = "Trial",
  Monthly = "Monthly",
  Annual = "Annual",
}

export enum SubscriptionStatus {
  TrialActive = "TrialActive",
  TrialExpired = "TrialExpired",
  Active = "Active",
  PastDue = "PastDue",
  PaymentFailed = "PaymentFailed",
  Cancelled = "Cancelled",
  Expired = "Expired",
  Suspended = "Suspended",
}
