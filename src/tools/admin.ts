import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';
import { formatResultsAsTable } from '../utils/formatters.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * Get SQL Server information
 */
export const getServerInfoTool = {
  name: 'sqlserver_get_server_info',
  description: 'Get SQL Server version, edition, and configuration information',
  inputSchema: z.object({}),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager) => {
    try {
      const query = `
        SELECT
          SERVERPROPERTY('ProductVersion') AS version,
          SERVERPROPERTY('ProductLevel') AS product_level,
          SERVERPROPERTY('Edition') AS edition,
          SERVERPROPERTY('EngineEdition') AS engine_edition,
          SERVERPROPERTY('MachineName') AS machine_name,
          SERVERPROPERTY('ServerName') AS server_name,
          SERVERPROPERTY('IsClustered') AS is_clustered,
          SERVERPROPERTY('IsHadrEnabled') AS is_hadr_enabled,
          SERVERPROPERTY('Collation') AS collation,
          @@VERSION AS full_version
      `;

      const result = await connectionManager.executeQuery(query);
      const serverInfo = result.recordset[0];

      let response = `SQL Server Information:\n\n`;
      response += `Version: ${serverInfo.version}\n`;
      response += `Product Level: ${serverInfo.product_level}\n`;
      response += `Edition: ${serverInfo.edition}\n`;
      response += `Server Name: ${serverInfo.server_name}\n`;
      response += `Machine Name: ${serverInfo.machine_name}\n`;
      response += `Clustered: ${serverInfo.is_clustered ? 'Yes' : 'No'}\n`;
      response += `HADR Enabled: ${serverInfo.is_hadr_enabled ? 'Yes' : 'No'}\n`;
      response += `Collation: ${serverInfo.collation}\n\n`;
      response += `Full Version:\n${serverInfo.full_version}`;

      return {
        content: [
          {
            type: 'text' as const,
            text: response,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: formatError(error),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Get database size information
 */
export const getDatabaseSizeTool = {
  name: 'sqlserver_get_database_size',
  description: 'Get size information for the current database',
  inputSchema: z.object({}),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager) => {
    try {
      const query = `
        SELECT
          DB_NAME() AS database_name,
          SUM(CAST(size AS BIGINT) * 8 / 1024) AS size_mb,
          SUM(CASE WHEN type_desc = 'ROWS' THEN CAST(size AS BIGINT) * 8 / 1024 ELSE 0 END) AS data_size_mb,
          SUM(CASE WHEN type_desc = 'LOG' THEN CAST(size AS BIGINT) * 8 / 1024 ELSE 0 END) AS log_size_mb
        FROM sys.database_files
        GROUP BY DB_NAME()
      `;

      const result = await connectionManager.executeQuery(query);
      const sizeInfo = result.recordset[0];

      let response = `Database Size Information:\n\n`;
      response += `Database: ${sizeInfo.database_name}\n`;
      response += `Total Size: ${sizeInfo.size_mb} MB\n`;
      response += `Data Size: ${sizeInfo.data_size_mb} MB\n`;
      response += `Log Size: ${sizeInfo.log_size_mb} MB\n`;

      return {
        content: [
          {
            type: 'text' as const,
            text: response,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: formatError(error),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Get current connections
 */
export const getCurrentConnectionsTool = {
  name: 'sqlserver_get_current_connections',
  description: 'Get information about current database connections',
  inputSchema: z.object({}),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager) => {
    try {
      const query = `
        SELECT
          session_id,
          login_name,
          host_name,
          program_name,
          status,
          DB_NAME(database_id) AS database_name,
          login_time,
          last_request_start_time,
          cpu_time,
          memory_usage,
          reads,
          writes
        FROM sys.dm_exec_sessions
        WHERE is_user_process = 1
        ORDER BY session_id
      `;

      const result = await connectionManager.executeQuery(query);
      const connections = result.recordset;

      return {
        content: [
          {
            type: 'text' as const,
            text: `Current Connections (${connections.length}):\n\n` + formatResultsAsTable(connections),
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: formatError(error),
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Restart SQL Server service
 * Based on dbatools Restart-DbaService functionality
 */
const restartServiceInputSchema = z.object({
  instanceName: z.string().optional().describe('SQL Server instance name (e.g., MSSQLSERVER for default instance, or named instance like SQL2019). If not specified, restarts all SQL Server services.'),
  serviceType: z.enum(['Engine', 'Agent', 'Browser', 'FullText', 'SSAS', 'SSIS', 'SSRS', 'PolyBase', 'Launchpad', 'All']).optional().describe('Type of SQL Server service to restart. If not specified or "All", restarts all SQL Server services for the instance.'),
  force: z.boolean().optional().describe('Automatically include dependent services (SQL Agent, PolyBase, Launchpad) when restarting Database Engine services (default: true)'),
  timeout: z.number().optional().describe('Timeout in seconds for service stop/start operations (default: 60)'),
});

export const restartServiceTool = {
  name: 'sqlserver_restart_service',
  description: 'Restart SQL Server services with proper dependency handling and service ordering. Supports Engine, Agent, Browser, FullText, SSAS, SSIS, SSRS, PolyBase, and Launchpad services. Requires administrator privileges.',
  inputSchema: restartServiceInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof restartServiceInputSchema>) => {
    try {
      const { instanceName, serviceType = 'All', force = true, timeout = 60 } = input;

      // Build service name pattern based on instance and type
      const serviceNames: string[] = [];
      const instanceSuffix = instanceName && instanceName !== 'MSSQLSERVER' ? `$${instanceName}` : '';

      // Map service types to Windows service names
      const serviceTypeMap: Record<string, string> = {
        'Engine': instanceName === 'MSSQLSERVER' || !instanceName ? 'MSSQLSERVER' : `MSSQL$${instanceName}`,
        'Agent': instanceName === 'MSSQLSERVER' || !instanceName ? 'SQLSERVERAGENT' : `SQLAgent$${instanceName}`,
        'Browser': 'SQLBrowser',
        'FullText': instanceName === 'MSSQLSERVER' || !instanceName ? 'MSSQLFDLauncher' : `MSSQLFDLauncher$${instanceName}`,
        'SSAS': instanceName === 'MSSQLSERVER' || !instanceName ? 'MSSQLServerOLAPService' : `MSOLAP$${instanceName}`,
        'SSIS': 'MsDtsServer160', // SQL Server 2022, adjust version as needed
        'SSRS': instanceName === 'MSSQLSERVER' || !instanceName ? 'ReportServer' : `ReportServer$${instanceName}`,
        'PolyBase': instanceName === 'MSSQLSERVER' || !instanceName ? 'SQLPBDMS' : `SQLPBDMS$${instanceName}`,
        'Launchpad': instanceName === 'MSSQLSERVER' || !instanceName ? 'MSSQLLaunchpad' : `MSSQLLaunchpad$${instanceName}`,
      };

      if (serviceType === 'All') {
        // Get all SQL Server services for the instance
        Object.values(serviceTypeMap).forEach(svc => serviceNames.push(svc));
      } else {
        serviceNames.push(serviceTypeMap[serviceType]);

        // If restarting Engine with force, include dependent services
        if (serviceType === 'Engine' && force) {
          serviceNames.push(serviceTypeMap['Agent']);
          serviceNames.push(serviceTypeMap['PolyBase']);
          serviceNames.push(serviceTypeMap['Launchpad']);
        }
      }

      let response = `Restarting SQL Server Services:\n\n`;
      const results: Array<{ service: string; status: string; message: string }> = [];

      // Restart each service
      for (const serviceName of serviceNames) {
        try {
          // Check if service exists
          const checkCmd = `powershell -Command "Get-Service -Name '${serviceName}' -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Name"`;
          const { stdout: checkOutput } = await execAsync(checkCmd);

          if (!checkOutput.trim()) {
            results.push({
              service: serviceName,
              status: 'SKIPPED',
              message: 'Service not found',
            });
            continue;
          }

          // Stop the service
          response += `Stopping ${serviceName}...\n`;
          const stopCmd = `powershell -Command "Stop-Service -Name '${serviceName}' -Force -WarningAction SilentlyContinue"`;
          await execAsync(stopCmd, { timeout: timeout * 1000 });

          // Wait a moment for clean shutdown
          await new Promise(resolve => setTimeout(resolve, 2000));

          // Start the service
          response += `Starting ${serviceName}...\n`;
          const startCmd = `powershell -Command "Start-Service -Name '${serviceName}' -WarningAction SilentlyContinue"`;
          await execAsync(startCmd, { timeout: timeout * 1000 });

          // Verify service is running
          const statusCmd = `powershell -Command "Get-Service -Name '${serviceName}' | Select-Object -ExpandProperty Status"`;
          const { stdout: statusOutput } = await execAsync(statusCmd);
          const status = statusOutput.trim();

          results.push({
            service: serviceName,
            status: status === 'Running' ? 'SUCCESS' : 'WARNING',
            message: status === 'Running' ? 'Service restarted successfully' : `Service status: ${status}`,
          });

        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          results.push({
            service: serviceName,
            status: 'FAILED',
            message: errorMsg,
          });
        }
      }

      // Build summary response
      response += `\nRestart Summary:\n\n`;
      results.forEach(result => {
        response += `${result.service}: [${result.status}] ${result.message}\n`;
      });

      const successCount = results.filter(r => r.status === 'SUCCESS').length;
      const failCount = results.filter(r => r.status === 'FAILED').length;

      response += `\nTotal: ${results.length} services | Success: ${successCount} | Failed: ${failCount}\n`;

      if (failCount > 0) {
        response += `\n⚠️  Some services failed to restart. Please check the error messages above.`;
      } else {
        response += `\n✅ All services restarted successfully.`;
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: response,
          },
        ],
        isError: failCount > 0,
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: formatError(error),
          },
        ],
        isError: true,
      };
    }
  },
};
