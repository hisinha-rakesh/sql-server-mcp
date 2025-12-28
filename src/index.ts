#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import * as dotenv from 'dotenv';
import { loadConfig } from './config.js';
import { ConnectionManager } from './connection.js';

// Import tools
import { testConnectionTool } from './tools/connection.js';
import {
  executeQueryTool,
  executeNonQueryTool,
  executeStoredProcedureTool,
  executeBatchTool,
} from './tools/query.js';
import {
  listDatabasesTool,
  listTablesTool,
  listColumnsTool,
  listStoredProceduresTool,
  getTableInfoTool,
} from './tools/schema.js';
import {
  getServerInfoTool,
  getDatabaseSizeTool,
  getCurrentConnectionsTool,
  restartServiceTool,
} from './tools/admin.js';
import {
  beginTransactionTool,
  commitTransactionTool,
  rollbackTransactionTool,
  executeInTransactionTool,
} from './tools/transactions.js';
import { bulkInsertTool } from './tools/bulk-operations.js';
import {
  createTableTool,
  dropTableTool,
  alterTableTool,
  truncateTableTool,
  createIndexTool,
  dropIndexTool,
} from './tools/ddl.js';
import {
  detectOrphanLoginsTool,
  fixOrphanLoginTool,
  createLinkedServerTool,
  dropLinkedServerTool,
  listLinkedServersTool,
  testLinkedServerTool,
  setupReplicationTool,
  createSubscriptionTool,
  listReplicationsTool,
} from './tools/advanced-admin.js';
import {
  listAgentJobsTool,
  getJobDetailsTool,
  getJobHistoryTool,
  startJobTool,
  stopJobTool,
  toggleJobTool,
  createJobTool,
  deleteJobTool,
  listJobSchedulesTool,
  getAgentStatusTool,
  getMaintenancePlanGuidanceTool,
} from './tools/agent.js';
import {
  getCpuUsageTool,
  getTopCpuQueriesTool,
  getWaitStatsTool,
} from './tools/performance.js';
import {
  addDatabaseFileTool,
  removeDatabaseFileTool,
  modifyDatabaseFileTool,
  shrinkDatabaseFileTool,
  createFilegroupTool,
  removeFilegroupTool,
  modifyFilegroupTool,
  listFilegroupsTool,
  listDatabaseFilesTool,
} from './tools/file-management.js';
import {
  backupDatabaseTool,
  listBackupHistoryTool,
  verifyBackupTool,
  getBackupDevicesTool,
} from './tools/backup.js';
import {
  addServerRoleMemberTool,
  removeServerRoleMemberTool,
  listServerRolesTool,
  createServerRoleTool,
  dropServerRoleTool,
  getLoginTool,
  newLoginTool,
  removeLoginTool,
  setLoginTool,
  renameLoginTool,
  testLoginPasswordTool,
  testWindowsLoginTool,
  findLoginInGroupTool,
  exportLoginTool,
} from './tools/security.js';


// Load environment variables
dotenv.config();

// Initialize configuration
const config = loadConfig();
const connectionManager = new ConnectionManager(config);

// Create MCP server
const server = new Server(
  {
    name: 'sql-server-mcp',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// All available tools
const tools = [
  // Connection tools
  testConnectionTool,

  // Query tools
  executeQueryTool,
  executeNonQueryTool,
  executeStoredProcedureTool,
  executeBatchTool,

  // Transaction tools
  beginTransactionTool,
  commitTransactionTool,
  rollbackTransactionTool,
  executeInTransactionTool,

  // Bulk operations
  bulkInsertTool,

  // DDL tools
  createTableTool,
  dropTableTool,
  alterTableTool,
  truncateTableTool,
  createIndexTool,
  dropIndexTool,

  // Schema tools
  listDatabasesTool,
  listTablesTool,
  listColumnsTool,
  listStoredProceduresTool,
  getTableInfoTool,

  // Admin tools
  getServerInfoTool,
  getDatabaseSizeTool,
  getCurrentConnectionsTool,
  restartServiceTool,

  // Advanced Admin tools
  detectOrphanLoginsTool,
  fixOrphanLoginTool,
  createLinkedServerTool,
  dropLinkedServerTool,
  listLinkedServersTool,
  testLinkedServerTool,
  setupReplicationTool,
  createSubscriptionTool,
  listReplicationsTool,

  // SQL Server Agent tools
  listAgentJobsTool,
  getJobDetailsTool,
  getJobHistoryTool,
  startJobTool,
  stopJobTool,
  toggleJobTool,
  createJobTool,
  deleteJobTool,
  listJobSchedulesTool,
  getAgentStatusTool,
  getMaintenancePlanGuidanceTool,
  
  // Performance monitoring tools
  getCpuUsageTool,
  getTopCpuQueriesTool,
  getWaitStatsTool,

  // File and filegroup management tools
  addDatabaseFileTool,
  removeDatabaseFileTool,
  modifyDatabaseFileTool,
  shrinkDatabaseFileTool,
  createFilegroupTool,
  removeFilegroupTool,
  modifyFilegroupTool,
  listFilegroupsTool,
  listDatabaseFilesTool,

  // Backup and restore tools
  backupDatabaseTool,
  listBackupHistoryTool,
  verifyBackupTool,
  getBackupDevicesTool,

  // Security and role management tools
  addServerRoleMemberTool,
  removeServerRoleMemberTool,
  listServerRolesTool,
  createServerRoleTool,
  dropServerRoleTool,

  // Login management tools
  getLoginTool,
  newLoginTool,
  removeLoginTool,
  setLoginTool,
  renameLoginTool,
  testLoginPasswordTool,
  testWindowsLoginTool,
  findLoginInGroupTool,
  exportLoginTool,
];

// Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: tools.map((tool) => {
      const shape = tool.inputSchema.shape as Record<string, any>;
      const requiredKeys = Object.keys(shape).filter(
        (key) => !shape[key].isOptional()
      );

      return {
        name: tool.name,
        description: tool.description,
        inputSchema: {
          type: 'object',
          properties: shape,
          required: requiredKeys,
        } as any,
        annotations: tool.annotations,
      };
    }),
  };
});

// List of write operations that require readwrite mode
const writeOperations = new Set([
  'sqlserver_execute_non_query',
  'sqlserver_execute_stored_procedure',
  'sqlserver_execute_batch',
  'sqlserver_begin_transaction',
  'sqlserver_commit_transaction',
  'sqlserver_rollback_transaction',
  'sqlserver_execute_in_transaction',
  'sqlserver_bulk_insert',
  'sqlserver_create_table',
  'sqlserver_drop_table',
  'sqlserver_alter_table',
  'sqlserver_truncate_table',
  'sqlserver_create_index',
  'sqlserver_drop_index',
  'sqlserver_fix_orphan_login',
  'sqlserver_create_linked_server',
  'sqlserver_drop_linked_server',
  'sqlserver_setup_replication',
  'sqlserver_create_subscription',
  'sqlserver_start_job',
  'sqlserver_stop_job',
  'sqlserver_toggle_job',
  'sqlserver_create_job',
  'sqlserver_delete_job',
  'sqlserver_restart_service',
  'sqlserver_add_database_file',
  'sqlserver_remove_database_file',
  'sqlserver_modify_database_file',
  'sqlserver_shrink_database_file',
  'sqlserver_create_filegroup',
  'sqlserver_remove_filegroup',
  'sqlserver_modify_filegroup',
  'sqlserver_backup_database',
  'sqlserver_add_server_role_member',
  'sqlserver_remove_server_role_member',
  'sqlserver_create_server_role',
  'sqlserver_drop_server_role',
]);

// Register tool call handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const tool = tools.find((t) => t.name === request.params.name);

  if (!tool) {
    return {
      content: [
        {
          type: 'text',
          text: `Unknown tool: ${request.params.name}`,
        },
      ],
      isError: true,
    };
  }

  try {
    // Check if operation is allowed in current mode
    if (config.mode === 'read' && writeOperations.has(tool.name)) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Operation denied: '${tool.name}' is a write operation and the server is configured in READ-ONLY mode. Set SQL_MODE=readwrite to enable write operations.`,
          },
        ],
        isError: true,
      };
    }

    // Validate input
    const validatedInput = tool.inputSchema.parse(request.params.arguments || {});

    // Execute tool handler
    const result = await tool.handler(connectionManager, validatedInput as any);

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      content: [
        {
          type: 'text',
          text: `Tool execution error: ${errorMessage}`,
        },
      ],
      isError: true,
    };
  }
});

// Start server
async function main() {
  console.error('SQL Server MCP Server starting...');
  console.error(`Authentication Type: ${config.authType}`);
  console.error(`Server: ${config.server}`);
  console.error(`Database: ${config.database}`);
  console.error(`Mode: ${config.mode}`);
  console.error('');

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error('SQL Server MCP Server running on stdio');
  console.error('Available tools:');
  tools.forEach((tool) => {
    console.error(`  - ${tool.name}`);
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

// Cleanup on exit
process.on('SIGINT', async () => {
  console.error('\nShutting down...');
  await connectionManager.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.error('\nShutting down...');
  await connectionManager.close();
  process.exit(0);
});
