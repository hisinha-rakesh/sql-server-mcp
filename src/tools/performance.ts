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
