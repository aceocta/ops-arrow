import { BillingCycle, EntryMethod, PackStatus, SellingOrder, ShiftStatus, SubscriptionStatus, SyncStatus, TemperatureEquipmentType } from "./enums";

export type AuthProfile = {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName?: string;
  roles: string[];
  shops: { shopId: string; companyId?: string; companyName?: string; shopName: string; role: string }[];
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

export type Shift = {
  id: string;
  businessDayId: string;
  shopId: string;
  shiftName: string;
  startTime: string;
  endTime?: string;
  status: ShiftStatus;
  syncStatus?: SyncStatus;
  isAutoCreated?: boolean;
  autoTemplateId?: string;
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
};

export type ShiftSalesEntry = {
  id: string;
  packId: string;
  packNumber: string;
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
