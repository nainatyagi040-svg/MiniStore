import net from 'node:net';
import { once } from 'node:events';

export interface ClientConnection {
  readonly id: string;
  write(data: string): void;
}

/** Handles one complete protocol line and returns the raw reply to write back, or void if handled asynchronously. */
export type LineHandler = (line: string, connection: ClientConnection) => string | void;

export interface TcpServerOptions {
  readonly host: string;
  readonly port: number;
  /** Reject a connection once its unterminated line buffer exceeds this many bytes. */
  readonly maxLineBytes: number;
  /** Optional callback fired when a connection is closed. */
  readonly onConnectionClose?: (connection: ClientConnection) => void;
}

/**
 * Accepts TCP connections and performs line framing only. It knows nothing
 * about what commands mean — each newline-terminated line is passed to the
 * injected {@link LineHandler}, whose return value is written back verbatim.
 *
 * Framing rules:
 *  - Lines are split on `\n`; a trailing `\r` (CRLF clients) is stripped.
 *  - A line whose buffered length exceeds `maxLineBytes` closes the connection,
 *    preventing a client that never sends `\n` from growing memory unbounded.
 */
export class TcpServer {
  readonly #options: TcpServerOptions;
  readonly #handleLine: LineHandler;
  readonly #server: net.Server;
  readonly #sockets = new Set<net.Socket>();

  constructor(options: TcpServerOptions, handleLine: LineHandler) {
    this.#options = options;
    this.#handleLine = handleLine;
    this.#server = net.createServer((socket) => this.#onConnection(socket));
  }

  /** Starts listening. Resolves with the actual bound address (port may be ephemeral). */
  async listen(): Promise<{ host: string; port: number }> {
    try {
      this.#server.listen(this.#options.port, this.#options.host);
      await once(this.#server, 'listening');
      const address = this.#server.address();
      if (address === null || typeof address === 'string') {
        throw new Error('TcpServer: expected an AddressInfo after listening');
      }
      return { host: address.address, port: address.port };
    } catch (err: any) {
      if (err.code === 'EADDRINUSE') {
        throw new Error(`Port ${this.#options.port} is already in use. Please choose a different port or stop the conflicting service.`);
      }
      throw err;
    }
  }

  /** Stops accepting connections and destroys any that remain open. */
  async close(): Promise<void> {
    for (const socket of this.#sockets) {
      socket.destroy();
    }
    this.#sockets.clear();
    if (this.#server.listening) {
      this.#server.close();
      await once(this.#server, 'close');
    }
  }

  #onConnection(socket: net.Socket): void {
    this.#sockets.add(socket);
    socket.setEncoding('utf8');

    const connectionId = Math.random().toString(36).slice(2);
    const connection: ClientConnection = {
      id: connectionId,
      write: (data: string) => {
        if (!socket.destroyed) {
          socket.write(data);
        }
      }
    };

    let buffer = '';
    socket.on('data', (chunk: string) => {
      buffer += chunk;

      if (buffer.length > this.#options.maxLineBytes) {
        socket.write('-ERR line too long\r\n');
        socket.destroy();
        return;
      }

      let newlineIndex: number;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        if (line.endsWith('\r')) {
          line = line.slice(0, -1);
        }
        if (line.length === 0) {
          continue; // ignore blank lines
        }
        try {
          const reply = this.#handleLine(line, connection);
          if (reply !== undefined && reply !== null) {
            socket.write(reply);
          }
        } catch (err: any) {
          console.error('Unhandled error processing command:', err);
          socket.write(`-ERR internal server error\r\n`);
        }
      }
    });

    socket.on('error', () => {
      // Client-side reset/timeout: drop the socket, keep the server running.
      socket.destroy();
    });

    socket.on('close', () => {
      this.#sockets.delete(socket);
      if (this.#options.onConnectionClose) {
        this.#options.onConnectionClose(connection);
      }
    });
  }
}
