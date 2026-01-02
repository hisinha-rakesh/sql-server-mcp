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
 * Enables Query Store for a database
 */
const enableQueryStoreInputSchema = z.object({
  database: z.string().describe('Database name to enable Query Store'),
  maxStorageSizeMB: z.number().default(1000).optional().describe('Maximum storage size in MB (default: 1000)'),
  queryCaptureMode: z.enum(['ALL', 'AUTO', 'NONE', 'CUSTOM']).default('AUTO').optional().describe('Query capture mode'),
  cleanupMode: z.enum(['AUTO', 'OFF']).default('AUTO').optional().describe('Size-based cleanup mode'),
});

export const enableQueryStoreTool = {
  name: 'sqlserver_enable_query_store',
  description: 'Enable Query Store for a database with specified configuration. Query Store captures query performance metrics for troubleshooting and optimization.',
  inputSchema: enableQueryStoreInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof enableQueryStoreInputSchema>) => {
    try {
      const { database, maxStorageSizeMB, queryCaptureMode, cleanupMode } = input;

      const query = `
        ALTER DATABASE [${database}]
        SET QUERY_STORE = ON (
          OPERATION_MODE = READ_WRITE,
          MAX_STORAGE_SIZE_MB = ${maxStorageSizeMB},
          QUERY_CAPTURE_MODE = ${queryCaptureMode},
          SIZE_BASED_CLEANUP_MODE = ${cleanupMode},
          DATA_FLUSH_INTERVAL_SECONDS = 900,
          INTERVAL_LENGTH_MINUTES = 60,
          STALE_QUERY_THRESHOLD_DAYS = 30
        );
      `;

      await connectionManager.executeQuery(query);

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Query Store enabled for database '${database}'.\n\n` +
                `Configuration:\n` +
                `- Max Storage: ${maxStorageSizeMB} MB\n` +
                `- Capture Mode: ${queryCaptureMode}\n` +
                `- Cleanup Mode: ${cleanupMode}\n\n` +
                `Query Store will now begin capturing query performance data.`,
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
