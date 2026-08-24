import net from 'node:net';
import { ReplyParser, type Reply } from '@ministore/protocol';
import { EventEmitter } from 'node:events';

export class Client extends EventEmitter {
  #socket: net.Socket;
  #parser: ReplyParser;
  #pendingResolvers: ((reply: Reply) => void)[] = [];

  constructor(public readonly host: string, public readonly port: number) {
    super();
    this.#socket = new net.Socket();
    this.#parser = new ReplyParser();

    this.#parser.on('reply', (reply: Reply) => {
      const resolve = this.#pendingResolvers.shift();
      if (resolve) {
        resolve(reply);
      } else {
        // Unexpected reply?
      }
    });

    this.#parser.on('push', (reply: Reply) => {
      this.emit('push', reply);
    });

    this.#socket.on('data', (data) => {
      this.#parser.append(data);
    });

    this.#socket.on('error', (err) => {
      this.emit('error', err);
      this.close();
    });

    this.#socket.on('close', () => {
      this.emit('close');
      // Resolve any pending with an error
      for (const resolve of this.#pendingResolvers) {
        resolve({ type: 'error', message: 'Connection closed' });
      }
      this.#pendingResolvers = [];
    });
  }

  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.#socket.connect(this.port, this.host, () => {
        resolve();
      });
      this.#socket.once('error', reject);
    });
  }

  async send(commandLine: string): Promise<Reply> {
    return new Promise((resolve) => {
      this.#pendingResolvers.push(resolve);
      this.#socket.write(commandLine + '\r\n');
    });
  }

  close(): void {
    this.#socket.destroy();
  }
}
