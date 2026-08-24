import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { Client } from './Client.js';
import type { Reply } from '@ministore/protocol';

function printReply(reply: Reply): void {
  switch (reply.type) {
    case 'success':
      console.log(`OK: ${reply.value}`);
      break;
    case 'bulk':
      if (reply.value === null) {
        console.log('(nil)');
      } else {
        console.log(`"${reply.value}"`);
      }
      break;
    case 'integer':
      console.log(`(integer) ${reply.value}`);
      break;
    case 'error':
      console.error(`(error) ${reply.message}`);
      break;
    case 'array':
      if (reply.items.length === 0) {
        console.log('(empty array)');
      } else {
        reply.items.forEach((item, index) => {
          const val = item === null ? '(nil)' : `"${item}"`;
          console.log(`${index + 1}) ${val}`);
        });
      }
      break;
  }
}

async function main() {
  const args = process.argv.slice(2);
  let host = '127.0.0.1';
  let port = 6380;
  
  // Very basic parsing for --host and --port, or positional fallback
  const commandArgs: string[] = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host' && i + 1 < args.length) {
      host = args[++i]!;
    } else if (args[i] === '--port' && i + 1 < args.length) {
      port = parseInt(args[++i]!, 10);
    } else {
      commandArgs.push(args[i]!);
    }
  }

  const client = new Client(host, port);
  try {
    await client.connect();
  } catch (err: any) {
    console.error(`Could not connect to ${host}:${port}: ${err.message}`);
    process.exit(1);
  }

  if (commandArgs.length > 0) {
    // Non-interactive mode
    const commandLine = commandArgs.join(' ');
    const reply = await client.send(commandLine);
    printReply(reply);
    client.close();
    process.exit(0);
  }

  // Interactive mode
  const rl = readline.createInterface({ input, output, prompt: 'ministore> ' });
  
  client.on('error', (err) => {
    console.error(`\nConnection error: ${err.message}`);
    rl.close();
  });

  client.on('close', () => {
    console.log('\nConnection closed.');
    rl.close();
  });

  client.on('push', (reply: Reply) => {
    // Erase current prompt line
    process.stdout.write('\r\x1b[K');
    printReply(reply);
    // Restore prompt
    rl.prompt(true);
  });

  rl.prompt();

  for await (const line of rl) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        break;
      }
      const reply = await client.send(trimmed);
      printReply(reply);
    }
    rl.prompt();
  }

  client.close();
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
