type Props = Record<string, unknown>;

export type AnalyticsEvent =
  | "app_opened"
  | "paywall_viewed"
  | "plan_selected"
  | "trial_started"
  | "purchase_completed"
  | "purchase_failed"
  | "purchase_restored"
  | "cancellation_intent"
  | "shift_opened"
  | "shift_closed"
  | "compliance_submitted"
  | "delivery_received"
  | "barcode_scanned"
  | string;

type Tracker = {
  init: () => void | Promise<void>;
  identify: (userId: string, traits?: Props) => void;
  track: (event: AnalyticsEvent, props?: Props) => void;
  reset: () => void;
};

const noopTracker: Tracker = {
  init: () => {},
  identify: () => {},
  track: (event, props) => {
    if (__DEV__) {
      console.log("[analytics]", event, props);
    }
  },
  reset: () => {},
};

let activeTracker: Tracker = noopTracker;

export function registerAnalytics(tracker: Partial<Tracker>) {
  activeTracker = { ...noopTracker, ...tracker };
}

export function initAnalytics() {
  return activeTracker.init();
}

export function identifyUser(userId: string, traits?: Props) {
  activeTracker.identify(userId, traits);
}

export function track(event: AnalyticsEvent, props?: Props) {
  activeTracker.track(event, props);
}

export function resetAnalytics() {
  activeTracker.reset();
}
