// Tiny event bus so the (non-React) axios interceptor can tell AuthContext that the session is
// unrecoverable (refresh failed). AuthContext listens and signs the user out, which flips the
// navigator to the Login screen. Kept separate from client.ts / AuthContext to avoid import cycles.
type Listener = () => void;

let listeners: Listener[] = [];

export function onSessionExpired(listener: Listener): () => void {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

export function emitSessionExpired(): void {
  for (const listener of listeners.slice()) {
    try {
      listener();
    } catch {
      // A listener throwing must not stop the others from running.
    }
  }
}
