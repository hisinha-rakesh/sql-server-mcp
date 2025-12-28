import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';
import { formatResultsAsTable } from '../utils/formatters.js';

/**
 * Backup Database Tool
 * Based on dbatools Backup-DbaDatabase functionality
 * Supports Full, Differential, and Log backups with compression, encryption, and Azure storage
 */
const backupDatabaseInputSchema = z.object({
  database: z.string().describe('Database name to backup. Use "*" or omit to backup all user databases.').optional(),
  excludeDatabase: z.array(z.string()).optional().describe('Array of database names to exclude from backup'),
  backupType: z.enum(['Full', 'Differential', 'Log']).default('Full').describe('Type of backup to perform: Full, Differential, or Log'),
  path: z.string().optional().describe('Backup destination path. If not specified, uses SQL Server default backup directory. Can be local path or UNC path.'),
  fileName: z.string().optional().describe('Specific backup file name. If not specified, auto-generates name with pattern DatabaseName_yyyyMMddHHmm.ext. Use tokens: {dbname}, {timestamp}, {backuptype}, {servername}, {instancename}'),
  compression: z.boolean().optional().describe('Enable backup compression (requires Enterprise or Standard edition SQL 2008+). If not specified, uses server default setting.'),
  checksum: z.boolean().default(true).describe('Enable backup checksum for data integrity verification. Recommended for production backups.'),
  verify: z.boolean().default(false).describe('Perform RESTORE VERIFYONLY after backup to confirm backup can be restored. Adds time but ensures backup integrity.'),
  copyOnly: z.boolean().default(false).describe('Create copy-only backup that does not affect backup chain or differential base. Use for ad-hoc backups.'),
  encryptionAlgorithm: z.enum(['AES_128', 'AES_192', 'AES_256', 'TRIPLE_DES_3KEY']).optional().describe('Encryption algorithm for backup encryption. Requires encryptionCertificate.'),
  encryptionCertificate: z.string().optional().describe('Name of certificate in master database for backup encryption. Certificate must exist before backup.'),
  striping: z.object({
    fileCount: z.number().min(1).max(64).describe('Number of backup files to stripe across for improved performance. Each file will be named with _x_of_y suffix.'),
    paths: z.array(z.string()).optional().describe('Array of paths for striped backups. If specified, fileCount is ignored.'),
  }).optional().describe('Configure backup striping across multiple files/paths for better performance'),
  azureStorage: z.object({
    baseUrl: z.string().describe('Azure blob storage container URL (e.g., https://mystorageaccount.blob.core.windows.net/backups/)'),
    credential: z.string().optional().describe('SQL Server credential name for Azure storage authentication. For SAS, credential should match the container URL.'),
  }).optional().describe('Azure blob storage configuration for cloud backups'),
  noRecovery: z.boolean().default(false).describe('For log backups only: backup log without truncating it. Used for tail-log backups before restores.'),
  description: z.string().optional().describe('Description text to store with backup metadata (max 255 characters)'),
  maxTransferSize: z.number().optional().describe('Maximum transfer size in bytes. Must be multiple of 64KB, max 4MB. Affects backup/restore performance.'),
  bufferCount: z.number().optional().describe('Number of I/O buffers for backup operation. More buffers can improve performance but use more memory.'),
  blockSize: z.number().optional().describe('Physical block size in bytes. Must be 512, 1024, 2048, 4096, 8192, 16384, 32768, or 65536. Cannot be used with Azure page blobs.'),
  initialize: z.boolean().default(false).describe('Overwrite existing backup sets on the media. WARNING: Destroys all previous backups on target files.'),
  format: z.boolean().default(false).describe('Format the backup media before writing. Implies initialize and skip tape header.'),
  retainDays: z.number().optional().describe('Number of days to retain backup before it can be overwritten. Sets expiration date on backup set.'),
});

export const backupDatabaseTool = {
  name: 'sqlserver_backup_database',
  description: 'Create database backups with support for Full, Differential, and Log backup types. Includes compression, encryption, checksum verification, striping, and Azure blob storage support. Based on dbatools Backup-DbaDatabase functionality.',
  inputSchema: backupDatabaseInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof backupDatabaseInputSchema>) => {
    try {
      const {
        database,
        excludeDatabase = [],
        backupType = 'Full',
        path,
        fileName,
        compression,
        checksum = true,
        verify = false,
        copyOnly = false,
        encryptionAlgorithm,
        encryptionCertificate,
        striping,
        azureStorage,
        noRecovery = false,
        description,
        maxTransferSize,
        bufferCount,
        blockSize,
        initialize = false,
        format = false,
        retainDays,
      } = input;

      // Validate encryption parameters
      if (encryptionAlgorithm && !encryptionCertificate) {
        return {
          content: [{
            type: 'text' as const,
            text: '❌ Error: encryptionCertificate is required when using encryptionAlgorithm',
          }],
          isError: true,
        };
      }

      // Validate maxTransferSize
      if (maxTransferSize) {
        if (maxTransferSize % 65536 !== 0 || maxTransferSize > 4194304) {
          return {
            content: [{
              type: 'text' as const,
              text: '❌ Error: maxTransferSize must be a multiple of 64KB (65536 bytes) and no greater than 4MB (4194304 bytes)',
            }],
            isError: true,
          };
        }
      }

      // Validate blockSize
      if (blockSize) {
        const validBlockSizes = [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536];
        if (!validBlockSizes.includes(blockSize)) {
          return {
            content: [{
              type: 'text' as const,
              text: `❌ Error: blockSize must be one of: ${validBlockSizes.join(', ')}`,
            }],
            isError: true,
          };
        }
      }

      // Get list of databases to backup
      let databasesToBackup: string[] = [];
      if (database && database !== '*') {
        databasesToBackup = [database];
      } else {
        const dbQuery = `
          SELECT name
          FROM sys.databases
          WHERE name NOT IN ('tempdb', 'model', 'msdb')
            AND state_desc = 'ONLINE'
            AND is_read_only = 0
          ORDER BY name
        `;
        const dbResult = await connectionManager.executeQuery(dbQuery);
        databasesToBackup = dbResult.recordset.map((row: any) => row.name);
      }

      // Apply exclusions
      if (excludeDatabase.length > 0) {
        databasesToBackup = databasesToBackup.filter(db => !excludeDatabase.includes(db));
      }

      if (databasesToBackup.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: '⚠️  No databases match the criteria for backup.',
          }],
        };
      }

      const results: Array<{
        database: string;
        status: string;
        backupFile: string;
        sizeMB: number;
        duration: string;
        message: string;
      }> = [];

      // Get server name for file naming
      const serverInfoQuery = `
        SELECT
          SERVERPROPERTY('ServerName') AS ServerName,
          SERVERPROPERTY('InstanceName') AS InstanceName
      `;
      const serverInfo = await connectionManager.executeQuery(serverInfoQuery);
      const serverName = (serverInfo.recordset[0].ServerName as string).split('\\')[0];
      const instanceName = serverInfo.recordset[0].InstanceName || 'MSSQLSERVER';

      // Backup each database
      for (const dbName of databasesToBackup) {
        try {
          const startTime = Date.now();

          // Determine backup destination
          let backupPath = path;
          if (!backupPath && !azureStorage) {
            // Get default backup directory
            const defaultPathQuery = `
              DECLARE @BackupDirectory NVARCHAR(512)
              EXEC master.dbo.xp_instance_regread
                N'HKEY_LOCAL_MACHINE',
                N'Software\\Microsoft\\MSSQLServer\\MSSQLServer',
                N'BackupDirectory',
                @BackupDirectory OUTPUT
              SELECT @BackupDirectory AS BackupDirectory
            `;
            const pathResult = await connectionManager.executeQuery(defaultPathQuery);
            backupPath = pathResult.recordset[0].BackupDirectory;
          }

          // Generate file name if not specified
          let backupFileName = fileName;
          if (!backupFileName) {
            const timestamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12);
            const extension = backupType === 'Full' ? 'bak' : backupType === 'Differential' ? 'dif' : 'trn';
            backupFileName = `{dbname}_${timestamp}.${extension}`;
          }

          // Replace tokens in file name
          backupFileName = backupFileName
            .replace(/{dbname}/g, dbName)
            .replace(/{timestamp}/g, new Date().toISOString().replace(/[-:T]/g, '').slice(0, 12))
            .replace(/{backuptype}/g, backupType)
            .replace(/{servername}/g, serverName)
            .replace(/{instancename}/g, instanceName);

          // Build backup paths
          let backupPaths: string[] = [];
          if (azureStorage) {
            // Azure storage backup
            const azureUrl = azureStorage.baseUrl.endsWith('/')
              ? azureStorage.baseUrl + backupFileName
              : azureStorage.baseUrl + '/' + backupFileName;
            backupPaths = [azureUrl];
          } else if (striping?.paths && striping.paths.length > 0) {
            // Multiple paths for striping
            backupPaths = striping.paths.map((p, idx) => {
              const stripedFileName = backupFileName.replace(/(\.[^.]+)$/, `_${idx + 1}_of_${striping.paths!.length}$1`);
              return p.endsWith('\\') || p.endsWith('/') ? p + stripedFileName : p + '\\' + stripedFileName;
            });
          } else if (striping?.fileCount && striping.fileCount > 1) {
            // Stripe across multiple files in same directory
            for (let i = 0; i < striping.fileCount; i++) {
              const stripedFileName = backupFileName.replace(/(\.[^.]+)$/, `_${i + 1}_of_${striping.fileCount}$1`);
              const fullPath = backupPath!.endsWith('\\') || backupPath!.endsWith('/')
                ? backupPath + stripedFileName
                : backupPath + '\\' + stripedFileName;
              backupPaths.push(fullPath);
            }
          } else {
            // Single backup file
            const fullPath = backupPath
              ? (backupPath.endsWith('\\') || backupPath.endsWith('/') ? backupPath + backupFileName : backupPath + '\\' + backupFileName)
              : backupFileName;
            backupPaths = [fullPath];
          }

          // Build BACKUP DATABASE command
          let backupCommand = `BACKUP ${backupType === 'Log' ? 'LOG' : 'DATABASE'} [${dbName}]\n`;
          backupCommand += backupPaths.map((p, idx) => `  ${idx === 0 ? 'TO' : ','} DISK = '${p}'`).join('\n');

          // Add WITH clause options
          const withOptions: string[] = [];

          if (copyOnly) withOptions.push('COPY_ONLY');
          if (checksum) withOptions.push('CHECKSUM');
          if (compression !== undefined) withOptions.push(compression ? 'COMPRESSION' : 'NO_COMPRESSION');
          if (initialize) withOptions.push('INIT');
          if (format) withOptions.push('FORMAT');
          if (description) withOptions.push(`DESCRIPTION = '${description.replace(/'/g, "''")}'`);
          if (maxTransferSize) withOptions.push(`MAXTRANSFERSIZE = ${maxTransferSize}`);
          if (bufferCount) withOptions.push(`BUFFERCOUNT = ${bufferCount}`);
          if (blockSize) withOptions.push(`BLOCKSIZE = ${blockSize}`);
          if (retainDays) withOptions.push(`RETAINDAYS = ${retainDays}`);
          if (noRecovery && backupType === 'Log') withOptions.push('NO_RECOVERY');

          // Add encryption if specified
          if (encryptionAlgorithm && encryptionCertificate) {
            // Verify certificate exists
            const certQuery = `
              SELECT name
              FROM sys.certificates
              WHERE name = '${encryptionCertificate.replace(/'/g, "''")}'
            `;
            const certResult = await connectionManager.executeQuery(certQuery);
            if (certResult.recordset.length === 0) {
              results.push({
                database: dbName,
                status: 'FAILED',
                backupFile: backupPaths[0],
                sizeMB: 0,
                duration: '0s',
                message: `Certificate '${encryptionCertificate}' not found in master database`,
              });
              continue;
            }

            withOptions.push(`ENCRYPTION (ALGORITHM = ${encryptionAlgorithm}, SERVER CERTIFICATE = [${encryptionCertificate}])`);
          }

          // Add Azure credential if specified
          if (azureStorage?.credential) {
            withOptions.push(`CREDENTIAL = '${azureStorage.credential}'`);
          }

          withOptions.push(`NAME = '${dbName}-${backupType} Backup'`);
          withOptions.push('STATS = 10');

          if (withOptions.length > 0) {
            backupCommand += '\n  WITH ' + withOptions.join(',\n       ');
          }

          // Execute backup
          await connectionManager.executeQuery(backupCommand);

          const duration = ((Date.now() - startTime) / 1000).toFixed(2);

          // Get backup size
          const sizeQuery = `
            SELECT TOP 1
              CAST(backup_size / 1024.0 / 1024.0 AS DECIMAL(10, 2)) AS SizeMB
            FROM msdb.dbo.backupset
            WHERE database_name = '${dbName.replace(/'/g, "''")}'
              AND type = '${backupType === 'Full' ? 'D' : backupType === 'Differential' ? 'I' : 'L'}'
            ORDER BY backup_finish_date DESC
          `;
          const sizeResult = await connectionManager.executeQuery(sizeQuery);
          const sizeMB = sizeResult.recordset[0]?.SizeMB || 0;

          // Verify backup if requested
          if (verify) {
            const verifyStartTime = Date.now();
            try {
              const verifyCommand = `RESTORE VERIFYONLY FROM ${backupPaths.map(p => `DISK = '${p}'`).join(', ')}`;
              await connectionManager.executeQuery(verifyCommand);
              const verifyDuration = ((Date.now() - verifyStartTime) / 1000).toFixed(2);

              results.push({
                database: dbName,
                status: 'SUCCESS',
                backupFile: backupPaths.join(', '),
                sizeMB: sizeMB,
                duration: `${duration}s (verify: ${verifyDuration}s)`,
                message: 'Backup completed and verified successfully',
              });
            } catch (verifyError) {
              results.push({
                database: dbName,
                status: 'WARNING',
                backupFile: backupPaths.join(', '),
                sizeMB: sizeMB,
                duration: `${duration}s`,
                message: `Backup completed but verification failed: ${verifyError instanceof Error ? verifyError.message : String(verifyError)}`,
              });
            }
          } else {
            results.push({
              database: dbName,
              status: 'SUCCESS',
              backupFile: backupPaths.join(', '),
              sizeMB: sizeMB,
              duration: `${duration}s`,
              message: 'Backup completed successfully',
            });
          }

        } catch (dbError) {
          results.push({
            database: dbName,
            status: 'FAILED',
            backupFile: '',
            sizeMB: 0,
            duration: '0s',
            message: dbError instanceof Error ? dbError.message : String(dbError),
          });
        }
      }

      // Build response
      let response = `Database Backup Results:\n\n`;
      response += `Backup Type: ${backupType}\n`;
      response += `Total Databases: ${results.length}\n`;
      response += `Successful: ${results.filter(r => r.status === 'SUCCESS').length}\n`;
      response += `Failed: ${results.filter(r => r.status === 'FAILED').length}\n`;
      if (results.some(r => r.status === 'WARNING')) {
        response += `Warnings: ${results.filter(r => r.status === 'WARNING').length}\n`;
      }
      response += `\nDetails:\n\n`;
      response += formatResultsAsTable(results);

      const hasFailures = results.some(r => r.status === 'FAILED');

      return {
        content: [{
          type: 'text' as const,
          text: response,
        }],
        isError: hasFailures,
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
 * List Backup History Tool
 */
const listBackupHistoryInputSchema = z.object({
  database: z.string().optional().describe('Filter by specific database name. If not specified, shows backups for all databases.'),
  backupType: z.enum(['Full', 'Differential', 'Log', 'All']).default('All').describe('Filter by backup type'),
  days: z.number().default(7).describe('Number of days of history to retrieve (default: 7)'),
  limit: z.number().default(50).describe('Maximum number of backup records to return (default: 50, max: 500)'),
});

export const listBackupHistoryTool = {
  name: 'sqlserver_list_backup_history',
  description: 'List backup history from msdb with details including backup type, size, duration, and file locations. Based on dbatools Get-DbaDbBackupHistory functionality.',
  inputSchema: listBackupHistoryInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof listBackupHistoryInputSchema>) => {
    try {
      const { database, backupType = 'All', days = 7, limit = 50 } = input;

      let query = `
        SELECT TOP ${Math.min(limit, 500)}
          bs.database_name AS DatabaseName,
          CASE bs.type
            WHEN 'D' THEN 'Full'
            WHEN 'I' THEN 'Differential'
            WHEN 'L' THEN 'Log'
            WHEN 'F' THEN 'File/Filegroup'
            ELSE 'Other'
          END AS BackupType,
          bs.backup_start_date AS StartTime,
          bs.backup_finish_date AS FinishTime,
          DATEDIFF(SECOND, bs.backup_start_date, bs.backup_finish_date) AS DurationSeconds,
          CAST(bs.backup_size / 1024.0 / 1024.0 AS DECIMAL(10, 2)) AS SizeMB,
          CAST(bs.compressed_backup_size / 1024.0 / 1024.0 AS DECIMAL(10, 2)) AS CompressedSizeMB,
          CASE WHEN bs.is_copy_only = 1 THEN 'Yes' ELSE 'No' END AS CopyOnly,
          CASE WHEN bs.has_backup_checksums = 1 THEN 'Yes' ELSE 'No' END AS Checksum,
          bmf.physical_device_name AS BackupFile,
          bs.server_name AS ServerName,
          bs.recovery_model AS RecoveryModel,
          ISNULL(bs.key_algorithm, 'None') AS EncryptionAlgorithm,
          bs.user_name AS UserName
        FROM msdb.dbo.backupset bs
        INNER JOIN msdb.dbo.backupmediafamily bmf ON bs.media_set_id = bmf.media_set_id
        WHERE bs.backup_start_date >= DATEADD(DAY, -${days}, GETDATE())
      `;

      if (database) {
        query += ` AND bs.database_name = '${database.replace(/'/g, "''")}'`;
      }

      if (backupType !== 'All') {
        const typeCode = backupType === 'Full' ? 'D' : backupType === 'Differential' ? 'I' : 'L';
        query += ` AND bs.type = '${typeCode}'`;
      }

      query += `
        ORDER BY bs.backup_start_date DESC
      `;

      const result = await connectionManager.executeQuery(query);
      const backups = result.recordset;

      if (backups.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: '⚠️  No backup history found matching the specified criteria.',
          }],
        };
      }

      const response = `Backup History (Last ${days} days):\n\n` +
        `Total Backups: ${backups.length}\n\n` +
        formatResultsAsTable(backups);

      return {
        content: [{
          type: 'text' as const,
          text: response,
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
 * Verify Backup File Tool
 */
const verifyBackupInputSchema = z.object({
  backupFile: z.string().describe('Full path to the backup file to verify. Can be local path, UNC path, or Azure blob URL.'),
  azureCredential: z.string().optional().describe('SQL Server credential name for Azure blob storage authentication (if verifying Azure backup)'),
});

export const verifyBackupTool = {
  name: 'sqlserver_verify_backup',
  description: 'Verify backup file integrity using RESTORE VERIFYONLY. Confirms the backup can be read and restored without actually restoring it. Essential for validating backup reliability.',
  inputSchema: verifyBackupInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof verifyBackupInputSchema>) => {
    try {
      const { backupFile, azureCredential } = input;

      const startTime = Date.now();

      // Build RESTORE VERIFYONLY command
      let verifyCommand = `RESTORE VERIFYONLY FROM DISK = '${backupFile.replace(/'/g, "''")}'`;

      if (azureCredential) {
        verifyCommand += ` WITH CREDENTIAL = '${azureCredential.replace(/'/g, "''")}'`;
      }

      // Execute verification
      await connectionManager.executeQuery(verifyCommand);

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // Get backup file info
      const fileInfoQuery = `
        RESTORE FILELISTONLY FROM DISK = '${backupFile.replace(/'/g, "''")}'
        ${azureCredential ? `WITH CREDENTIAL = '${azureCredential.replace(/'/g, "''")}'` : ''}
      `;
      const fileInfo = await connectionManager.executeQuery(fileInfoQuery);

      // Get backup header info
      const headerQuery = `
        RESTORE HEADERONLY FROM DISK = '${backupFile.replace(/'/g, "''")}'
        ${azureCredential ? `WITH CREDENTIAL = '${azureCredential.replace(/'/g, "''")}'` : ''}
      `;
      const headerInfo = await connectionManager.executeQuery(headerQuery);
      const header = headerInfo.recordset[0];

      const backupTypeMap: Record<string, string> = {
        '1': 'Full',
        '2': 'Transaction Log',
        '5': 'Differential',
      };

      let response = `✅ Backup Verification Successful\n\n`;
      response += `Backup File: ${backupFile}\n`;
      response += `Verification Time: ${duration}s\n\n`;
      response += `Backup Information:\n`;
      response += `  Database: ${header.DatabaseName}\n`;
      response += `  Backup Type: ${backupTypeMap[header.BackupType] || 'Unknown'}\n`;
      response += `  Backup Date: ${header.BackupStartDate}\n`;
      response += `  Server: ${header.ServerName}\n`;
      response += `  Recovery Model: ${header.RecoveryModel}\n`;
      response += `  Compressed: ${header.Compressed ? 'Yes' : 'No'}\n`;
      response += `  Encrypted: ${header.KeyAlgorithm ? 'Yes (' + header.KeyAlgorithm + ')' : 'No'}\n`;
      response += `  Has Checksums: ${header.HasBulkLoggedData ? 'Yes' : 'No'}\n\n`;
      response += `Files in Backup:\n`;
      response += formatResultsAsTable(fileInfo.recordset.map((file: any) => ({
        LogicalName: file.LogicalName,
        Type: file.Type,
        FileGroup: file.FileGroupName || 'N/A',
      })));

      return {
        content: [{
          type: 'text' as const,
          text: response,
        }],
      };

    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: `❌ Backup Verification Failed\n\n` + formatError(error),
        }],
        isError: true,
      };
    }
  },
};

/**
 * Get Backup Device Information Tool
 */
export const getBackupDevicesTool = {
  name: 'sqlserver_list_backup_devices',
  description: 'List all backup devices configured on the SQL Server instance, including permanent backup devices and their physical locations.',
  inputSchema: z.object({}),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager) => {
    try {
      const query = `
        SELECT
          name AS DeviceName,
          physical_name AS PhysicalLocation,
          CASE type
            WHEN 2 THEN 'Disk'
            WHEN 3 THEN 'Diskette'
            WHEN 5 THEN 'Tape'
            WHEN 6 THEN 'Pipe'
            WHEN 7 THEN 'Virtual Device'
            ELSE 'Unknown'
          END AS DeviceType
        FROM sys.backup_devices
        ORDER BY name
      `;

      const result = await connectionManager.executeQuery(query);
      const devices = result.recordset;

      if (devices.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: '⚠️  No backup devices are configured on this SQL Server instance.',
          }],
        };
      }

      const response = `Configured Backup Devices:\n\n` + formatResultsAsTable(devices);

      return {
        content: [{
          type: 'text' as const,
          text: response,
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
