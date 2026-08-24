#!/usr/bin/env node

const net = require('node:net');

const port = process.env.MINISTORE_PORT || 6380;
const host = process.env.MINISTORE_HOST || '127.0.0.1';
const password = process.env.MINISTORE_REQUIREPASS;

console.log(`Connecting to MiniStore at ${host}:${port}...`);
const client = net.createConnection({ host, port }, () => {
  if (password) {
    client.write(`AUTH ${password}\n`);
  }
  client.write('BGSAVE\n');
});

let state = 0; // 0 = wait auth or bgsave, 1 = wait bgsave

client.on('data', (data) => {
  const responses = data.toString().trim().split('\r\n');
  
  for (const res of responses) {
    if (res.startsWith('-ERR') || res.startsWith('-NOAUTH')) {
      console.error(`Error from server: ${res}`);
      client.end();
      process.exit(1);
    }
    
    if (res === '+OK') {
      if (password && state === 0) {
        state = 1; // Auth succeeded
      } else {
        console.log('Successfully triggered BGSAVE. The server is writing the dataset to dump.json.');
        client.end();
        process.exit(0);
      }
    }
  }
});

client.on('error', (err) => {
  console.error(`Connection error: ${err.message}`);
  process.exit(1);
});
