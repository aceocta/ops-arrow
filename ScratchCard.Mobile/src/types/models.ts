import { BillingCycle, EntryMethod, PackStatus, SellingOrder, ShiftStatus, SubscriptionStatus, SyncStatus, TemperatureEquipmentType, TillLineClassification, TillLineSource, TillReportStatus, TillReportType, TillRuleMatchType } from "./enums";

export type ShopPaymentType = {
  id: string;
  shopId: string;
  name: string;
  code?: string;
  keywords?: string;
  sortOrder: number;
  isActive: boolean;
};

export type TillReportPayment = {
  id: string;
  paymentTypeId?: string;
  paymentTypeName: string;
  amount: number;
  source: TillLineSource;
};

export type TillPaymentTypeAmount = {
  paymentTypeId?: string;
  name: string;
  amount: number;
};

export type TillShiftPaymentSummary = {
  shiftId: string;
  shiftName: string;
  totals: TillPaymentTypeAmount[];
};

export type TillPaymentSummary = {
  businessDayId: string;
  businessDate: string;
  dayTotals: TillPaymentTypeAmount[];
  shifts: TillShiftPaymentSummary[];
};

export type Till = {
  id: string;
  shopId: string;
  name: string;
  code?: string;
  isActive: boolean;
  defaultFloat: number;
};

export type TillReportScopeSummary = {
  totalSales: number;
  payouts: number;
  net: number;
  reportCount: number;
  tenders: TillPaymentTypeAmount[];
};

export type TillReportLine = {
  id: string;
  lineNumber: number;
  rawDescription: string;
  amount: number;
  typeCode?: string;
  classification: TillLineClassification;
  source: TillLineSource;
  matchedRuleId?: string;
  notes?: string;
};

export type TillReportAttachment = {
  id: string;
  pageNumber: number;
  originalFileName: string;
  contentType: string;
};

export type TillReport = {
  id: string;
  shopId: string;
  tillId?: string;
  tillName?: string;
  reportType: TillReportType;
  shiftId?: string;
  businessDayId?: string;
  businessDate: string;
  status: TillReportStatus;
  totalIncome: number;
  totalExpense: number;
  net: number;
  lineCount: number;
  unclassifiedCount: number;
  attachmentCount: number;
  processedOn: string;
  confirmedOn?: string;
  lines: TillReportLine[];
  attachments: TillReportAttachment[];
  payments: TillReportPayment[];
};

export type TillReportListItem = {
  id: string;
  shopId: string;
  tillId?: string;
  tillName?: string;
  reportType: TillReportType;
  shiftId?: string;
  businessDate: string;
  status: TillReportStatus;
  totalIncome: number;
  totalExpense: number;
  net: number;
  lineCount: number;
  unclassifiedCount: number;
  processedOn: string;
};

export type TillCategoryRule = {
  id: string;
  shopId: string;
  pattern: string;
  matchType: TillRuleMatchType;
  classification: TillLineClassification;
  priority: number;
  isActive: boolean;
};

export type AuthProfile = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Optional user phone number (with country code) — used to route WhatsApp alerts. */
  phoneNumber?: string;
  displayName?: string;
  roles: string[];
  shops: { shopId: string; companyId?: string; companyName?: string; shopName: string; role: string; isFuelStation?: boolean }[];
  hasCompanySetup: boolean;
  hasShopSetup: boolean;
  primaryCompanyId?: string;
};

export type Company = {
  id: string;
  companyName: string;
  registrationNumber?: string;
  ownerUserId?: string;
  email: string;
  phoneNumber?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  postCode?: string;
  country: string;
  isActive: boolean;
};

export type SubscriptionPlan = {
  id: string;
  name: string;
  billingCycle: BillingCycle;
  pricePerShop: number;
  trialDays: number;
  description?: string;
  includedFeatures?: string[];
  maxUsers?: number | null;
  reportExportsPerMonth?: number | null;
  appleProductId?: string | null;
  googleProductId?: string | null;
  isActive: boolean;
};

export type SubscriptionSummary = {
  companyId: string;
  companySubscriptionId: string;
  subscriptionPlanId: string;
  planName: string;
  billingCycle: BillingCycle;
  status: SubscriptionStatus;
  activeShopCount: number;
  pricePerShop: number;
  subTotalAmount: number;
  discountPercentage: number;
  discountAmount: number;
  totalAmount: number;
  trialStartedOn?: string;
  trialEndsOn?: string;
  currentPeriodStartedOn?: string;
  currentPeriodEndsOn?: string;
  trialDaysRemaining?: number;
  requiresBillingAction: boolean;
  includedFeatures?: string[];
};

export type Shop = {
  id: string;
  companyId?: string;
  companyName?: string;
  shopName: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  postCode: string;
  country: string;
  isActive: boolean;
};

export type RoleOption = {
  id: string;
  name: string;
  description: string;
};

export type Game = {
  id: string;
  shopId: string;
  gameName: string;
  gameCode: string;
  defaultTicketPrice: number;
  defaultTicketsPerPack: number;
  defaultStartSerialNumber: string;
  defaultEndSerialNumber: string;
  defaultSellingOrder: SellingOrder;
  commissionRate?: number;
  isActive: boolean;
};

export type DeliveryPack = {
  packId: string;
  packNumber: string;
  gameName: string;
};

export type Delivery = {
  id: string;
  shopId: string;
  deliveryDate: string;
  supplierName: string;
  deliveryReference: string;
  notes?: string;
  packs: DeliveryPack[];
};

export type DeliveryNotePackSuggestion = {
  gameCode: string;
  packNumber: string;
  rawText: string;
  confidence: number;
  gameId?: string;
  gameName?: string;
  ticketPrice?: number;
  totalTickets?: number;
  startSerialNumber?: string;
  endSerialNumber?: string;
  sellingOrder?: SellingOrder | string | number;
  isNewGameCandidate: boolean;
  isDuplicateInImage: boolean;
  existsInSystem: boolean;
};

export type DeliveryNoteParseResult = {
  supplierName: string;
  deliveryReference: string;
  shipmentNumber: string;
  deliveryDate: string;
  packSuggestions: DeliveryNotePackSuggestion[];
  warnings: string[];
};

export type ScratchCardPack = {
  id: string;
  shopId: string;
  gameId: string;
  gameName: string;
  gameCode?: string;
  packNumber: string;
  displayNumber?: number;
  ticketPrice: number;
  totalTickets: number;
  startSerialNumber: string;
  endSerialNumber: string;
  sellingOrder: SellingOrder;
  currentSerialNumber: string;
  status: PackStatus;
  isManuallyAdded: boolean;
};

export type BusinessDay = {
  id: string;
  shopId: string;
  businessDate: string;
  status: string;
  totalSalesAmount: number;
  totalPrizePayout: number;
  expectedCash: number;
  difference: number;
  missingOpeningTicketCount?: number;
  missingOpeningTicketDetails?: MissingOpeningTicketDetail[];
  scratchCardDayCloseSummary?: {
    lottoPayout: number;
    scratchCardPayout: number;
    tillPayout: number;
  };
  closeAttachments?: Array<{
    id: string;
    fileName: string;
    contentType?: string;
    fileSizeBytes: number;
    uploadedOn: string;
  }>;
};

export type MissingOpeningTicketDetail = {
  shiftId: string;
  shiftName: string;
  packId: string;
  packNumber: string;
  displayNumber?: number;
  gameName: string;
  gameCode: string;
  expectedOpeningSerialNumber: string;
  actualOpeningSerialNumber: string;
  missingQuantity: number;
  overageQuantity: number;
};

export type CanisterDrop = {
  id: string;
  shopId: string;
  businessDayId: string;
  shiftId: string;
  canisterId: string;
  shiftName: string;
  canisterNumber: string;
  amount: number;
  droppedByUserId?: string;
  droppedByName: string;
  droppedOn: string;
  approvalStatus: "Pending" | "Approved" | "Rejected";
  approvedByUserId?: string;
  approvedOn?: string;
  approvalNotes?: string;
};

export type Canister = {
  id: string;
  canisterNumber: string;
  shopId: string;
  isActive: boolean;
  maxAmount?: number;
};

export type Shift = {
  id: string;
  businessDayId: string;
  shopId: string;
  shiftName: string;
  startTime: string;
  endTime?: string;
  openedOn?: string;
  closedOn?: string;
  status: ShiftStatus;
  syncStatus?: SyncStatus;
  isAutoCreated?: boolean;
  autoTemplateId?: string;
  closeNote?: string;
  missingOpeningTicketCount?: number;
  closeAttachments?: Array<{
    id: string;
    fileName: string;
    contentType?: string;
    fileSizeBytes: number;
    uploadedOn: string;
  }>;
};

export type ShiftCloseCandidate = {
  id: string;
  shopId: string;
  businessDayId: string;
  businessDate: string;
  businessDayStatus: string;
  shiftName: string;
  status: ShiftStatus;
  syncStatus?: SyncStatus;
  startTime: string;
  endTime?: string;
};

export type PrizePayout = {
  id: string;
  shiftId: string;
  packId?: string;
  ticketNumber?: string;
  prizeAmount: number;
  approvalStatus: string;
  paidOn: string;
};

export type UserListItem = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  /** Optional phone (with country code). Used for WhatsApp routing. */
  phoneNumber?: string;
  displayName?: string;
  isActive: boolean;
  lastLoginOn?: string;
  roleName: string;
};

export type ConfigurationItem = {
  id: string;
  shopId?: string;
  configKey: string;
  configValue: string;
  dataType: string;
  groupName: string;
  description?: string;
  isActive: boolean;
};

export type DailySalesReportRow = {
  businessDate: string;
  shiftName: string;
  soldQuantity?: number;
  salesAmount: number;
  prizePayout: number;
  expectedCash: number;
  difference: number;
  lottoPayout?: number;
  scratchCardPayout?: number;
  tillPayout?: number;
};

export type ManualEntryReviewRow = {
  businessDate: string;
  shiftName: string;
  cashier: string;
  packNumber: string;
  gameName: string;
  openingSerial: string;
  originalScannedSerial?: string;
  finalClosingSerial: string;
  entryMethod: string;
  soldQuantity: number;
  salesAmount: number;
  reason: string;
  notificationSent: boolean;
};

export type StockReportRow = {
  packNumber: string;
  gameName: string;
  status: string;
  currentSerialNumber: string;
  remainingTickets: number;
};

export type RotaAssignee = {
  userId?: string | null;
  rotaStaffMemberId?: string | null;
  name: string;
  phone?: string | null;
  email?: string | null;
  isExternal?: boolean;
  /** Why this person is on the shift (e.g. "Cleaning"). Null/absent = regular shift. */
  reason?: string | null;
  note?: string | null;
};

export type RotaStaffMember = { id: string; name: string; phone?: string | null; email?: string | null; isActive: boolean };

export type RotaShiftTemplate = {
  templateId: string;
  name: string;
  startTime: string; // HH:mm:ss
  endTime: string; // HH:mm:ss
};

export type RotaShift = {
  id: string;
  shopId: string;
  shiftDate: string; // yyyy-MM-dd (start date)
  endDate: string; // yyyy-MM-dd (next day for overnight shifts)
  businessDayId?: string | null;
  shiftTemplateId?: string | null;
  shiftName: string;
  startTime: string; // HH:mm:ss
  endTime: string; // HH:mm:ss
  position?: string | null;
  notes?: string | null;
  assignees: RotaAssignee[];
  myAttendance?: ShiftAttendance | null;
};

export type AttendanceApprovalRow = {
  id: string;
  userId?: string | null;
  userName: string;
  shiftName?: string | null;
  shiftDate?: string | null;
  shiftEndDate?: string | null;
  shiftStart?: string | null; // HH:mm:ss
  shiftEnd?: string | null; // HH:mm:ss
  checkInAt: string;
  checkOutAt?: string | null;
  entryMethod: "Clocked" | "Manual";
  submittedOn: string;
  notes?: string | null;
};

export type AssignableUser = { userId?: string | null; rotaStaffMemberId?: string | null; isExternal?: boolean; name: string; role: string };

export type ShiftAttendance = {
  id: string;
  shopId: string;
  userId?: string | null;
  rotaStaffMemberId?: string | null;
  isExternal?: boolean;
  userName: string;
  rotaShiftId?: string | null;
  businessDayId?: string | null;
  checkInAt: string;
  checkOutAt?: string | null;
  entryMethod: "Clocked" | "Manual";
  isApproved: boolean;
};

export type TimesheetRow = {
  userId?: string | null;
  rotaStaffMemberId?: string | null;
  isExternal?: boolean;
  userName: string;
  shiftsWorked: number;
  openSessions: number;
  totalHours: number;
  /** Distinct non-regular assignment reasons across the range (e.g. "Cover", "Overtime"). */
  reasons?: string[];
  /** Approved leave hours in the range, by type (only when Leave Management is enabled). */
  holidayHours?: number;
  sickHours?: number;
  otherLeaveHours?: number;
  unpaidLeaveHours?: number;
};

export type ShiftTimesheetRow = {
  shiftName: string;
  date: string; // yyyy-MM-dd
  startTime?: string | null; // HH:mm:ss
  endTime?: string | null; // HH:mm:ss
  staffCount: number;
  shiftsWorked: number;
  openSessions: number;
  totalHours: number;
  /** Distinct non-regular assignment reasons across this shift's sessions. */
  reasons?: string[];
};

export type TimesheetSession = {
  id: string;
  date: string; // yyyy-MM-dd
  shiftName?: string | null;
  checkInAt: string;
  checkOutAt?: string | null;
  hours: number;
  entryMethod: "Clocked" | "Manual";
  isApproved: boolean;
  /** Assignment reason for the rostered shift (e.g. "Cleaning"). Null/absent = regular shift. */
  reason?: string | null;
};

export type ShiftSession = {
  id: string;
  date: string; // yyyy-MM-dd
  userId?: string | null;
  rotaStaffMemberId?: string | null;
  isExternal?: boolean;
  userName: string;
  /** This person's assignment reason on the shift (e.g. "Cleaning"). Null/absent = regular shift. */
  reason?: string | null;
  checkInAt: string;
  checkOutAt?: string | null;
  hours: number;
  entryMethod: "Clocked" | "Manual";
  isApproved: boolean;
};

export type LeaveType = "Holiday" | "Sick" | "Unpaid" | "Other";
export type LeaveStatus = "Pending" | "Approved" | "Rejected" | "Cancelled";

export type LeaveRequest = {
  id: string;
  shopId: string;
  userId?: string | null;
  rotaStaffMemberId?: string | null;
  isExternal: boolean;
  userName: string;
  type: LeaveType;
  startDate: string; // yyyy-MM-dd
  endDate: string; // yyyy-MM-dd
  hoursPerDay: number;
  totalDays: number;
  totalHours: number;
  isPaid: boolean;
  status: LeaveStatus;
  staffNote?: string | null;
  managerNote?: string | null;
  decidedByUserId?: string | null;
  decidedOn?: string | null; // ISO
  requestedOn: string; // ISO
};

/** Leave allowance for the current holiday year. Null from the API = no entitlement configured. */
export type LeaveBalance = {
  yearStart: string; // yyyy-MM-dd
  entitledHours: number;
  usualHoursPerDay: number;
  usedHours: number;
  remainingHours: number;
};

export type LeaveEntitlement = {
  id: string;
  shopId: string;
  userId?: string | null;
  rotaStaffMemberId?: string | null;
  isExternal: boolean;
  userName: string;
  yearStart: string; // yyyy-MM-dd
  entitledHours: number;
  usualHoursPerDay: number;
};

/** One approved leave day for a person (per-day expansion of approved requests). */
export type LeaveDay = {
  date: string; // yyyy-MM-dd
  type: LeaveType;
  hours: number;
  isPaid: boolean;
  leaveRequestId: string;
};

export type BusinessDayStaffRow = {
  userId?: string | null;
  rotaStaffMemberId?: string | null;
  isExternal?: boolean;
  userName: string;
  shiftName?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  hours: number;
  status: "Scheduled" | "OnShift" | "Completed" | "Unplanned";
};

export type BusinessDayStaff = {
  date: string;
  dayStatus: string;
  totalHours: number;
  onShiftCount: number;
  rows: BusinessDayStaffRow[];
};

export type OwnerShopOverview = {
  shopId: string;
  shopName: string;
  salesAmount: number;
  previousSalesAmount: number;
  cashVariance: number;
  dayStatus: string;
  temperatureChecksDone: number;
  temperatureChecksTotal: number;
  temperatureIssues: number;
  temperatureOutOfRangeUnits: number;
  temperatureCompliancePercent: number;
  complianceNonCompliantCount: number;
  openComplianceActions: number;
  complianceScore: number;
  activePacks: number;
  lowStockPacks: number;
  refusals: number;
  visitors: number;
  onShiftNow: number;
  pendingApprovals: number;
  needsAttention: boolean;
  attentionReasons: string[];
};

export type OwnerOverview = {
  from: string;
  to: string;
  shops: OwnerShopOverview[];
  shopCount: number;
  totalSalesAmount: number;
  previousTotalSalesAmount: number;
  totalCashVariance: number;
  shopsNeedingAttention: number;
  totalOpenComplianceActions: number;
  totalTemperatureIssues: number;
  totalLowStockPacks: number;
  totalRefusals: number;
  totalVisitors: number;
  totalOnShiftNow: number;
  totalPendingApprovals: number;
  averageComplianceScore: number;
  salesByDay: { date: string; amount: number }[];
  temperatureByDay: { date: string; inRange: number; outOfRange: number }[];
};

export type NotificationLogRow = {
  id: string;
  notificationType: string;
  channel: string;
  recipient: string;
  subject: string;
  status: string;
  sentOn?: string;
  failedReason?: string;
};

export type AuditLogRow = {
  id: string;
  changedOn: string;
  entityName: string;
  entityId?: string;
  actionType: string;
  changedByUserId?: string;
  reason?: string;
  ipAddress?: string;
};

export type ShiftCloseEntry = {
  packId: string;
  closingSerialNumber: string;
  originalScannedSerialNumber?: string;
  entryMethod: EntryMethod;
  manualEntryReason?: string;
  notes?: string;
};

export type ShiftClosePayload = {
  notes?: string;
  attachments?: Array<{
    fileName: string;
    base64: string;
    contentType?: string;
  }>;
  attachmentFileName?: string;
  attachmentBase64?: string;
  entries: ShiftCloseEntry[];
};

export type ShiftCloseResult = {
  shiftId: string;
  totalSalesAmount: number;
  totalPrizePayout: number;
  expectedCash: number;
  difference: number;
  hasManualOrEditedEntries: boolean;
  moveDayManagementToNextBusinessDate?: boolean;
  nextBusinessDate?: string;
};

export type ShiftSalesEntry = {
  id: string;
  packId: string;
  packNumber: string;
  displayNumber?: number | null;
  openingSerialNumber: string;
  closingSerialNumber: string;
  originalScannedSerialNumber?: string;
  entryMethod: EntryMethod;
  soldQuantity: number;
  ticketPrice: number;
  salesAmount: number;
  remainingTickets: number;
  isFlaggedForReview: boolean;
  notificationSent: boolean;
  missingQuantity?: number;
};

export type OfflineShiftQueueItem = {
  id: string;
  shiftId: string;
  shopId: string;
  payloadJson: string;
  syncStatus: SyncStatus;
  createdOn: string;
  updatedOn: string;
  error?: string;
};

export type OfflineChecklistQueueItem = {
  id: string;
  shopId: string;
  businessDate: string;
  shiftId?: string;
  checklistTaskId: string;
  payloadJson: string;
  syncStatus: SyncStatus;
  createdOn: string;
  updatedOn: string;
  error?: string;
};

export type ShopChecklistTask = {
  id: string;
  shopId: string;
  checklistGroupId: string;
  taskName: string;
  description?: string;
  displayOrder: number;
  isRequired: boolean;
  isActive: boolean;
  notesRequiredOnComplete: boolean;
  requiredForShopOpen: boolean;
  requiredForShiftClose: boolean;
  requiredForDayClose: boolean;
  isSystemDefault: boolean;
};

export type ShopChecklistGroup = {
  id: string;
  shopId: string;
  groupName: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  isSystemDefault: boolean;
  tasks: ShopChecklistTask[];
};

export type ChecklistTaskCompletion = {
  id: string;
  shopId: string;
  companyId?: string;
  businessDate: string;
  shiftId?: string;
  checklistGroupId: string;
  checklistTaskId: string;
  isCompleted: boolean;
  completedByUserId?: string;
  completedByName?: string;
  completedOn?: string;
  notes?: string;
};

export type ChecklistDailyTask = {
  task: ShopChecklistTask;
  completion?: ChecklistTaskCompletion;
};

export type ChecklistDailyGroup = {
  group: ShopChecklistGroup;
  completedCount: number;
  totalCount: number;
  tasks: ChecklistDailyTask[];
};

export type ChecklistDailyLog = {
  shopId: string;
  businessDate: string;
  shiftId?: string;
  completedCount: number;
  totalCount: number;
  groups: ChecklistDailyGroup[];
};

export type ChecklistCompletionHistoryRow = {
  completionId: string;
  shopId: string;
  companyId?: string;
  businessDate: string;
  shiftId?: string;
  checklistGroupId: string;
  checklistGroupName: string;
  checklistTaskId: string;
  checklistTaskName: string;
  isCompleted: boolean;
  completedByUserId?: string;
  completedByName?: string;
  completedOn?: string;
  notes?: string;
};

export type ComplianceCheckFrequency = "Daily" | "Weekly" | "Monthly";
export type ComplianceCheckResult = "Pending" | "Compliant" | "NonCompliant" | "NotApplicable";

export type ComplianceCheckItem = {
  id: string;
  shopId: string;
  complianceCheckGroupId: string;
  groupName: string;
  frequency: ComplianceCheckFrequency;
  itemName: string;
  description?: string;
  displayOrder: number;
  isRequired: boolean;
  isActive: boolean;
  isSystemDefault: boolean;
};

export type ComplianceCheckEntry = {
  id: string;
  shopId: string;
  companyId?: string;
  complianceCheckItemId: string;
  frequency: ComplianceCheckFrequency;
  periodDate: string;
  periodStartDate: string;
  periodEndDate: string;
  periodLabel: string;
  checkDate?: string;
  weekStartDate?: string;
  weekEndDate?: string;
  monthStartDate?: string;
  monthEndDate?: string;
  monthName?: string;
  monthNumber?: number;
  monthYear?: number;
  result: ComplianceCheckResult;
  notes?: string;
  actionRequired?: string;
  checkedByUserId?: string;
  checkedByName?: string;
  checkedOn?: string;
  isActionClosedOut: boolean;
  closedOutNotes?: string;
  closedOutByUserId?: string;
  closedOutByName?: string;
  closedOutOn?: string;
  closeAttachments?: Array<{
    id: string;
    fileName: string;
    contentType?: string;
    fileSizeBytes: number;
    uploadedOn: string;
  }>;
};

export type ComplianceCheckPeriodRow = {
  item: ComplianceCheckItem;
  entry?: ComplianceCheckEntry;
};

export type ComplianceCheckGroup = {
  id: string;
  shopId: string;
  frequency: ComplianceCheckFrequency;
  groupName: string;
  description?: string;
  displayOrder: number;
  isActive: boolean;
  isSystemDefault: boolean;
  items: ComplianceCheckItem[];
};

export type ComplianceCheckPeriodGroup = {
  group: ComplianceCheckGroup;
  completedCount: number;
  totalCount: number;
  nonCompliantCount: number;
  rows: ComplianceCheckPeriodRow[];
};

export type ComplianceCheckPeriodLog = {
  shopId: string;
  frequency: ComplianceCheckFrequency;
  periodDate: string;
  periodStartDate: string;
  periodEndDate: string;
  periodLabel: string;
  monthName?: string;
  monthNumber?: number;
  monthYear?: number;
  completedCount: number;
  totalCount: number;
  nonCompliantCount: number;
  groups: ComplianceCheckPeriodGroup[];
};

export type ComplianceActionReportRow = {
  entryId: string;
  shopId: string;
  complianceCheckItemId: string;
  complianceCheckGroupId: string;
  groupName: string;
  frequency: ComplianceCheckFrequency;
  periodDate: string;
  periodStartDate: string;
  periodEndDate: string;
  periodLabel: string;
  monthName?: string;
  monthNumber?: number;
  monthYear?: number;
  itemName: string;
  notes?: string;
  actionRequired?: string;
  isActionClosedOut: boolean;
  closedOutNotes?: string;
  checkedByName?: string;
  checkedOn?: string;
  closedOutByName?: string;
  closedOutOn?: string;
};

export type TemperatureMonitoringUnit = {
  id: string;
  shopId: string;
  unitName: string;
  equipmentType: TemperatureEquipmentType;
  minTemperatureCelsius: number;
  maxTemperatureCelsius: number;
  isActive: boolean;
  location?: string;
  notes?: string;
  displayOrder: number;
};

export type TemperatureReading = {
  id: string;
  shopId: string;
  temperatureMonitoringUnitId: string;
  unitName: string;
  equipmentType: TemperatureEquipmentType;
  minTemperatureCelsius: number;
  maxTemperatureCelsius: number;
  readingDate: string;
  readingTime: string;
  temperatureCelsius: number;
  isOutOfRange: boolean;
  checkedByInitials: string;
  notes?: string;
  actionTaken?: string;
  recordedOn: string;
  recordedByName?: string;
  scheduleId?: string;
  scheduleLabel?: string;
  isLateForSchedule: boolean;
};

export type TemperatureSchedule = {
  id: string;
  shopId: string;
  temperatureMonitoringUnitId?: string;
  label: string;
  expectedTime: string;
  toleranceMinutes: number;
  isActive: boolean;
};

export type TemperatureScheduleGridSlot = {
  scheduleId: string;
  unitId?: string;
  label: string;
  expectedTime: string;
  toleranceMinutes: number;
};

export type TemperatureScheduleGridUnit = {
  unitId: string;
  unitName: string;
  displayOrder: number;
};

export type TemperatureScheduleCellState = "Upcoming" | "OnTime" | "Late" | "Missed" | "Early";

export type TemperatureScheduleGridCell = {
  date: string;
  unitId: string;
  scheduleId: string;
  state: TemperatureScheduleCellState;
  readingId?: string;
  readingTime?: string;
  temperatureCelsius?: number;
  isOutOfRange?: boolean;
  isLate: boolean;
};

export type TemperatureScheduleGrid = {
  from: string;
  to: string;
  units: TemperatureScheduleGridUnit[];
  slots: TemperatureScheduleGridSlot[];
  cells: TemperatureScheduleGridCell[];
  onTimeCount: number;
  earlyCount: number;
  lateCount: number;
  missedCount: number;
};

export type TemperatureDailySignoff = {
  id: string;
  shopId: string;
  signoffDate: string;
  signedOn: string;
  signedByUserId: string;
  signedByInitials: string;
  signedByName: string;
  notes?: string;
};

export type TemperatureUnitDailyLog = {
  unit: TemperatureMonitoringUnit;
  readings: TemperatureReading[];
};

export type TemperatureDailyLog = {
  shopId: string;
  date: string;
  signoff?: TemperatureDailySignoff;
  units: TemperatureUnitDailyLog[];
};

export type RefusalRegisterEntry = {
  id: string;
  shopId: string;
  sequenceNo: number;
  refusalDate: string;
  refusalTime: string;
  product: string;
  personDescription: string;
  observations?: string;
  staffMemberInitials: string;
  signatureImagePath?: string;
  recordedOn: string;
  recordedByName?: string;
  reviewedOn?: string;
  reviewedByUserId?: string;
  reviewedByName?: string;
  reviewNotes?: string;
  reviewSignatureImagePath?: string;
};

export type RefusalRegisterDailySignoff = {
  id: string;
  shopId: string;
  signoffDate: string;
  signedOn: string;
  signedByUserId: string;
  signedByInitials: string;
  signedByName: string;
  notes?: string;
  signatureImagePath?: string;
};

export type RefusalRegisterDailyLog = {
  shopId: string;
  date: string;
  signoff?: RefusalRegisterDailySignoff;
  entries: RefusalRegisterEntry[];
};

export type VisitorVisitType = "Delivery" | "Contractor" | "Rep" | "Inspector" | "Other";

export type VisitorLogEntry = {
  id: string;
  shopId: string;
  visitorId?: string;
  sequenceNo: number;
  visitDate: string;
  timeIn: string;
  timeOut?: string;
  isOnSite: boolean;
  visitorName: string;
  organisation?: string;
  visitType: string;
  purpose?: string;
  hostName?: string;
  vehicleRegistration?: string;
  isInspector: boolean;
  hasSignature: boolean;
  hasPhoto: boolean;
  notes?: string;
  spaPassportRef?: string;
  permitToWorkRef?: string;
  inductionAcknowledged: boolean;
  recordedOn: string;
  recordedByName?: string;
};

export type VisitorLogDailyLog = {
  shopId: string;
  date: string;
  onSiteCount: number;
  entries: VisitorLogEntry[];
};

export type VisitorDirectory = {
  id: string;
  fullName: string;
  organisation?: string;
  phone?: string;
  defaultVisitType?: string;
  visitCount: number;
  lastVisitedOn?: string;
};
