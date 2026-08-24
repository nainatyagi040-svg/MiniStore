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
  readonly #requirepass: string | undefined;
  readonly #disabledCommands: Set<string>;

  // Track per-connection transaction state: connection ID -> queued commands
  readonly #transactions = new Map<string, Array<{ line: string; command: any }>>();
  
  // Track authenticated connection IDs
  readonly #authenticated = new Set<string>();
  
  // Ring buffer of recent mutating commands (max 15)
  readonly #recentActivity: string[] = [];

  constructor(
    store: Store,
    persistenceManager?: PersistenceManager,
    aofWriter?: AofWriter,
    pubSubManager?: PubSubManager,
    requirepass?: string,
    disabledCommands?: Set<string>
  ) {
    this.#store = store;
    this.#persistenceManager = persistenceManager;
    this.#aofWriter = aofWriter;
    this.#pubSubManager = pubSubManager;
    this.#requirepass = requirepass;
    this.#disabledCommands = disabledCommands ?? new Set();
  }

  get recentActivity(): string[] {
    return this.#recentActivity;
  }

  #logActivity(line: string) {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false });
    this.#recentActivity.push(`${time} - ${line}`);
    if (this.#recentActivity.length > 15) {
      this.#recentActivity.shift();
    }
  }

  handleLine(line: string, connection: ClientConnection): string {
    const parsed = parseCommand(line);
    if (!parsed.ok) {
      return reply.error(parsed.message);
    }

    const command = parsed.command;

    if (this.#requirepass !== undefined && !this.#authenticated.has(connection.id)) {
      if (command.name === 'AUTH') {
        if (command.password === this.#requirepass) {
          this.#authenticated.add(connection.id);
          return reply.ok();
        } else {
          return reply.error('invalid password');
        }
      }
      return reply.error('NOAUTH Authentication required.');
    }

    if (this.#disabledCommands.has(command.name)) {
      return reply.error('command disabled');
    }

    // Subscribed connections are restricted
    if (this.#pubSubManager?.isSubscribed(connection)) {
      if (command.name !== 'SUBSCRIBE' && command.name !== 'UNSUBSCRIBE') {
        return reply.error('only (P)SUBSCRIBE / (P)UNSUBSCRIBE / PING / QUIT allowed in this context');
      }
    }

    const inTransaction = this.#transactions.has(connection.id);

    if (command.name === 'MULTI') {
      if (inTransaction) return reply.error('MULTI calls can not be nested');
      this.#transactions.set(connection.id, []);
      return reply.ok();
    }

    if (command.name === 'EXEC') {
      if (!inTransaction) return reply.error('EXEC without MULTI');
      const queue = this.#transactions.get(connection.id)!;
      this.#transactions.delete(connection.id);
      
      const results: string[] = [];
      for (const item of queue) {
        // Execute each command and capture the wire format reply
        results.push(this.#executeCommand(item.command, item.line, connection));
      }
      return reply.rawArray(results);
    }

    if (command.name === 'DISCARD') {
      if (!inTransaction) return reply.error('DISCARD without MULTI');
      this.#transactions.delete(connection.id);
      return reply.ok();
    }

    if (inTransaction) {
      this.#transactions.get(connection.id)!.push({ line, command });
      return reply.ok('QUEUED');
    }

    return this.#executeCommand(command, line, connection);
  }

  #executeCommand(command: any, line: string, connection: ClientConnection): string {
    switch (command.name) {
      case 'SET':
        this.#store.set(command.key, command.value, command.ttlSeconds);
        this.#aofWriter?.write(line);
        this.#logActivity(line);
        return reply.ok();
      case 'GET': {
        const kind = this.#store.keyType(command.key);
        if (kind !== undefined && kind !== 'string') return reply.wrongType();
        const found = this.#store.get(command.key);
        return found === undefined ? reply.nil() : reply.value(found);
      }
      case 'DEL': {
        const removed = this.#store.del(command.key);
        if (removed) {
          this.#aofWriter?.write(line);
          this.#logActivity(line);
        }
        return reply.integer(removed ? 1 : 0);
      }
      case 'EXPIRE': {
        const applied = this.#store.expire(command.key, command.seconds);
        if (applied) {
          this.#aofWriter?.write(line);
          this.#logActivity(line);
        }
        return reply.integer(applied ? 1 : 0);
      }
      case 'LPUSH': {
        const result = this.#store.lpush(command.key, command.values);
        if (result.ok) {
          this.#aofWriter?.write(line);
          this.#logActivity(line);
        }
        return result.ok ? reply.integer(result.value) : reply.wrongType();
      }
      case 'LPOP': {
        const result = this.#store.lpop(command.key);
        if (!result.ok) return reply.wrongType();
        if (result.value !== undefined) {
          this.#aofWriter?.write(line);
          this.#logActivity(line);
        }
        return result.value === undefined ? reply.nil() : reply.value(result.value);
      }
      case 'LRANGE': {
        const result = this.#store.lrange(command.key, command.start, command.stop);
        return result.ok ? reply.array(result.value) : reply.wrongType();
      }
      case 'HSET': {
        const result = this.#store.hset(command.key, command.pairs);
        if (result.ok && result.value > 0) {
          this.#aofWriter?.write(line);
          this.#logActivity(line);
        }
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
        if (applied) {
          this.#aofWriter?.write(line);
          this.#logActivity(line);
        }
        return reply.integer(applied ? 1 : 0);
      }
      case 'KEYS': {
        return reply.array(this.#store.keys(command.pattern));
      }
      case 'RPUSH': {
        const result = this.#store.rpush(command.key, command.values);
        if (result.ok) {
          this.#aofWriter?.write(line);
          this.#logActivity(line);
        }
        return result.ok ? reply.integer(result.value) : reply.wrongType();
      }
      case 'RPOP': {
        const result = this.#store.rpop(command.key);
        if (!result.ok) return reply.wrongType();
        if (result.value !== undefined) {
          this.#aofWriter?.write(line);
          this.#logActivity(line);
        }
        return result.value === undefined ? reply.nil() : reply.value(result.value);
      }
      case 'LLEN': {
        const result = this.#store.llen(command.key);
        return result.ok ? reply.integer(result.value) : reply.wrongType();
      }
      case 'HDEL': {
        const result = this.#store.hdel(command.key, command.fields);
        if (result.ok && result.value > 0) {
          this.#aofWriter?.write(line);
          this.#logActivity(line);
        }
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
        this.#persistenceManager.save().catch((e) => console.error('BGSAVE failed:', e));
        return reply.ok();
      }
      case 'BGREWRITEAOF': {
        if (!this.#aofWriter) {
          return reply.error('AOF not configured');
        }
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
      case 'AUTH': {
        // If requirepass is not set, or already authenticated, just return ok.
        // We handle actual password verification early in handleLine.
        return reply.ok();
      }
      default: {
        return reply.error(`unhandled command ${JSON.stringify(command)}`);
      }
    }
  }
}
