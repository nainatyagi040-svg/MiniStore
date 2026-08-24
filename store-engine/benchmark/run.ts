import net from 'node:net';
import { performance } from 'node:perf_hooks';
import { ReplyParser } from '@ministore/protocol';
import type { Reply } from '@ministore/protocol';

class BenchmarkClient {
  #socket: net.Socket;
  #parser: ReplyParser;
  #waiters: Array<(reply: Reply) => void> = [];
  #drainQueue: string[] = [];
  #draining = false;

  constructor(private host: string, private port: number) {
    this.#socket = new net.Socket();
    this.#parser = new ReplyParser();
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#socket.connect(this.port, this.host, () => {
        resolve();
      });
      this.#socket.on('error', reject);
      this.#socket.on('data', (data) => {
        this.#parser.append(data);
      });
      this.#parser.on('reply', (reply: Reply) => {
        const resolveFn = this.#waiters.shift();
        if (resolveFn) resolveFn(reply);
      });
    });
  }

  async send(command: string): Promise<Reply> {
    return new Promise((resolve) => {
      this.#waiters.push(resolve);
      this.#socket.write(command + '\r\n');
    });
  }

  /**
   * Pipelined send to avoid waiting for every single reply.
   * Node's `socket.write` handles buffering, but we also queue
   * up the promises. 
   */
  async pipeline(commands: string[]): Promise<Reply[]> {
    const promises: Promise<Reply>[] = [];
    const buf = commands.join('\r\n') + '\r\n';
    
    for (let i = 0; i < commands.length; i++) {
      promises.push(new Promise((resolve) => {
        this.#waiters.push(resolve);
      }));
    }
    this.#socket.write(buf);
    return Promise.all(promises);
  }

  close() {
    this.#socket.destroy();
  }
}

async function runBenchmark(name: string, ops: number, fn: (client: BenchmarkClient) => Promise<void>, client: BenchmarkClient): Promise<{ name: string, ops: number, timeMs: number, opsPerSec: number }> {
  console.log(`Starting ${name} benchmark (${ops} ops)...`);
  const start = performance.now();
  await fn(client);
  const end = performance.now();
  const timeMs = end - start;
  const opsPerSec = (ops / timeMs) * 1000;
  return { name, ops, timeMs, opsPerSec };
}

async function main() {
  const args = process.argv.slice(2);
  let ops = 50000;
  let host = '127.0.0.1';
  let port = 6380;
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--ops' && i + 1 < args.length) {
      ops = parseInt(args[++i] as string, 10);
    } else if (args[i] === '--host' && i + 1 < args.length) {
      host = args[++i] as string;
    } else if (args[i] === '--port' && i + 1 < args.length) {
      port = parseInt(args[++i] as string, 10);
    }
  }

  const client = new BenchmarkClient(host, port);
  try {
    await client.connect();
    console.log(`Connected to MiniStore at ${host}:${port}`);
  } catch (err: any) {
    console.error(`Failed to connect to ${host}:${port}:`, err.message);
    process.exit(1);
  }

  // Clear db before starting? Let's just use random keys so we don't care.
  const batchSize = 1000;
  const numBatches = Math.max(1, Math.floor(ops / batchSize));
  const actualOps = numBatches * batchSize;

  const results = [];

  // SET
  results.push(await runBenchmark('SET', actualOps, async (c) => {
    for (let b = 0; b < numBatches; b++) {
      const cmds = [];
      for (let i = 0; i < batchSize; i++) {
        cmds.push(`SET bench:k:${b}:${i} value_${i}`);
      }
      await c.pipeline(cmds);
    }
  }, client));

  // GET
  results.push(await runBenchmark('GET', actualOps, async (c) => {
    for (let b = 0; b < numBatches; b++) {
      const cmds = [];
      for (let i = 0; i < batchSize; i++) {
        cmds.push(`GET bench:k:${b}:${i}`);
      }
      await c.pipeline(cmds);
    }
  }, client));

  // LPUSH / LPOP (each batch pushes then pops)
  results.push(await runBenchmark('LPUSH/LPOP', actualOps, async (c) => {
    // ops is total operations, we split into half push half pop
    const halfOps = actualOps / 2;
    const hBatches = Math.max(1, Math.floor(halfOps / batchSize));
    for (let b = 0; b < hBatches; b++) {
      const pcmds = [];
      for (let i = 0; i < batchSize; i++) {
        pcmds.push(`LPUSH bench:list ${i}`);
      }
      await c.pipeline(pcmds);
      
      const popcmds = [];
      for (let i = 0; i < batchSize; i++) {
        popcmds.push(`LPOP bench:list`);
      }
      await c.pipeline(popcmds);
    }
  }, client));

  // HSET / HGET
  results.push(await runBenchmark('HSET/HGET', actualOps, async (c) => {
    const halfOps = actualOps / 2;
    const hBatches = Math.max(1, Math.floor(halfOps / batchSize));
    for (let b = 0; b < hBatches; b++) {
      const pcmds = [];
      for (let i = 0; i < batchSize; i++) {
        pcmds.push(`HSET bench:hash f${i} v${i}`);
      }
      await c.pipeline(pcmds);
      
      const popcmds = [];
      for (let i = 0; i < batchSize; i++) {
        popcmds.push(`HGET bench:hash f${i}`);
      }
      await c.pipeline(popcmds);
    }
  }, client));

  // Mixed Workload
  results.push(await runBenchmark('Mixed Workload', actualOps, async (c) => {
    for (let b = 0; b < numBatches; b++) {
      const cmds = [];
      for (let i = 0; i < batchSize; i++) {
        const rand = Math.random();
        if (rand < 0.25) cmds.push(`SET bench:mixed:${i} mix`);
        else if (rand < 0.5) cmds.push(`GET bench:mixed:${i}`);
        else if (rand < 0.75) cmds.push(`LPUSH bench:mlist mix`);
        else cmds.push(`HGET bench:hash f0`);
      }
      await c.pipeline(cmds);
    }
  }, client));

  client.close();

  console.log('\n--- Benchmark Results ---');
  console.table(
    results.map(r => ({
      Command: r.name,
      'Total Ops': r.ops,
      'Total Time (ms)': r.timeMs.toFixed(2),
      'Ops/sec': Math.round(r.opsPerSec).toLocaleString()
    }))
  );
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
