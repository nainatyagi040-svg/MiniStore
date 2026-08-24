import fs from 'node:fs/promises';
import path from 'node:path';
import type { InMemoryStore } from './InMemoryStore.js';
import type { ValueType } from './Store.js';

interface SerializedKey {
  type: ValueType;
  value: any;
  ttl?: number;
}

type Dump = Record<string, SerializedKey>;

export class PersistenceManager {
  readonly #store: InMemoryStore;
  readonly #dumpPath: string;
  readonly #saveIntervalMs: number;
  
  #timer: ReturnType<typeof setInterval> | undefined;
  #lastSavedDirtyCount = 0;
  #saveInProgress = false;

  constructor(store: InMemoryStore, dumpPath: string, saveIntervalMs: number) {
    this.#store = store;
    this.#dumpPath = dumpPath;
    this.#saveIntervalMs = saveIntervalMs;
  }

  /**
   * Starts the background interval for snapshotting.
   */
  start(): void {
    if (this.#timer) return;
    this.#timer = setInterval(() => {
      this.#checkAndSave().catch(e => console.error('Background save failed:', e));
    }, this.#saveIntervalMs);
  }

  /**
   * Stops the background interval.
   */
  stop(): void {
    if (this.#timer) {
      clearInterval(this.#timer);
      this.#timer = undefined;
    }
  }

  async #checkAndSave(): Promise<void> {
    if (this.#store.dirtyCount !== this.#lastSavedDirtyCount) {
      await this.save();
    }
  }

  /**
   * Triggers an immediate snapshot to disk.
   */
  async save(): Promise<void> {
    if (this.#saveInProgress) {
      throw new Error('Save already in progress');
    }
    this.#saveInProgress = true;
    
    // Capture dirty count BEFORE extracting data
    const currentDirtyCount = this.#store.dirtyCount;

    try {
      const dump: Dump = {};
      const keys = this.#store.keys('*');
      
      for (const key of keys) {
        const type = this.#store.keyType(key);
        if (!type) continue; // expired lazily during loop
        
        let value: any;
        if (type === 'string') {
          value = this.#store.get(key);
        } else if (type === 'list') {
          const res = this.#store.lrange(key, 0, -1);
          if (res.ok) value = res.value;
        } else if (type === 'hash') {
          const res = this.#store.hgetall(key);
          if (res.ok) {
            const arr = res.value;
            const obj: Record<string, string> = {};
            for (let i = 0; i < arr.length; i += 2) {
              obj[arr[i] as string] = arr[i + 1] as string;
            }
            value = obj;
          }
        }
        
        if (value === undefined) continue;

        const ttl = this.#store.ttl(key);
        const serialized: SerializedKey = { type, value };
        if (ttl >= 0) {
          serialized.ttl = ttl;
        }
        
        dump[key] = serialized;
      }

      const tempPath = this.#dumpPath + '.temp';
      await fs.writeFile(tempPath, JSON.stringify(dump), 'utf-8');
      await fs.rename(tempPath, this.#dumpPath);
      
      this.#lastSavedDirtyCount = currentDirtyCount;
    } finally {
      this.#saveInProgress = false;
    }
  }

  /**
   * Restores the store from the dump file, bypassing max capacity checks.
   * Expired keys are skipped.
   * Returns the number of keys successfully restored.
   */
  async restore(): Promise<number> {
    try {
      const data = await fs.readFile(this.#dumpPath, 'utf-8');
      const dump = JSON.parse(data) as Dump;
      
      let restoredCount = 0;
      for (const [key, serialized] of Object.entries(dump)) {
        if (serialized.ttl !== undefined && serialized.ttl <= 0) {
          continue; // skip keys that have 0 or negative TTL loaded from dump
        }
        
        const ttl = serialized.ttl;
        if (serialized.type === 'string') {
          this.#store.set(key, serialized.value as string, ttl);
          restoredCount++;
        } else if (serialized.type === 'list') {
          this.#store.rpush(key, serialized.value as string[]);
          if (ttl !== undefined) this.#store.expire(key, ttl);
          restoredCount++;
        } else if (serialized.type === 'hash') {
          const obj = serialized.value as Record<string, string>;
          const pairs = Object.entries(obj);
          this.#store.hset(key, pairs);
          if (ttl !== undefined) this.#store.expire(key, ttl);
          restoredCount++;
        }
      }
      
      this.#lastSavedDirtyCount = this.#store.dirtyCount;
      return restoredCount;
    } catch (e: any) {
      if (e.code === 'ENOENT') {
        // No dump file exists, this is fine on first startup
        return 0;
      }
      throw new Error(`Failed to restore from dump: ${e.message}`);
    }
  }
}
