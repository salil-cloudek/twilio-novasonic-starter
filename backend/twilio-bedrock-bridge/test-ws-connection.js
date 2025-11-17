#!/usr/bin/env node

const WebSocket = require('ws');

const WS_URL = 'wss://voice-ai.cloudek.au/media';

console.log(`\n🔌 Testing WebSocket connection to: ${WS_URL}\n`);

const ws = new WebSocket(WS_URL, {
  headers: {
    'Origin': 'http://localhost:3000',
  },
  // Try adding a protocol
  protocolVersion: 13,
});

ws.on('open', () => {
  console.log('✅ WebSocket connected successfully!');
  console.log('   Connection is open and ready to send/receive messages.\n');
  
  // Test sending a message
  ws.send('{"type":"test","message":"Hello from test script"}');
  console.log('📤 Sent test message\n');
  
  // Keep connection open for a bit
  setTimeout(() => {
    console.log('🔌 Closing connection...');
    ws.close();
  }, 2000);
});

ws.on('message', (data) => {
  console.log('📥 Received message:', data.toString());
});

ws.on('error', (error) => {
  console.error('❌ WebSocket error:', error.message);
  console.error('   Error details:', error);
});

ws.on('close', (code, reason) => {
  console.log(`\n🔌 WebSocket closed`);
  console.log(`   Code: ${code}`);
  console.log(`   Reason: ${reason || '(no reason provided)'}`);
  process.exit(code === 1000 ? 0 : 1);
});

// Timeout after 10 seconds if no connection
setTimeout(() => {
  if (ws.readyState !== WebSocket.OPEN) {
    console.error('\n⏱️  Connection timeout - unable to establish connection after 10 seconds');
    ws.terminate();
    process.exit(1);
  }
}, 10000);
