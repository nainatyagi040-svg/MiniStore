/**
 * Wire-format reply builders. The protocol's response grammar lives here and
 * nowhere else:
 *   +  success        e.g. `+OK`
 *   $  bulk value     e.g. `$bar`   ($(nil) when the key is missing)
 *   :  integer        e.g. `:1`
 *   *  array header   e.g. `*2` followed by one `$item` line per element
 *   -  error          e.g. `-ERR ...` (`-WRONGTYPE ...` for a type mismatch)
 * Every reply is terminated with CRLF so line-oriented clients (telnet, nc)
 * frame responses correctly.
 */
const CRLF = '\r\n';

export function ok(message = 'OK'): string {
  return `+${message}${CRLF}`;
}

export function value(v: string): string {
  return `$${v}${CRLF}`;
}

export function nil(): string {
  return `$(nil)${CRLF}`;
}

export function integer(n: number): string {
  return `:${n}${CRLF}`;
}

/**
 * Multi-bulk array reply: a `*N` header line followed by one bulk line per
 * element (reusing the simplified `$item` bulk format). An empty array is just
 * `*0`. Used by LRANGE.
 */
export function array(items: readonly string[]): string {
  let out = `*${items.length}${CRLF}`;
  for (const item of items) {
    out += `$${item}${CRLF}`;
  }
  return out;
}

/**
 * Multi-bulk array reply without wrapping items as bulk strings.
 * Used by EXEC to return an array of already-formatted RESP replies (like integers, arrays, OKs).
 */
export function rawArray(replies: readonly string[]): string {
  let out = `*${replies.length}${CRLF}`;
  for (const rep of replies) {
    out += rep;
  }
  return out;
}

export function error(message: string): string {
  return `-ERR ${message}${CRLF}`;
}

/**
 * The Redis type-mismatch error, sent verbatim: a distinct `-WRONGTYPE` prefix
 * (not `-ERR`) so clients can single it out. Message text matches real Redis.
 */
export function wrongType(): string {
  return `-WRONGTYPE Operation against a key holding the wrong kind of value${CRLF}`;
}

export function subscribe(channel: string, count: number): string {
  return array(['subscribe', channel, count.toString()]);
}

export function unsubscribe(channel: string, count: number): string {
  return array(['unsubscribe', channel, count.toString()]);
}

export function pushMessage(channel: string, message: string): string {
  return array(['message', channel, message]);
}
