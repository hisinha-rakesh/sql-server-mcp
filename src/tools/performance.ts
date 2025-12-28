import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';
import { formatResultsAsTable } from '../utils/formatters.js';

// Input schemas
const getCpuUsageInputSchema = z.object({
  threshold: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe('Minimum CPU percentage threshold to filter results (default: 0). Only shows sessions with CPU usage at or above this percentage.'),
  includeSystemProcesses: z
    .boolean()
    .optional()
    .describe('Include system processes (session_id <= 50) in results (default: false)'),
});

/**
 * Get SQL Server CPU usage by session
 * Correlates SQL Server processes with threads to identify which queries are consuming CPU resources
 */
export const getCpuUsageTool = {
  name: 'sqlserver_get_cpu_usage',
  description: `Correlates SQL Server sessions with Windows threads to identify which queries are consuming CPU resources.

This tool helps pinpoint which specific SQL queries or processes are responsible for high CPU usage by querying SQL Server's dynamic management views (DMVs). It shows:
- Session IDs (SPID) and their corresponding Windows thread IDs (KPID)
- CPU time, total elapsed time, and other performance metrics
- The actual SQL queries being executed
- Session status, login name, host name, and program name
- Wait types and wait times

This is particularly valuable during performance troubleshooting when you need to identify the root cause of high CPU usage.

Reference: https://www.mssqltips.com/sqlservertip/2454/how-to-find-out-how-much-cpu-a-sql-server-process-is-really-using/`,
  inputSchema: getCpuUsageInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (
    connectionManager: ConnectionManager,
    input: z.infer<typeof getCpuUsageInputSchema>
  ) => {
    try {
      const threshold = input.threshold ?? 0;
      const includeSystemProcesses = input.includeSystemProcesses ?? false;

      // Query to get CPU usage information with SPID to KPID correlation
      const query = `
        SELECT
          s.session_id AS spid,
          t.os_thread_id AS kpid,
          s.login_name,
          s.host_name,
          s.program_name,
          s.status,
          s.cpu_time AS session_cpu_time_ms,
          s.total_elapsed_time AS session_elapsed_time_ms,
          s.memory_usage AS memory_usage_pages,
          s.reads AS logical_reads,
          s.writes,
          CASE
            WHEN s.total_elapsed_time > 0
            THEN CAST((s.cpu_time * 100.0 / s.total_elapsed_time) AS DECIMAL(5,2))
            ELSE 0
          END AS cpu_percentage,
          r.cpu_time AS request_cpu_time_ms,
          r.total_elapsed_time AS request_elapsed_time_ms,
          r.wait_type,
          r.wait_time AS wait_time_ms,
          r.last_wait_type,
          r.blocking_session_id,
          r.command,
          SUBSTRING(
            qt.text,
            (r.statement_start_offset / 2) + 1,
            (
              CASE r.statement_end_offset
                WHEN -1 THEN DATALENGTH(qt.text)
                ELSE r.statement_end_offset
              END - r.statement_start_offset
            ) / 2 + 1
          ) AS current_query,
          qt.text AS full_query_text,
          DB_NAME(s.database_id) AS database_name,
          s.last_request_start_time,
          s.last_request_end_time,
          s.row_count,
          s.transaction_isolation_level
        FROM sys.dm_exec_sessions s
        LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
        LEFT JOIN sys.dm_os_workers w ON r.task_address = w.task_address
        LEFT JOIN sys.dm_os_threads t ON w.thread_address = t.thread_address
        OUTER APPLY sys.dm_exec_sql_text(r.sql_handle) AS qt
        WHERE
          s.session_id <> @@SPID  -- Exclude current session
          ${!includeSystemProcesses ? 'AND s.session_id > 50' : ''}  -- Exclude system processes by default
          AND (
            s.cpu_time > 0  -- Has used CPU time
            OR r.session_id IS NOT NULL  -- Or has an active request
          )
          AND (
            CASE
              WHEN s.total_elapsed_time > 0
              THEN (s.cpu_time * 100.0 / s.total_elapsed_time)
              ELSE 0
            END
          ) >= @threshold
        ORDER BY cpu_percentage DESC, s.cpu_time DESC
      `;

      const result = await connectionManager.executeQuery(query, { threshold });
      const cpuUsage = result.recordset;

      if (cpuUsage.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No sessions found with CPU usage >= ${threshold}%${!includeSystemProcesses ? ' (excluding system processes)' : ''}.`,
            },
          ],
        };
      }

      // Calculate total CPU time across all sessions
      const totalCpuTime = cpuUsage.reduce(
        (sum, row) => sum + (row.session_cpu_time_ms || 0),
        0
      );

      let response = `CPU Usage Analysis (${cpuUsage.length} sessions):\n\n`;

      // Add summary statistics
      response += `Summary:\n`;
      response += `- Total sessions: ${cpuUsage.length}\n`;
      response += `- Total CPU time: ${totalCpuTime.toLocaleString()} ms\n`;
      response += `- Threshold: ${threshold}%\n`;
      response += `- Include system processes: ${includeSystemProcesses}\n\n`;

      // Format the detailed results
      response += `Detailed CPU Usage:\n\n`;
      response += formatResultsAsTable(cpuUsage);

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
 * Get top CPU consuming queries over time
 */
const getTopCpuQueriesInputSchema = z.object({
  topN: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Number of top queries to return (default: 10, max: 100)'),
});

export const getTopCpuQueriesTool = {
  name: 'sqlserver_get_top_cpu_queries',
  description: `Get the top CPU-consuming queries from the query plan cache.

This tool analyzes the query plan cache to identify queries that have consumed the most CPU time historically. It returns aggregated statistics including:
- Total CPU time consumed
- Average CPU time per execution
- Execution count
- Query text
- Last execution time
- Min and max CPU times

This is useful for identifying queries that should be optimized to reduce overall CPU load.`,
  inputSchema: getTopCpuQueriesInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (
    connectionManager: ConnectionManager,
    input: z.infer<typeof getTopCpuQueriesInputSchema>
  ) => {
    try {
      const topN = input.topN ?? 10;

      const query = `
        SELECT TOP (@topN)
          qs.total_worker_time / 1000 AS total_cpu_time_ms,
          qs.execution_count,
          (qs.total_worker_time / 1000) / qs.execution_count AS avg_cpu_time_ms,
          (qs.min_worker_time / 1000) AS min_cpu_time_ms,
          (qs.max_worker_time / 1000) AS max_cpu_time_ms,
          qs.last_execution_time,
          qs.creation_time AS plan_creation_time,
          SUBSTRING(
            qt.text,
            (qs.statement_start_offset / 2) + 1,
            (
              CASE qs.statement_end_offset
                WHEN -1 THEN DATALENGTH(qt.text)
                ELSE qs.statement_end_offset
              END - qs.statement_start_offset
            ) / 2 + 1
          ) AS query_text,
          DB_NAME(qt.dbid) AS database_name,
          qs.total_elapsed_time / 1000 AS total_elapsed_time_ms,
          qs.total_logical_reads,
          qs.total_logical_writes,
          qs.total_physical_reads
        FROM sys.dm_exec_query_stats qs
        CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) AS qt
        WHERE qt.text NOT LIKE '%dm_exec_query_stats%'  -- Exclude this query itself
        ORDER BY qs.total_worker_time DESC
      `;

      const result = await connectionManager.executeQuery(query, { topN });
      const topQueries = result.recordset;

      if (topQueries.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No query statistics found in the plan cache.',
            },
          ],
        };
      }

      // Calculate totals
      const totalCpuTime = topQueries.reduce(
        (sum, row) => sum + (row.total_cpu_time_ms || 0),
        0
      );
      const totalExecutions = topQueries.reduce(
        (sum, row) => sum + (row.execution_count || 0),
        0
      );

      let response = `Top ${topN} CPU-Consuming Queries from Plan Cache:\n\n`;

      // Add summary
      response += `Summary:\n`;
      response += `- Total queries returned: ${topQueries.length}\n`;
      response += `- Combined CPU time: ${totalCpuTime.toLocaleString()} ms\n`;
      response += `- Combined executions: ${totalExecutions.toLocaleString()}\n\n`;

      // Format the results
      response += formatResultsAsTable(topQueries);

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
 * Get current wait statistics
 */
const getWaitStatsInputSchema = z.object({
  topN: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Number of top wait types to return (default: 20, max: 100)'),
});

export const getWaitStatsTool = {
  name: 'sqlserver_get_wait_stats',
  description: `Get SQL Server wait statistics showing what the server is waiting on.

Wait statistics help identify performance bottlenecks by showing what SQL Server threads are waiting for. This includes:
- Wait type (e.g., LCK_M_X for exclusive locks, PAGEIOLATCH_SH for disk I/O)
- Wait time in milliseconds
- Wait count (number of times this wait occurred)
- Average wait time
- Percentage of total wait time

This is essential for diagnosing performance issues and understanding where SQL Server is spending time waiting rather than processing.`,
  inputSchema: getWaitStatsInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (
    connectionManager: ConnectionManager,
    input: z.infer<typeof getWaitStatsInputSchema>
  ) => {
    try {
      const topN = input.topN ?? 20;

      const query = `
        WITH Waits AS (
          SELECT
            wait_type,
            wait_time_ms,
            waiting_tasks_count,
            signal_wait_time_ms,
            wait_time_ms - signal_wait_time_ms AS resource_wait_time_ms,
            100.0 * wait_time_ms / SUM(wait_time_ms) OVER() AS percentage,
            ROW_NUMBER() OVER(ORDER BY wait_time_ms DESC) AS row_num
          FROM sys.dm_os_wait_stats
          WHERE wait_type NOT IN (
            -- Filter out known benign wait types
            'CLR_SEMAPHORE', 'LAZYWRITER_SLEEP', 'RESOURCE_QUEUE', 'SLEEP_TASK',
            'SLEEP_SYSTEMTASK', 'SQLTRACE_BUFFER_FLUSH', 'WAITFOR', 'LOGMGR_QUEUE',
            'CHECKPOINT_QUEUE', 'REQUEST_FOR_DEADLOCK_SEARCH', 'XE_TIMER_EVENT',
            'BROKER_TO_FLUSH', 'BROKER_TASK_STOP', 'CLR_MANUAL_EVENT',
            'CLR_AUTO_EVENT', 'DISPATCHER_QUEUE_SEMAPHORE', 'FT_IFTS_SCHEDULER_IDLE_WAIT',
            'XE_DISPATCHER_WAIT', 'XE_DISPATCHER_JOIN', 'SQLTRACE_INCREMENTAL_FLUSH_SLEEP',
            'ONDEMAND_TASK_QUEUE', 'BROKER_EVENTHANDLER', 'SLEEP_BPOOL_FLUSH',
            'DIRTY_PAGE_POLL', 'HADR_FILESTREAM_IOMGR_IOCOMPLETION', 'SP_SERVER_DIAGNOSTICS_SLEEP'
          )
          AND wait_time_ms > 0
        )
        SELECT TOP (@topN)
          wait_type,
          waiting_tasks_count AS wait_count,
          wait_time_ms,
          resource_wait_time_ms,
          signal_wait_time_ms,
          CAST(percentage AS DECIMAL(5,2)) AS percentage_of_total,
          CASE
            WHEN waiting_tasks_count > 0
            THEN wait_time_ms / waiting_tasks_count
            ELSE 0
          END AS avg_wait_time_ms
        FROM Waits
        WHERE row_num <= @topN
        ORDER BY wait_time_ms DESC
      `;

      const result = await connectionManager.executeQuery(query, { topN });
      const waitStats = result.recordset;

      if (waitStats.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No wait statistics found.',
            },
          ],
        };
      }

      // Calculate totals
      const totalWaitTime = waitStats.reduce(
        (sum, row) => sum + (row.wait_time_ms || 0),
        0
      );
      const totalWaitCount = waitStats.reduce(
        (sum, row) => sum + (row.wait_count || 0),
        0
      );

      let response = `Top ${topN} Wait Statistics:\n\n`;

      // Add summary
      response += `Summary:\n`;
      response += `- Wait types returned: ${waitStats.length}\n`;
      response += `- Total wait time: ${totalWaitTime.toLocaleString()} ms\n`;
      response += `- Total wait count: ${totalWaitCount.toLocaleString()}\n\n`;

      // Add common wait type explanations
      response += `Common Wait Types:\n`;
      response += `- CXPACKET: Parallelism waits (queries waiting for parallel threads)\n`;
      response += `- LCK_M_*: Lock waits (blocking/contention)\n`;
      response += `- PAGEIOLATCH_*: Disk I/O waits (reading data from disk)\n`;
      response += `- WRITELOG: Transaction log write waits\n`;
      response += `- ASYNC_NETWORK_IO: Waiting for client to consume data\n`;
      response += `- SOS_SCHEDULER_YIELD: CPU pressure (tasks yielding scheduler)\n\n`;

      // Format the results
      response += formatResultsAsTable(waitStats);

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
// THIS FILE CONTAINS 12 NEW PERFORMANCE TOOLS TO BE APPENDED TO performance.ts

// ==================== MEMORY MANAGEMENT TOOLS (6) ====================

const getMemoryUsageInputSchema = z.object({});

export const getMemoryUsageTool = {
  name: 'sqlserver_get_memory_usage',
  description: `Get SQL Server memory usage statistics. Shows process memory, system memory, and top memory clerks. Based on dbatools Get-DbaMemoryUsage.`,
  inputSchema: getMemoryUsageInputSchema,
  annotations: { readOnlyHint: true },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getMemoryUsageInputSchema>) => {
    try {
      const query = `
        SELECT (physical_memory_in_use_kb/1024) AS physical_memory_in_use_mb, (locked_page_allocations_kb/1024) AS locked_page_allocations_mb,
        (virtual_address_space_committed_kb/1024) AS virtual_address_space_committed_mb, memory_utilization_percentage FROM sys.dm_os_process_memory;
        SELECT (total_physical_memory_kb/1024) AS total_physical_memory_mb, (available_physical_memory_kb/1024) AS available_physical_memory_mb,
        system_memory_state_desc FROM sys.dm_os_sys_memory;
        SELECT TOP 10 type AS memory_clerk_type, (SUM(pages_kb)/1024) AS memory_used_mb FROM sys.dm_os_memory_clerks GROUP BY type ORDER BY SUM(pages_kb) DESC;
      `;
      const result = await connectionManager.executeQuery(query, {});
      const recordsets = result.recordsets as any[];
      let response = 'SQL Server Memory Usage:\n\n=== Process Memory ===\n';
      if (recordsets[0]) response += formatResultsAsTable(recordsets[0]) + '\n';
      if (recordsets[1]) response += '=== System Memory ===\n' + formatResultsAsTable(recordsets[1]) + '\n';
      if (recordsets[2]) response += '=== Top 10 Memory Clerks ===\n' + formatResultsAsTable(recordsets[2]);
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const getDbMemoryUsageInputSchema = z.object({
  database: z.string().optional().describe('Specific database to analyze'),
});

export const getDbMemoryUsageTool = {
  name: 'sqlserver_get_db_memory_usage',
  description: `Get memory usage by database from buffer pool. Based on dbatools Get-DbaDbMemoryUsage.`,
  inputSchema: getDbMemoryUsageInputSchema,
  annotations: { readOnlyHint: true },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getDbMemoryUsageInputSchema>) => {
    try {
      const whereClause = input.database ? 'WHERE DB_NAME(database_id) = @database' : '';
      const query = `SELECT CASE database_id WHEN 32767 THEN 'ResourceDb' ELSE DB_NAME(database_id) END AS database_name,
        COUNT(*) AS page_count, (COUNT(*)*8)/1024 AS buffer_pool_mb,
        SUM(CASE is_modified WHEN 1 THEN 1 ELSE 0 END) AS dirty_pages, SUM(CASE is_modified WHEN 0 THEN 1 ELSE 0 END) AS clean_pages
        FROM sys.dm_os_buffer_descriptors ${whereClause}
        GROUP BY database_id ORDER BY buffer_pool_mb DESC;`;
      const result = await connectionManager.executeQuery(query, input.database ? { database: input.database } : {});
      if (result.recordset.length === 0) return { content: [{ type: 'text' as const, text: 'No buffer pool data found.' }] };
      const totalMemory = result.recordset.reduce((sum, row) => sum + (row.buffer_pool_mb || 0), 0);
      let response = `Database Memory Usage:\n\nTotal: ${totalMemory} MB\nDatabases: ${result.recordset.length}\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const getMemoryConditionInputSchema = z.object({});

export const getMemoryConditionTool = {
  name: 'sqlserver_get_memory_condition',
  description: `Get SQL Server memory condition and pressure indicators from ring buffers. Based on dbatools Get-DbaMemoryCondition.`,
  inputSchema: getMemoryConditionInputSchema,
  annotations: { readOnlyHint: true },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getMemoryConditionInputSchema>) => {
    try {
      const query = `SELECT TOP 20 record.value('(Record/@id)[1]', 'int') AS record_id,
        DATEADD(ms, -1 * ((SELECT ms_ticks FROM sys.dm_os_sys_info) - record.value('(Record/@time)[1]', 'bigint')), GETDATE()) AS event_time,
        record.value('(Record/ResourceMonitor/Notification)[1]', 'varchar(30)') AS notification
        FROM (SELECT CAST(record AS xml) AS record FROM sys.dm_os_ring_buffers WHERE ring_buffer_type = 'RING_BUFFER_RESOURCE_MONITOR') AS records
        ORDER BY event_time DESC;`;
      const result = await connectionManager.executeQuery(query, {});
      if (result.recordset.length === 0) return { content: [{ type: 'text' as const, text: 'No memory condition data available.' }] };
      let response = `Memory Condition (Last 20 events):\n\n${formatResultsAsTable(result.recordset)}\n\nNotifications:\n- RESOURCE_MEMPHYSICAL_LOW: Low physical memory\n- RESOURCE_MEM_STEADY: Memory stable`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const getDbccMemoryStatusInputSchema = z.object({});

export const getDbccMemoryStatusTool = {
  name: 'sqlserver_get_dbcc_memory_status',
  description: `Run DBCC MEMORYSTATUS for detailed memory allocation. WARNING: Resource-intensive. Based on dbatools Get-DbaDbccMemoryStatus.`,
  inputSchema: getDbccMemoryStatusInputSchema,
  annotations: { readOnlyHint: true },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getDbccMemoryStatusInputSchema>) => {
    try {
      const result = await connectionManager.executeQuery('DBCC MEMORYSTATUS WITH NO_INFOMSGS;', {});
      const recordsets = result.recordsets as any[];
      let response = 'DBCC MEMORYSTATUS Output:\n\n';
      if (recordsets && recordsets.length > 0) {
        recordsets.forEach((recordset, index) => {
          if (recordset.length > 0) response += `=== Section ${index + 1} ===\n${formatResultsAsTable(recordset)}\n\n`;
        });
      }
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const getMaxMemoryInputSchema = z.object({});

export const getMaxMemoryTool = {
  name: 'sqlserver_get_max_memory',
  description: `Get SQL Server max/min memory configuration. Based on dbatools Get-DbaMaxMemory.`,
  inputSchema: getMaxMemoryInputSchema,
  annotations: { readOnlyHint: true },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getMaxMemoryInputSchema>) => {
    try {
      const query = `SELECT name, value AS config_value, value_in_use AS running_value, description FROM sys.configurations
        WHERE name IN ('max server memory (MB)', 'min server memory (MB)') ORDER BY name;`;
      const result = await connectionManager.executeQuery(query, {});
      let response = 'SQL Server Memory Configuration:\n\n' + formatResultsAsTable(result.recordset);
      const maxMem = result.recordset.find(r => r.name === 'max server memory (MB)');
      if (maxMem && maxMem.config_value === 2147483647) {
        response += '\n\n⚠ WARNING: Max memory is default (2147483647 MB). Set to prevent OS instability.';
      }
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const setMaxMemoryInputSchema = z.object({
  maxMemoryMB: z.number().int().min(128).describe('Maximum server memory in MB'),
  minMemoryMB: z.number().int().min(0).optional().describe('Minimum server memory in MB'),
});

export const setMaxMemoryTool = {
  name: 'sqlserver_set_max_memory',
  description: `Set SQL Server max/min memory. Recommendation: Total RAM - (4GB + 1GB per 8GB RAM). Based on dbatools Set-DbaMaxMemory.`,
  inputSchema: setMaxMemoryInputSchema,
  annotations: { readOnlyHint: false },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof setMaxMemoryInputSchema>) => {
    try {
      await connectionManager.executeQuery(`EXEC sp_configure 'show advanced options', 1; RECONFIGURE;
        EXEC sp_configure 'max server memory (MB)', @maxMemoryMB; RECONFIGURE;`, { maxMemoryMB: input.maxMemoryMB });
      if (input.minMemoryMB !== undefined) {
        await connectionManager.executeQuery(`EXEC sp_configure 'min server memory (MB)', @minMemoryMB; RECONFIGURE;`, { minMemoryMB: input.minMemoryMB });
      }
      const result = await connectionManager.executeQuery(`SELECT name, value_in_use FROM sys.configurations WHERE name IN ('max server memory (MB)', 'min server memory (MB)') ORDER BY name;`, {});
      let response = `✓ Memory configuration updated\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

// ==================== PLAN CACHE TOOLS (2) ====================

const getPlanCacheInputSchema = z.object({
  topN: z.number().int().min(1).max(100).optional().describe('Number of top plans to return (default: 20)'),
});

export const getPlanCacheTool = {
  name: 'sqlserver_get_plan_cache',
  description: `Analyze plan cache to identify single-use plans consuming memory. Based on dbatools Get-DbaPlanCache.`,
  inputSchema: getPlanCacheInputSchema,
  annotations: { readOnlyHint: true },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getPlanCacheInputSchema>) => {
    try {
      const topN = input.topN ?? 20;
      const query = `SELECT TOP (@topN) objtype AS plan_type, cacheobjtype AS cache_type, COUNT(*) AS plan_count,
        SUM(CAST(size_in_bytes AS BIGINT))/1024/1024 AS total_size_mb, AVG(usecounts) AS avg_use_count,
        SUM(CASE WHEN usecounts=1 THEN 1 ELSE 0 END) AS single_use_plans,
        SUM(CASE WHEN usecounts=1 THEN CAST(size_in_bytes AS BIGINT) ELSE 0 END)/1024/1024 AS single_use_mb
        FROM sys.dm_exec_cached_plans GROUP BY objtype, cacheobjtype ORDER BY total_size_mb DESC;`;
      const result = await connectionManager.executeQuery(query, { topN });
      const totalCacheMB = result.recordset.reduce((sum, row) => sum + (row.total_size_mb || 0), 0);
      const totalSingleUseMB = result.recordset.reduce((sum, row) => sum + (row.single_use_mb || 0), 0);
      let response = `Plan Cache Analysis:\n\nTotal: ${totalCacheMB.toFixed(2)} MB\nSingle-Use: ${totalSingleUseMB.toFixed(2)} MB (${((totalSingleUseMB/totalCacheMB)*100).toFixed(2)}%)\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const clearPlanCacheInputSchema = z.object({
  database: z.string().optional().describe('Clear plan cache for specific database'),
  clearAll: z.boolean().default(false).describe('Clear entire plan cache'),
});

export const clearPlanCacheTool = {
  name: 'sqlserver_clear_plan_cache',
  description: `Clear SQL Server plan cache. WARNING: Causes recompilation. Based on dbatools Clear-DbaPlanCache.`,
  inputSchema: clearPlanCacheInputSchema,
  annotations: { readOnlyHint: false },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof clearPlanCacheInputSchema>) => {
    try {
      if (input.database) {
        await connectionManager.executeQuery(`DECLARE @dbid INT = DB_ID(@database); DBCC FLUSHPROCINDB(@dbid);`, { database: input.database });
      } else if (input.clearAll) {
        await connectionManager.executeQuery('DBCC FREEPROCCACHE;', {});
      } else {
        return { content: [{ type: 'text' as const, text: 'Error: Specify database or clearAll=true' }], isError: true };
      }
      const result = await connectionManager.executeQuery(`SELECT SUM(CAST(size_in_bytes AS BIGINT))/1024/1024 AS current_cache_size_mb, COUNT(*) AS cached_plans FROM sys.dm_exec_cached_plans;`, {});
      let response = `✓ Plan cache cleared\n\n${formatResultsAsTable(result.recordset)}\n\n⚠ Queries will recompile`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

// ==================== IO PERFORMANCE TOOLS (2) ====================

const getIoLatencyInputSchema = z.object({
  database: z.string().optional().describe('Filter by database'),
});

export const getIoLatencyTool = {
  name: 'sqlserver_get_io_latency',
  description: `Get IO latency statistics for database files. >15-20ms indicates storage issues. Based on dbatools Get-DbaIoLatency.`,
  inputSchema: getIoLatencyInputSchema,
  annotations: { readOnlyHint: true },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getIoLatencyInputSchema>) => {
    try {
      const whereClause = input.database ? 'AND DB_NAME(vfs.database_id) = @database' : '';
      const query = `SELECT DB_NAME(vfs.database_id) AS database_name, mf.name AS file_name, mf.type_desc AS file_type,
        vfs.num_of_reads, vfs.num_of_writes, vfs.num_of_bytes_read/1024/1024 AS mb_read, vfs.num_of_bytes_written/1024/1024 AS mb_written,
        CASE WHEN vfs.num_of_reads=0 THEN 0 ELSE CAST(vfs.io_stall_read_ms AS DECIMAL(10,2))/vfs.num_of_reads END AS avg_read_latency_ms,
        CASE WHEN vfs.num_of_writes=0 THEN 0 ELSE CAST(vfs.io_stall_write_ms AS DECIMAL(10,2))/vfs.num_of_writes END AS avg_write_latency_ms
        FROM sys.dm_io_virtual_file_stats(NULL, NULL) vfs JOIN sys.master_files mf ON vfs.database_id=mf.database_id AND vfs.file_id=mf.file_id
        WHERE vfs.database_id <> 2 ${whereClause}
        ORDER BY avg_read_latency_ms DESC, avg_write_latency_ms DESC;`;
      const result = await connectionManager.executeQuery(query, input.database ? { database: input.database } : {});
      let response = `IO Latency:\n\nGuidelines: <5ms Good | 5-15ms OK | 15-25ms Poor | >25ms Critical\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const getDiskSpaceInputSchema = z.object({});

export const getDiskSpaceTool = {
  name: 'sqlserver_get_disk_space',
  description: `Get disk space for database files and drives. Based on dbatools Get-DbaDiskSpace.`,
  inputSchema: getDiskSpaceInputSchema,
  annotations: { readOnlyHint: true },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getDiskSpaceInputSchema>) => {
    try {
      const query = `SELECT DB_NAME(database_id) AS database_name, name AS file_name, type_desc AS file_type,
        CAST(size*8.0/1024 AS DECIMAL(10,2)) AS size_mb, CAST(FILEPROPERTY(name, 'SpaceUsed')*8.0/1024 AS DECIMAL(10,2)) AS used_mb
        FROM sys.master_files ORDER BY database_name;
        SELECT DISTINCT vs.volume_mount_point AS drive, CAST(vs.total_bytes/1024.0/1024/1024 AS DECIMAL(10,2)) AS total_gb,
        CAST(vs.available_bytes/1024.0/1024/1024 AS DECIMAL(10,2)) AS available_gb,
        CAST((vs.available_bytes*100.0/vs.total_bytes) AS DECIMAL(5,2)) AS percent_free
        FROM sys.master_files mf CROSS APPLY sys.dm_os_volume_stats(mf.database_id, mf.file_id) vs ORDER BY drive;`;
      const result = await connectionManager.executeQuery(query, {});
      const recordsets = result.recordsets as any[];
      let response = '=== Database Files ===\n' + formatResultsAsTable(recordsets[0]) + '\n\n=== Drives ===\n' + formatResultsAsTable(recordsets[1]);
      const lowSpace = recordsets[1].filter((d: any) => d.percent_free < 15);
      if (lowSpace.length > 0) {
        response += '\n\n⚠ WARNING: Low disk space:\n' + lowSpace.map((d: any) => `  - ${d.drive}: ${d.percent_free}% free`).join('\n');
      }
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

// ==================== BLOCKING & PROCESS TOOLS (2) ====================

const getBlockingInputSchema = z.object({});

export const getBlockingTool = {
  name: 'sqlserver_get_blocking',
  description: `Identify blocking sessions. Based on dbatools Get-DbaBlocking.`,
  inputSchema: getBlockingInputSchema,
  annotations: { readOnlyHint: true },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getBlockingInputSchema>) => {
    try {
      const query = `SELECT wt.blocking_session_id AS blocking_spid, s_blocking.login_name AS blocking_user,
        wt.session_id AS blocked_spid, s_blocked.login_name AS blocked_user, wt.wait_type, wt.wait_duration_ms,
        DB_NAME(r_blocked.database_id) AS database_name
        FROM sys.dm_os_waiting_tasks wt
        LEFT JOIN sys.dm_exec_sessions s_blocking ON wt.blocking_session_id = s_blocking.session_id
        LEFT JOIN sys.dm_exec_sessions s_blocked ON wt.session_id = s_blocked.session_id
        LEFT JOIN sys.dm_exec_requests r_blocked ON wt.session_id = r_blocked.session_id
        WHERE wt.blocking_session_id <> 0 ORDER BY wt.wait_duration_ms DESC;`;
      const result = await connectionManager.executeQuery(query, {});
      if (result.recordset.length === 0) {
        return { content: [{ type: 'text' as const, text: '✓ No blocking detected' }] };
      }
      let response = `⚠ BLOCKING DETECTED - ${result.recordset.length} blocked session(s)\n\n${formatResultsAsTable(result.recordset)}\n\nResolution:\n1. Optimize blocking query\n2. KILL <blocking_spid>\n3. Review isolation levels`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const getProcessInputSchema = z.object({
  includeSystemProcesses: z.boolean().default(false).describe('Include system processes'),
});

export const getProcessTool = {
  name: 'sqlserver_get_process',
  description: `Get all running SQL Server processes/sessions. Based on dbatools Get-DbaProcess.`,
  inputSchema: getProcessInputSchema,
  annotations: { readOnlyHint: true },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getProcessInputSchema>) => {
    try {
      const systemFilter = !input.includeSystemProcesses ? 'AND s.session_id > 50' : '';
      const query = `SELECT s.session_id AS spid, s.login_name, s.host_name, s.program_name, s.status, s.cpu_time,
        s.memory_usage AS memory_usage_pages, s.total_elapsed_time, s.reads AS logical_reads, s.writes,
        DB_NAME(s.database_id) AS database_name, r.command, r.wait_type, r.blocking_session_id
        FROM sys.dm_exec_sessions s LEFT JOIN sys.dm_exec_requests r ON s.session_id = r.session_id
        WHERE s.session_id <> @@SPID ${systemFilter} AND s.is_user_process = 1
        ORDER BY s.cpu_time DESC;`;
      const result = await connectionManager.executeQuery(query, {});
      if (result.recordset.length === 0) return { content: [{ type: 'text' as const, text: 'No active sessions' }] };
      const activeQueries = result.recordset.filter(p => p.command);
      let response = `Process List (${result.recordset.length} sessions):\n\nActive: ${activeQueries.length} | Idle: ${result.recordset.length - activeQueries.length}\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};
