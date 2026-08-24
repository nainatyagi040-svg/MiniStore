import { EventEmitter } from 'node:events';

export type Reply =
  | { type: 'success'; value: string }
  | { type: 'bulk'; value: string | null } // null for nil
  | { type: 'integer'; value: number }
  | { type: 'array'; items: (string | null)[] }
  | { type: 'error'; message: string };

export class ReplyParser extends EventEmitter {
  #buffer: string = '';
  
  // State for parsing arrays
  #parsingArray: boolean = false;
  #arrayLength: number = 0;
  #arrayItems: (string | null)[] = [];

  append(chunk: string | Buffer): void {
    this.#buffer += chunk.toString();
    this.#pump();
  }

  #pump(): void {
    while (true) {
      const crlfIndex = this.#buffer.indexOf('\r\n');
      if (crlfIndex === -1) {
        break; // Need more data
      }

      const line = this.#buffer.slice(0, crlfIndex);
      this.#buffer = this.#buffer.slice(crlfIndex + 2);
      
      this.#processLine(line);
    }
  }

  #processLine(line: string): void {
    if (this.#parsingArray) {
      this.#arrayItems.push(this.#parseBulkLine(line));
      if (this.#arrayItems.length === this.#arrayLength) {
        const reply: Reply = { type: 'array', items: this.#arrayItems };
        this.#parsingArray = false;
        this.#arrayItems = [];
        this.#arrayLength = 0;
        
        // Distinguish between normal array replies and pub/sub push messages
        if (
          reply.items.length >= 1 &&
          (reply.items[0] === 'message' ||
           reply.items[0] === 'subscribe' ||
           reply.items[0] === 'unsubscribe')
        ) {
          this.emit('push', reply);
        } else {
          this.emit('reply', reply);
        }
      }
      return;
    }

    if (line.length === 0) return;

    const prefix = line[0];
    const rest = line.slice(1);

    switch (prefix) {
      case '+':
        this.emit('reply', { type: 'success', value: rest });
        break;
      case '-':
        // Strip ERR/WRONGTYPE prefix if present? 
        // We'll just emit the whole error string for the client to print.
        this.emit('reply', { type: 'error', message: rest });
        break;
      case ':':
        this.emit('reply', { type: 'integer', value: parseInt(rest, 10) });
        break;
      case '$':
        this.emit('reply', { type: 'bulk', value: this.#parseBulkLine(line) });
        break;
      case '*': {
        const length = parseInt(rest, 10);
        if (length === 0) {
          this.emit('reply', { type: 'array', items: [] });
        } else {
          this.#parsingArray = true;
          this.#arrayLength = length;
          this.#arrayItems = [];
        }
        break;
      }
      default:
        this.emit('error', new Error(`Unknown reply prefix: ${prefix}`));
    }
  }

  #parseBulkLine(line: string): string | null {
    if (line === '$(nil)') return null;
    return line.slice(1);
  }
}
