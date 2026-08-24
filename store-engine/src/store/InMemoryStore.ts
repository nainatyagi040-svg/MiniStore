import type { Store, StoreResult, ValueType } from './Store.js';
import { LRUTracker } from './LRUTracker.js';
import { ExpiryManager } from './ExpiryManager.js';
import type { Sweepable } from './ExpirySweeper.js';

/** Notified when a key leaves the store, so the composition root can log it
 * (and, in a later slice, feed an EventBus). The store itself stays I/O-free. */
export type KeyLifecycleListener = (key: string) => void;

export interface InMemoryStoreOptions {
  /** Maximum number of live keys; inserting beyond this evicts the LRU key. Must be >= 1. */
  readonly maxKeys: number;
  /** Clock injection for testable TTL. Defaults to `Date.now`. */
  readonly now?: () => number;
  /** Called with a key removed because its TTL elapsed (lazy check or sweep). */
  readonly onExpired?: KeyLifecycleListener;
  /** Called with a key removed to make room under `maxKeys`. */
  readonly onEvicted?: KeyLifecycleListener;
}

/**
 * A stored value tagged by kind. The tag is what lets every operation detect a
 * type mismatch (WRONGTYPE) before touching the payload. Lists keep the head at
 * index 0; hashes use a Map for O(1) field access.
 */
type StoredValue =
  | { readonly type: 'string'; value: string }
  | { readonly type: 'list'; readonly value: string[] }
  | { readonly type: 'hash'; readonly value: Map<string, string> };

const WRONGTYPE: StoreResult<never> = { ok: false, error: 'WRONGTYPE' };

/**
 * In-memory {@link Store} that coordinates three single-purpose structures:
 *
 *   - `#values`   key -> tagged value (the data)
 *   - `#lru`      recency order for eviction ({@link LRUTracker})
 *   - `#expiry`   TTL deadlines ({@link ExpiryManager})
 *
 * The invariant is that `#values` and `#lru` hold exactly the same key set, and
 * `#expiry`'s keys are a subset. Every removal path funnels through the single
 * private {@link #removeKey} so the three structures can never drift apart, and
 * every read/write first runs {@link #expireIfNeeded} so an expired key is
 * reclaimed (including its LRU node) before it can be seen as live.
 *
 * TTL and LRU are entirely key-level: they never inspect a value's kind, so
 * strings, lists, and hashes expire and evict through exactly the same code.
 */
export class InMemoryStore implements Store, Sweepable {
  readonly #values = new Map<string, StoredValue>();
  readonly #lru = new LRUTracker();
  readonly #expiry = new ExpiryManager();
  readonly #maxKeys: number;
  readonly #now: () => number;
  readonly #onExpired: KeyLifecycleListener;
  readonly #onEvicted: KeyLifecycleListener;
  #evictionCount = 0;
  #dirtyCount = 0;

  constructor(options: InMemoryStoreOptions) {
    if (!Number.isInteger(options.maxKeys) || options.maxKeys < 1) {
      throw new Error(`maxKeys must be an integer >= 1, got ${options.maxKeys}`);
    }
    this.#maxKeys = options.maxKeys;
    this.#now = options.now ?? ((): number => Date.now());
    this.#onExpired = options.onExpired ?? ((): void => {});
    this.#onEvicted = options.onEvicted ?? ((): void => {});
  }

  // --- Strings ---

  get(key: string): string | undefined {
    if (this.#expireIfNeeded(key)) return undefined;
    const entry = this.#values.get(key);
    if (entry === undefined || entry.type !== 'string') return undefined;
    this.#lru.touch(key); // read counts as a use
    return entry.value;
  }

  set(key: string, value: string, ttlSeconds?: number): void {
    this.#expireIfNeeded(key);
    this.#reserveSlotFor(key); // SET overwrites any prior kind (Redis-faithful)
    this.#values.set(key, { type: 'string', value });
    this.#lru.touch(key);
    this.#dirtyCount++;
    if (ttlSeconds !== undefined) {
      this.#expiry.set(key, this.#now() + ttlSeconds * 1000);
    } else {
      this.#expiry.clear(key); // plain SET drops any prior TTL
    }
  }

  del(key: string): boolean {
    this.#expireIfNeeded(key); // an already-expired key counts as absent
    if (!this.#values.has(key)) return false;
    this.#removeKey(key);
    return true;
  }

  expire(key: string, seconds: number): boolean {
    if (this.#expireIfNeeded(key)) return false;
    if (!this.#values.has(key)) return false;
    this.#expiry.set(key, this.#now() + seconds * 1000);
    this.#lru.touch(key); // setting a TTL is a write, so it refreshes recency
    this.#dirtyCount++;
    return true;
  }

  exists(key: string): boolean {
    return !this.#expireIfNeeded(key) && this.#values.has(key);
  }

  ttl(key: string): number {
    if (this.#expireIfNeeded(key) || !this.#values.has(key)) return -2;
    const remMs = this.#expiry.remainingMs(key, this.#now());
    if (remMs === undefined) return -1;
    return Math.max(0, Math.ceil(remMs / 1000));
  }

  persist(key: string): boolean {
    if (this.#expireIfNeeded(key) || !this.#values.has(key)) return false;
    if (!this.#expiry.has(key)) return false;
    this.#expiry.clear(key);
    this.#lru.touch(key);
    this.#dirtyCount++;
    return true;
  }

  keys(pattern: string): string[] {
    const regexStr = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
    const regex = new RegExp(regexStr);
    const matched: string[] = [];
    for (const key of this.#values.keys()) {
      if (!this.#expireIfNeeded(key) && regex.test(key)) {
        matched.push(key);
      }
    }
    return matched;
  }

  // --- Type introspection ---

  keyType(key: string): ValueType | undefined {
    if (this.#expireIfNeeded(key)) return undefined;
    return this.#values.get(key)?.type; // a metadata probe: does not touch recency
  }

  // --- Lists ---

  lpush(key: string, values: readonly string[]): StoreResult<number> {
    if (this.#expireIfNeeded(key)) return this.#pushNewList(key, values);
    const entry = this.#values.get(key);
    if (entry === undefined) return this.#pushNewList(key, values);
    if (entry.type !== 'list') return WRONGTYPE;
    for (const v of values) entry.value.unshift(v);
    this.#lru.touch(key);
    this.#dirtyCount++;
    return { ok: true, value: entry.value.length };
  }

  lpop(key: string): StoreResult<string | undefined> {
    if (this.#expireIfNeeded(key)) return { ok: true, value: undefined };
    const entry = this.#values.get(key);
    if (entry === undefined) return { ok: true, value: undefined };
    if (entry.type !== 'list') return WRONGTYPE;
    const head = entry.value.shift();
    if (entry.value.length === 0) {
      this.#removeKey(key); // Redis drops a list key once it becomes empty
    } else {
      this.#lru.touch(key);
      this.#dirtyCount++;
    }
    return { ok: true, value: head };
  }

  lrange(key: string, start: number, stop: number): StoreResult<readonly string[]> {
    if (this.#expireIfNeeded(key)) return { ok: true, value: [] };
    const entry = this.#values.get(key);
    if (entry === undefined) return { ok: true, value: [] };
    if (entry.type !== 'list') return WRONGTYPE;
    this.#lru.touch(key);
    const len = entry.value.length;
    let from = start < 0 ? len + start : start;
    let to = stop < 0 ? len + stop : stop;
    if (from < 0) from = 0;
    if (to >= len) to = len - 1;
    if (from > to) return { ok: true, value: [] };
    return { ok: true, value: entry.value.slice(from, to + 1) };
  }

  rpush(key: string, values: readonly string[]): StoreResult<number> {
    if (this.#expireIfNeeded(key)) return this.#pushNewListTail(key, values);
    const entry = this.#values.get(key);
    if (entry === undefined) return this.#pushNewListTail(key, values);
    if (entry.type !== 'list') return WRONGTYPE;
    for (const v of values) entry.value.push(v);
    this.#lru.touch(key);
    this.#dirtyCount++;
    return { ok: true, value: entry.value.length };
  }

  rpop(key: string): StoreResult<string | undefined> {
    if (this.#expireIfNeeded(key)) return { ok: true, value: undefined };
    const entry = this.#values.get(key);
    if (entry === undefined) return { ok: true, value: undefined };
    if (entry.type !== 'list') return WRONGTYPE;
    const tail = entry.value.pop();
    if (entry.value.length === 0) {
      this.#removeKey(key);
    } else {
      this.#lru.touch(key);
      this.#dirtyCount++;
    }
    return { ok: true, value: tail };
  }

  llen(key: string): StoreResult<number> {
    if (this.#expireIfNeeded(key)) return { ok: true, value: 0 };
    const entry = this.#values.get(key);
    if (entry === undefined) return { ok: true, value: 0 };
    if (entry.type !== 'list') return WRONGTYPE;
    this.#lru.touch(key);
    return { ok: true, value: entry.value.length };
  }

  // --- Hashes ---

  hset(key: string, pairs: ReadonlyArray<readonly [string, string]>): StoreResult<number> {
    const expired = this.#expireIfNeeded(key);
    const entry = expired ? undefined : this.#values.get(key);
    if (entry !== undefined && entry.type !== 'hash') return WRONGTYPE;
    const map = entry?.value ?? this.#createHash(key);
    let added = 0;
    for (const [field, value] of pairs) {
      if (!map.has(field)) added++;
      map.set(field, value);
    }
    this.#lru.touch(key);
    if (pairs.length > 0) this.#dirtyCount++;
    return { ok: true, value: added };
  }

  hget(key: string, field: string): StoreResult<string | undefined> {
    if (this.#expireIfNeeded(key)) return { ok: true, value: undefined };
    const entry = this.#values.get(key);
    if (entry === undefined) return { ok: true, value: undefined };
    if (entry.type !== 'hash') return WRONGTYPE;
    this.#lru.touch(key);
    return { ok: true, value: entry.value.get(field) };
  }

  hdel(key: string, fields: readonly string[]): StoreResult<number> {
    if (this.#expireIfNeeded(key)) return { ok: true, value: 0 };
    const entry = this.#values.get(key);
    if (entry === undefined) return { ok: true, value: 0 };
    if (entry.type !== 'hash') return WRONGTYPE;
    let removed = 0;
    for (const field of fields) {
      if (entry.value.delete(field)) removed++;
    }
    if (entry.value.size === 0) {
      this.#removeKey(key);
    } else if (removed > 0) { // only bump LRU if we actually removed something? Or unconditionally? Redis touches if found. We'll touch unconditionally since it's a command on the key.
      this.#lru.touch(key);
      this.#dirtyCount++;
    }
    return { ok: true, value: removed };
  }

  hgetall(key: string): StoreResult<readonly string[]> {
    if (this.#expireIfNeeded(key)) return { ok: true, value: [] };
    const entry = this.#values.get(key);
    if (entry === undefined) return { ok: true, value: [] };
    if (entry.type !== 'hash') return WRONGTYPE;
    this.#lru.touch(key);
    const result: string[] = [];
    for (const [k, v] of entry.value.entries()) {
      result.push(k, v);
    }
    return { ok: true, value: result };
  }

  hlen(key: string): StoreResult<number> {
    if (this.#expireIfNeeded(key)) return { ok: true, value: 0 };
    const entry = this.#values.get(key);
    if (entry === undefined) return { ok: true, value: 0 };
    if (entry.type !== 'hash') return WRONGTYPE;
    this.#lru.touch(key);
    return { ok: true, value: entry.value.size };
  }

  /**
   * Active-sweep entry point: reclaims a bounded sample of expired keys that no
   * reader has touched. Delegates key selection to {@link ExpiryManager}; the
   * per-tick cost is O(sampleSize), not O(keyspace).
   */
  sweepExpired(sampleSize: number): number {
    const now = this.#now();
    const expired = this.#expiry.collectExpired(now, sampleSize);
    for (const key of expired) {
      this.#removeKey(key);
      this.#onExpired(key);
    }
    return expired.length;
  }

  /** Number of live keys currently stored. Diagnostic only — not on the wire. */
  get size(): number {
    return this.#values.size;
  }

  /** The configured max capacity of the store. */
  get maxKeys(): number {
    return this.#maxKeys;
  }

  /** Total number of evictions over the lifetime of the store. */
  get evictions(): number {
    return this.#evictionCount;
  }

  /** Gets the number of mutations. Resets when assigned to 0 (by persistence manager). */
  get dirtyCount(): number {
    return this.#dirtyCount;
  }

  set dirtyCount(val: number) {
    this.#dirtyCount = val;
  }

  /** Returns keys in Most-Recently-Used to Least-Recently-Used order. */
  *keysMRU(): IterableIterator<string> {
    for (const key of this.#lru.keysMRU()) {
      if (!this.#expireIfNeeded(key)) {
        yield key;
      }
    }
  }

  // --- Internals ---

  /** Creates an empty list at `key` (reserving an LRU slot), pushes `values`, returns the result. */
  #pushNewList(key: string, values: readonly string[]): StoreResult<number> {
    this.#reserveSlotFor(key);
    const list: string[] = [];
    this.#values.set(key, { type: 'list', value: list });
    for (const v of values) list.unshift(v);
    this.#lru.touch(key);
    return { ok: true, value: list.length };
  }

  /** Creates an empty list at `key` (reserving an LRU slot), pushes `values` to the tail, returns the result. */
  #pushNewListTail(key: string, values: readonly string[]): StoreResult<number> {
    this.#reserveSlotFor(key);
    const list: string[] = [];
    this.#values.set(key, { type: 'list', value: list });
    for (const v of values) list.push(v);
    this.#lru.touch(key);
    return { ok: true, value: list.length };
  }

  /** Creates an empty hash at `key` (reserving an LRU slot) and returns its backing map. */
  #createHash(key: string): Map<string, string> {
    this.#reserveSlotFor(key);
    const map = new Map<string, string>();
    this.#values.set(key, { type: 'hash', value: map });
    return map;
  }

  /** If inserting `key` would be a *new* key at capacity, evict the LRU key first. */
  #reserveSlotFor(key: string): void {
    if (!this.#values.has(key) && this.#values.size >= this.#maxKeys) {
      this.#makeRoomForNewKey();
    }
  }

  /**
   * If `key` is present but past its expiry, remove it fully and notify. Returns
   * true iff it was expired-and-removed. This is the single lazy-expiry gate all
   * public reads/writes pass through.
   */
  #expireIfNeeded(key: string): boolean {
    if (!this.#values.has(key)) return false;
    if (!this.#expiry.isExpired(key, this.#now())) return false;
    this.#removeKey(key);
    this.#onExpired(key);
    return true;
  }

  /** Evicts one key to make room for a new insertion, preferring the LRU key.
   * If the chosen victim happens to be expired it is reported as an expiry
   * rather than an eviction. Broader reclamation of other expired keys is the
   * sweeper's job (Redis-style: eviction targets the LRU key regardless). */
  #makeRoomForNewKey(): void {
    const victim = this.#lru.peekLRU();
    if (victim === undefined) return;
    const wasExpired = this.#expiry.isExpired(victim, this.#now());
    this.#removeKey(victim);
    if (wasExpired) {
      this.#onExpired(victim);
    } else {
      this.#evictionCount++;
      this.#onEvicted(victim);
    }
  }

  /** The one place a key is removed. Keeps all three structures in lockstep. */
  #removeKey(key: string): void {
    if (this.#values.has(key)) {
      this.#dirtyCount++;
      this.#values.delete(key);
      this.#lru.delete(key);
      this.#expiry.clear(key);
    }
  }
}
