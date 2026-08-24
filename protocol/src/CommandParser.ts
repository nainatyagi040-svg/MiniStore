import type { Command, ParseResult } from './Command.js';

/**
 * Turns one raw protocol line into a structured {@link Command}, or a parse
 * error. Pure: no I/O, no storage. Arguments are whitespace-separated tokens;
 * values are a single token (no embedded spaces) so that the `EX seconds`
 * suffix on SET stays unambiguous.
 */
export function parseCommand(line: string): ParseResult {
  const tokens = line.trim().split(/\s+/).filter((t) => t.length > 0);
  if (tokens.length === 0) {
    return err('empty command');
  }

  const name = tokens[0]!.toUpperCase();
  switch (name) {
    case 'SET':
      return parseSet(tokens);
    case 'GET': {
      if (tokens.length !== 2) return arityError('get');
      return ok({ name: 'GET', key: tokens[1]! });
    }
    case 'DEL': {
      if (tokens.length !== 2) return arityError('del');
      return ok({ name: 'DEL', key: tokens[1]! });
    }
    case 'EXPIRE': {
      if (tokens.length !== 3) return arityError('expire');
      const seconds = parsePositiveInt(tokens[2]!);
      if (seconds === undefined) return err('seconds must be a positive integer');
      return ok({ name: 'EXPIRE', key: tokens[1]!, seconds });
    }
    case 'LPUSH':
      return parseLpush(tokens);
    case 'LPOP': {
      if (tokens.length !== 2) return arityError('lpop');
      return ok({ name: 'LPOP', key: tokens[1]! });
    }
    case 'LRANGE': {
      if (tokens.length !== 4) return arityError('lrange');
      const start = parseSignedInt(tokens[2]!);
      const stop = parseSignedInt(tokens[3]!);
      if (start === undefined || stop === undefined) {
        return err('start and stop must be integers');
      }
      return ok({ name: 'LRANGE', key: tokens[1]!, start, stop });
    }
    case 'HSET':
      return parseHset(tokens);
    case 'HGET': {
      if (tokens.length !== 3) return arityError('hget');
      return ok({ name: 'HGET', key: tokens[1]!, field: tokens[2]! });
    }
    case 'EXISTS': {
      if (tokens.length !== 2) return arityError('exists');
      return ok({ name: 'EXISTS', key: tokens[1]! });
    }
    case 'TTL': {
      if (tokens.length !== 2) return arityError('ttl');
      return ok({ name: 'TTL', key: tokens[1]! });
    }
    case 'PERSIST': {
      if (tokens.length !== 2) return arityError('persist');
      return ok({ name: 'PERSIST', key: tokens[1]! });
    }
    case 'KEYS': {
      if (tokens.length !== 2) return arityError('keys');
      return ok({ name: 'KEYS', pattern: tokens[1]! });
    }
    case 'RPUSH':
      return parseRpush(tokens);
    case 'RPOP': {
      if (tokens.length !== 2) return arityError('rpop');
      return ok({ name: 'RPOP', key: tokens[1]! });
    }
    case 'LLEN': {
      if (tokens.length !== 2) return arityError('llen');
      return ok({ name: 'LLEN', key: tokens[1]! });
    }
    case 'HDEL':
      return parseHdel(tokens);
    case 'HGETALL': {
      if (tokens.length !== 2) return arityError('hgetall');
      return ok({ name: 'HGETALL', key: tokens[1]! });
    }
    case 'HLEN':
      return parseHlen(tokens);
    case 'BGSAVE':
      return parseBgsave(tokens);
    case 'BGREWRITEAOF':
      return parseBgrewriteaof(tokens);
    case 'SUBSCRIBE':
      return parseSubscribe(tokens);
    case 'UNSUBSCRIBE':
      return parseUnsubscribe(tokens);
    case 'PUBLISH':
      return parsePublish(tokens);
    default:
      return err(`unknown command '${tokens[0]!}'`);
  }
}

/** SET key value | SET key value EX seconds */
function parseSet(tokens: string[]): ParseResult {
  if (tokens.length === 3) {
    return ok({ name: 'SET', key: tokens[1]!, value: tokens[2]! });
  }
  if (tokens.length === 5) {
    if (tokens[3]!.toUpperCase() !== 'EX') {
      return err(`syntax error near '${tokens[3]!}' (expected EX)`);
    }
    const seconds = parsePositiveInt(tokens[4]!);
    if (seconds === undefined) return err('EX seconds must be a positive integer');
    // Property is only present when a TTL was given (exactOptionalPropertyTypes).
    return ok({ name: 'SET', key: tokens[1]!, value: tokens[2]!, ttlSeconds: seconds });
  }
  return arityError('set');
}

/** LPUSH key value [value ...] — at least one value required. */
function parseLpush(tokens: string[]): ParseResult {
  if (tokens.length < 3) return arityError('lpush');
  return ok({ name: 'LPUSH', key: tokens[1]!, values: tokens.slice(2) });
}

/** RPUSH key value [value ...] — at least one value required. */
function parseRpush(tokens: string[]): ParseResult {
  if (tokens.length < 3) return arityError('rpush');
  return ok({ name: 'RPUSH', key: tokens[1]!, values: tokens.slice(2) });
}

/** HSET key field value [field value ...] — one or more field/value pairs. */
function parseHset(tokens: string[]): ParseResult {
  // tokens[0]=HSET, tokens[1]=key, then field/value pairs: need an even count >= 2.
  const rest = tokens.slice(2);
  if (rest.length < 2 || rest.length % 2 !== 0) return arityError('hset');
  const pairs: Array<readonly [string, string]> = [];
  for (let i = 0; i < rest.length; i += 2) {
    pairs.push([rest[i]!, rest[i + 1]!]);
  }
  return ok({ name: 'HSET', key: tokens[1]!, pairs });
}

/** HDEL key field [field ...] — at least one field required. */
function parseHdel(tokens: string[]): ParseResult {
  if (tokens.length < 3) return arityError('hdel');
  return ok({ name: 'HDEL', key: tokens[1]!, fields: tokens.slice(2) });
}

/** HLEN key — returns length of hash. */
function parseHlen(tokens: string[]): ParseResult {
  if (tokens.length !== 2) return arityError('hlen');
  return ok({ name: 'HLEN', key: tokens[1]! });
}

/** BGSAVE — triggers background save. */
function parseBgsave(tokens: string[]): ParseResult {
  if (tokens.length !== 1) return arityError('bgsave');
  return ok({ name: 'BGSAVE' });
}

/** BGREWRITEAOF — triggers AOF compaction. */
function parseBgrewriteaof(tokens: string[]): ParseResult {
  if (tokens.length !== 1) return arityError('bgrewriteaof');
  return ok({ name: 'BGREWRITEAOF' });
}

/** SUBSCRIBE channel [channel...] */
function parseSubscribe(tokens: string[]): ParseResult {
  if (tokens.length < 2) return arityError('subscribe');
  return ok({ name: 'SUBSCRIBE', channels: tokens.slice(1) });
}

/** UNSUBSCRIBE [channel...] */
function parseUnsubscribe(tokens: string[]): ParseResult {
  return ok({ name: 'UNSUBSCRIBE', channels: tokens.slice(1) });
}

/** PUBLISH channel message */
function parsePublish(tokens: string[]): ParseResult {
  if (tokens.length !== 3) return arityError('publish');
  return ok({ name: 'PUBLISH', channel: tokens[1]!, message: tokens[2]! });
}

/** Upper bound (~317 years) so that `now + seconds * 1000` stays a safe integer. */
const MAX_TTL_SECONDS = 9_999_999_999;

/** Parses a strictly positive integer TTL in seconds, or undefined if invalid. */
function parsePositiveInt(token: string): number | undefined {
  if (!/^\d+$/.test(token)) return undefined;
  const n = Number(token);
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_TTL_SECONDS) return undefined;
  return n;
}

/** Parses a signed integer index (LRANGE bounds), or undefined if invalid.
 * Allows a leading `-`; negative indices count from the list's end. */
function parseSignedInt(token: string): number | undefined {
  if (!/^-?\d+$/.test(token)) return undefined;
  const n = Number(token);
  if (!Number.isSafeInteger(n)) return undefined;
  return n;
}

function ok(command: Command): ParseResult {
  return { ok: true, command };
}

function err(message: string): ParseResult {
  return { ok: false, message };
}

function arityError(command: string): ParseResult {
  return err(`wrong number of arguments for '${command}' command`);
}
