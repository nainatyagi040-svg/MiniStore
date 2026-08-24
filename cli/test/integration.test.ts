import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, ChildProcess } from 'node:child_process';
import path from 'node:path';
import { Client } from '../src/Client.js';
import { fileURLToPath } from 'node:url';
import net from 'node:net';

import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testAofPath = path.resolve(__dirname, 'test-cli-appendonly.aof');
const testDumpPath = path.resolve(__dirname, 'test-cli-dump.json');

async function waitForServer(port: number, host: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    try {
      await new Promise<void>((resolve, reject) => {
        const socket = net.connect(port, host, () => {
          socket.destroy();
          resolve();
        });
        socket.on('error', reject);
      });
      return;
    } catch {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  throw new Error('Server did not start in time');
}

describe('CLI Integration', () => {
  let serverProcess: ChildProcess;
  const PORT = 6388; // Use a different port to avoid conflicts
  const HOST = '127.0.0.1';

  before(async () => {
    const storeEnginePath = path.resolve(__dirname, '../../../store-engine/dist/src/index.js');
    if (fs.existsSync(testAofPath)) fs.unlinkSync(testAofPath);
    if (fs.existsSync(testDumpPath)) fs.unlinkSync(testDumpPath);

    serverProcess = spawn(process.execPath, [storeEnginePath], {
      env: { 
        ...process.env, 
        MINISTORE_PORT: PORT.toString(), 
        MINISTORE_HOST: HOST, 
        MINISTORE_STATS_PORT: '8088',
        MINISTORE_AOF_PATH: testAofPath,
        MINISTORE_DUMP_PATH: testDumpPath
      },
    });
    serverProcess.stdout?.on('data', d => console.log(`SERVER: ${d}`));
    serverProcess.stderr?.on('data', d => console.error(`SERVER ERR: ${d}`));
    serverProcess.on('exit', code => console.log(`SERVER EXITED WITH CODE: ${code}`));
    
    await waitForServer(PORT, HOST);
  });

  after(() => {
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
    }
    if (fs.existsSync(testAofPath)) fs.unlinkSync(testAofPath);
    if (fs.existsSync(testDumpPath)) fs.unlinkSync(testDumpPath);
  });

  test('Client round trips commands', async () => {
    const client = new Client(HOST, PORT);
    await client.connect();

    // Send SET
    const setReply = await client.send('SET clik 100');
    assert.deepEqual(setReply, { type: 'success', value: 'OK' });

    // Send GET
    const getReply = await client.send('GET clik');
    assert.deepEqual(getReply, { type: 'bulk', value: '100' });

    // Send LRANGE
    await client.send('LPUSH clil 1 2');
    const lrangeReply = await client.send('LRANGE clil 0 -1');
    assert.deepEqual(lrangeReply, { type: 'array', items: ['2', '1'] });

    // Send Error
    const errReply = await client.send('UNKNOWNCMD');
    assert.equal(errReply.type, 'error');
    assert.match((errReply as any).message, /unknown command/i);

    client.close();
  });
});
