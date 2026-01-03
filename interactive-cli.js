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
          console.error('\n❌ Error:', response.error.message, '\n');
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
  console.log('✓ Connected to SQL Server!\n');
  rl.prompt();
}, 2000);

// Command handlers
const commands = {
  help: () => {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║                    Available Commands                        ║
╚══════════════════════════════════════════════════════════════╝

DATABASE OPERATIONS:
  list databases                - List all databases
  list tables [schema]          - List tables (optional schema filter)
  db size                       - Get database sizes
  db info <name>                - Get detailed database info

QUERY OPERATIONS:
  query <sql>                   - Execute SELECT query
  exec <sql>                    - Execute non-query (INSERT/UPDATE/DELETE)

PERFORMANCE MONITORING:
  cpu                           - Show top CPU-consuming queries
  cpu usage                     - Show CPU usage by session
  blocking                      - Show blocking sessions
  memory                        - Show memory usage
  wait stats                    - Show wait statistics
  io latency                    - Show I/O latency by file
  disk space                    - Show disk space usage
  processes                     - Show running processes

SQL SERVER AGENT:
  job list                      - List all SQL Agent jobs
  job details <name>            - Get job details
  job history <name>            - Get job execution history
  job start <name>              - Start a job
  job stop <name>               - Stop a job

BACKUP & RESTORE:
  backup <dbname>               - Full backup with compression
  backup list [dbname]          - Show backup history
  verify <path>                 - Verify backup file

SERVER ADMINISTRATION:
  server info                   - Get server version and config
  connections                   - Show active connections
  logins                        - List all SQL Server logins
  roles                         - List server roles with members

SECURITY:
  permissions [principal]       - Show permissions
  orphan logins                 - Detect orphan database users

SYSTEM:
  help                          - Show this help
  clear                         - Clear screen
  exit                          - Exit CLI

EXAMPLES:
  SQL> list databases
  SQL> query SELECT TOP 10 * FROM sys.tables
  SQL> cpu
  SQL> backup ProductionDB
  SQL> job list
`);
    rl.prompt();
  },

  clear: () => {
    console.clear();
    console.log('╔══════════════════════════════════════════════════════╗');
    console.log('║  SQL Server MCP - Interactive CLI                   ║');
    console.log('╚══════════════════════════════════════════════════════╝\n');
    rl.prompt();
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
      console.error('\n❌ Usage: query <SQL statement>\n');
      rl.prompt();
      return;
    }
    callTool('sqlserver_execute_query', { query: sql, limit: 100 });
  },

  exec: (sql) => {
    if (!sql) {
      console.error('\n❌ Usage: exec <SQL statement>\n');
      rl.prompt();
      return;
    }
    console.log('\n⚠️  Executing non-query operation...\n');
    callTool('sqlserver_execute_non_query', { query: sql });
  },

  cpu: () => {
    callTool('sqlserver_get_top_cpu_queries', { topN: 10 });
  },

  'cpu usage': () => {
    callTool('sqlserver_get_cpu_usage', { threshold: 0, includeSystemProcesses: false });
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

  'io latency': () => {
    callTool('sqlserver_get_io_latency', {});
  },

  'disk space': () => {
    callTool('sqlserver_get_disk_space', {});
  },

  processes: () => {
    callTool('sqlserver_get_process', { includeSystemProcesses: false });
  },

  backup: (dbname) => {
    if (!dbname) {
      console.error('\n❌ Usage: backup <database_name>\n');
      rl.prompt();
      return;
    }
    console.log('\n⏳ Creating backup (this may take a while)...\n');
    callTool('sqlserver_backup_database', {
      database: dbname,
      backupType: 'Full',
      compression: true,
      checksum: true,
      verify: true
    });
  },

  'backup list': (dbname) => {
    const args = dbname ? { database: dbname } : {};
    callTool('sqlserver_list_backup_history', { ...args, days: 7, limit: 50 });
  },

  verify: (path) => {
    if (!path) {
      console.error('\n❌ Usage: verify <backup_file_path>\n');
      rl.prompt();
      return;
    }
    console.log('\n⏳ Verifying backup...\n');
    callTool('sqlserver_verify_backup', { backupFile: path });
  },

  'server info': () => {
    callTool('sqlserver_get_server_info', {});
  },

  'db size': () => {
    callTool('sqlserver_get_database_size', {});
  },

  'db info': (name) => {
    if (!name) {
      console.error('\n❌ Usage: db info <database_name>\n');
      rl.prompt();
      return;
    }
    callTool('sqlserver_get_database', { database: name });
  },

  connections: () => {
    callTool('sqlserver_get_current_connections', {});
  },

  'job list': () => {
    callTool('sqlserver_list_agent_jobs', {});
  },

  'job details': (name) => {
    if (!name) {
      console.error('\n❌ Usage: job details <job_name>\n');
      rl.prompt();
      return;
    }
    callTool('sqlserver_get_job_details', { jobName: name });
  },

  'job history': (name) => {
    if (!name) {
      console.error('\n❌ Usage: job history <job_name>\n');
      rl.prompt();
      return;
    }
    callTool('sqlserver_get_job_history', { jobName: name, topN: 20 });
  },

  'job start': (name) => {
    if (!name) {
      console.error('\n❌ Usage: job start <job_name>\n');
      rl.prompt();
      return;
    }
    console.log('\n⏳ Starting job...\n');
    callTool('sqlserver_start_job', { jobName: name });
  },

  'job stop': (name) => {
    if (!name) {
      console.error('\n❌ Usage: job stop <job_name>\n');
      rl.prompt();
      return;
    }
    console.log('\n⏳ Stopping job...\n');
    callTool('sqlserver_stop_job', { jobName: name });
  },

  logins: () => {
    callTool('sqlserver_get_login', { excludeSystemLogin: true });
  },

  roles: () => {
    callTool('sqlserver_list_server_roles', { includeMembers: true });
  },

  permissions: (principal) => {
    const args = principal ? { principal } : {};
    callTool('sqlserver_get_permissions', {
      ...args,
      includeServerPermissions: true,
      includeDatabasePermissions: true,
      includeObjectPermissions: false
    });
  },

  'orphan logins': () => {
    callTool('sqlserver_detect_orphan_logins', {});
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
    console.log('\n👋 Goodbye!\n');
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
    const threeWord = parts.slice(0, 3).join(' ');

    if (commands[threeWord]) {
      commands[threeWord](parts.slice(3).join(' '));
    } else if (commands[twoWord]) {
      commands[twoWord](parts.slice(2).join(' '));
    } else {
      console.error(`\n❌ Unknown command: ${input}`);
      console.log('💡 Type "help" for available commands\n');
      rl.prompt();
    }
  }
});

rl.on('close', () => {
  mcp.kill();
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('\n\n👋 Goodbye!\n');
  mcp.kill();
  process.exit(0);
});
