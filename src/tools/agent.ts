import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';
import { formatResultsAsTable } from '../utils/formatters.js';

/**
 * List all SQL Server Agent jobs
 */
export const listAgentJobsTool = {
  name: 'sqlserver_list_agent_jobs',
  description: 'List all SQL Server Agent jobs with their status and schedule information',
  inputSchema: z.object({
    enabled: z.boolean().optional().describe('Filter by enabled status (true/false). If not specified, shows all jobs'),
  }),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, args: { enabled?: boolean }) => {
    try {
      let whereClause = '';
      if (args.enabled !== undefined) {
        whereClause = `WHERE j.enabled = ${args.enabled ? 1 : 0}`;
      }

      const query = `
        SELECT
          j.job_id,
          j.name AS job_name,
          j.enabled,
          j.description,
          j.date_created,
          j.date_modified,
          SUSER_SNAME(j.owner_sid) AS owner,
          CASE
            WHEN ISNULL(sched.next_run_date, 0) = 0 THEN NULL
            ELSE CONVERT(DATETIME,
              CONVERT(VARCHAR(8), sched.next_run_date) + ' ' +
              STUFF(STUFF(RIGHT('000000' + CONVERT(VARCHAR(6), sched.next_run_time), 6), 5, 0, ':'), 3, 0, ':')
            )
          END AS next_run_time,
          CASE js.last_run_outcome
            WHEN 0 THEN 'Failed'
            WHEN 1 THEN 'Succeeded'
            WHEN 2 THEN 'Retry'
            WHEN 3 THEN 'Canceled'
            WHEN 5 THEN 'Unknown'
            ELSE 'N/A'
          END AS last_run_status,
          CASE
            WHEN ISNULL(js.last_run_date, 0) = 0 THEN NULL
            ELSE CONVERT(DATETIME,
              CONVERT(VARCHAR(8), js.last_run_date) + ' ' +
              STUFF(STUFF(RIGHT('000000' + CONVERT(VARCHAR(6), js.last_run_time), 6), 5, 0, ':'), 3, 0, ':')
            )
          END AS last_run_time,
          (SELECT COUNT(*) FROM msdb.dbo.sysjobsteps WHERE job_id = j.job_id) AS step_count
        FROM msdb.dbo.sysjobs j
        LEFT JOIN msdb.dbo.sysjobservers js ON j.job_id = js.job_id
        LEFT JOIN (
          SELECT job_id, MIN(next_run_date) AS next_run_date, MIN(next_run_time) AS next_run_time
          FROM msdb.dbo.sysjobschedules
          WHERE next_run_date > 0
          GROUP BY job_id
        ) sched ON j.job_id = sched.job_id
        ${whereClause}
        ORDER BY j.name
      `;

      const result = await connectionManager.executeQuery(query);
      const jobs = result.recordset;

      return {
        content: [
          {
            type: 'text' as const,
            text: `SQL Server Agent Jobs (${jobs.length}):\n\n` + formatResultsAsTable(jobs),
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
 * Get detailed information about a specific job
 */
export const getJobDetailsTool = {
  name: 'sqlserver_get_job_details',
  description: 'Get detailed information about a specific SQL Server Agent job including steps and schedules',
  inputSchema: z.object({
    jobName: z.string().min(1).describe('Name of the job to get details for'),
  }),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, args: { jobName: string }) => {
    try {
      // Get job information
      const jobQuery = `
        SELECT
          j.job_id,
          j.name AS job_name,
          j.enabled,
          j.description,
          j.date_created,
          j.date_modified,
          SUSER_SNAME(j.owner_sid) AS owner,
          c.name AS category_name
        FROM msdb.dbo.sysjobs j
        LEFT JOIN msdb.dbo.syscategories c ON j.category_id = c.category_id
        WHERE j.name = @jobName
      `;

      const jobResult = await connectionManager.executeQuery(jobQuery, { jobName: args.jobName });

      if (jobResult.recordset.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Job '${args.jobName}' not found.`,
            },
          ],
          isError: true,
        };
      }

      const job = jobResult.recordset[0];

      // Get job steps
      const stepsQuery = `
        SELECT
          step_id,
          step_name,
          subsystem,
          command,
          database_name,
          on_success_action,
          on_fail_action,
          retry_attempts,
          retry_interval
        FROM msdb.dbo.sysjobsteps
        WHERE job_id = @jobId
        ORDER BY step_id
      `;

      const stepsResult = await connectionManager.executeQuery(stepsQuery, { jobId: job.job_id });

      // Get job schedules
      const schedulesQuery = `
        SELECT
          s.schedule_id,
          s.name AS schedule_name,
          s.enabled,
          CASE s.freq_type
            WHEN 1 THEN 'Once'
            WHEN 4 THEN 'Daily'
            WHEN 8 THEN 'Weekly'
            WHEN 16 THEN 'Monthly'
            WHEN 32 THEN 'Monthly relative'
            WHEN 64 THEN 'When SQL Server Agent starts'
            WHEN 128 THEN 'When computer is idle'
          END AS frequency_type,
          s.freq_interval,
          s.freq_recurrence_factor,
          s.active_start_date,
          s.active_end_date,
          s.active_start_time,
          s.active_end_time
        FROM msdb.dbo.sysjobschedules js
        INNER JOIN msdb.dbo.sysschedules s ON js.schedule_id = s.schedule_id
        WHERE js.job_id = @jobId
      `;

      const schedulesResult = await connectionManager.executeQuery(schedulesQuery, { jobId: job.job_id });

      let response = `Job Details:\n\n`;
      response += `Name: ${job.job_name}\n`;
      response += `Enabled: ${job.enabled ? 'Yes' : 'No'}\n`;
      response += `Description: ${job.description || 'N/A'}\n`;
      response += `Owner: ${job.owner}\n`;
      response += `Category: ${job.category_name}\n`;
      response += `Created: ${job.date_created}\n`;
      response += `Modified: ${job.date_modified}\n\n`;

      response += `Job Steps (${stepsResult.recordset.length}):\n\n`;
      if (stepsResult.recordset.length > 0) {
        response += formatResultsAsTable(stepsResult.recordset) + '\n';
      } else {
        response += 'No steps defined.\n';
      }

      response += `\nJob Schedules (${schedulesResult.recordset.length}):\n\n`;
      if (schedulesResult.recordset.length > 0) {
        response += formatResultsAsTable(schedulesResult.recordset);
      } else {
        response += 'No schedules defined.';
      }

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
 * Get job execution history
 */
export const getJobHistoryTool = {
  name: 'sqlserver_get_job_history',
  description: 'Get execution history for a SQL Server Agent job',
  inputSchema: z.object({
    jobName: z.string().min(1).describe('Name of the job to get history for'),
    topN: z.number().int().min(1).max(100).optional().describe('Number of recent executions to return (default: 20)'),
  }),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, args: { jobName: string; topN?: number }) => {
    try {
      const topN = args.topN || 20;

      const query = `
        SELECT TOP (@topN)
          h.instance_id,
          j.name AS job_name,
          h.step_id,
          h.step_name,
          CASE h.run_status
            WHEN 0 THEN 'Failed'
            WHEN 1 THEN 'Succeeded'
            WHEN 2 THEN 'Retry'
            WHEN 3 THEN 'Canceled'
            WHEN 4 THEN 'In Progress'
          END AS status,
          CONVERT(DATETIME,
            CONVERT(VARCHAR(8), h.run_date) + ' ' +
            STUFF(STUFF(RIGHT('000000' + CONVERT(VARCHAR(6), h.run_time), 6), 5, 0, ':'), 3, 0, ':')
          ) AS run_datetime,
          STUFF(STUFF(RIGHT('000000' + CONVERT(VARCHAR(6), h.run_duration), 6), 5, 0, ':'), 3, 0, ':') AS duration,
          h.message,
          h.retries_attempted
        FROM msdb.dbo.sysjobhistory h
        INNER JOIN msdb.dbo.sysjobs j ON h.job_id = j.job_id
        WHERE j.name = @jobName
        ORDER BY h.instance_id DESC
      `;

      const result = await connectionManager.executeQuery(query, { jobName: args.jobName, topN });

      if (result.recordset.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `No history found for job '${args.jobName}' or job does not exist.`,
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Job History for '${args.jobName}' (Last ${result.recordset.length} executions):\n\n` +
                  formatResultsAsTable(result.recordset),
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
 * Start a SQL Server Agent job
 */
export const startJobTool = {
  name: 'sqlserver_start_job',
  description: 'Start execution of a SQL Server Agent job',
  inputSchema: z.object({
    jobName: z.string().min(1).describe('Name of the job to start'),
  }),
  annotations: {},
  handler: async (connectionManager: ConnectionManager, args: { jobName: string }) => {
    try {
      const query = `
        DECLARE @jobId UNIQUEIDENTIFIER
        SELECT @jobId = job_id FROM msdb.dbo.sysjobs WHERE name = @jobName

        IF @jobId IS NULL
        BEGIN
          RAISERROR('Job not found', 16, 1)
          RETURN
        END

        EXEC msdb.dbo.sp_start_job @job_name = @jobName

        SELECT 'Job started successfully' AS result
      `;

      await connectionManager.executeQuery(query, { jobName: args.jobName });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Job '${args.jobName}' has been started successfully.`,
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
 * Stop a SQL Server Agent job
 */
export const stopJobTool = {
  name: 'sqlserver_stop_job',
  description: 'Stop execution of a running SQL Server Agent job',
  inputSchema: z.object({
    jobName: z.string().min(1).describe('Name of the job to stop'),
  }),
  annotations: {},
  handler: async (connectionManager: ConnectionManager, args: { jobName: string }) => {
    try {
      const query = `
        DECLARE @jobId UNIQUEIDENTIFIER
        SELECT @jobId = job_id FROM msdb.dbo.sysjobs WHERE name = @jobName

        IF @jobId IS NULL
        BEGIN
          RAISERROR('Job not found', 16, 1)
          RETURN
        END

        EXEC msdb.dbo.sp_stop_job @job_name = @jobName

        SELECT 'Job stopped successfully' AS result
      `;

      await connectionManager.executeQuery(query, { jobName: args.jobName });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Job '${args.jobName}' has been stopped successfully.`,
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
 * Enable or disable a SQL Server Agent job
 */
export const toggleJobTool = {
  name: 'sqlserver_toggle_job',
  description: 'Enable or disable a SQL Server Agent job',
  inputSchema: z.object({
    jobName: z.string().min(1).describe('Name of the job to enable or disable'),
    enabled: z.boolean().describe('True to enable the job, false to disable it'),
  }),
  annotations: {},
  handler: async (connectionManager: ConnectionManager, args: { jobName: string; enabled: boolean }) => {
    try {
      const query = `
        DECLARE @jobId UNIQUEIDENTIFIER
        SELECT @jobId = job_id FROM msdb.dbo.sysjobs WHERE name = @jobName

        IF @jobId IS NULL
        BEGIN
          RAISERROR('Job not found', 16, 1)
          RETURN
        END

        EXEC msdb.dbo.sp_update_job
          @job_name = @jobName,
          @enabled = @enabled

        SELECT 'Job updated successfully' AS result
      `;

      await connectionManager.executeQuery(query, { jobName: args.jobName, enabled: args.enabled ? 1 : 0 });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Job '${args.jobName}' has been ${args.enabled ? 'enabled' : 'disabled'} successfully.`,
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
 * Create a new SQL Server Agent job
 */
export const createJobTool = {
  name: 'sqlserver_create_job',
  description: 'Create a new SQL Server Agent job with a T-SQL step',
  inputSchema: z.object({
    jobName: z.string().min(1).describe('Name of the job to create'),
    description: z.string().optional().describe('Description of the job'),
    enabled: z.boolean().optional().describe('Whether the job should be enabled (default: true)'),
    stepName: z.string().min(1).describe('Name of the first job step'),
    command: z.string().min(1).describe('T-SQL command to execute'),
    databaseName: z.string().optional().describe('Database to run the command in (default: master)'),
  }),
  annotations: {},
  handler: async (connectionManager: ConnectionManager, args: {
    jobName: string;
    description?: string;
    enabled?: boolean;
    stepName: string;
    command: string;
    databaseName?: string;
  }) => {
    try {
      const enabled = args.enabled !== false ? 1 : 0;
      const databaseName = args.databaseName || 'master';
      const description = args.description || '';

      const query = `
        DECLARE @jobId UNIQUEIDENTIFIER

        -- Check if job already exists
        IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name = @jobName)
        BEGIN
          RAISERROR('Job already exists', 16, 1)
          RETURN
        END

        -- Create the job
        EXEC msdb.dbo.sp_add_job
          @job_name = @jobName,
          @enabled = @enabled,
          @description = @description,
          @job_id = @jobId OUTPUT

        -- Add a job step
        EXEC msdb.dbo.sp_add_jobstep
          @job_id = @jobId,
          @step_name = @stepName,
          @subsystem = 'TSQL',
          @command = @command,
          @database_name = @databaseName,
          @retry_attempts = 0,
          @retry_interval = 0,
          @on_success_action = 1, -- Quit with success
          @on_fail_action = 2 -- Quit with failure

        -- Add job to local server
        EXEC msdb.dbo.sp_add_jobserver
          @job_id = @jobId,
          @server_name = N'(local)'

        SELECT 'Job created successfully' AS result, @jobId AS job_id
      `;

      const result = await connectionManager.executeQuery(query, {
        jobName: args.jobName,
        description,
        enabled,
        stepName: args.stepName,
        command: args.command,
        databaseName
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Job '${args.jobName}' has been created successfully.\nJob ID: ${result.recordset[0].job_id}`,
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
 * Delete a SQL Server Agent job
 */
export const deleteJobTool = {
  name: 'sqlserver_delete_job',
  description: 'Delete a SQL Server Agent job. WARNING: This permanently deletes the job and all its history.',
  inputSchema: z.object({
    jobName: z.string().min(1).describe('Name of the job to delete'),
    deleteHistory: z.boolean().optional().describe('Whether to delete job history (default: true)'),
  }),
  annotations: {},
  handler: async (connectionManager: ConnectionManager, args: { jobName: string; deleteHistory?: boolean }) => {
    try {
      const deleteHistory = args.deleteHistory !== false ? 1 : 0;

      const query = `
        DECLARE @jobId UNIQUEIDENTIFIER
        SELECT @jobId = job_id FROM msdb.dbo.sysjobs WHERE name = @jobName

        IF @jobId IS NULL
        BEGIN
          RAISERROR('Job not found', 16, 1)
          RETURN
        END

        EXEC msdb.dbo.sp_delete_job
          @job_name = @jobName,
          @delete_history = @deleteHistory

        SELECT 'Job deleted successfully' AS result
      `;

      await connectionManager.executeQuery(query, { jobName: args.jobName, deleteHistory });

      return {
        content: [
          {
            type: 'text' as const,
            text: `Job '${args.jobName}' has been deleted successfully.`,
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
 * List all job schedules
 */
export const listJobSchedulesTool = {
  name: 'sqlserver_list_job_schedules',
  description: 'List all SQL Server Agent job schedules',
  inputSchema: z.object({
    jobName: z.string().optional().describe('Filter by specific job name. If not specified, shows all schedules'),
  }),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, args: { jobName?: string }) => {
    try {
      let whereClause = '';
      const parameters: any = {};

      if (args.jobName) {
        whereClause = 'WHERE j.name = @jobName';
        parameters.jobName = args.jobName;
      }

      const query = `
        SELECT
          s.schedule_id,
          s.name AS schedule_name,
          j.name AS job_name,
          s.enabled,
          CASE s.freq_type
            WHEN 1 THEN 'Once'
            WHEN 4 THEN 'Daily'
            WHEN 8 THEN 'Weekly'
            WHEN 16 THEN 'Monthly'
            WHEN 32 THEN 'Monthly relative'
            WHEN 64 THEN 'When SQL Server Agent starts'
            WHEN 128 THEN 'When computer is idle'
          END AS frequency_type,
          s.freq_interval,
          s.freq_recurrence_factor,
          CONVERT(VARCHAR(10), CONVERT(DATETIME, CONVERT(VARCHAR(8), s.active_start_date)), 120) AS active_start_date,
          CONVERT(VARCHAR(10), CONVERT(DATETIME, CONVERT(VARCHAR(8), s.active_end_date)), 120) AS active_end_date,
          STUFF(STUFF(RIGHT('000000' + CONVERT(VARCHAR(6), s.active_start_time), 6), 5, 0, ':'), 3, 0, ':') AS active_start_time,
          STUFF(STUFF(RIGHT('000000' + CONVERT(VARCHAR(6), s.active_end_time), 6), 5, 0, ':'), 3, 0, ':') AS active_end_time
        FROM msdb.dbo.sysschedules s
        LEFT JOIN msdb.dbo.sysjobschedules js ON s.schedule_id = js.schedule_id
        LEFT JOIN msdb.dbo.sysjobs j ON js.job_id = j.job_id
        ${whereClause}
        ORDER BY s.name
      `;

      const result = await connectionManager.executeQuery(query, parameters);
      const schedules = result.recordset;

      return {
        content: [
          {
            type: 'text' as const,
            text: `Job Schedules (${schedules.length}):\n\n` + formatResultsAsTable(schedules),
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
 * Check SQL Server Agent service status
 */
export const getAgentStatusTool = {
  name: 'sqlserver_get_agent_status',
  description: 'Check if SQL Server Agent service is running',
  inputSchema: z.object({}),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager) => {
    try {
      const query = `
        DECLARE @ServiceStatus INT
        EXEC @ServiceStatus = master.dbo.xp_servicecontrol 'QueryState', 'SQLServerAGENT'

        SELECT
          CASE @ServiceStatus
            WHEN 1 THEN 'Running'
            WHEN 4 THEN 'Stopped'
            ELSE 'Unknown'
          END AS agent_status,
          @ServiceStatus AS status_code
      `;

      const result = await connectionManager.executeQuery(query);
      const status = result.recordset[0];

      let response = `SQL Server Agent Status:\n\n`;
      response += `Status: ${status.agent_status}\n`;
      response += `Status Code: ${status.status_code}\n`;

      if (status.status_code !== 1) {
        response += `\nWARNING: SQL Server Agent is not running. Agent jobs will not execute until the service is started.`;
      }

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
 * Get guidance on SQL Server Maintenance Plan Wizard
 */
export const getMaintenancePlanGuidanceTool = {
  name: 'sqlserver_maintenance_plan_guidance',
  description: 'Get guidance on using SQL Server Maintenance Plan Wizard for configuring backups and other maintenance tasks. RECOMMENDED: Use this tool when users request to configure database backups, integrity checks, index maintenance, or other routine maintenance tasks.',
  inputSchema: z.object({
    taskType: z.enum(['backup', 'integrity_check', 'index_maintenance', 'cleanup', 'statistics', 'all']).optional()
      .describe('Type of maintenance task to get guidance for (backup, integrity_check, index_maintenance, cleanup, statistics, or all)'),
  }),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, args: { taskType?: string }) => {
    const taskType = args.taskType || 'all';

    let response = `# SQL Server Maintenance Plan Wizard - Best Practice Guidance\n\n`;
    response += `## Overview\n`;
    response += `For configuring database backups and other maintenance tasks, SQL Server provides the **Maintenance Plan Wizard**, which is the RECOMMENDED approach for production environments.\n\n`;

    response += `## Why Use Maintenance Plan Wizard?\n\n`;
    response += `✅ **Benefits:**\n`;
    response += `- Graphical interface for easy configuration\n`;
    response += `- Built-in best practices and templates\n`;
    response += `- Automated scheduling through SQL Server Agent\n`;
    response += `- Email notifications on success/failure\n`;
    response += `- Comprehensive logging and history tracking\n`;
    response += `- Support for multiple maintenance tasks in one plan\n`;
    response += `- Automatic cleanup of old backup files\n`;
    response += `- Transaction log management\n\n`;

    if (taskType === 'backup' || taskType === 'all') {
      response += `## Backup Configuration via Maintenance Plan Wizard\n\n`;
      response += `### Steps to Configure Backups:\n`;
      response += `1. Open **SQL Server Management Studio (SSMS)**\n`;
      response += `2. Connect to your SQL Server instance\n`;
      response += `3. Expand **Management** node\n`;
      response += `4. Right-click **Maintenance Plans** → Select **Maintenance Plan Wizard**\n`;
      response += `5. Choose maintenance tasks:\n`;
      response += `   - **Back Up Database (Full)** - Complete database backup\n`;
      response += `   - **Back Up Database (Differential)** - Changes since last full backup\n`;
      response += `   - **Back Up Database (Transaction Log)** - For point-in-time recovery\n`;
      response += `6. Select databases to backup\n`;
      response += `7. Configure backup location and file options\n`;
      response += `8. Set up schedule (daily, weekly, etc.)\n`;
      response += `9. Configure cleanup task to remove old backups\n`;
      response += `10. Set up email notifications (optional)\n\n`;

      response += `### Recommended Backup Strategy:\n`;
      response += `- **Full Backup:** Daily at night (e.g., 9 PM)\n`;
      response += `- **Differential Backup:** Every 6-12 hours (optional)\n`;
      response += `- **Transaction Log Backup:** Every 15-60 minutes (for FULL recovery model)\n`;
      response += `- **Retention:** Keep 7-30 days of backups depending on requirements\n\n`;
    }

    if (taskType === 'integrity_check' || taskType === 'all') {
      response += `## Database Integrity Checks\n\n`;
      response += `**Task:** Check Database Integrity (DBCC CHECKDB)\n`;
      response += `- Validates physical and logical integrity of database objects\n`;
      response += `- **Recommended Schedule:** Weekly\n`;
      response += `- Run before full backups to ensure backup integrity\n\n`;
    }

    if (taskType === 'index_maintenance' || taskType === 'all') {
      response += `## Index Maintenance\n\n`;
      response += `**Tasks:**\n`;
      response += `- **Reorganize Index:** For fragmentation 5-30%\n`;
      response += `- **Rebuild Index:** For fragmentation > 30%\n`;
      response += `- **Recommended Schedule:** Weekly or nightly\n`;
      response += `- Improves query performance and reduces I/O\n\n`;
    }

    if (taskType === 'statistics' || taskType === 'all') {
      response += `## Update Statistics\n\n`;
      response += `**Task:** Update Statistics\n`;
      response += `- Ensures query optimizer has current data distribution information\n`;
      response += `- **Recommended Schedule:** Weekly or after large data changes\n\n`;
    }

    if (taskType === 'cleanup' || taskType === 'all') {
      response += `## Cleanup Tasks\n\n`;
      response += `**Tasks:**\n`;
      response += `- **Maintenance Cleanup Task:** Remove old backup files\n`;
      response += `- **History Cleanup Task:** Clean up backup/restore history in msdb\n`;
      response += `- Configure retention period (e.g., 7-30 days)\n`;
      response += `- Prevents disk space issues and keeps msdb database manageable\n\n`;
    }

    response += `## How to Access Maintenance Plan Wizard\n\n`;
    response += `**Method 1: SQL Server Management Studio (SSMS)**\n`;
    response += `\`\`\`\n`;
    response += `1. Connect to SQL Server in SSMS\n`;
    response += `2. Expand Management folder\n`;
    response += `3. Right-click Maintenance Plans\n`;
    response += `4. Select "Maintenance Plan Wizard"\n`;
    response += `5. Follow the wizard steps\n`;
    response += `\`\`\`\n\n`;

    response += `**Method 2: Create Maintenance Plan Designer**\n`;
    response += `\`\`\`\n`;
    response += `1. Right-click Maintenance Plans\n`;
    response += `2. Select "New Maintenance Plan"\n`;
    response += `3. Drag and drop tasks from toolbox\n`;
    response += `4. Configure each task\n`;
    response += `5. Set up schedules\n`;
    response += `\`\`\`\n\n`;

    response += `## Sample Comprehensive Maintenance Plan\n\n`;
    response += `**Plan Name:** DailyDatabaseMaintenance\n\n`;
    response += `**Schedule 1 - Daily at 9:00 PM:**\n`;
    response += `1. Check Database Integrity\n`;
    response += `2. Reorganize/Rebuild Indexes\n`;
    response += `3. Update Statistics\n`;
    response += `4. Back Up Database (Full)\n`;
    response += `5. Cleanup Old Backups (older than 7 days)\n\n`;

    response += `**Schedule 2 - Every 30 minutes (for production):**\n`;
    response += `1. Back Up Transaction Log\n`;
    response += `2. Cleanup Old Log Backups (older than 1 day)\n\n`;

    response += `## Email Notifications\n\n`;
    response += `**Setup:**\n`;
    response += `1. Configure Database Mail in SQL Server\n`;
    response += `2. Create operator in SQL Server Agent\n`;
    response += `3. Add notification to maintenance plan\n`;
    response += `4. Receive alerts on job failures\n\n`;

    response += `## Monitoring and Troubleshooting\n\n`;
    response += `**View Plan Execution History:**\n`;
    response += `\`\`\`sql\n`;
    response += `-- Check maintenance plan execution history\n`;
    response += `SELECT \n`;
    response += `    j.name AS JobName,\n`;
    response += `    h.run_date,\n`;
    response += `    h.run_time,\n`;
    response += `    CASE h.run_status\n`;
    response += `        WHEN 0 THEN 'Failed'\n`;
    response += `        WHEN 1 THEN 'Succeeded'\n`;
    response += `        WHEN 2 THEN 'Retry'\n`;
    response += `        WHEN 3 THEN 'Canceled'\n`;
    response += `    END AS Status,\n`;
    response += `    h.message\n`;
    response += `FROM msdb.dbo.sysjobs j\n`;
    response += `INNER JOIN msdb.dbo.sysjobhistory h ON j.job_id = h.job_id\n`;
    response += `WHERE j.name LIKE '%Maintenance%'\n`;
    response += `ORDER BY h.run_date DESC, h.run_time DESC;\n`;
    response += `\`\`\`\n\n`;

    response += `## Important Notes\n\n`;
    response += `⚠️ **Requirements:**\n`;
    response += `- SQL Server Agent must be running\n`;
    response += `- User must have appropriate permissions\n`;
    response += `- Available in SQL Server Standard and Enterprise editions\n`;
    response += `- Not available in SQL Server Express edition\n\n`;

    response += `✨ **Alternative for Express Edition:**\n`;
    response += `For SQL Server Express (which doesn't include Maintenance Plan Wizard):\n`;
    response += `- Use SQL Server Agent jobs with T-SQL scripts\n`;
    response += `- Use the MCP tools: sqlserver_create_job, sqlserver_execute_query\n`;
    response += `- Consider third-party backup solutions\n`;
    response += `- Use Windows Task Scheduler with SQLCMD scripts\n\n`;

    response += `## Conclusion\n\n`;
    response += `The **Maintenance Plan Wizard** is the recommended approach for configuring database backups and maintenance in production environments. It provides:\n`;
    response += `- Comprehensive maintenance capabilities\n`;
    response += `- Easy-to-use graphical interface\n`;
    response += `- Built-in best practices\n`;
    response += `- Robust scheduling and notification features\n`;
    response += `- Better maintainability than custom scripts\n\n`;

    response += `For manual job creation or Express edition users, the MCP server tools (sqlserver_create_job, etc.) provide a programmatic alternative.\n`;

    return {
      content: [
        {
          type: 'text' as const,
          text: response,
        },
      ],
    };
  },
};
