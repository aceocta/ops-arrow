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
};

export const hasHelpFor = (routeName?: string): boolean => Boolean(routeName && HELP_CONTENT[routeName]);
