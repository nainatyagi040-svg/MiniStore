/**
 * Runtime configuration for the store engine, sourced from environment
 * variables with safe defaults. This is the single place env is read.
 */
export interface ServerConfig {
  /** Interface to bind. Defaults to loopback so the raw, unauthenticated store is not network-exposed. */
  readonly host: string;
  /** TCP port to listen on. Defaults to 6380 to avoid clashing with a real Redis on 6379. */
  readonly port: number;
  /** Maximum bytes an unterminated command line may occupy before the connection is rejected. */
  readonly maxLineBytes: number;
  /** Maximum number of live keys before LRU eviction kicks in. */
  readonly maxKeys: number;
  /** How often the active expiry sweep runs, in milliseconds. */
  readonly sweepIntervalMs: number;
  /** How many TTL-bearing keys the sweep samples per tick. */
  readonly sweepSampleSize: number;
  /** Path to the persistence dump file. Defaults to 'dump.json'. */
  readonly dumpPath: string;
  /** Interval in milliseconds to check and save the dump file if there are changes. Defaults to 60000. */
  readonly saveIntervalMs: number;
  /** Port for the websocket stats server. Defaults to 8090. */
  readonly statsPort: number;
  /** Path to the append-only file. Defaults to 'appendonly.aof'. */
  readonly aofPath: string;
  /** Fsync policy: 'always' (sync every write), 'everysec' (sync every second), 'no' (OS buffers). Defaults to 'everysec'. */
  readonly aofFsync: 'always' | 'everysec' | 'no';
  /** Optional password required for TCP client authentication. */
  readonly requirepass?: string;
  /** Optional password required for dashboard websocket connections. */
  readonly dashboardPassword?: string;
  /** Set of commands disabled in production. */
  readonly disabledCommands: Set<string>;
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 6380;
const DEFAULT_MAX_LINE_BYTES = 64 * 1024; // 64 KiB
const DEFAULT_MAX_KEYS = 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 1000;
const DEFAULT_SWEEP_SAMPLE_SIZE = 20;
const DEFAULT_DUMP_PATH = './data/dump.json';
const DEFAULT_SAVE_INTERVAL_MS = 60000;
const DEFAULT_AOF_PATH = './data/appendonly.aof';
const DEFAULT_AOF_FSYNC = 'everysec';

function parseIntInRange(
  raw: string | undefined,
  fallback: number,
  name: string,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new Error(`Invalid ${name} "${raw}": expected an integer in ${min}..${max}`);
  }
  return n;
}

export function loadConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const host = env.MINISTORE_HOST?.trim();
  const dumpPath = env.MINISTORE_DUMP_PATH?.trim();
  const aofPath = env.MINISTORE_AOF_PATH?.trim();
  const aofFsync = (env.MINISTORE_AOF_FSYNC?.trim() ?? DEFAULT_AOF_FSYNC) as 'always' | 'everysec' | 'no';
  if (!['always', 'everysec', 'no'].includes(aofFsync)) {
    throw new Error(`Invalid MINISTORE_AOF_FSYNC "${aofFsync}": expected 'always', 'everysec', or 'no'`);
  }
  
  const requirepass = env.MINISTORE_REQUIREPASS?.trim() || undefined;
  const dashboardPassword = env.MINISTORE_DASHBOARD_PASSWORD?.trim() || undefined;
  
  const disabledStr = env.MINISTORE_DISABLED_COMMANDS?.trim();
  const disabledCommands = new Set<string>();
  if (disabledStr) {
    for (const cmd of disabledStr.split(',')) {
      const trimmed = cmd.trim().toUpperCase();
      if (trimmed) disabledCommands.add(trimmed);
    }
  }

  const config: ServerConfig = {
    host: host !== undefined && host.length > 0 ? host : DEFAULT_HOST,
    port: parseIntInRange(env.MINISTORE_PORT, DEFAULT_PORT, 'MINISTORE_PORT', 1, 65535),
    maxLineBytes: parseIntInRange(
      env.MINISTORE_MAX_LINE_BYTES,
      DEFAULT_MAX_LINE_BYTES,
      'MINISTORE_MAX_LINE_BYTES',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    maxKeys: parseIntInRange(
      env.MINISTORE_MAX_KEYS,
      DEFAULT_MAX_KEYS,
      'MINISTORE_MAX_KEYS',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    sweepIntervalMs: parseIntInRange(
      env.MINISTORE_SWEEP_INTERVAL_MS,
      DEFAULT_SWEEP_INTERVAL_MS,
      'MINISTORE_SWEEP_INTERVAL_MS',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    sweepSampleSize: parseIntInRange(
      env.MINISTORE_SWEEP_SAMPLE_SIZE,
      DEFAULT_SWEEP_SAMPLE_SIZE,
      'MINISTORE_SWEEP_SAMPLE_SIZE',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    dumpPath: dumpPath !== undefined && dumpPath.length > 0 ? dumpPath : DEFAULT_DUMP_PATH,
    saveIntervalMs: parseIntInRange(
      env.MINISTORE_SAVE_INTERVAL_MS,
      DEFAULT_SAVE_INTERVAL_MS,
      'MINISTORE_SAVE_INTERVAL_MS',
      1,
      Number.MAX_SAFE_INTEGER,
    ),
    statsPort: env.PORT ? parseInt(env.PORT, 10) : parseIntInRange(env.MINISTORE_STATS_PORT, 8090, 'MINISTORE_STATS_PORT', 1, 65535),
    aofPath: aofPath !== undefined && aofPath.length > 0 ? aofPath : DEFAULT_AOF_PATH,
    aofFsync,
    disabledCommands,
    ...(requirepass !== undefined ? { requirepass } : {}),
    ...(dashboardPassword !== undefined ? { dashboardPassword } : {}),
  };
  
  return config;
}
