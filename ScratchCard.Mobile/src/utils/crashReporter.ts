type Extras = Record<string, unknown>;

type Reporter = {
  init: () => void | Promise<void>;
  reportError: (error: unknown, extras?: Extras) => void;
  reportMessage: (message: string, extras?: Extras) => void;
  setUser: (user: { id?: string; email?: string } | null) => void;
};

const noopReporter: Reporter = {
  init: () => {},
  reportError: (error, extras) => {
    if (__DEV__) {
      console.warn("[crashReporter] error", error, extras);
    }
  },
  reportMessage: (message, extras) => {
    if (__DEV__) {
      console.log("[crashReporter] message", message, extras);
    }
  },
  setUser: () => {},
};

let activeReporter: Reporter = noopReporter;

export function registerReporter(reporter: Partial<Reporter>) {
  activeReporter = { ...noopReporter, ...reporter };
}

export function initCrashReporter() {
  return activeReporter.init();
}

export function reportError(error: unknown, extras?: Extras) {
  activeReporter.reportError(error, extras);
}

export function reportMessage(message: string, extras?: Extras) {
  activeReporter.reportMessage(message, extras);
}

export function setCrashReporterUser(user: { id?: string; email?: string } | null) {
  activeReporter.setUser(user);
}
