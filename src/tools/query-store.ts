import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';
import { formatResultsAsTable } from '../utils/formatters.js';

/**
 * Get Query Store Status Tool
 * Gets the current status and configuration of Query Store
 */
const getQueryStoreStatusInputSchema = z.object({
  database: z.string().describe('Database name to check Query Store status'),
});

export const getQueryStoreStatusTool = {
  name: 'sqlserver_get_query_store_status',
  description: 'Get Query Store status and configuration for a database. Shows whether Query Store is enabled and its current settings.',
  inputSchema: getQueryStoreStatusInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getQueryStoreStatusInputSchema>) => {
    try {
      const { database } = input;

      const query = `
        SELECT
          d.name AS DatabaseName,
          d.is_query_store_on AS IsEnabled,
          dqso.actual_state_desc AS ActualState,
          dqso.readonly_reason AS ReadOnlyReason,
          dqso.desired_state_desc AS DesiredState,
          dqso.current_storage_size_mb AS CurrentStorageSizeMB,
          dqso.max_storage_size_mb AS MaxStorageSizeMB,
          dqso.query_capture_mode_desc AS QueryCaptureMode,
          dqso.size_based_cleanup_mode_desc AS CleanupMode,
          dqso.stale_query_threshold_days AS StaleQueryThresholdDays,
          dqso.max_plans_per_query AS MaxPlansPerQuery,
          dqso.wait_stats_capture_mode_desc AS WaitStatsCaptureMode
        FROM sys.databases d
        LEFT JOIN sys.database_query_store_options dqso
          ON d.database_id = dqso.database_id
        WHERE d.name = @database;
      `;

      const result = await connectionManager.executeQuery(query, { database });

      if (result.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Error: Database '${database}' not found.`,
          }],
          isError: true,
        };
      }

      const qsStatus = result.recordset[0];

      return {
        content: [{
          type: 'text' as const,
          text: `Query Store Status for '${database}':\n\n${formatResultsAsTable(result.recordset)}\n\n` +
                `${qsStatus.IsEnabled
                  ? `✅ Query Store is ENABLED (${qsStatus.ActualState})\n` +
                    `Storage: ${qsStatus.CurrentStorageSizeMB} MB / ${qsStatus.MaxStorageSizeMB} MB (${((qsStatus.CurrentStorageSizeMB / qsStatus.MaxStorageSizeMB) * 100).toFixed(1)}% used)`
                  : '❌ Query Store is DISABLED. Enable it to capture query performance data.'
                }`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: formatError(error),
        }],
        isError: true,
      };
    }
  },
};

/**
 * Enable Query Store Tool
 * Enables Query Store for a database after checking version and edition compatibility
 */
const enableQueryStoreInputSchema = z.object({
  database: z.string().describe('Database name to enable Query Store'),
  maxStorageSizeMB: z.number().default(1000).optional().describe('Maximum storage size in MB (default: 1000)'),
  queryCaptureMode: z.enum(['ALL', 'AUTO', 'NONE', 'CUSTOM']).default('AUTO').optional().describe('Query capture mode'),
  cleanupMode: z.enum(['AUTO', 'OFF']).default('AUTO').optional().describe('Size-based cleanup mode'),
  waitStatsCaptureMode: z.enum(['ON', 'OFF']).default('ON').optional().describe('Wait statistics capture mode (SQL Server 2017+)'),
  maxPlansPerQuery: z.number().default(200).optional().describe('Maximum plans per query (default: 200)'),
});

export const enableQueryStoreTool = {
  name: 'sqlserver_enable_query_store',
  description: `Enable Query Store for a database after checking SQL Server version and edition compatibility.

Query Store is available in:
- SQL Server 2016 (13.x) and later: Standard, Enterprise, Developer, Web, Express editions
- Azure SQL Database: All tiers
- Azure SQL Managed Instance: All tiers

The tool automatically:
1. Checks SQL Server version (requires 13.x / 2016 or later)
2. Validates edition compatibility
3. Adjusts options based on version (e.g., wait stats capture for 2017+)
4. Enables Query Store with optimal settings`,
  inputSchema: enableQueryStoreInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof enableQueryStoreInputSchema>) => {
    try {
      const { database, maxStorageSizeMB, queryCaptureMode, cleanupMode, waitStatsCaptureMode, maxPlansPerQuery } = input;

      // Step 1: Check SQL Server version and edition
      const versionQuery = `
        SELECT
          SERVERPROPERTY('ProductVersion') AS ProductVersion,
          SERVERPROPERTY('ProductMajorVersion') AS MajorVersion,
          SERVERPROPERTY('ProductMinorVersion') AS MinorVersion,
          SERVERPROPERTY('Edition') AS Edition,
          SERVERPROPERTY('EngineEdition') AS EngineEdition,
          SERVERPROPERTY('ProductLevel') AS ProductLevel,
          @@VERSION AS FullVersion
      `;

      const versionResult = await connectionManager.executeQuery(versionQuery, {});
      const serverInfo = versionResult.recordset[0];

      const majorVersion = parseInt(serverInfo.MajorVersion || serverInfo.ProductVersion?.split('.')[0] || '0');
      const edition = serverInfo.Edition as string;
      const engineEdition = serverInfo.EngineEdition as number;

      // Query Store minimum version is SQL Server 2016 (version 13)
      const minVersion = 13;

      // Version check
      if (majorVersion < minVersion) {
        return {
          content: [{
            type: 'text' as const,
            text: `Query Store is NOT supported on this SQL Server version.\n\n` +
                  `Current Version:\n` +
                  `- Product Version: ${serverInfo.ProductVersion}\n` +
                  `- Edition: ${edition}\n` +
                  `- Full Version: ${serverInfo.FullVersion}\n\n` +
                  `Requirements:\n` +
                  `- SQL Server 2016 (version 13.x) or later\n` +
                  `- Azure SQL Database (any tier)\n` +
                  `- Azure SQL Managed Instance (any tier)\n\n` +
                  `Your SQL Server major version is ${majorVersion}, but Query Store requires version 13 or higher.`,
          }],
          isError: true,
        };
      }

      // Edition check - Query Store is available in all editions of SQL Server 2016+
      // EngineEdition values: 1=Personal/Desktop, 2=Standard, 3=Enterprise, 4=Express, 5=Azure SQL DB, 6=Azure Synapse, 8=Azure SQL MI
      const supportedEngineEditions = [2, 3, 4, 5, 6, 8]; // Standard, Enterprise, Express, Azure SQL DB, Azure Synapse, Azure SQL MI
      const supportedEditionPatterns = ['Standard', 'Enterprise', 'Developer', 'Web', 'Express', 'Azure'];

      const isEditionSupported = supportedEngineEditions.includes(engineEdition) ||
        supportedEditionPatterns.some(pattern => edition.toLowerCase().includes(pattern.toLowerCase()));

      if (!isEditionSupported) {
        return {
          content: [{
            type: 'text' as const,
            text: `Query Store may not be supported on this edition.\n\n` +
                  `Current Edition: ${edition}\n` +
                  `Engine Edition Code: ${engineEdition}\n\n` +
                  `Query Store is supported on:\n` +
                  `- SQL Server: Standard, Enterprise, Developer, Web, Express editions\n` +
                  `- Azure SQL Database: All tiers\n` +
                  `- Azure SQL Managed Instance: All tiers\n\n` +
                  `Proceeding may fail if your edition does not support Query Store.`,
          }],
          isError: true,
        };
      }

      // Step 2: Check if database exists and is accessible
      const dbCheckQuery = `
        SELECT
          name,
          state_desc AS DatabaseState,
          is_read_only AS IsReadOnly,
          is_query_store_on AS QueryStoreAlreadyEnabled
        FROM sys.databases
        WHERE name = @database
      `;

      const dbCheckResult = await connectionManager.executeQuery(dbCheckQuery, { database });

      if (dbCheckResult.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `Database '${database}' not found.`,
          }],
          isError: true,
        };
      }

      const dbInfo = dbCheckResult.recordset[0];

      if (dbInfo.DatabaseState !== 'ONLINE') {
        return {
          content: [{
            type: 'text' as const,
            text: `Database '${database}' is not online (current state: ${dbInfo.DatabaseState}). Query Store can only be enabled on online databases.`,
          }],
          isError: true,
        };
      }

      if (dbInfo.QueryStoreAlreadyEnabled) {
        return {
          content: [{
            type: 'text' as const,
            text: `Query Store is already enabled for database '${database}'.\n\n` +
                  `Use sqlserver_get_query_store_status to view current configuration.`,
          }],
        };
      }

      // Step 3: Build the ALTER DATABASE command based on version
      // WAIT_STATS_CAPTURE_MODE is only available in SQL Server 2017 (14.x) and later
      const supportsWaitStats = majorVersion >= 14;

      let alterQuery = `
        ALTER DATABASE [${database}]
        SET QUERY_STORE = ON (
          OPERATION_MODE = READ_WRITE,
          MAX_STORAGE_SIZE_MB = ${maxStorageSizeMB},
          QUERY_CAPTURE_MODE = ${queryCaptureMode},
          SIZE_BASED_CLEANUP_MODE = ${cleanupMode},
          DATA_FLUSH_INTERVAL_SECONDS = 900,
          INTERVAL_LENGTH_MINUTES = 60,
          STALE_QUERY_THRESHOLD_DAYS = 30,
          MAX_PLANS_PER_QUERY = ${maxPlansPerQuery}`;

      if (supportsWaitStats) {
        alterQuery += `,
          WAIT_STATS_CAPTURE_MODE = ${waitStatsCaptureMode}`;
      }

      alterQuery += `
        );
      `;

      await connectionManager.executeQuery(alterQuery, {});

      // Step 4: Verify Query Store is enabled
      const verifyQuery = `
        SELECT
          actual_state_desc AS ActualState,
          current_storage_size_mb AS CurrentStorageMB,
          max_storage_size_mb AS MaxStorageMB,
          query_capture_mode_desc AS CaptureMode
        FROM sys.database_query_store_options
        WHERE database_id = DB_ID(@database)
      `;

      const verifyResult = await connectionManager.executeQuery(verifyQuery, { database });
      const qsStatus = verifyResult.recordset[0];

      return {
        content: [{
          type: 'text' as const,
          text: `Query Store successfully enabled for database '${database}'.\n\n` +
                `SQL Server Information:\n` +
                `- Version: ${serverInfo.ProductVersion} (${serverInfo.ProductLevel})\n` +
                `- Edition: ${edition}\n` +
                `- Major Version: ${majorVersion} (${majorVersion >= 14 ? 'Full feature support' : 'Basic support'})\n\n` +
                `Query Store Configuration:\n` +
                `- Actual State: ${qsStatus?.ActualState || 'READ_WRITE'}\n` +
                `- Max Storage: ${maxStorageSizeMB} MB\n` +
                `- Capture Mode: ${queryCaptureMode}\n` +
                `- Cleanup Mode: ${cleanupMode}\n` +
                `- Max Plans Per Query: ${maxPlansPerQuery}\n` +
                (supportsWaitStats ? `- Wait Stats Capture: ${waitStatsCaptureMode}\n` : `- Wait Stats Capture: Not available (requires SQL Server 2017+)\n`) +
                `\nQuery Store will now begin capturing query performance data.\n` +
                `Use sqlserver_get_query_store_top_queries to view captured query statistics.`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: formatError(error),
        }],
        isError: true,
      };
    }
  },
};

/**
 * Disable Query Store Tool
 * Disables Query Store for a database
 */
const disableQueryStoreInputSchema = z.object({
  database: z.string().describe('Database name to disable Query Store'),
  clearData: z.boolean().default(false).optional().describe('Clear Query Store data after disabling (default: false)'),
});

export const disableQueryStoreTool = {
  name: 'sqlserver_disable_query_store',
  description: 'Disable Query Store for a database. Optionally clear all Query Store data.',
  inputSchema: disableQueryStoreInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof disableQueryStoreInputSchema>) => {
    try {
      const { database, clearData } = input;

      if (clearData) {
        const clearQuery = `ALTER DATABASE [${database}] SET QUERY_STORE CLEAR;`;
        await connectionManager.executeQuery(clearQuery);
      }

      const disableQuery = `ALTER DATABASE [${database}] SET QUERY_STORE = OFF;`;
      await connectionManager.executeQuery(disableQuery);

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Query Store disabled for database '${database}'.${clearData ? ' All Query Store data has been cleared.' : ''}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: formatError(error),
        }],
        isError: true,
      };
    }
  },
};

/**
 * Get Top Queries from Query Store
 * Retrieves the top queries by various metrics
 */
const getQueryStoreTopQueriesInputSchema = z.object({
  database: z.string().describe('Database name'),
  metric: z.enum(['cpu', 'duration', 'execution_count', 'memory', 'logical_reads', 'physical_reads']).default('cpu').describe('Metric to order by'),
  topN: z.number().default(20).optional().describe('Number of top queries to return (default: 20, max: 100)'),
  hours: z.number().default(24).optional().describe('Time window in hours (default: 24)'),
});

export const getQueryStoreTopQueriesTool = {
  name: 'sqlserver_get_query_store_top_queries',
  description: 'Get top queries from Query Store by CPU, duration, execution count, or other metrics. Useful for identifying resource-intensive queries.',
  inputSchema: getQueryStoreTopQueriesInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getQueryStoreTopQueriesInputSchema>) => {
    try {
      const { database, metric, topN, hours } = input;

      const metricColumn = {
        cpu: 'total_cpu_time',
        duration: 'total_duration',
        execution_count: 'count_executions',
        memory: 'total_grant_kb',
        logical_reads: 'total_logical_reads',
        physical_reads: 'total_physical_reads',
      }[metric];

      const query = `
        USE [${database}];

        SELECT TOP ${topN}
          q.query_id AS QueryID,
          OBJECT_NAME(q.object_id) AS ObjectName,
          qt.query_sql_text AS QueryText,
          rs.count_executions AS ExecutionCount,
          rs.avg_duration / 1000.0 AS AvgDurationMS,
          rs.avg_cpu_time / 1000.0 AS AvgCpuTimeMS,
          rs.avg_logical_io_reads AS AvgLogicalReads,
          rs.avg_physical_io_reads AS AvgPhysicalReads,
          rs.avg_query_max_used_memory * 8 / 1024.0 AS AvgMemoryMB,
          rs.last_execution_time AS LastExecutionTime,
          rs.${metricColumn} AS ${metric.toUpperCase()}
        FROM sys.query_store_query q
        INNER JOIN sys.query_store_query_text qt
          ON q.query_text_id = qt.query_text_id
        INNER JOIN sys.query_store_plan p
          ON q.query_id = p.query_id
        INNER JOIN sys.query_store_runtime_stats rs
          ON p.plan_id = rs.plan_id
        INNER JOIN sys.query_store_runtime_stats_interval rsi
          ON rs.runtime_stats_interval_id = rsi.runtime_stats_interval_id
        WHERE rsi.start_time >= DATEADD(HOUR, -${hours}, GETUTCDATE())
        ORDER BY rs.${metricColumn} DESC;
      `;

      const result = await connectionManager.executeQuery(query);

      if (result.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No queries found in Query Store for database '${database}' in the last ${hours} hours.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Top ${result.recordset.length} Queries by ${metric.toUpperCase()}:\n\n${formatResultsAsTable(result.recordset)}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: formatError(error),
        }],
        isError: true,
      };
    }
  },
};

/**
 * Get Regressed Queries from Query Store
 * Finds queries with performance degradation
 */
const getQueryStoreRegressedQueriesInputSchema = z.object({
  database: z.string().describe('Database name'),
  metric: z.enum(['cpu', 'duration', 'logical_reads']).default('duration').describe('Metric to analyze for regression'),
  hours: z.number().default(24).optional().describe('Time window in hours (default: 24)'),
  regressionThresholdPercent: z.number().default(50).optional().describe('Minimum regression percentage to report (default: 50%)'),
});

export const getQueryStoreRegressedQueriesTool = {
  name: 'sqlserver_get_query_store_regressed_queries',
  description: 'Identify queries with performance regression using Query Store. Compares recent performance to historical baseline.',
  inputSchema: getQueryStoreRegressedQueriesInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getQueryStoreRegressedQueriesInputSchema>) => {
    try {
      const { database, metric, hours, regressionThresholdPercent } = input;

      const metricColumn = {
        cpu: 'avg_cpu_time',
        duration: 'avg_duration',
        logical_reads: 'avg_logical_io_reads',
      }[metric];

      const query = `
        USE [${database}];

        WITH RecentStats AS (
          SELECT
            p.query_id,
            AVG(rs.${metricColumn}) AS recent_avg
          FROM sys.query_store_plan p
          INNER JOIN sys.query_store_runtime_stats rs
            ON p.plan_id = rs.plan_id
          INNER JOIN sys.query_store_runtime_stats_interval rsi
            ON rs.runtime_stats_interval_id = rsi.runtime_stats_interval_id
          WHERE rsi.start_time >= DATEADD(HOUR, -${hours}, GETUTCDATE())
          GROUP BY p.query_id
        ),
        HistoricalStats AS (
          SELECT
            p.query_id,
            AVG(rs.${metricColumn}) AS historical_avg
          FROM sys.query_store_plan p
          INNER JOIN sys.query_store_runtime_stats rs
            ON p.plan_id = rs.plan_id
          INNER JOIN sys.query_store_runtime_stats_interval rsi
            ON rs.runtime_stats_interval_id = rsi.runtime_stats_interval_id
          WHERE rsi.start_time < DATEADD(HOUR, -${hours}, GETUTCDATE())
            AND rsi.start_time >= DATEADD(DAY, -7, GETUTCDATE())
          GROUP BY p.query_id
        )
        SELECT
          q.query_id AS QueryID,
          OBJECT_NAME(q.object_id) AS ObjectName,
          SUBSTRING(qt.query_sql_text, 1, 200) AS QueryText,
          h.historical_avg AS HistoricalAvg,
          r.recent_avg AS RecentAvg,
          ((r.recent_avg - h.historical_avg) / h.historical_avg * 100) AS RegressionPercent
        FROM sys.query_store_query q
        INNER JOIN sys.query_store_query_text qt
          ON q.query_text_id = qt.query_text_id
        INNER JOIN RecentStats r
          ON q.query_id = r.query_id
        INNER JOIN HistoricalStats h
          ON q.query_id = h.query_id
        WHERE ((r.recent_avg - h.historical_avg) / h.historical_avg * 100) >= ${regressionThresholdPercent}
        ORDER BY RegressionPercent DESC;
      `;

      const result = await connectionManager.executeQuery(query);

      if (result.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `✅ No regressed queries found in database '${database}' (threshold: ${regressionThresholdPercent}% regression in ${metric}).`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `⚠️  Regressed Queries Found (${metric}):\n\n${formatResultsAsTable(result.recordset)}\n\n` +
                `Total regressed queries: ${result.recordset.length}`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: formatError(error),
        }],
        isError: true,
      };
    }
  },
};

/**
 * Clear Query Store Data
 * Clears all data from Query Store
 */
const clearQueryStoreInputSchema = z.object({
  database: z.string().describe('Database name to clear Query Store data'),
});

export const clearQueryStoreTool = {
  name: 'sqlserver_clear_query_store',
  description: 'Clear all data from Query Store. WARNING: This removes all captured query performance history.',
  inputSchema: clearQueryStoreInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof clearQueryStoreInputSchema>) => {
    try {
      const { database } = input;

      const query = `ALTER DATABASE [${database}] SET QUERY_STORE CLEAR;`;
      await connectionManager.executeQuery(query);

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Query Store data cleared for database '${database}'. Query Store will begin capturing fresh data.`,
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: formatError(error),
        }],
        isError: true,
      };
    }
  },
};
