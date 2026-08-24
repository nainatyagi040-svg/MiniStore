/**
 * Structured commands produced by the parser. This slice covers SET, GET, DEL.
 * New commands extend the union; the compiler then forces every consumer
 * (e.g. the handler's switch) to account for them.
 */
export interface SetCommand {
  readonly name: 'SET';
  readonly key: string;
  readonly value: string;
  /** Optional TTL in seconds from the `EX seconds` suffix; omitted for a plain SET. */
  readonly ttlSeconds?: number;
}

export interface GetCommand {
  readonly name: 'GET';
  readonly key: string;
}

export interface DelCommand {
  readonly name: 'DEL';
  readonly key: string;
}

export interface ExpireCommand {
  readonly name: 'EXPIRE';
  readonly key: string;
  readonly seconds: number;
}

export interface LpushCommand {
  readonly name: 'LPUSH';
  readonly key: string;
  /** One or more values, pushed onto the head in argument order (leftmost ends up furthest left). */
  readonly values: readonly string[];
}

export interface LpopCommand {
  readonly name: 'LPOP';
  readonly key: string;
}

export interface LrangeCommand {
  readonly name: 'LRANGE';
  readonly key: string;
  /** Inclusive bounds; negative indices count from the end (Redis-style). */
  readonly start: number;
  readonly stop: number;
}

export interface HsetCommand {
  readonly name: 'HSET';
  readonly key: string;
  /** One or more `[field, value]` pairs to set. */
  readonly pairs: ReadonlyArray<readonly [string, string]>;
}

export interface HgetCommand {
  readonly name: 'HGET';
  readonly key: string;
  readonly field: string;
}

export interface ExistsCommand {
  readonly name: 'EXISTS';
  readonly key: string;
}

export interface TtlCommand {
  readonly name: 'TTL';
  readonly key: string;
}

export interface PersistCommand {
  readonly name: 'PERSIST';
  readonly key: string;
}

export interface KeysCommand {
  readonly name: 'KEYS';
  readonly pattern: string;
}

export interface RpushCommand {
  readonly name: 'RPUSH';
  readonly key: string;
  readonly values: readonly string[];
}

export interface RpopCommand {
  readonly name: 'RPOP';
  readonly key: string;
}

export interface LlenCommand {
  readonly name: 'LLEN';
  readonly key: string;
}

export interface HdelCommand {
  readonly name: 'HDEL';
  readonly key: string;
  /** One or more fields to remove. */
  readonly fields: readonly string[];
}

export interface HgetallCommand {
  readonly name: 'HGETALL';
  readonly key: string;
}

export interface HlenCommand {
  readonly name: 'HLEN';
  readonly key: string;
}

/**
 * Triggers a background snapshot of the store to disk.
 *
 * Syntax: BGSAVE
 */
export interface BgsaveCommand {
  readonly name: 'BGSAVE';
}

export interface BgrewriteaofCommand {
  readonly name: 'BGREWRITEAOF';
}

export interface SubscribeCommand {
  readonly name: 'SUBSCRIBE';
  readonly channels: readonly string[];
}

export interface UnsubscribeCommand {
  readonly name: 'UNSUBSCRIBE';
  readonly channels: readonly string[];
}

export interface PublishCommand {
  readonly name: 'PUBLISH';
  readonly channel: string;
  readonly message: string;
}

export interface MultiCommand {
  readonly name: 'MULTI';
}

export interface ExecCommand {
  readonly name: 'EXEC';
}

export interface DiscardCommand {
  readonly name: 'DISCARD';
}

export interface AuthCommand {
  readonly name: 'AUTH';
  readonly password: string;
}

export type Command =
  | SetCommand
  | GetCommand
  | DelCommand
  | ExpireCommand
  | LpushCommand
  | LpopCommand
  | LrangeCommand
  | HsetCommand
  | HgetCommand
  | ExistsCommand
  | TtlCommand
  | PersistCommand
  | KeysCommand
  | RpushCommand
  | RpopCommand
  | LlenCommand
  | HdelCommand
  | HgetallCommand
  | HlenCommand
  | BgsaveCommand
  | BgrewriteaofCommand
  | SubscribeCommand
  | UnsubscribeCommand
  | PublishCommand
  | MultiCommand
  | ExecCommand
  | DiscardCommand
  | AuthCommand;

/** A malformed line. Parse errors are expected input, not exceptions, so they are values. */
export interface ParseError {
  readonly ok: false;
  readonly message: string;
}

export interface ParseSuccess {
  readonly ok: true;
  readonly command: Command;
}

export type ParseResult = ParseSuccess | ParseError;
