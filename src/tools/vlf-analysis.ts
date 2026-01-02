import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';
import { formatResultsAsTable } from '../utils/formatters.js';

/**
 * Get Database VLF Count Tool
 * Based on dbatools Get-DbaDbVirtualLogFile functionality
 * Gets the Virtual Log File (VLF) count for databases - high count indicates log fragmentation
 */
const getDbVlfCountInputSchema = z.object({
  database: z.string().optional().describe('Specific database name. If not specified, analyzes all databases.'),
  threshold: z.number().optional().default(50).describe('Highlight databases with VLF count above this threshold (default: 50)'),
});

export const getDbVlfCountTool = {
  name: 'sqlserver_get_vlf_count',
  description: 'Get Virtual Log File (VLF) count for databases. High VLF count (>50) indicates transaction log fragmentation and can cause performance issues during startup, backup, and restore. Based on dbatools Get-DbaDbVirtualLogFile functionality.',
  inputSchema: getDbVlfCountInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getDbVlfCountInputSchema>) => {
    try {
      const { database, threshold } = input;

      const query = database
        ? `
          DBCC LOGINFO('${database}') WITH NO_INFOMSGS;
        `
        : `
          CREATE TABLE #VLFCounts (
            DatabaseName SYSNAME,
            VLFCount INT
          );

          EXEC sp_MSforeachdb '
            USE [?];
            INSERT INTO #VLFCounts (DatabaseName, VLFCount)
            SELECT DB_NAME(), COUNT(*)
            FROM sys.dm_db_log_info(DB_ID());
          ';

          SELECT
            DatabaseName,
            VLFCount,
            CASE
              WHEN VLFCount >= ${threshold} THEN 'HIGH - Action Required'
              WHEN VLFCount >= 25 THEN 'MODERATE - Monitor'
              ELSE 'NORMAL'
            END AS Status,
            CASE
              WHEN VLFCount >= ${threshold} THEN 'Consider shrinking and regro wing log file to reduce VLF count'
              WHEN VLFCount >= 25 THEN 'Monitor VLF growth and consider optimization'
              ELSE 'VLF count is within acceptable range'
            END AS Recommendation
          FROM #VLFCounts
          ORDER BY VLFCount DESC;

          DROP TABLE #VLFCounts;
        `;

      const result = await connectionManager.executeQuery(query);

      if (database) {
        // For single database, count the VLF entries
        const vlfCount = result.recordset.length;
        const status = vlfCount >= threshold!
          ? 'HIGH - Action Required'
          : vlfCount >= 25
          ? 'MODERATE - Monitor'
          : 'NORMAL';

        return {
          content: [{
            type: 'text' as const,
            text: `VLF Analysis for database '${database}':\n\n` +
                  `VLF Count: ${vlfCount}\n` +
                  `Status: ${status}\n\n` +
                  `Recommendation:\n` +
                  `${vlfCount >= threshold!
                    ? '⚠️  HIGH VLF count detected! Consider:\n' +
                      '  1. Shrink the transaction log file\n' +
                      '  2. Re-grow it in larger increments (e.g., 8GB chunks)\n' +
                      '  3. Review log backup frequency\n' +
                      '  4. Consider setting appropriate auto-growth settings'
                    : vlfCount >= 25
                    ? '⚠️  MODERATE VLF count. Monitor log growth patterns and consider optimization if it increases.'
                    : '✅ VLF count is within acceptable range.'
                  }`,
          }],
        };
      }

      if (result.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No databases found or unable to retrieve VLF information.',
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `VLF Analysis for all databases:\n\n${formatResultsAsTable(result.recordset)}\n\n` +
                `Databases analyzed: ${result.recordset.length}\n` +
                `Databases with HIGH VLF count (>=${threshold}): ${result.recordset.filter((r: any) => r.Status === 'HIGH - Action Required').length}`,
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
 * Get Database VLF Details Tool
 * Gets detailed Virtual Log File information including status and size
 */
const getDbVlfDetailsInputSchema = z.object({
  database: z.string().describe('Database name to get detailed VLF information'),
});

export const getDbVlfDetailsTool = {
  name: 'sqlserver_get_vlf_details',
  description: 'Get detailed Virtual Log File (VLF) information including size, status, and sequence for a specific database. Useful for deep analysis of transaction log structure.',
  inputSchema: getDbVlfDetailsInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getDbVlfDetailsInputSchema>) => {
    try {
      const { database } = input;

      // Use sys.dm_db_log_info for SQL Server 2016+ (compatibility level 130+)
      const query = `
        USE [${database}];

        SELECT
          vlf_sequence_number AS SequenceNumber,
          file_id AS FileID,
          vlf_size_mb AS SizeMB,
          vlf_status AS Status,
          CASE vlf_status
            WHEN 0 THEN 'Inactive'
            WHEN 2 THEN 'Active'
            ELSE 'Unknown'
          END AS StatusDescription,
          vlf_parity AS Parity,
          vlf_begin_offset AS BeginOffset,
          vlf_create_lsn AS CreateLSN
        FROM sys.dm_db_log_info(DB_ID())
        ORDER BY file_id, vlf_sequence_number;
      `;

      const result = await connectionManager.executeQuery(query);

      if (result.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No VLF information found for database '${database}'.`,
          }],
        };
      }

      const totalSize = result.recordset.reduce((sum: number, vlf: any) => sum + (vlf.SizeMB || 0), 0);
      const activeCount = result.recordset.filter((vlf: any) => vlf.Status === 2).length;
      const inactiveCount = result.recordset.filter((vlf: any) => vlf.Status === 0).length;

      return {
        content: [{
          type: 'text' as const,
          text: `Detailed VLF Information for '${database}':\n\n${formatResultsAsTable(result.recordset)}\n\n` +
                `Summary:\n` +
                `- Total VLFs: ${result.recordset.length}\n` +
                `- Active VLFs: ${activeCount}\n` +
                `- Inactive VLFs: ${inactiveCount}\n` +
                `- Total Log Size: ${totalSize.toFixed(2)} MB`,
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
 * Optimize Database VLF Tool
 * Reduces excessive VLF count by shrinking and regrowing the transaction log
 */
const optimizeDbVlfInputSchema = z.object({
  database: z.string().describe('Database name to optimize VLF count'),
  targetLogSizeMB: z.number().optional().describe('Target log file size in MB (optional - if not specified, uses current used space + 25%)'),
  growthIncrementMB: z.number().default(512).optional().describe('Log file auto-growth increment in MB (default: 512MB)'),
});

export const optimizeDbVlfTool = {
  name: 'sqlserver_optimize_vlf',
  description: 'Optimize Virtual Log File count by shrinking and regrowing the transaction log file. WARNING: This operation can take time and may impact performance. Ensure log backups are up to date. Based on best practices for VLF management.',
  inputSchema: optimizeDbVlfInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof optimizeDbVlfInputSchema>) => {
    try {
      const { database, targetLogSizeMB, growthIncrementMB } = input;

      // Check recovery model
      const recoveryModelQuery = `
        SELECT recovery_model_desc
        FROM sys.databases
        WHERE name = @database;
      `;
      const recoveryResult = await connectionManager.executeQuery(recoveryModelQuery, { database });

      if (recoveryResult.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Error: Database '${database}' not found.`,
          }],
          isError: true,
        };
      }

      const recoveryModel = recoveryResult.recordset[0].recovery_model_desc;

      // Get current VLF count
      const vlfCountQuery = `
        USE [${database}];
        SELECT COUNT(*) AS VLFCount FROM sys.dm_db_log_info(DB_ID());
      `;
      const vlfCountResult = await connectionManager.executeQuery(vlfCountQuery);
      const currentVLFCount = vlfCountResult.recordset[0].VLFCount;

      // Get log file information
      const logFileQuery = `
        USE [${database}];
        SELECT
          name AS LogicalName,
          physical_name AS PhysicalName,
          size * 8 / 1024 AS SizeMB,
          FILEPROPERTY(name, 'SpaceUsed') * 8 / 1024 AS UsedMB
        FROM sys.database_files
        WHERE type = 1;
      `;
      const logFileResult = await connectionManager.executeQuery(logFileQuery);
      const logFile = logFileResult.recordset[0];

      // Calculate target size
      const calculatedTargetSize = targetLogSizeMB || Math.ceil(logFile.UsedMB * 1.25);

      const steps: string[] = [];

      // Step 1: Backup log if in FULL recovery model
      if (recoveryModel === 'FULL') {
        steps.push('Taking transaction log backup to truncate inactive VLFs...');
        try {
          const backupQuery = `BACKUP LOG [${database}] TO DISK = 'NUL';`;
          await connectionManager.executeQuery(backupQuery);
          steps.push('✅ Log backup completed');
        } catch (error: any) {
          steps.push(`⚠️  Log backup failed: ${error.message}. Continuing...`);
        }
      }

      // Step 2: Shrink log file
      steps.push('Shrinking transaction log file...');
      const shrinkQuery = `
        USE [${database}];
        DBCC SHRINKFILE('${logFile.LogicalName}', ${calculatedTargetSize});
      `;
      await connectionManager.executeQuery(shrinkQuery);
      steps.push('✅ Log file shrunk');

      // Step 3: Modify growth settings
      steps.push(`Setting auto-growth to ${growthIncrementMB}MB...`);
      const growthQuery = `
        USE [master];
        ALTER DATABASE [${database}]
        MODIFY FILE (
          NAME = '${logFile.LogicalName}',
          FILEGROWTH = ${growthIncrementMB}MB
        );
      `;
      await connectionManager.executeQuery(growthQuery);
      steps.push('✅ Growth settings updated');

      // Get new VLF count
      const newVLFCountResult = await connectionManager.executeQuery(vlfCountQuery);
      const newVLFCount = newVLFCountResult.recordset[0].VLFCount;

      return {
        content: [{
          type: 'text' as const,
          text: `VLF Optimization completed for database '${database}':\n\n` +
                `Steps executed:\n${steps.map(s => `  ${s}`).join('\n')}\n\n` +
                `Results:\n` +
                `- Previous VLF Count: ${currentVLFCount}\n` +
                `- New VLF Count: ${newVLFCount}\n` +
                `- VLF Reduction: ${currentVLFCount - newVLFCount} (${((1 - newVLFCount / currentVLFCount) * 100).toFixed(1)}%)\n` +
                `- Target Log Size: ${calculatedTargetSize} MB\n` +
                `- Auto-Growth: ${growthIncrementMB} MB\n\n` +
                `${newVLFCount > 50
                  ? '⚠️  VLF count is still high. Consider increasing targetLogSizeMB or running the optimization again.'
                  : '✅ VLF count is now optimized.'
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
 * Get Database Log File Info Tool
 * Gets comprehensive transaction log file information
 */
const getDbLogFileInfoInputSchema = z.object({
  database: z.string().optional().describe('Specific database name. If not specified, shows all databases.'),
});

export const getDbLogFileInfoTool = {
  name: 'sqlserver_get_log_file_info',
  description: 'Get comprehensive transaction log file information including size, growth settings, usage, and VLF count. Useful for capacity planning and performance analysis.',
  inputSchema: getDbLogFileInfoInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getDbLogFileInfoInputSchema>) => {
    try {
      const { database } = input;

      const query = database
        ? `
          USE [${database}];

          SELECT
            DB_NAME() AS DatabaseName,
            mf.name AS LogicalName,
            mf.physical_name AS PhysicalName,
            mf.size * 8 / 1024 AS SizeMB,
            FILEPROPERTY(mf.name, 'SpaceUsed') * 8 / 1024 AS UsedMB,
            (mf.size * 8 / 1024) - (FILEPROPERTY(mf.name, 'SpaceUsed') * 8 / 1024) AS FreeMB,
            CAST(FILEPROPERTY(mf.name, 'SpaceUsed') * 100.0 / mf.size AS DECIMAL(5,2)) AS UsedPercent,
            CASE mf.is_percent_growth
              WHEN 1 THEN CAST(mf.growth AS VARCHAR) + '%'
              ELSE CAST(mf.growth * 8 / 1024 AS VARCHAR) + ' MB'
            END AS Growth,
            CASE mf.max_size
              WHEN -1 THEN 'Unlimited'
              WHEN 268435456 THEN 'Unlimited'
              ELSE CAST(mf.max_size * 8 / 1024 AS VARCHAR) + ' MB'
            END AS MaxSize,
            (SELECT COUNT(*) FROM sys.dm_db_log_info(DB_ID())) AS VLFCount
          FROM sys.master_files mf
          WHERE mf.database_id = DB_ID()
            AND mf.type = 1;
        `
        : `
          SELECT
            DB_NAME(mf.database_id) AS DatabaseName,
            mf.name AS LogicalName,
            mf.physical_name AS PhysicalName,
            mf.size * 8 / 1024 AS SizeMB,
            FILEPROPERTY(mf.name, 'SpaceUsed') * 8 / 1024 AS UsedMB,
            (mf.size * 8 / 1024) - (FILEPROPERTY(mf.name, 'SpaceUsed') * 8 / 1024) AS FreeMB,
            CAST(FILEPROPERTY(mf.name, 'SpaceUsed') * 100.0 / mf.size AS DECIMAL(5,2)) AS UsedPercent,
            CASE mf.is_percent_growth
              WHEN 1 THEN CAST(mf.growth AS VARCHAR) + '%'
              ELSE CAST(mf.growth * 8 / 1024 AS VARCHAR) + ' MB'
            END AS Growth,
            CASE mf.max_size
              WHEN -1 THEN 'Unlimited'
              WHEN 268435456 THEN 'Unlimited'
              ELSE CAST(mf.max_size * 8 / 1024 AS VARCHAR) + ' MB'
            END AS MaxSize
          FROM sys.master_files mf
          WHERE mf.type = 1
            AND mf.database_id > 4
          ORDER BY DB_NAME(mf.database_id);
        `;

      const result = await connectionManager.executeQuery(query);

      if (result.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: 'No transaction log files found.',
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Transaction Log File Information:\n\n${formatResultsAsTable(result.recordset)}\n\n` +
                `Total log files: ${result.recordset.length}`,
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
