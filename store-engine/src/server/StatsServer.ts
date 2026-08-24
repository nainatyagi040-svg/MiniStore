import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { InMemoryStore } from '../store/InMemoryStore.js';
import type { CommandHandler } from './CommandHandler.js';
import type { ClientConnection } from './TcpServer.js';

export interface Snapshot {
  size: number;
  maxKeys: number;
  evictions: number;
  keys: Array<{
    name: string;
    type: string;
    ttl: number;
  }>;
}

export class StatsServer {
  readonly #store: InMemoryStore;
  readonly #port: number;
  readonly #host: string;
  readonly #intervalMs: number;
  readonly #commandHandler: CommandHandler | undefined;
  readonly #onPlaygroundClose: ((conn: ClientConnection) => void) | undefined;

  #server?: http.Server;
  #wssStats?: WebSocketServer;
  #wssPlayground?: WebSocketServer;
  #timer?: ReturnType<typeof setInterval>;

  constructor(
    store: InMemoryStore,
    host = '127.0.0.1',
    port = 8090,
    intervalMs = 1000,
    commandHandler?: CommandHandler,
    onPlaygroundClose?: (conn: ClientConnection) => void
  ) {
    this.#store = store;
    this.#host = host;
    this.#port = port;
    this.#intervalMs = intervalMs;
    this.#commandHandler = commandHandler;
    this.#onPlaygroundClose = onPlaygroundClose;
  }

  get port(): number {
    const address = this.#server?.address();
    if (address && typeof address !== 'string') {
      return address.port;
    }
    return this.#port;
  }

  async start(): Promise<void> {
    this.#server = http.createServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok' }));
    });

    this.#wssStats = new WebSocketServer({ noServer: true });
    this.#wssPlayground = new WebSocketServer({ noServer: true });

    this.#server.on('upgrade', (request, socket, head) => {
      const pathname = request.url;

      if (pathname === '/playground') {
        this.#wssPlayground!.handleUpgrade(request, socket, head, (ws) => {
          this.#wssPlayground!.emit('connection', ws, request);
        });
      } else {
        this.#wssStats!.handleUpgrade(request, socket, head, (ws) => {
          this.#wssStats!.emit('connection', ws, request);
        });
      }
    });
    
    this.#wssStats.on('connection', (ws) => {
      ws.send(JSON.stringify(this.#buildSnapshot()));
    });

    this.#wssPlayground.on('connection', (ws) => {
      let commandCount = 0;
      let lastTime = Date.now();
      const connectionId = Math.random().toString(36).slice(2);
      
      const connection: ClientConnection = {
        id: connectionId,
        write: (data: string) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
          }
        }
      };

      ws.on('message', (message) => {
        if (!this.#commandHandler) {
          ws.send('-ERR playground not configured\r\n');
          return;
        }

        const now = Date.now();
        if (now - lastTime > 1000) {
          commandCount = 0;
          lastTime = now;
        }
        commandCount++;
        
        if (commandCount > 20) {
          ws.send('-ERR rate limit exceeded\r\n');
          return;
        }

        const line = message.toString().trim();
        if (line.length > 1024) {
          ws.send('-ERR command too long\r\n');
          return;
        }

        if (line.length > 0) {
          const res = this.#commandHandler.handleLine(line, connection);
          if (res !== undefined && res !== null) {
            ws.send(res);
          }
        }
      });

      ws.on('close', () => {
        if (this.#onPlaygroundClose) {
          this.#onPlaygroundClose(connection);
        }
      });
    });

    this.#timer = setInterval(() => {
      this.#broadcast();
    }, this.#intervalMs);

    return new Promise((resolve) => {
      this.#server!.listen(this.#port, this.#host, resolve);
    });
  }

  async stop(): Promise<void> {
    if (this.#timer) clearInterval(this.#timer);
    
    return new Promise((resolve, reject) => {
      if (this.#wssStats) {
        for (const client of this.#wssStats.clients) {
          client.close();
        }
        this.#wssStats.close();
      }
      if (this.#wssPlayground) {
        for (const client of this.#wssPlayground.clients) {
          client.close();
        }
        this.#wssPlayground.close();
      }
      if (this.#server) {
        this.#server.close((err) => {
          if (err) reject(err);
          else resolve();
        });
      } else {
        resolve();
      }
    });
  }

  #broadcast(): void {
    if (!this.#wssStats || this.#wssStats.clients.size === 0) return;
    const snap = JSON.stringify(this.#buildSnapshot());
    for (const client of this.#wssStats.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(snap);
      }
    }
  }

  #buildSnapshot(): Snapshot {
    const keys = [];
    for (const key of this.#store.keysMRU()) {
      const type = this.#store.keyType(key);
      const ttl = this.#store.ttl(key);
      if (type !== undefined) {
        keys.push({ name: key, type, ttl });
      }
    }
    
    return {
      size: this.#store.size,
      maxKeys: this.#store.maxKeys,
      evictions: this.#store.evictions,
      keys
    };
  }
}
