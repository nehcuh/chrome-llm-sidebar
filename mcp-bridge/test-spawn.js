const { spawn } = require('child_process');

// This is the exact command from your JSON config
const command = 'npx';
const args = [
  'node',
  'C:\Users\HuChen\scoop\apps\nvm\current\nodejs\nodejs\node_modules\mcp-chrome-bridge\dist\mcp\mcp-server-stdio.js'
];

console.log(`--- Starting Spawn Test ---`);
console.log(`Executing: ${command} ${args.join(' ')}`);
console.log(`---------------------------`);

const child = spawn(command, args, {
  // Use the most robust settings we've identified
  shell: true,
  // We pipe stdio to capture any output
  stdio: 'pipe' 
});

child.on('spawn', () => {
  console.log(`[SUCCESS] Process spawned successfully with PID: ${child.pid}`);
});

child.on('error', (err) => {
  console.error('[ERROR] Failed to start the subprocess.', err);
});

child.stdout.on('data', (data) => {
  console.log(`[STDOUT] Output received:\n${data}`);
});

child.stderr.on('data', (data) => {
  console.error(`[STDERR] Error output received:\n${data}`);
});

child.on('close', (code) => {
  console.log(`[EXIT] Child process exited with code: ${code}`);
});

setTimeout(() => {
    if (child.exitCode === null) {
        console.log('[TIMEOUT] Process is still running after 5 seconds.');
    }
}, 5000);
