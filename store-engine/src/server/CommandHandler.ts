import { parseCommand, reply } from '@ministore/protocol';
import type { Store } from '../store/Store.js';
import type { PersistenceManager } from '../store/PersistenceManager.js';
import type { AofWriter } from '../store/AofWriter.js';
import type { InMemoryStore } from '../store/InMemoryStore.js';
import type { ClientConnection } from './TcpServer.js';
import type { PubSubManager } from './PubSubManager.js';

/**
 * The glue between transport and storage: given one raw protocol line, parse
 * it, execute it against the {@link Store}, and return the wire reply string.
 *
 * This is the only layer that knows both what a command means and how the store
 * behaves. It keeps {@link TcpServer} ignorant of command semantics and the
 * {@link Store} ignorant of sockets and the wire protocol.
 */
export class CommandHandler {
  readonly #store: Store;
  readonly #persistenceManager: PersistenceManager | undefined;
  readonly #aofWriter: AofWriter | undefined;
  readonly #pubSubManager: PubSubManager | undefined;

  constructor(
    store: Store,
    persistenceManager?: PersistenceManager,
    aofWriter?: AofWriter,
    pubSubManager?: PubSubManager
  ) {
    this.#store = store;
    this.#persistenceManager = persistenceManager;
    this.#aofWriter = aofWriter;
    this.#pubSubManager = pubSubManager;
  }

  handleLine(line: string, connection: ClientConnection): string {
    const parsed = parseCommand(line);
    if (!parsed.ok) {
      return reply.error(parsed.message);
    }

    const command = parsed.command;

    // Subscribed connections are restricted to SUBSCRIBE, UNSUBSCRIBE, PING, QUIT
    // Since we don't have PING/QUIT implemented yet, just allow SUBSCRIBE/UNSUBSCRIBE
    if (this.#pubSubManager?.isSubscribed(connection)) {
      if (command.name !== 'SUBSCRIBE' && command.name !== 'UNSUBSCRIBE') {
        return reply.error('only (P)SUBSCRIBE / (P)UNSUBSCRIBE / PING / QUIT allowed in this context');
      }
    }
    switch (command.name) {
      case 'SET':
        this.#store.set(command.key, command.value, command.ttlSeconds);
        this.#aofWriter?.write(line);
        return reply.ok();
      case 'GET': {
        // A string GET against a list/hash key is a type error. The store's
        // get() returns undefined for any non-string kind, so we consult
        // keyType to tell "absent" apart from "present but wrong kind".
        const kind = this.#store.keyType(command.key);
        if (kind !== undefined && kind !== 'string') return reply.wrongType();
        const found = this.#store.get(command.key);
        return found === undefined ? reply.nil() : reply.value(found);
      }
      case 'DEL': {
        const removed = this.#store.del(command.key);
        if (removed) this.#aofWriter?.write(line);
        return reply.integer(removed ? 1 : 0);
      }
      case 'EXPIRE': {
        const applied = this.#store.expire(command.key, command.seconds);
        if (applied) this.#aofWriter?.write(line);
        return reply.integer(applied ? 1 : 0);
      }
      case 'LPUSH': {
        const result = this.#store.lpush(command.key, command.values);
        if (result.ok) this.#aofWriter?.write(line);
        return result.ok ? reply.integer(result.value) : reply.wrongType();
      }
      case 'LPOP': {
        const result = this.#store.lpop(command.key);
        if (!result.ok) return reply.wrongType();
        if (result.value !== undefined) this.#aofWriter?.write(line);
        return result.value === undefined ? reply.nil() : reply.value(result.value);
      }
      case 'LRANGE': {
        const result = this.#store.lrange(command.key, command.start, command.stop);
        return result.ok ? reply.array(result.value) : reply.wrongType();
      }
      case 'HSET': {
        const result = this.#store.hset(command.key, command.pairs);
        if (result.ok && result.value > 0) this.#aofWriter?.write(line);
        return result.ok ? reply.integer(result.value) : reply.wrongType();
      }
      case 'HGET': {
        const result = this.#store.hget(command.key, command.field);
        if (!result.ok) return reply.wrongType();
        return result.value === undefined ? reply.nil() : reply.value(result.value);
      }
      case 'EXISTS': {
        return reply.integer(this.#store.exists(command.key) ? 1 : 0);
      }
      case 'TTL': {
        return reply.integer(this.#store.ttl(command.key));
      }
      case 'PERSIST': {
        const applied = this.#store.persist(command.key);
        if (applied) this.#aofWriter?.write(line);
        return reply.integer(applied ? 1 : 0);
      }
      case 'KEYS': {
        return reply.array(this.#store.keys(command.pattern));
      }
      case 'RPUSH': {
        const result = this.#store.rpush(command.key, command.values);
        if (result.ok) this.#aofWriter?.write(line);
        return result.ok ? reply.integer(result.value) : reply.wrongType();
      }
      case 'RPOP': {
        const result = this.#store.rpop(command.key);
        if (!result.ok) return reply.wrongType();
        if (result.value !== undefined) this.#aofWriter?.write(line);
        return result.value === undefined ? reply.nil() : reply.value(result.value);
      }
      case 'LLEN': {
        const result = this.#store.llen(command.key);
        return result.ok ? reply.integer(result.value) : reply.wrongType();
      }
      case 'HDEL': {
        const result = this.#store.hdel(command.key, command.fields);
        if (result.ok && result.value > 0) this.#aofWriter?.write(line);
        return result.ok ? reply.integer(result.value) : reply.wrongType();
      }
      case 'HGETALL': {
        const result = this.#store.hgetall(command.key);
        return result.ok ? reply.array(result.value) : reply.wrongType();
      }
      case 'HLEN': {
        const result = this.#store.hlen(command.key);
        return result.ok ? reply.integer(result.value) : reply.wrongType();
      }
      case 'BGSAVE': {
        if (!this.#persistenceManager) {
          return reply.error('persistence not configured');
        }
        // Fire and forget the save. We don't await because it shouldn't block the TCP handler.
        this.#persistenceManager.save().catch((e) => console.error('BGSAVE failed:', e));
        return reply.ok(); // Redis responds with +Background saving started, but +OK is fine per protocol slice rules or we can do +Background saving started
      }
      case 'BGREWRITEAOF': {
        if (!this.#aofWriter) {
          return reply.error('AOF not configured');
        }
        // Fire and forget the rewrite
        this.#aofWriter.rewrite(this.#store as InMemoryStore).catch((e) => console.error('BGREWRITEAOF failed:', e));
        return reply.ok();
      }
      case 'SUBSCRIBE': {
        if (!this.#pubSubManager) return reply.error('Pub/Sub not configured');
        const replies = this.#pubSubManager.subscribe(connection, command.channels);
        return replies.join('');
      }
      case 'UNSUBSCRIBE': {
        if (!this.#pubSubManager) return reply.error('Pub/Sub not configured');
        const replies = this.#pubSubManager.unsubscribe(connection, command.channels);
        return replies.join('');
      }
      case 'PUBLISH': {
        if (!this.#pubSubManager) return reply.error('Pub/Sub not configured');
        const count = this.#pubSubManager.publish(command.channel, command.message);
        return reply.integer(count);
      }
      default: {
        // Exhaustiveness guard: if a new Command variant is added without a
        // case here, this fails to compile.
        const _exhaustive: never = command;
        return reply.error(`unhandled command ${JSON.stringify(_exhaustive)}`);
      }
    }
  }
}
