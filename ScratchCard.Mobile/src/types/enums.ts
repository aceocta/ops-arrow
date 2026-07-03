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
  Scheduled = "Scheduled",
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
  HotFoodCounter = "HotFoodCounter",
  BainMarie = "BainMarie",
  PieWarmer = "PieWarmer",
  Other = "Other",
}

// Food-safety category that drives the Pass/Warning/Fail bands (spec §5/§7/§8).
export enum FoodCategory {
  HotFood = "HotFood",
  ColdFood = "ColdFood",
  Frozen = "Frozen",
}

// Three-tier verdict for a temperature reading (spec §7/§8).
export enum TemperatureResult {
  Pass = "Pass",
  Warning = "Warning",
  Fail = "Fail",
}

// Equipment working status, separate from the reading verdict (spec §9/§21).
export enum EquipmentWorkingStatus {
  Working = "Working",
  TemperatureWarning = "TemperatureWarning",
  NotWorking = "NotWorking",
  UnderMaintenance = "UnderMaintenance",
  Resolved = "Resolved",
  Inactive = "Inactive",
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

export enum TillReportStatus {
  Processing = "Processing",
  NeedsReview = "NeedsReview",
  Confirmed = "Confirmed",
  Failed = "Failed",
}

export enum TillLineClassification {
  Unclassified = "Unclassified",
  Income = "Income",
  Expense = "Expense",
}

export enum TillLineSource {
  Unclassified = "Unclassified",
  TypeCode = "TypeCode",
  RuleEngine = "RuleEngine",
  Manual = "Manual",
  Ai = "Ai",
}

export enum TillRuleMatchType {
  Contains = "Contains",
  Equals = "Equals",
  Regex = "Regex",
  TypeCode = "TypeCode",
}

export enum TillReportType {
  Shift = "Shift",
  DayEnd = "DayEnd",
}
