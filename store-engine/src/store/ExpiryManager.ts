/**
 * Tracks per-key expiry deadlines (absolute epoch milliseconds) and answers
 * "is this key expired *now*?". Time is always passed in by the caller — the
 * manager never reads a clock itself — so every branch is unit-testable with a
 * fake clock and no sleeping.
 *
 * For the active sweep it exposes {@link collectExpired}, which examines at most
 * `limit` tracked keys per call using a rotating cursor. This bounds each sweep
 * tick to O(limit) regardless of how large the keyspace grows, rather than
 * scanning the whole map. To keep both O(1) lookups and O(1) rotating sampling,
 * deadlines live in a Map while the same keys are mirrored in a dense array with
 * a position index (swap-remove keeps the array compact).
 *
 * Pure logic: no I/O, no values, no LRU knowledge.
 */
export class ExpiryManager {
  /** Source of truth: key -> absolute expiry in epoch ms. */
  readonly #expiresAt = new Map<string, number>();
  /** Dense mirror of the keys, for rotating-cursor sampling. */
  readonly #keys: string[] = [];
  /** key -> its index in {@link #keys}, enabling O(1) swap-remove. */
  readonly #pos = new Map<string, number>();
  /** Rotating sweep position into {@link #keys}. */
  #cursor = 0;

  /** Number of keys currently carrying an expiry. */
  get size(): number {
    return this.#expiresAt.size;
  }

  /** Whether `key` currently has an expiry set. */
  has(key: string): boolean {
    return this.#expiresAt.has(key);
  }

  /** Sets or updates the absolute expiry deadline (epoch ms) for `key`. */
  set(key: string, expiresAtMs: number): void {
    if (this.#expiresAt.has(key)) {
      this.#expiresAt.set(key, expiresAtMs); // update in place; array position unchanged
      return;
    }
    this.#expiresAt.set(key, expiresAtMs);
    this.#pos.set(key, this.#keys.length);
    this.#keys.push(key);
  }

  /** Removes any expiry for `key`. Returns true if one was present. O(1). */
  clear(key: string): boolean {
    const idx = this.#pos.get(key);
    if (idx === undefined) return false;
    this.#expiresAt.delete(key);
    this.#pos.delete(key);
    const lastIdx = this.#keys.length - 1;
    const lastKey = this.#keys[lastIdx]!;
    if (idx !== lastIdx) {
      this.#keys[idx] = lastKey;
      this.#pos.set(lastKey, idx);
    }
    this.#keys.pop();
    return true;
  }

  /** True if `key` has an expiry that is at or before `nowMs`. */
  isExpired(key: string, nowMs: number): boolean {
    const exp = this.#expiresAt.get(key);
    return exp !== undefined && nowMs >= exp;
  }

  /** Milliseconds until `key` expires (never negative), or undefined if it has no expiry. */
  remainingMs(key: string, nowMs: number): number | undefined {
    const exp = this.#expiresAt.get(key);
    if (exp === undefined) return undefined;
    return Math.max(0, exp - nowMs);
  }

  /**
   * Examines up to `limit` tracked keys starting from the rotating cursor and
   * returns those already expired at `nowMs`. Does not mutate expiry state —
   * the caller is responsible for removing each returned key (which will call
   * {@link clear}); the cursor advances so successive ticks cover fresh ground.
   */
  collectExpired(nowMs: number, limit: number): string[] {
    const expired: string[] = [];
    const n = this.#keys.length;
    if (n === 0 || limit <= 0) return expired;
    const steps = Math.min(limit, n);
    for (let i = 0; i < steps; i++) {
      if (this.#cursor >= this.#keys.length) this.#cursor = 0;
      const key = this.#keys[this.#cursor]!;
      const exp = this.#expiresAt.get(key)!;
      if (nowMs >= exp) expired.push(key);
      this.#cursor++;
    }
    if (this.#keys.length > 0) this.#cursor %= this.#keys.length;
    return expired;
  }
}
