import type { DirectState, DirectStore } from "./kakerattaDirect";

const PREFIX = "gemihub-desktop:kakeratta-direct:";
const RETENTION_MS = 25 * 60 * 60_000;
const LEASE_MS = 10 * 60_000;

interface Journal {
  records: Record<string, DirectState>;
}

// A desktop app runs one poller, so in-memory leases are sufficient; the
// journal itself persists claims and effect intents across restarts.
const leases = new Map<string, number>();

function newState(id: string): DirectState {
  return {
    id,
    claimId: crypto.randomUUID(),
    expiresAt: Date.now() + RETENTION_MS,
    messages: [],
    rounds: 0,
    comments: 0,
  };
}

function read(key: string): Journal {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? "null") as
      | Journal
      | null;
    if (value && typeof value.records === "object") return value;
  } catch { /* start a new journal */ }
  return { records: {} };
}

function write(key: string, journal: Journal): void {
  localStorage.setItem(key, JSON.stringify(journal));
}

/**
 * Durable direct-request journal for one connection scope. `isCurrent` is
 * checked before every side effect so a changed URL/key cannot resume old work.
 */
export function createLocalDirectStore(
  fingerprint: string,
  isCurrent: () => Promise<boolean>,
): DirectStore {
  const key = `${PREFIX}${fingerprint}`;
  const lease = (id: string) => `${fingerprint}:${id}`;
  return {
    async list() {
      const journal = read(key);
      let changed = false;
      for (const [id, state] of Object.entries(journal.records)) {
        if (state.expiresAt <= Date.now()) {
          delete journal.records[id];
          changed = true;
        }
      }
      if (changed) write(key, journal);
      return Object.values(journal.records);
    },
    async acquire(id) {
      if ((leases.get(lease(id)) ?? 0) > Date.now()) return null;
      leases.set(lease(id), Date.now() + LEASE_MS);
      const journal = read(key);
      return journal.records[id] ?? newState(id);
    },
    async save(state) {
      const journal = read(key);
      journal.records[state.id] = state;
      write(key, journal);
    },
    async finish(id) {
      const journal = read(key);
      delete journal.records[id];
      write(key, journal);
    },
    async release(id) {
      leases.delete(lease(id));
    },
    isCurrent,
  };
}

/** Drop journals of connections that are no longer configured. */
export function pruneDirectJournals(activeFingerprint: string): void {
  try {
    for (let index = localStorage.length - 1; index >= 0; index--) {
      const name = localStorage.key(index);
      if (
        name?.startsWith(PREFIX) && name !== `${PREFIX}${activeFingerprint}`
      ) localStorage.removeItem(name);
    }
  } catch { /* storage unavailable */ }
}
