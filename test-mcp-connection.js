const { spawn } = require('child_process');

// Start the MCP server as a child process
const mcp = spawn('node', ['dist/index.js'], {
  env: {
    ...process.env,
    SQL_AUTH_TYPE: 'windows',
    SQL_SERVER: 'RAKESH-PC',
    SQL_DATABASE: 'master',
    SQL_TRUSTED_CONNECTION: 'true',
    SQL_ENCRYPT: 'false',
    SQL_TRUST_SERVER_CERTIFICATE: 'true',
    SQL_CONNECTION_TIMEOUT: '30000'
  },
  stdio: ['pipe', 'pipe', 'pipe']
});

let output = '';
let errorOutput = '';

mcp.stdout.on('data', (data) => {
  output += data.toString();
  console.log('STDOUT:', data.toString());
});

mcp.stderr.on('data', (data) => {
  errorOutput += data.toString();
  console.error('STDERR:', data.toString());
});

// Wait for server to start
setTimeout(async () => {
  console.log('\n=== Sending test connection request ===\n');
  
  // Send MCP request to test connection
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'sqlserver_test_connection',
      arguments: {}
    }
  };
  
  mcp.stdin.write(JSON.stringify(request) + '\n');
  
  // Wait for response
  setTimeout(() => {
    console.log('\n=== Test Complete ===');
    console.log('Response received:', output.includes('success') || output.includes('error'));
    mcp.kill();
    process.exit(0);
  }, 5000);
}, 2000);

mcp.on('error', (err) => {
  console.error('Failed to start MCP server:', err);
  process.exit(1);
});

mcp.on('exit', (code) => {
  console.log(`\nMCP server exited with code ${code}`);
});
