/** The slice of the store the sweeper drives. Kept narrow so the timer shell
 * depends only on the sweep entry point, not the whole store. */
export interface Sweepable {
  /** Reclaims a bounded sample of expired keys; returns how many were removed. */
  sweepExpired(sampleSize: number): number;
}

/**
 * Thin impure shell around the pure sweep logic: a periodic timer that asks the
 * store to reclaim expired keys nobody is actively reading. All the decision
 * logic lives in {@link Sweepable.sweepExpired} / ExpiryManager; this class only
 * owns the `setInterval`.
 *
 * The timer is `unref`'d so it never keeps the process alive on its own, and it
 * is started only by the composition root — unit tests exercise the store's
 * sweep directly without spinning a real timer.
 */
export class ExpirySweeper {
  readonly #store: Sweepable;
  readonly #intervalMs: number;
  readonly #sampleSize: number;
  #timer: ReturnType<typeof setInterval> | undefined;

  constructor(store: Sweepable, intervalMs: number, sampleSize: number) {
    this.#store = store;
    this.#intervalMs = intervalMs;
    this.#sampleSize = sampleSize;
  }

  /** Starts the periodic sweep. Idempotent — a second call is a no-op while running. */
  start(): void {
    if (this.#timer !== undefined) return;
    this.#timer = setInterval(() => {
      this.#store.sweepExpired(this.#sampleSize);
    }, this.#intervalMs);
    this.#timer.unref();
  }

  /** Stops the periodic sweep. Idempotent. */
  stop(): void {
    if (this.#timer === undefined) return;
    clearInterval(this.#timer);
    this.#timer = undefined;
  }
}
