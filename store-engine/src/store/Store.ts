/**
 * The storage contract. Implementations own the data; they know nothing about
 * sockets, HTTP, or events. Keeping this an interface lets the engine swap the
 * backing implementation without touching callers.
 *
 * Reads and writes are expiry-aware: any operation that touches a key first
 * checks whether it has expired and, if so, treats it as absent.
 *
 * A key holds exactly one of three value kinds — a string, a list, or a hash.
 * Operations for one kind against a key holding another return a `WRONGTYPE`
 * error *as a value* (see {@link StoreResult}) rather than throwing or
 * corrupting data — mirroring Redis. TTL and LRU are key-level and value-kind
 * agnostic, so every kind expires and is evicted identically.
 */

/** The kind of value a key holds. `keyType` returns undefined for an absent key. */
export type ValueType = 'string' | 'list' | 'hash';

/** The only structured error a store operation can return: a type mismatch. */
export type StoreError = 'WRONGTYPE';

/**
 * Result of an operation that can fail with a typed error. Errors are values,
 * not exceptions — consistent with the parser's {@link ParseResult}. The caller
 * maps `{ ok: false }` to the wire error and `{ ok: true }` to a normal reply.
 */
export type StoreResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: StoreError };

export interface Store {
  // --- Strings (unchanged from the string/TTL/LRU slices) ---

  /**
   * Returns the value for `key`, or `undefined` if absent or expired. Note: this
   * returns `undefined` for a key that holds a list or hash too; the wrong-type
   * distinction for the string GET command is made by the handler via
   * {@link keyType}. New list/hash methods surface WRONGTYPE directly.
   */
  get(key: string): string | undefined;
  /**
   * Sets `key` to a string `value`, overwriting any existing value *of any kind*
   * (Redis-faithful: SET replaces a list or hash with a string, no WRONGTYPE).
   * When `ttlSeconds` is given the key expires that many seconds from now; when
   * omitted, any existing expiry on the key is cleared (a plain SET is persistent).
   */
  set(key: string, value: string, ttlSeconds?: number): void;
  /** Deletes `key` of any kind. Returns `true` if a live key was removed, `false` otherwise. */
  del(key: string): boolean;
  /**
   * Sets an expiry of `seconds` from now on an existing key of any kind. Returns
   * `true` if the key exists and the expiry was applied, `false` if the key is
   * absent or already expired.
   */
  expire(key: string, seconds: number): boolean;
  /**
   * Returns true if `key` exists (and is not expired).
   */
  exists(key: string): boolean;
  /**
   * Returns remaining TTL in seconds if key has expiry, -1 if no expiry, -2 if absent/expired.
   */
  ttl(key: string): number;
  /**
   * Removes expiry from `key`. Returns true if an expiry was removed.
   */
  persist(key: string): boolean;
  /**
   * Returns all keys matching `pattern` (simple glob `*`).
   */
  keys(pattern: string): string[];

  // --- Type introspection ---

  /** The kind of value `key` holds, or `undefined` if absent/expired. */
  keyType(key: string): ValueType | undefined;

  // --- Lists (head = index 0) ---

  /**
   * Pushes `values` onto the head of the list at `key` (leftmost value in the
   * argument list ends up furthest left, matching Redis LPUSH), creating the
   * list if absent. Returns the new length. WRONGTYPE if `key` holds a non-list.
   */
  lpush(key: string, values: readonly string[]): StoreResult<number>;
  /**
   * Removes and returns the head element of the list at `key`, or `undefined` if
   * the key is absent or the list is empty. WRONGTYPE if `key` holds a non-list.
   */
  lpop(key: string): StoreResult<string | undefined>;
  /**
   * Returns the elements of the list at `key` between `start` and `stop`
   * inclusive, Redis-style: negative indices count from the end (-1 = last),
   * out-of-range bounds are clamped, and an empty/absent list yields `[]`.
   * WRONGTYPE if `key` holds a non-list.
   */
  lrange(key: string, start: number, stop: number): StoreResult<readonly string[]>;
  /**
   * Pushes `values` onto the tail of the list at `key`, creating the list if
   * absent. Returns the new length. WRONGTYPE if `key` holds a non-list.
   */
  rpush(key: string, values: readonly string[]): StoreResult<number>;
  /**
   * Removes and returns the tail element of the list at `key`, or `undefined` if
   * the key is absent or the list is empty. WRONGTYPE if `key` holds a non-list.
   */
  rpop(key: string): StoreResult<string | undefined>;
  /**
   * Returns the length of the list at `key`. 0 if absent. WRONGTYPE if non-list.
   */
  llen(key: string): StoreResult<number>;

  // --- Hashes ---

  /**
   * Sets each `[field, value]` pair on the hash at `key`, creating the hash if
   * absent. Returns the number of fields that were *newly added* (not those that
   * overwrote an existing field). WRONGTYPE if `key` holds a non-hash.
   */
  hset(key: string, pairs: ReadonlyArray<readonly [string, string]>): StoreResult<number>;
  /**
   * Returns the value of `field` on the hash at `key`, or `undefined` if the key
   * or field is absent. WRONGTYPE if `key` holds a non-hash.
   */
  hget(key: string, field: string): StoreResult<string | undefined>;
  /**
   * Removes `fields` from the hash at `key`. Returns the number of fields
   * actually removed. WRONGTYPE if `key` holds a non-hash.
   */
  hdel(key: string, fields: readonly string[]): StoreResult<number>;
  /**
   * Returns all fields and values of the hash at `key` as an alternating array.
   * WRONGTYPE if `key` holds a non-hash.
   */
  hgetall(key: string): StoreResult<readonly string[]>;
  /**
   * Returns the number of fields in the hash at `key`. WRONGTYPE if non-hash.
   */
  hlen(key: string): StoreResult<number>;
}
