// Registry of best-effort cleanup callbacks that must run when the user signs out. Mirrors the
// authEvents.ts listener pattern: modules that own session-scoped state (e.g. the TanStack Query
// client created in App.tsx) register a callback here, and AuthContext.signOut calls
// runSessionCleanup() without needing to import them directly (avoids import cycles).
type CleanupFn = () => void | Promise<void>;

let cleanupFns: CleanupFn[] = [];

export function registerSessionCleanup(fn: CleanupFn): () => void {
  cleanupFns.push(fn);
  return () => {
    cleanupFns = cleanupFns.filter((f) => f !== fn);
  };
}

export async function runSessionCleanup(): Promise<void> {
  for (const fn of cleanupFns.slice()) {
    try {
      await fn();
    } catch {
      // Best-effort: one failing cleanup must not stop the others.
    }
  }
}
