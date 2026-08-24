import fs from 'node:fs';
import promisesFs from 'node:fs/promises';
import path from 'node:path';
import type { InMemoryStore } from './InMemoryStore.js';

export class AofWriter {
  readonly #path: string;
  readonly #fsyncPolicy: 'always' | 'everysec' | 'no';
  #fd: number | undefined;
  #interval: ReturnType<typeof setInterval> | undefined;
  #dirty = false;
  #rewriteInProgress = false;
  #rewriteBuffer: string[] | undefined = undefined;

  constructor(aofPath: string, fsyncPolicy: 'always' | 'everysec' | 'no') {
    this.#path = aofPath;
    this.#fsyncPolicy = fsyncPolicy;
  }

  start(): void {
    if (this.#fd !== undefined) return;
    const dir = path.dirname(this.#path);
    fs.mkdirSync(dir, { recursive: true });
    this.#fd = fs.openSync(this.#path, 'a');
    
    if (this.#fsyncPolicy === 'everysec') {
      this.#interval = setInterval(() => {
        if (this.#dirty && this.#fd !== undefined) {
          try {
            fs.fsyncSync(this.#fd);
            this.#dirty = false;
          } catch (e) {
            console.error('AOF background fsync failed:', e);
          }
        }
      }, 1000);
      this.#interval.unref();
    }
  }

  stop(): void {
    if (this.#interval) {
      clearInterval(this.#interval);
      this.#interval = undefined;
    }
    if (this.#fd !== undefined) {
      if (this.#dirty) {
        try { fs.fsyncSync(this.#fd); } catch (e) {}
      }
      fs.closeSync(this.#fd);
      this.#fd = undefined;
    }
    this.#dirty = false;
  }

  write(line: string): void {
    if (this.#fd === undefined) return;
    
    const formatted = line.trim() + '\n';
    fs.writeSync(this.#fd, formatted);
    this.#dirty = true;
    
    if (this.#fsyncPolicy === 'always') {
      fs.fsyncSync(this.#fd);
      this.#dirty = false;
    }

    if (this.#rewriteBuffer !== undefined) {
      this.#rewriteBuffer.push(formatted);
    }
  }

  async rewrite(store: InMemoryStore): Promise<void> {
    if (this.#rewriteInProgress) throw new Error('AOF rewrite already in progress');
    this.#rewriteInProgress = true;
    this.#rewriteBuffer = [];
    
    try {
      const commands: string[] = [];
      const keys = store.keys('*');
      
      for (const key of keys) {
        const type = store.keyType(key);
        if (!type) continue;
        
        const ttl = store.ttl(key);
        
        if (type === 'string') {
          const val = store.get(key);
          if (val !== undefined) {
            if (ttl > 0) commands.push(`SET ${key} ${val} EX ${ttl}`);
            else commands.push(`SET ${key} ${val}`);
          }
        } else if (type === 'list') {
          const res = store.lrange(key, 0, -1);
          if (res.ok && res.value.length > 0) {
            commands.push(`RPUSH ${key} ${res.value.join(' ')}`);
          }
          if (ttl > 0) commands.push(`EXPIRE ${key} ${ttl}`);
        } else if (type === 'hash') {
          const res = store.hgetall(key);
          if (res.ok && res.value.length > 0) {
            commands.push(`HSET ${key} ${res.value.join(' ')}`);
          }
          if (ttl > 0) commands.push(`EXPIRE ${key} ${ttl}`);
        }
      }

      const tempPath = this.#path + '.temp';
      const dir = path.dirname(tempPath);
      await promisesFs.mkdir(dir, { recursive: true });
      await promisesFs.writeFile(tempPath, commands.join('\n') + (commands.length > 0 ? '\n' : ''), 'utf-8');
      
      const buf = this.#rewriteBuffer;
      this.#rewriteBuffer = undefined;
      
      if (buf.length > 0) {
        await promisesFs.appendFile(tempPath, buf.join(''), 'utf-8');
      }
      
      if (this.#fd !== undefined) fs.closeSync(this.#fd);
      await promisesFs.rename(tempPath, this.#path);
      this.#fd = fs.openSync(this.#path, 'a');
    } finally {
      this.#rewriteInProgress = false;
      this.#rewriteBuffer = undefined;
    }
  }
}
