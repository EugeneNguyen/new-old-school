#!/usr/bin/env node

const { spawn } = require('child_process');
const open = require('open').default || require('open');
const path = require('path');

console.log('🚀 Launching nos internal tools...');

// Start the Next.js server
// Using 'npm run dev' for development or 'npm run start' for production
const server = spawn('npm', ['run', 'dev'], {
  stdio: 'inherit',
  shell: true
});

// Wait for the server to start then open the browser
// In a real production app, you might want to poll the port to check when it's actually ready
setTimeout(async () => {
  try {
    await open('http://localhost:3000');
    console.log('\n✨ Tool is ready at http://localhost:3000');
    console.log('Press Ctrl+C to stop the server and exit.\n');
  } catch (err) {
    console.error('Failed to open browser:', err);
  }
}, 4000);

// Clean up when the CLI process is killed
process.on('SIGINT', () => {
  console.log('\nStopping nos server...');
  server.kill();
  process.exit();
});
