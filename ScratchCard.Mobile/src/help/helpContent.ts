import { HowItWorksStep } from "../components/HowItWorksSheet";

export type HelpEntry = { title: string; steps: HowItWorksStep[] };

// Per-screen "how it works" content, keyed by navigation route name. The global header (?) only
// appears on routes listed here, so a screen without help never shows a dead button.
export const HELP_CONTENT: Record<string, HelpEntry> = {
  TillReconciliation: {
    title: "How till reconciliation works",
    steps: [
      { icon: "camera", title: "Add your till report", detail: "Take a photo of the end-of-day printout, or upload one — we read the figures for you." },
      { icon: "checkmark-circle", title: "Check the figures", detail: "Tap any line with a dot to confirm the amount. Fix anything the scan got wrong." },
      { icon: "cash", title: "Count your cash", detail: "Enter your counted drawer so we can work out any over or short." },
      { icon: "lock-closed", title: "Approve & lock", detail: "Mark it reconciled, then approve to lock the day. Add a reason if there's a variance." },
    ],
  },
  DayEndClose: {
    title: "How day management works",
    steps: [
      { icon: "today-outline", title: "Open the day", detail: "Open the business day and confirm your starting scratchcard serials so the day begins from a known position." },
      { icon: "people-outline", title: "Run shifts & sales", detail: "Through the day, staff record shifts, sales and till reports — they all roll up here." },
      { icon: "clipboard-outline", title: "Review before closing", detail: "Check temperature logs, compliance, safe drops and any missing tickets flagged on this screen." },
      { icon: "lock-closed-outline", title: "Close the day", detail: "Enter closing figures and payouts to finalise the day. You can reopen it with a reason if something needs fixing." },
    ],
  },
  BusinessDay: {
    title: "How day management works",
    steps: [
      { icon: "today-outline", title: "Open the day", detail: "Pick the date and open a business day. Sales, shifts and till reports all attach to the open day." },
      { icon: "people-outline", title: "Run shifts & sales", detail: "Staff clock their shifts and record sales and till reports against the day as it runs." },
      { icon: "alert-circle-outline", title: "Check it's ready", detail: "Before closing, clear any missing opening tickets and review the day's figures." },
      { icon: "lock-closed-outline", title: "Close the day", detail: "Close to finalise the day's totals. You can reopen a closed day if something needs fixing." },
    ],
  },
  SafeDrop: {
    title: "How safe drops work",
    steps: [
      { icon: "cash-outline", title: "Record the drop", detail: "Enter the canister number and the amount you're dropping into the safe." },
      { icon: "person-outline", title: "Who dropped it", detail: "Your name is filled in automatically — change it if you're logging a drop for someone else." },
      { icon: "hourglass-outline", title: "Waiting for approval", detail: "New drops show as Pending until a manager checks them." },
      { icon: "checkmark-circle-outline", title: "Manager approval", detail: "Managers tap Approve on each drop. Approved totals feed into the day's cash figures." },
    ],
  },
  RefusalRegister: {
    title: "How the refusal log works",
    steps: [
      { icon: "hand-left-outline", title: "Log every refusal", detail: "Record each refused sale as it happens — product, reason and time, just like the paper refusals book." },
      { icon: "person-outline", title: "Who was involved", detail: "Add a short description of the customer and which staff member refused the sale." },
      { icon: "calendar-outline", title: "Browse by day", detail: "Tap a date to see that day's entries. Everything stays on record." },
      { icon: "document-text-outline", title: "Ready for inspections", detail: "Managers can produce a date-range report to show compliance at a glance." },
    ],
  },
  TemperatureLogs: {
    title: "How temperature logs work",
    steps: [
      { icon: "thermometer-outline", title: "Record your checks", detail: "Enter a reading for each fridge and freezer — the digital version of the paper temperature sheet." },
      { icon: "alert-circle-outline", title: "Out-of-range readings", detail: "Readings outside the safe range are flagged so you can act and add a note." },
      { icon: "time-outline", title: "Scheduled checks", detail: "Set up scheduled checks so the team knows what's due and nothing gets missed." },
      { icon: "document-text-outline", title: "History & reports", detail: "Past readings are kept by day, with reports ready for audits and EHO visits." },
    ],
  },
  VisitorLog: {
    title: "How the visitor log works",
    steps: [
      { icon: "people-outline", title: "Sign visitors in", detail: "Record their name, company and reason for visiting — the digital version of the visitor book." },
      { icon: "time-outline", title: "Who's on site", detail: "Anyone not signed out yet shows as still on site." },
      { icon: "log-out-outline", title: "Sign visitors out", detail: "Tap Sign out on a visitor when they leave to complete the record." },
      { icon: "document-text-outline", title: "Reports", detail: "Pull a date-range report when you need to show who was on site and when." },
    ],
  },
  MyShifts: {
    title: "How my shifts work",
    steps: [
      { icon: "log-in-outline", title: "Check in", detail: "Tap Check in when you start your shift — it records your actual start time." },
      { icon: "log-out-outline", title: "Check out", detail: "Check out when you finish. Your worked hours are calculated for you." },
      { icon: "create-outline", title: "Forgot to check in?", detail: "Use Enter times to log your hours manually — they go to your manager for approval." },
      { icon: "calendar-outline", title: "See what's coming", detail: "Change the date range to see your upcoming shifts for the week ahead." },
    ],
  },
  RotaManage: {
    title: "How the shift rota works",
    steps: [
      { icon: "calendar-number-outline", title: "Build the week", detail: "Each card is a day. Tap + on a day, pick the shift time, and choose who's working." },
      { icon: "sparkles-outline", title: "Auto-generate", detail: "Generate the week to add every configured shift in one go, copying last week's staffing." },
      { icon: "alert-circle-outline", title: "Spot the gaps", detail: "Shifts with no one assigned are highlighted, and the week header shows how many still need staff." },
      { icon: "people-outline", title: "External staff", detail: "Roster people who don't use the app, and record their hours for them." },
    ],
  },
  ComplianceChecks: {
    title: "How compliance checks work",
    steps: [
      { icon: "clipboard-outline", title: "Work through checks", detail: "Complete each compliance check as it falls due — daily, weekly or monthly." },
      { icon: "camera-outline", title: "Attach evidence", detail: "Add photos or notes where proof is needed." },
      { icon: "warning-outline", title: "Raise actions", detail: "Anything that fails creates an action so it gets fixed and signed off." },
      { icon: "document-text-outline", title: "Audit trail", detail: "Completed checks stay on record, ready for inspections." },
    ],
  },
  Deliveries: {
    title: "How deliveries work",
    steps: [
      { icon: "cube-outline", title: "Receive a delivery", detail: "Start Receive Delivery when stock arrives and add the packs that came in." },
      { icon: "barcode-outline", title: "Scan packs", detail: "Use the camera to scan pack barcodes — faster and fewer mistakes than typing." },
      { icon: "checkmark-circle-outline", title: "Confirm & save", detail: "Check the list matches the delivery note, then save." },
      { icon: "albums-outline", title: "Stock follows on", detail: "Received packs appear in your pack inventory, ready to activate." },
    ],
  },
  PrizePayout: {
    title: "How prize payouts work",
    steps: [
      { icon: "trophy-outline", title: "Record a payout", detail: "Log each scratch card prize you pay out, with the winning ticket's details." },
      { icon: "barcode-outline", title: "Scan the ticket", detail: "Scan the ticket barcode to capture the game and serial automatically." },
      { icon: "cash-outline", title: "How it was paid", detail: "Record whether the prize was paid in cash or another way." },
      { icon: "document-text-outline", title: "Day's payouts", detail: "Payouts roll into the day's figures for reconciliation." },
    ],
  },
};

export const hasHelpFor = (routeName?: string): boolean => Boolean(routeName && HELP_CONTENT[routeName]);
