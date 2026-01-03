# SQL Server MCP: Standalone Usage for DBAs

## For DBAs Without Claude Desktop Access

This guide explains how to use the SQL Server MCP server **without requiring Claude Desktop or Claude Code**. As a DBA, you can use this powerful tool directly through:

1. **MCP Inspector** - Built-in interactive testing tool
2. **Node.js Scripts** - Write simple scripts to call MCP tools
3. **Interactive CLI** - Use the included interactive command-line interface
4. **VS Code Integration** - Use with GitHub Copilot or continue.dev extension
5. **REST API Wrapper** - HTTP API for any client (optional)

---

## Table of Contents

1. [Quick Start: MCP Inspector](#quick-start-mcp-inspector)
2. [Using Node.js Scripts Directly](#using-nodejs-scripts-directly)
3. [Interactive CLI for DBAs](#interactive-cli-for-dbas)
4. [VS Code Integration Options](#vs-code-integration-options)
5. [Creating a REST API Wrapper](#creating-a-rest-api-wrapper)
6. [Jupyter Notebook Integration](#jupyter-notebook-integration)
7. [PowerShell Integration](#powershell-integration)

---

## Quick Start: MCP Inspector

The **MCP Inspector** is a built-in web-based tool for testing and using MCP servers. No Claude required!

### Step 1: Install and Build

```bash
cd C:\Users\YourUsername\sql-server-mcp
npm install
npm run build
```

### Step 2: Launch MCP Inspector

```bash
npm run inspect
```

This opens a web browser at `http://localhost:5173` with an interactive UI.

### Step 3: Test Connection

1. In the MCP Inspector UI, select **"sqlserver_test_connection"** tool
2. Click **"Execute"**
3. View the results

### Step 4: Run Queries

1. Select **"sqlserver_execute_query"** tool
2. Enter parameters:
   ```json
   {
     "query": "SELECT TOP 10 name, database_id FROM sys.databases"
   }
   ```
3. Click **"Execute"**
4. View formatted results

### MCP Inspector Features

- ✅ Web-based GUI (no terminal required)
- ✅ All 123 tools available in dropdown
- ✅ JSON parameter editor with validation
- ✅ Formatted result display
- ✅ Error messages with troubleshooting
- ✅ Request/response logging
- ✅ No Claude subscription needed

**Screenshot Walkthrough:**
```
┌─────────────────────────────────────────────────────────┐
│  MCP Inspector - SQL Server MCP                         │
├─────────────────────────────────────────────────────────┤
│  Tool: [sqlserver_execute_query ▼]                      │
│                                                          │
│  Parameters:                                             │
│  ┌────────────────────────────────────────────────────┐ │
│  │ {                                                   │ │
│  │   "query": "SELECT @@VERSION",                     │ │
│  │   "limit": 10                                      │ │
│  │ }                                                   │ │
│  └────────────────────────────────────────────────────┘ │
│                                                          │
│  [Execute Tool]                                          │
│                                                          │
│  Results:                                                │
│  ┌────────────────────────────────────────────────────┐ │
│  │ Microsoft SQL Server 2022 (RTM) - 16.0.1000.6       │ │
│  │ Execution time: 23ms                                │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Using Node.js Scripts Directly

Create simple Node.js scripts to call MCP tools programmatically.

### Example 1: Check Database Health

Create `health-check.js`:

```javascript
import { spawn } from 'child_process';

// Start the MCP server
const mcp = spawn('node', ['dist/index.js']);

// Send MCP request
const request = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'sqlserver_get_server_info',
    arguments: {}
  }
};

mcp.stdin.write(JSON.stringify(request) + '\n');

// Read response
mcp.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        if (response.result) {
          console.log('Server Info:', response.result.content[0].text);
        }
      } catch (e) {
        // Skip non-JSON lines
      }
    }
  }
});

// Wait 5 seconds then exit
setTimeout(() => mcp.kill(), 5000);
```

**Run:**
```bash
node health-check.js
```

### Example 2: Get Top CPU Queries

Create `cpu-check.js`:

```javascript
import { spawn } from 'child_process';

const mcp = spawn('node', ['dist/index.js']);

const request = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'sqlserver_get_top_cpu_queries',
    arguments: {
      topN: 10
    }
  }
};

mcp.stdin.write(JSON.stringify(request) + '\n');

mcp.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        if (response.result) {
          console.log('Top CPU Queries:\n');
          console.log(response.result.content[0].text);
        }
      } catch (e) {
        // Skip non-JSON lines
      }
    }
  }
});

setTimeout(() => mcp.kill(), 5000);
```

### Example 3: Database Backup

Create `backup-database.js`:

```javascript
import { spawn } from 'child_process';

const mcp = spawn('node', ['dist/index.js']);

const request = {
  jsonrpc: '2.0',
  id: 1,
  method: 'tools/call',
  params: {
    name: 'sqlserver_backup_database',
    arguments: {
      database: 'ProductionDB',
      backupType: 'Full',
      compression: true,
      checksum: true,
      verify: true,
      path: 'C:\\Backup'
    }
  }
};

mcp.stdin.write(JSON.stringify(request) + '\n');

mcp.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        if (response.result) {
          console.log('Backup Result:\n');
          console.log(response.result.content[0].text);
        } else if (response.error) {
          console.error('Backup Error:', response.error.message);
        }
      } catch (e) {
        // Skip non-JSON lines
      }
    }
  }
});

setTimeout(() => mcp.kill(), 30000); // 30 seconds for backup
```

---

## Interactive CLI for DBAs

Let's create a simple interactive CLI that DBAs can use without understanding MCP protocol.

Create `interactive-cli.js` in the project root:

```javascript
#!/usr/bin/env node
import { spawn } from 'child_process';
import readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: 'SQL> '
});

let mcp = null;
let requestId = 1;

console.log('╔══════════════════════════════════════════════════════╗');
console.log('║  SQL Server MCP - Interactive CLI                   ║');
console.log('║  Type "help" for available commands                  ║');
console.log('║  Type "exit" to quit                                 ║');
console.log('╚══════════════════════════════════════════════════════╝\n');

// Start MCP server
console.log('Starting SQL Server MCP...');
mcp = spawn('node', ['dist/index.js']);

mcp.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim() && !line.includes('SQL Server MCP Server')) {
      try {
        const response = JSON.parse(line);
        if (response.result) {
          const content = response.result.content[0].text;
          console.log('\n' + content + '\n');
        } else if (response.error) {
          console.error('Error:', response.error.message);
        }
      } catch (e) {
        // Skip non-JSON lines
      }
    }
  }
  rl.prompt();
});

mcp.stderr.on('data', (data) => {
  // Suppress stderr unless it's critical
  const msg = data.toString();
  if (msg.includes('Error') || msg.includes('Failed')) {
    console.error(msg);
  }
});

setTimeout(() => {
  console.log('Connected to SQL Server!\n');
  rl.prompt();
}, 2000);

// Command handlers
const commands = {
  help: () => {
    console.log(`
Available Commands:
  help                          - Show this help
  list databases                - List all databases
  list tables [schema]          - List tables (optional schema filter)
  query <sql>                   - Execute SELECT query
  cpu                           - Show top CPU-consuming queries
  blocking                      - Show blocking sessions
  memory                        - Show memory usage
  wait stats                    - Show wait statistics
  backup <dbname>               - Backup database
  server info                   - Get server information
  db size                       - Get database sizes
  connections                   - Show active connections
  job list                      - List SQL Agent jobs
  exit                          - Exit CLI
`);
  },

  'list databases': () => {
    callTool('sqlserver_list_databases', {});
  },

  'list tables': (schema) => {
    const args = schema ? { schema } : {};
    callTool('sqlserver_list_tables', args);
  },

  query: (sql) => {
    if (!sql) {
      console.error('Usage: query <SQL statement>');
      return;
    }
    callTool('sqlserver_execute_query', { query: sql, limit: 100 });
  },

  cpu: () => {
    callTool('sqlserver_get_top_cpu_queries', { topN: 10 });
  },

  blocking: () => {
    callTool('sqlserver_get_blocking', {});
  },

  memory: () => {
    callTool('sqlserver_get_memory_usage', {});
  },

  'wait stats': () => {
    callTool('sqlserver_get_wait_stats', { topN: 20 });
  },

  backup: (dbname) => {
    if (!dbname) {
      console.error('Usage: backup <database_name>');
      return;
    }
    callTool('sqlserver_backup_database', {
      database: dbname,
      backupType: 'Full',
      compression: true,
      checksum: true
    });
  },

  'server info': () => {
    callTool('sqlserver_get_server_info', {});
  },

  'db size': () => {
    callTool('sqlserver_get_database_size', {});
  },

  connections: () => {
    callTool('sqlserver_get_current_connections', {});
  },

  'job list': () => {
    callTool('sqlserver_list_agent_jobs', {});
  }
};

function callTool(toolName, args) {
  const request = {
    jsonrpc: '2.0',
    id: requestId++,
    method: 'tools/call',
    params: {
      name: toolName,
      arguments: args
    }
  };

  mcp.stdin.write(JSON.stringify(request) + '\n');
}

rl.on('line', (line) => {
  const input = line.trim();

  if (!input) {
    rl.prompt();
    return;
  }

  if (input === 'exit') {
    console.log('Goodbye!');
    mcp.kill();
    process.exit(0);
  }

  // Parse command
  const parts = input.split(' ');
  const cmd = parts[0];
  const args = parts.slice(1).join(' ');

  // Check for exact command match
  if (commands[input]) {
    commands[input]();
  }
  // Check for command with arguments
  else if (commands[cmd]) {
    commands[cmd](args);
  }
  // Check for multi-word commands
  else {
    const twoWord = parts.slice(0, 2).join(' ');
    if (commands[twoWord]) {
      commands[twoWord](parts.slice(2).join(' '));
    } else {
      console.error(`Unknown command: ${input}`);
      console.log('Type "help" for available commands');
      rl.prompt();
    }
  }
});

rl.on('close', () => {
  mcp.kill();
  process.exit(0);
});
```

**Make it executable:**
```bash
chmod +x interactive-cli.js
```

**Usage:**
```bash
node interactive-cli.js

SQL> help
SQL> list databases
SQL> query SELECT TOP 10 * FROM sys.tables
SQL> cpu
SQL> blocking
SQL> backup MyDatabase
SQL> exit
```

---

## VS Code Integration Options

### Option 1: GitHub Copilot Chat (Requires Subscription)

GitHub Copilot doesn't natively support MCP, but you can use it with the interactive CLI or scripts.

**Workflow:**
1. Open VS Code terminal
2. Run `node interactive-cli.js`
3. Use Copilot to generate SQL queries
4. Paste queries into CLI
5. View results in terminal

### Option 2: Continue.dev Extension (FREE)

[Continue.dev](https://continue.dev/) is a **FREE VS Code extension** that supports local LLMs and custom integrations.

**Installation:**

1. Install Continue.dev extension in VS Code:
   - Open Extensions (Ctrl+Shift+X)
   - Search "Continue"
   - Install "Continue - Codestral, GPT-4, and more"

2. Configure Continue to use free models:
   - Continue supports **Ollama** (100% free, local models)
   - Continue supports **HuggingFace** (free tier)
   - Continue supports **Together AI** (free tier)

3. Create a custom MCP integration:

**File: `.continue/config.json`** (in your project root):

```json
{
  "models": [
    {
      "title": "Ollama CodeLlama",
      "provider": "ollama",
      "model": "codellama:7b",
      "apiBase": "http://localhost:11434"
    }
  ],
  "customCommands": [
    {
      "name": "sql-health-check",
      "description": "Check SQL Server health",
      "prompt": "Run the health check script and analyze the results",
      "command": "node health-check.js"
    },
    {
      "name": "sql-cpu-check",
      "description": "Check top CPU queries",
      "command": "node cpu-check.js"
    }
  ],
  "systemMessage": "You are a SQL Server DBA assistant. You have access to the SQL Server MCP tools via Node.js scripts."
}
```

**Setup Ollama (FREE local LLM):**

```bash
# Windows: Download from https://ollama.ai/download
# Install Ollama

# Pull a model (one-time)
ollama pull codellama:7b

# Ollama runs automatically on http://localhost:11434
```

**Using with Continue in VS Code:**

1. Press **Ctrl+L** to open Continue chat
2. Type: `@sql-health-check`
3. Continue executes the script and shows results
4. Ask follow-up questions: "What does this mean?" or "Should I be concerned?"

### Option 3: Custom VS Code Extension

Create a simple VS Code extension that wraps the MCP server.

**File: `vscode-extension/extension.js`:**

```javascript
const vscode = require('vscode');
const { spawn } = require('child_process');

function activate(context) {
  let mcp = null;

  // Start MCP server
  const startMCP = vscode.commands.registerCommand('sqlserver-mcp.start', () => {
    if (mcp) {
      vscode.window.showInformationMessage('MCP server already running');
      return;
    }

    mcp = spawn('node', ['dist/index.js'], {
      cwd: vscode.workspace.rootPath
    });

    vscode.window.showInformationMessage('SQL Server MCP started');
  });

  // Execute query
  const executeQuery = vscode.commands.registerCommand('sqlserver-mcp.executeQuery', async () => {
    const query = await vscode.window.showInputBox({
      prompt: 'Enter SQL query',
      placeHolder: 'SELECT * FROM sys.databases'
    });

    if (!query) return;

    const request = {
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name: 'sqlserver_execute_query',
        arguments: { query, limit: 100 }
      }
    };

    mcp.stdin.write(JSON.stringify(request) + '\n');

    // Show results in output channel
    const output = vscode.window.createOutputChannel('SQL Results');
    output.show();

    mcp.stdout.on('data', (data) => {
      const lines = data.toString().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            const response = JSON.parse(line);
            if (response.result) {
              output.appendLine(response.result.content[0].text);
            }
          } catch (e) {
            // Skip
          }
        }
      }
    });
  });

  context.subscriptions.push(startMCP, executeQuery);
}

module.exports = { activate };
```

---

## Creating a REST API Wrapper

For DBAs who prefer HTTP/REST APIs, create a simple Express.js wrapper.

Create `rest-api.js`:

```javascript
import express from 'express';
import { spawn } from 'child_process';

const app = express();
app.use(express.json());

let mcp = null;
let requestId = 1;
const pendingRequests = new Map();

// Start MCP server
mcp = spawn('node', ['dist/index.js']);

mcp.stdout.on('data', (data) => {
  const lines = data.toString().split('\n');
  for (const line of lines) {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        if (response.id && pendingRequests.has(response.id)) {
          const resolve = pendingRequests.get(response.id);
          pendingRequests.delete(response.id);
          resolve(response);
        }
      } catch (e) {
        // Skip non-JSON lines
      }
    }
  }
});

// Helper function to call MCP tool
function callTool(toolName, args) {
  return new Promise((resolve) => {
    const id = requestId++;
    const request = {
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: {
        name: toolName,
        arguments: args
      }
    };

    pendingRequests.set(id, resolve);
    mcp.stdin.write(JSON.stringify(request) + '\n');

    // Timeout after 30 seconds
    setTimeout(() => {
      if (pendingRequests.has(id)) {
        pendingRequests.delete(id);
        resolve({ error: { message: 'Request timeout' } });
      }
    }, 30000);
  });
}

// REST API endpoints
app.get('/api/databases', async (req, res) => {
  const result = await callTool('sqlserver_list_databases', {});
  if (result.error) {
    return res.status(500).json({ error: result.error.message });
  }
  res.json({ data: result.result.content[0].text });
});

app.post('/api/query', async (req, res) => {
  const { query, limit = 100 } = req.body;
  const result = await callTool('sqlserver_execute_query', { query, limit });
  if (result.error) {
    return res.status(500).json({ error: result.error.message });
  }
  res.json({ data: result.result.content[0].text });
});

app.get('/api/performance/cpu', async (req, res) => {
  const { topN = 10 } = req.query;
  const result = await callTool('sqlserver_get_top_cpu_queries', { topN: parseInt(topN) });
  if (result.error) {
    return res.status(500).json({ error: result.error.message });
  }
  res.json({ data: result.result.content[0].text });
});

app.get('/api/performance/blocking', async (req, res) => {
  const result = await callTool('sqlserver_get_blocking', {});
  if (result.error) {
    return res.status(500).json({ error: result.error.message });
  }
  res.json({ data: result.result.content[0].text });
});

app.post('/api/backup', async (req, res) => {
  const { database, backupType = 'Full', compression = true } = req.body;
  const result = await callTool('sqlserver_backup_database', {
    database,
    backupType,
    compression,
    checksum: true
  });
  if (result.error) {
    return res.status(500).json({ error: result.error.message });
  }
  res.json({ data: result.result.content[0].text });
});

// Start server
const PORT = 3000;
app.listen(PORT, () => {
  console.log(`SQL Server MCP REST API running on http://localhost:${PORT}`);
  console.log('\nAvailable endpoints:');
  console.log('  GET  /api/databases');
  console.log('  POST /api/query');
  console.log('  GET  /api/performance/cpu');
  console.log('  GET  /api/performance/blocking');
  console.log('  POST /api/backup');
});
```

**Install Express:**
```bash
npm install express
```

**Start REST API:**
```bash
node rest-api.js
```

**Test with cURL:**
```bash
# List databases
curl http://localhost:3000/api/databases

# Execute query
curl -X POST http://localhost:3000/api/query \
  -H "Content-Type: application/json" \
  -d '{"query": "SELECT TOP 10 name FROM sys.databases"}'

# Get CPU stats
curl http://localhost:3000/api/performance/cpu?topN=5

# Check blocking
curl http://localhost:3000/api/performance/blocking

# Backup database
curl -X POST http://localhost:3000/api/backup \
  -H "Content-Type: application/json" \
  -d '{"database": "MyDB", "backupType": "Full", "compression": true}'
```

**Test with PowerShell:**
```powershell
# List databases
Invoke-RestMethod -Uri http://localhost:3000/api/databases

# Execute query
$body = @{ query = "SELECT @@VERSION" } | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3000/api/query -Method Post -Body $body -ContentType "application/json"
```

---

## Jupyter Notebook Integration

For data analysis and reporting, use Jupyter notebooks.

Create `sql-server-analysis.ipynb`:

```python
import subprocess
import json

class SQLServerMCP:
    def __init__(self):
        self.process = subprocess.Popen(
            ['node', 'dist/index.js'],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1
        )
        self.request_id = 1

    def call_tool(self, tool_name, arguments=None):
        request = {
            'jsonrpc': '2.0',
            'id': self.request_id,
            'method': 'tools/call',
            'params': {
                'name': tool_name,
                'arguments': arguments or {}
            }
        }
        self.request_id += 1

        self.process.stdin.write(json.dumps(request) + '\n')
        self.process.stdin.flush()

        # Read response
        for line in self.process.stdout:
            if line.strip():
                try:
                    response = json.loads(line)
                    if 'result' in response:
                        return response['result']['content'][0]['text']
                    elif 'error' in response:
                        return f"Error: {response['error']['message']}"
                except json.JSONDecodeError:
                    continue

        return "No response"

    def query(self, sql, limit=100):
        return self.call_tool('sqlserver_execute_query', {'query': sql, 'limit': limit})

    def cpu_stats(self, topN=10):
        return self.call_tool('sqlserver_get_top_cpu_queries', {'topN': topN})

    def blocking_sessions(self):
        return self.call_tool('sqlserver_get_blocking', {})

    def close(self):
        self.process.kill()

# Usage
mcp = SQLServerMCP()

# Get server info
print(mcp.call_tool('sqlserver_get_server_info'))

# Query
print(mcp.query("SELECT name, database_id FROM sys.databases"))

# Performance analysis
print(mcp.cpu_stats(10))

# Cleanup
mcp.close()
```

---

## PowerShell Integration

For Windows DBAs comfortable with PowerShell:

Create `Invoke-SQLServerMCP.ps1`:

```powershell
function Invoke-SQLServerMCP {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)]
        [string]$ToolName,

        [Parameter(Mandatory=$false)]
        [hashtable]$Arguments = @{}
    )

    $mcpPath = "C:\Users\YourUsername\sql-server-mcp"

    # Create request
    $request = @{
        jsonrpc = "2.0"
        id = (Get-Random)
        method = "tools/call"
        params = @{
            name = $ToolName
            arguments = $Arguments
        }
    } | ConvertTo-Json -Depth 10

    # Start MCP process
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = "node"
    $psi.Arguments = "dist/index.js"
    $psi.WorkingDirectory = $mcpPath
    $psi.UseShellExecute = $false
    $psi.RedirectStandardInput = $true
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true

    $process = [System.Diagnostics.Process]::Start($psi)

    # Send request
    $process.StandardInput.WriteLine($request)
    $process.StandardInput.Close()

    # Read response
    Start-Sleep -Seconds 2
    $output = $process.StandardOutput.ReadToEnd()
    $process.WaitForExit(5000)

    # Parse response
    $lines = $output -split "`n"
    foreach ($line in $lines) {
        if ($line.Trim()) {
            try {
                $response = $line | ConvertFrom-Json
                if ($response.result) {
                    return $response.result.content[0].text
                }
            } catch {
                # Skip non-JSON lines
            }
        }
    }
}

# Usage examples
Invoke-SQLServerMCP -ToolName "sqlserver_list_databases"

Invoke-SQLServerMCP -ToolName "sqlserver_execute_query" -Arguments @{
    query = "SELECT TOP 10 name FROM sys.tables"
    limit = 10
}

Invoke-SQLServerMCP -ToolName "sqlserver_get_top_cpu_queries" -Arguments @{
    topN = 5
}
```

---

## Summary: Best Options for DBAs

| Method | Free? | Ease of Use | Best For |
|--------|-------|-------------|----------|
| **MCP Inspector** | ✅ Yes | ⭐⭐⭐⭐⭐ Easy | Quick testing, learning tools |
| **Interactive CLI** | ✅ Yes | ⭐⭐⭐⭐ Easy | Daily operations, ad-hoc queries |
| **Node.js Scripts** | ✅ Yes | ⭐⭐⭐ Medium | Automation, scheduled tasks |
| **REST API** | ✅ Yes | ⭐⭐⭐⭐ Easy | Integration with other tools |
| **Continue.dev + Ollama** | ✅ Yes | ⭐⭐⭐ Medium | VS Code users, AI assistance |
| **PowerShell** | ✅ Yes | ⭐⭐⭐⭐ Easy | Windows DBAs, existing scripts |
| **Jupyter Notebook** | ✅ Yes | ⭐⭐⭐ Medium | Data analysis, reporting |

## Recommended Workflow

**For Daily Use:**
1. Use **MCP Inspector** for exploratory work
2. Use **Interactive CLI** for routine operations
3. Use **REST API** for integration with monitoring tools

**For Automation:**
1. Write **Node.js scripts** for scheduled tasks
2. Use **PowerShell** for Windows task scheduler
3. Integrate with existing automation frameworks

**For Learning:**
1. Start with **MCP Inspector** (visual, forgiving)
2. Graduate to **Interactive CLI** (faster)
3. Create **Node.js scripts** for repetitive tasks

---

## Getting Help

- **MCP Inspector**: Click tools to see parameter documentation
- **Interactive CLI**: Type `help` for available commands
- **Node.js**: Check `README.md` for tool specifications
- **GitHub**: Open issues at https://github.com/your-username/sql-server-mcp

No Claude subscription required! All these methods are **100% free** and work offline (except Ollama initial download).
