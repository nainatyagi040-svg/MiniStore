import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from '../src/CommandParser.js';

test('parses SET with key and value', () => {
  const result = parseCommand('SET foo bar');
  assert.deepEqual(result, { ok: true, command: { name: 'SET', key: 'foo', value: 'bar' } });
});

test('parses GET with a key', () => {
  const result = parseCommand('GET foo');
  assert.deepEqual(result, { ok: true, command: { name: 'GET', key: 'foo' } });
});

test('parses DEL with a key', () => {
  const result = parseCommand('DEL foo');
  assert.deepEqual(result, { ok: true, command: { name: 'DEL', key: 'foo' } });
});

test('command names are case-insensitive', () => {
  const result = parseCommand('sEt foo bar');
  assert.deepEqual(result, { ok: true, command: { name: 'SET', key: 'foo', value: 'bar' } });
});

test('collapses arbitrary whitespace between tokens', () => {
  const result = parseCommand('  SET   foo\tbar  ');
  assert.deepEqual(result, { ok: true, command: { name: 'SET', key: 'foo', value: 'bar' } });
});

test('rejects a multi-token value (single-token value grammar)', () => {
  const result = parseCommand('SET foo hello world');
  assert.equal(result.ok, false);
  assert.match((result as { message: string }).message, /wrong number of arguments for 'set'/);
});

test('rejects SET with a missing value', () => {
  const result = parseCommand('SET foo');
  assert.equal(result.ok, false);
});

test('rejects GET with extra arguments', () => {
  const result = parseCommand('GET foo bar');
  assert.equal(result.ok, false);
});

test('rejects an unknown command, preserving original casing in the message', () => {
  const result = parseCommand('BOGUS foo');
  assert.equal(result.ok, false);
  assert.match((result as { message: string }).message, /unknown command 'BOGUS'/);
});

test('rejects an empty line', () => {
  const result = parseCommand('   ');
  assert.equal(result.ok, false);
});

// --- EX suffix on SET ---

test('parses SET with an EX ttl suffix', () => {
  const result = parseCommand('SET foo bar EX 30');
  assert.deepEqual(result, {
    ok: true,
    command: { name: 'SET', key: 'foo', value: 'bar', ttlSeconds: 30 },
  });
});

test('the EX keyword is case-insensitive', () => {
  const result = parseCommand('SET foo bar ex 30');
  assert.equal(result.ok, true);
  assert.deepEqual((result as { command: unknown }).command, {
    name: 'SET',
    key: 'foo',
    value: 'bar',
    ttlSeconds: 30,
  });
});

test('a plain SET carries no ttlSeconds property', () => {
  const result = parseCommand('SET foo bar');
  assert.equal(result.ok, true);
  assert.equal(Object.hasOwn((result as { command: object }).command, 'ttlSeconds'), false);
});

test('rejects SET with a non-EX 4th/5th token', () => {
  const result = parseCommand('SET foo bar PX 30');
  assert.equal(result.ok, false);
  assert.match((result as { message: string }).message, /expected EX/);
});

test('rejects SET EX with a non-positive or non-integer ttl', () => {
  for (const ttl of ['0', '-5', '1.5', 'abc']) {
    const result = parseCommand(`SET foo bar EX ${ttl}`);
    assert.equal(result.ok, false, `EX ${ttl} should be rejected`);
  }
});

test('rejects SET with 4 tokens (dangling suffix)', () => {
  const result = parseCommand('SET foo bar EX');
  assert.equal(result.ok, false);
});

// --- EXPIRE command ---

test('parses EXPIRE key seconds', () => {
  const result = parseCommand('EXPIRE foo 60');
  assert.deepEqual(result, { ok: true, command: { name: 'EXPIRE', key: 'foo', seconds: 60 } });
});

test('EXPIRE is case-insensitive', () => {
  const result = parseCommand('expire foo 60');
  assert.equal(result.ok, true);
});

test('rejects EXPIRE with a non-positive seconds value', () => {
  for (const s of ['0', '-1', '2.5', 'x']) {
    const result = parseCommand(`EXPIRE foo ${s}`);
    assert.equal(result.ok, false, `EXPIRE ... ${s} should be rejected`);
  }
});

test('rejects EXPIRE with wrong arity', () => {
  assert.equal(parseCommand('EXPIRE foo').ok, false);
  assert.equal(parseCommand('EXPIRE foo 60 extra').ok, false);
});

// --- LPUSH / LPOP / LRANGE ---

test('parses LPUSH with a single value', () => {
  const result = parseCommand('LPUSH mylist a');
  assert.deepEqual(result, { ok: true, command: { name: 'LPUSH', key: 'mylist', values: ['a'] } });
});

test('parses LPUSH with multiple values, preserving argument order', () => {
  const result = parseCommand('LPUSH mylist a b c');
  assert.deepEqual(result, {
    ok: true,
    command: { name: 'LPUSH', key: 'mylist', values: ['a', 'b', 'c'] },
  });
});

test('rejects LPUSH with no values', () => {
  const result = parseCommand('LPUSH mylist');
  assert.equal(result.ok, false);
  assert.match((result as { message: string }).message, /wrong number of arguments for 'lpush'/);
});

test('parses LPOP with a key', () => {
  const result = parseCommand('LPOP mylist');
  assert.deepEqual(result, { ok: true, command: { name: 'LPOP', key: 'mylist' } });
});

test('rejects LPOP with wrong arity', () => {
  assert.equal(parseCommand('LPOP').ok, false);
  assert.equal(parseCommand('LPOP a b').ok, false);
});

test('parses LRANGE with positive bounds', () => {
  const result = parseCommand('LRANGE mylist 0 2');
  assert.deepEqual(result, {
    ok: true,
    command: { name: 'LRANGE', key: 'mylist', start: 0, stop: 2 },
  });
});

test('parses LRANGE with negative bounds', () => {
  const result = parseCommand('LRANGE mylist 0 -1');
  assert.deepEqual(result, {
    ok: true,
    command: { name: 'LRANGE', key: 'mylist', start: 0, stop: -1 },
  });
});

test('rejects LRANGE with non-integer bounds', () => {
  for (const bounds of ['a b', '0 x', '1.5 2']) {
    const result = parseCommand(`LRANGE mylist ${bounds}`);
    assert.equal(result.ok, false, `LRANGE ... ${bounds} should be rejected`);
  }
});

test('rejects LRANGE with wrong arity', () => {
  assert.equal(parseCommand('LRANGE mylist 0').ok, false);
  assert.equal(parseCommand('LRANGE mylist 0 1 2').ok, false);
});

// --- HSET / HGET ---

test('parses HSET with a single field/value pair', () => {
  const result = parseCommand('HSET h f1 v1');
  assert.deepEqual(result, {
    ok: true,
    command: { name: 'HSET', key: 'h', pairs: [['f1', 'v1']] },
  });
});

test('parses HSET with multiple field/value pairs', () => {
  const result = parseCommand('HSET h f1 v1 f2 v2');
  assert.deepEqual(result, {
    ok: true,
    command: { name: 'HSET', key: 'h', pairs: [['f1', 'v1'], ['f2', 'v2']] },
  });
});

test('rejects HSET with an odd number of field/value tokens', () => {
  const result = parseCommand('HSET h f1 v1 f2');
  assert.equal(result.ok, false);
  assert.match((result as { message: string }).message, /wrong number of arguments for 'hset'/);
});

test('rejects HSET with no field/value pairs', () => {
  const result = parseCommand('HSET h');
  assert.equal(result.ok, false);
});

test('parses HGET with key and field', () => {
  const res = parseCommand('HGET profile email');
  assert.deepStrictEqual(res, { ok: true, command: { name: 'HGET', key: 'profile', field: 'email' } });
});

test('rejects HGET with wrong arity', () => {
  const res = parseCommand('HGET profile');
  assert.strictEqual(res.ok, false);
  if (!res.ok) assert.match(res.message, /wrong number/);
});

test('parses EXISTS', () => {
  const res = parseCommand('EXISTS mykey');
  assert.deepStrictEqual(res, { ok: true, command: { name: 'EXISTS', key: 'mykey' } });
});

test('parses TTL', () => {
  const res = parseCommand('TTL mykey');
  assert.deepStrictEqual(res, { ok: true, command: { name: 'TTL', key: 'mykey' } });
});

test('parses PERSIST', () => {
  const res = parseCommand('PERSIST mykey');
  assert.deepStrictEqual(res, { ok: true, command: { name: 'PERSIST', key: 'mykey' } });
});

test('parses KEYS', () => {
  const res = parseCommand('KEYS user:*');
  assert.deepStrictEqual(res, { ok: true, command: { name: 'KEYS', pattern: 'user:*' } });
});

test('parses RPUSH', () => {
  const res = parseCommand('RPUSH q v1 v2');
  assert.deepStrictEqual(res, { ok: true, command: { name: 'RPUSH', key: 'q', values: ['v1', 'v2'] } });
});

test('parses RPOP', () => {
  const res = parseCommand('RPOP q');
  assert.deepStrictEqual(res, { ok: true, command: { name: 'RPOP', key: 'q' } });
});

test('parses LLEN', () => {
  const res = parseCommand('LLEN q');
  assert.deepStrictEqual(res, { ok: true, command: { name: 'LLEN', key: 'q' } });
});

test('parses HDEL', () => {
  const res = parseCommand('HDEL h f1 f2');
  assert.deepStrictEqual(res, { ok: true, command: { name: 'HDEL', key: 'h', fields: ['f1', 'f2'] } });
});

test('parses HGETALL', () => {
  const res = parseCommand('HGETALL h');
  assert.deepStrictEqual(res, { ok: true, command: { name: 'HGETALL', key: 'h' } });
});

test('parses HLEN', () => {
  const res = parseCommand('HLEN h');
  assert.deepStrictEqual(res, { ok: true, command: { name: 'HLEN', key: 'h' } });
});

test('list/hash command names are case-insensitive', () => {
  assert.equal(parseCommand('lpush k v').ok, true);
  assert.equal(parseCommand('hget k f').ok, true);
});
