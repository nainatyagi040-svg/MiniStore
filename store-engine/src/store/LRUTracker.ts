/**
 * Recency tracker for LRU eviction. A hashmap from key to a node in a
 * doubly linked list keeps every operation O(1):
 *
 *   head  <-> ... <-> tail
 *   (MRU)              (LRU)
 *
 * The head end is most-recently-used; the tail end is the next eviction
 * victim. This module is capacity-agnostic — it only maintains order. The
 * owner (the store) decides *when* to evict by calling {@link evictLRU}.
 *
 * Pure logic: no clock, no I/O, no knowledge of values or TTL.
 */

interface Node {
  readonly key: string;
  prev: Node | undefined;
  next: Node | undefined;
}

export class LRUTracker {
  readonly #nodes = new Map<string, Node>();
  #head: Node | undefined; // most-recently-used
  #tail: Node | undefined; // least-recently-used

  /** Number of tracked keys. */
  get size(): number {
    return this.#nodes.size;
  }

  /** Whether `key` is currently tracked. */
  has(key: string): boolean {
    return this.#nodes.has(key);
  }

  /**
   * Marks `key` as most-recently-used. Inserts it at the head if new, or
   * unlinks and re-inserts it at the head if it already exists. O(1).
   */
  touch(key: string): void {
    const existing = this.#nodes.get(key);
    if (existing !== undefined) {
      if (existing === this.#head) return; // already MRU, nothing to move
      this.#unlink(existing);
      this.#pushFront(existing);
      return;
    }
    const node: Node = { key, prev: undefined, next: undefined };
    this.#nodes.set(key, node);
    this.#pushFront(node);
  }

  /**
   * Removes `key` from tracking if present. Returns true if it was tracked.
   * O(1). Used both for explicit deletes and to clean up an expired key's
   * bookkeeping so no dangling node is left behind.
   */
  delete(key: string): boolean {
    const node = this.#nodes.get(key);
    if (node === undefined) return false;
    this.#unlink(node);
    this.#nodes.delete(key);
    return true;
  }

  /** Returns the least-recently-used key without removing it, or undefined if empty. */
  peekLRU(): string | undefined {
    return this.#tail?.key;
  }

  /**
   * Removes and returns the least-recently-used key, or undefined if empty.
   * O(1). This is the eviction primitive the store calls when at capacity.
   */
  evictLRU(): string | undefined {
    const victim = this.#tail;
    if (victim === undefined) return undefined;
    this.#unlink(victim);
    this.#nodes.delete(victim.key);
    return victim.key;
  }

  /** Yields keys in MRU to LRU order. */
  *keysMRU(): IterableIterator<string> {
    let current = this.#head;
    while (current !== undefined) {
      yield current.key;
      current = current.next;
    }
  }

  #pushFront(node: Node): void {
    node.prev = undefined;
    node.next = this.#head;
    if (this.#head !== undefined) {
      this.#head.prev = node;
    }
    this.#head = node;
    if (this.#tail === undefined) {
      this.#tail = node;
    }
  }

  #unlink(node: Node): void {
    const { prev, next } = node;
    if (prev !== undefined) {
      prev.next = next;
    } else {
      this.#head = next; // node was head
    }
    if (next !== undefined) {
      next.prev = prev;
    } else {
      this.#tail = prev; // node was tail
    }
    node.prev = undefined;
    node.next = undefined;
  }
}
