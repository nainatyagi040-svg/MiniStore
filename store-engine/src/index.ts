import { loadConfig } from './config.js';
import { CommandHandler } from './server/CommandHandler.js';
import { TcpServer } from './server/TcpServer.js';
import { InMemoryStore } from './store/InMemoryStore.js';
import { ExpirySweeper } from './store/ExpirySweeper.js';
import { StatsServer } from './server/StatsServer.js';
import { PersistenceManager } from './store/PersistenceManager.js';
import { AofWriter } from './store/AofWriter.js';
import { PubSubManager } from './server/PubSubManager.js';
import fs from 'node:fs';
import readline from 'node:readline';

/**
 * Composition root: wire the store, handler, and TCP server together, start
 * the active expiry sweep, and install graceful shutdown. This is the only
 * place concrete implementations are chosen and the only place key-lifecycle
 * events are surfaced (via logging, until the EventBus slice replaces it).
 */
async function main(): Promise<void> {
  const config = loadConfig();

  const store = new InMemoryStore({
    maxKeys: config.maxKeys,
    onExpired: (key) => console.log(`key expired: ${key}`),
    onEvicted: (key) => console.log(`key evicted (LRU): ${key}`),
  });

  const persistenceManager = new PersistenceManager(store, config.dumpPath, config.saveIntervalMs);
  const restored = await persistenceManager.restore();
  if (restored > 0) {
    console.log(`Restored ${restored} keys from ${config.dumpPath}`);
  }

  // Note: logically the AOF should start *after* the snapshot in a real Redis,
  // but for this slice, if both exist, we replay AOF on top of snapshot.
  let aofRestored = 0;
  if (fs.existsSync(config.aofPath)) {
    const fileStream = fs.createReadStream(config.aofPath);
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity
    });
    const replayHandler = new CommandHandler(store); // No persistence/AOF for replay
    const dummyConnection = { id: 'replay', write: () => {} };
    for await (const line of rl) {
      if (line.trim().length > 0) {
        replayHandler.handleLine(line, dummyConnection);
        aofRestored++;
      }
    }
    console.log(`Replayed ${aofRestored} commands from ${config.aofPath}`);
  }

  const aofWriter = new AofWriter(config.aofPath, config.aofFsync);
  aofWriter.start();

  persistenceManager.start();

  const sweeper = new ExpirySweeper(store, config.sweepIntervalMs, config.sweepSampleSize);
  const pubSubManager = new PubSubManager();
  const handler = new CommandHandler(store, persistenceManager, aofWriter, pubSubManager);
  const server = new TcpServer({
    ...config,
    onConnectionClose: (conn) => pubSubManager.removeConnection(conn)
  }, (line, conn) => handler.handleLine(line, conn));
  const statsServer = new StatsServer(
    store,
    config.host,
    config.statsPort,
    1000,
    handler,
    (conn) => pubSubManager.removeConnection(conn)
  );

  sweeper.start();
  const { host, port } = await server.listen();
  await statsServer.start();

  console.log(
    `MiniStore engine listening on ${host}:${port} ` +
      `(maxKeys=${config.maxKeys}, sweep=${config.sweepIntervalMs}ms/${config.sweepSampleSize})`,
  );
  console.log(`StatsServer listening on ws://${config.host}:${config.statsPort}`);

  let shuttingDown = false;
  const shutdown = async (signal: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nReceived ${signal}, shutting down…`);
    
    sweeper.stop();
    persistenceManager.stop();
    aofWriter.stop();
    
    try {
      await persistenceManager.save();
      console.log(`Saved state to ${config.dumpPath}`);
    } catch (err) {
      console.error('Failed to save state on shutdown:', err);
    }

    statsServer.stop().catch((e) => console.error('StatsServer shutdown error:', e));
    server
      .close()
      .then(() => process.exit(0))
      .catch((e: unknown) => {
        console.error('Error during shutdown:', e);
        process.exit(1);
      });
  };

  process.on('SIGINT', () => { shutdown('SIGINT').catch(console.error); });
  process.on('SIGTERM', () => { shutdown('SIGTERM').catch(console.error); });
}

main().catch((e: unknown) => {
  console.error('Fatal startup error:', e);
  process.exit(1);
});
