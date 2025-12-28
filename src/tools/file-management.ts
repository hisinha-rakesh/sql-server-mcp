import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';
import { formatResultsAsTable } from '../utils/formatters.js';

// Input schemas
const addDatabaseFileInputSchema = z.object({
  databaseName: z.string().min(1).describe('Database name where the file will be added'),
  filegroupName: z.string().min(1).describe('Filegroup name where the file will be added'),
  logicalFileName: z.string().min(1).describe('Logical name for the new file (e.g., MyDB_Data2)'),
  physicalFilePath: z.string().min(1).describe('Full physical path including filename (e.g., C:\\Data\\MyDB_Data2.ndf)'),
  sizeMB: z.number().int().min(1).optional().describe('Initial file size in MB (default: 50)'),
  maxSizeMB: z.number().int().min(1).optional().describe('Maximum file size in MB (default: unlimited)'),
  filegrowthMB: z.number().int().min(1).optional().describe('File growth increment in MB (default: 10)'),
});

const removeDatabaseFileInputSchema = z.object({
  databaseName: z.string().min(1).describe('Database name containing the file'),
  logicalFileName: z.string().min(1).describe('Logical name of the file to remove'),
  emptyFile: z.boolean().optional().describe('Use DBCC SHRINKFILE with EMPTYFILE option before removing (default: true)'),
});

const modifyDatabaseFileInputSchema = z.object({
  databaseName: z.string().min(1).describe('Database name containing the file'),
  logicalFileName: z.string().min(1).describe('Logical name of the file to modify'),
  newSizeMB: z.number().int().min(1).optional().describe('New file size in MB'),
  newMaxSizeMB: z.number().int().min(1).optional().describe('New maximum file size in MB (use -1 for unlimited)'),
  newFilegrowthMB: z.number().int().min(1).optional().describe('New file growth increment in MB'),
  newPhysicalPath: z.string().optional().describe('New physical file path (requires database offline)'),
});

const shrinkDatabaseFileInputSchema = z.object({
  databaseName: z.string().min(1).describe('Database name containing the file'),
  logicalFileName: z.string().min(1).describe('Logical name of the file to shrink'),
  targetSizeMB: z.number().int().min(0).optional().describe('Target size in MB (default: shrink to minimum)'),
  emptyFile: z.boolean().optional().describe('Empty the file completely (default: false)'),
  noTruncate: z.boolean().optional().describe('Keep freed space in the file (default: false)'),
});

const createFilegroupInputSchema = z.object({
  databaseName: z.string().min(1).describe('Database name where the filegroup will be created'),
  filegroupName: z.string().min(1).describe('Name of the filegroup to create'),
  containsFilestream: z.boolean().optional().describe('Create FILESTREAM filegroup (default: false)'),
  containsMemoryOptimizedData: z.boolean().optional().describe('Create memory-optimized filegroup (default: false)'),
  makeDefault: z.boolean().optional().describe('Set as default filegroup (default: false)'),
});

const removeFilegroupInputSchema = z.object({
  databaseName: z.string().min(1).describe('Database name containing the filegroup'),
  filegroupName: z.string().min(1).describe('Name of the filegroup to remove (must be empty)'),
});

const modifyFilegroupInputSchema = z.object({
  databaseName: z.string().min(1).describe('Database name containing the filegroup'),
  filegroupName: z.string().min(1).describe('Name of the filegroup to modify'),
  makeDefault: z.boolean().optional().describe('Set as default filegroup'),
  readOnly: z.boolean().optional().describe('Set filegroup as read-only'),
});

const listFilegroupsInputSchema = z.object({
  databaseName: z.string().min(1).describe('Database name to list filegroups from'),
  includeFiles: z.boolean().optional().describe('Include file details for each filegroup (default: true)'),
});

const listDatabaseFilesInputSchema = z.object({
  databaseName: z.string().min(1).describe('Database name to list files from'),
  fileType: z.enum(['DATA', 'LOG', 'ALL']).optional().describe('Filter by file type (default: ALL)'),
});

// Add database file tool
export const addDatabaseFileTool = {
  name: 'sqlserver_add_database_file',
  description: 'Add a new data file (.mdf or .ndf) to an existing filegroup in a SQL Server database. Essential for expanding database capacity, distributing data across multiple files, or creating files after adding new filegroups. Equivalent to ALTER DATABASE ... ADD FILE.',
  inputSchema: addDatabaseFileInputSchema,
  annotations: {
    title: 'Add Database File',
    destructive: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof addDatabaseFileInputSchema>) => {
    try {
      const {
        databaseName,
        filegroupName,
        logicalFileName,
        physicalFilePath,
        sizeMB = 50,
        maxSizeMB,
        filegrowthMB = 10,
      } = input;

      // Build the ADD FILE statement
      const maxSizeClause = maxSizeMB ? `MAXSIZE = ${maxSizeMB}MB` : 'MAXSIZE = UNLIMITED';

      const query = `
        ALTER DATABASE [${databaseName}]
        ADD FILE (
          NAME = N'${logicalFileName}',
          FILENAME = N'${physicalFilePath}',
          SIZE = ${sizeMB}MB,
          ${maxSizeClause},
          FILEGROWTH = ${filegrowthMB}MB
        ) TO FILEGROUP [${filegroupName}]
      `;

      await connectionManager.executeQuery(query);

      // Verify the file was added
      const verifyQuery = `
        SELECT
          df.name AS logical_name,
          df.physical_name,
          df.type_desc,
          fg.name AS filegroup_name,
          df.size * 8 / 1024 AS size_mb,
          CASE
            WHEN df.max_size = -1 THEN 'UNLIMITED'
            ELSE CAST(df.max_size * 8 / 1024 AS VARCHAR)
          END AS max_size_mb,
          df.growth * 8 / 1024 AS growth_mb,
          df.state_desc
        FROM sys.database_files df
        LEFT JOIN sys.filegroups fg ON df.data_space_id = fg.data_space_id
        WHERE df.name = @logicalFileName
      `;

      const result = await connectionManager.executeQuery(verifyQuery, { logicalFileName });

      return {
        content: [
          {
            type: 'text',
            text: `✅ Database file added successfully to database '${databaseName}'!\n\n` +
                  `File Details:\n` +
                  formatResultsAsTable(result.recordset) +
                  `\n💡 The file is now ready to store data in the '${filegroupName}' filegroup.`,
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
      };
    }
  },
};

// Remove database file tool
export const removeDatabaseFileTool = {
  name: 'sqlserver_remove_database_file',
  description: 'Remove a data file from a SQL Server database. The file must be empty before removal. Optionally uses DBCC SHRINKFILE with EMPTYFILE to evacuate all data pages first. WARNING: Physical file is automatically deleted from disk.',
  inputSchema: removeDatabaseFileInputSchema,
  annotations: {
    title: 'Remove Database File',
    destructive: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof removeDatabaseFileInputSchema>) => {
    try {
      const { databaseName, logicalFileName, emptyFile = true } = input;

      // Get file info before removal
      const fileInfoQuery = `
        SELECT
          file_id,
          physical_name,
          size * 8 / 1024 AS size_mb,
          FILEPROPERTY(name, 'SpaceUsed') * 8 / 1024 AS used_mb
        FROM sys.database_files
        WHERE name = @logicalFileName
      `;

      const fileInfo = await connectionManager.executeQuery(fileInfoQuery, { logicalFileName });

      if (fileInfo.recordset.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ File '${logicalFileName}' not found in database '${databaseName}'.`,
            },
          ],
        };
      }

      const fileData = fileInfo.recordset[0];
      const physicalPath = fileData.physical_name;

      // Empty the file if requested
      if (emptyFile) {
        const shrinkQuery = `DBCC SHRINKFILE (${fileData.file_id}, EMPTYFILE)`;
        await connectionManager.executeQuery(shrinkQuery);
      }

      // Remove the file
      const removeQuery = `
        ALTER DATABASE [${databaseName}]
        REMOVE FILE [${logicalFileName}]
      `;

      await connectionManager.executeQuery(removeQuery);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Database file removed successfully from '${databaseName}'!\n\n` +
                  `File Details:\n` +
                  `- Logical Name: ${logicalFileName}\n` +
                  `- Physical Path: ${physicalPath}\n` +
                  `- Size: ${fileData.size_mb} MB\n` +
                  `- Used Space: ${fileData.used_mb} MB\n\n` +
                  `⚠️  Physical file has been automatically deleted from disk.`,
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
      };
    }
  },
};

// Modify database file tool
export const modifyDatabaseFileTool = {
  name: 'sqlserver_modify_database_file',
  description: 'Modify properties of an existing database file including size, max size, growth increment, or physical path. Note: Changing physical path requires database to be offline.',
  inputSchema: modifyDatabaseFileInputSchema,
  annotations: {
    title: 'Modify Database File',
    destructive: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof modifyDatabaseFileInputSchema>) => {
    try {
      const { databaseName, logicalFileName, newSizeMB, newMaxSizeMB, newFilegrowthMB, newPhysicalPath } = input;

      const modifications: string[] = [];

      // Build modification clauses
      if (newSizeMB !== undefined) {
        modifications.push(`SIZE = ${newSizeMB}MB`);
      }

      if (newMaxSizeMB !== undefined) {
        if (newMaxSizeMB === -1) {
          modifications.push(`MAXSIZE = UNLIMITED`);
        } else {
          modifications.push(`MAXSIZE = ${newMaxSizeMB}MB`);
        }
      }

      if (newFilegrowthMB !== undefined) {
        modifications.push(`FILEGROWTH = ${newFilegrowthMB}MB`);
      }

      if (newPhysicalPath !== undefined) {
        modifications.push(`FILENAME = N'${newPhysicalPath}'`);
      }

      if (modifications.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ No modifications specified. Please provide at least one property to modify.',
            },
          ],
        };
      }

      const modifyQuery = `
        ALTER DATABASE [${databaseName}]
        MODIFY FILE (
          NAME = N'${logicalFileName}',
          ${modifications.join(',\n          ')}
        )
      `;

      await connectionManager.executeQuery(modifyQuery);

      // Get updated file info
      const verifyQuery = `
        SELECT
          df.name AS logical_name,
          df.physical_name,
          df.size * 8 / 1024 AS size_mb,
          CASE
            WHEN df.max_size = -1 THEN 'UNLIMITED'
            ELSE CAST(df.max_size * 8 / 1024 AS VARCHAR)
          END AS max_size_mb,
          df.growth * 8 / 1024 AS growth_mb,
          df.state_desc
        FROM sys.database_files df
        WHERE df.name = @logicalFileName
      `;

      const result = await connectionManager.executeQuery(verifyQuery, { logicalFileName });

      return {
        content: [
          {
            type: 'text',
            text: `✅ Database file modified successfully in '${databaseName}'!\n\n` +
                  `Updated File Details:\n` +
                  formatResultsAsTable(result.recordset) +
                  (newPhysicalPath ? '\n⚠️  Path change requires database to be taken offline and brought back online to take effect.' : ''),
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
      };
    }
  },
};

// Shrink database file tool
export const shrinkDatabaseFileTool = {
  name: 'sqlserver_shrink_database_file',
  description: 'Shrink a database file to reclaim unused space using DBCC SHRINKFILE. Can shrink to a target size or empty the file completely for removal. Note: Shrinking can cause index fragmentation.',
  inputSchema: shrinkDatabaseFileInputSchema,
  annotations: {
    title: 'Shrink Database File',
    destructive: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof shrinkDatabaseFileInputSchema>) => {
    try {
      const { databaseName, logicalFileName, targetSizeMB, emptyFile = false, noTruncate = false } = input;

      // Get file info before shrinking
      const beforeQuery = `
        SELECT
          file_id,
          name,
          size * 8 / 1024 AS size_mb,
          FILEPROPERTY(name, 'SpaceUsed') * 8 / 1024 AS used_mb
        FROM sys.database_files
        WHERE name = @logicalFileName
      `;

      const beforeResult = await connectionManager.executeQuery(beforeQuery, { logicalFileName });

      if (beforeResult.recordset.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ File '${logicalFileName}' not found in database '${databaseName}'.`,
            },
          ],
        };
      }

      const beforeData = beforeResult.recordset[0];

      // Build DBCC SHRINKFILE command
      let shrinkCommand: string;
      if (emptyFile) {
        shrinkCommand = `DBCC SHRINKFILE (${beforeData.file_id}, EMPTYFILE)`;
      } else if (targetSizeMB !== undefined) {
        shrinkCommand = `DBCC SHRINKFILE (${beforeData.file_id}, ${targetSizeMB})`;
      } else {
        shrinkCommand = noTruncate
          ? `DBCC SHRINKFILE (${beforeData.file_id}, NOTRUNCATE)`
          : `DBCC SHRINKFILE (${beforeData.file_id}, TRUNCATEONLY)`;
      }

      await connectionManager.executeQuery(shrinkCommand);

      // Get file info after shrinking
      const afterResult = await connectionManager.executeQuery(beforeQuery, { logicalFileName });
      const afterData = afterResult.recordset[0];

      const spaceReclaimed = beforeData.size_mb - afterData.size_mb;

      return {
        content: [
          {
            type: 'text',
            text: `✅ Database file shrink completed for '${logicalFileName}' in '${databaseName}'!\n\n` +
                  `Before Shrink:\n` +
                  `- Size: ${beforeData.size_mb} MB\n` +
                  `- Used: ${beforeData.used_mb} MB\n\n` +
                  `After Shrink:\n` +
                  `- Size: ${afterData.size_mb} MB\n` +
                  `- Used: ${afterData.used_mb} MB\n\n` +
                  `Space Reclaimed: ${spaceReclaimed} MB\n\n` +
                  (spaceReclaimed > 0
                    ? '💡 Note: Shrinking can cause index fragmentation. Consider rebuilding indexes if needed.'
                    : '💡 File could not be shrunk further. It may already be at minimum size or data is not contiguous.'),
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
      };
    }
  },
};

// Create filegroup tool
export const createFilegroupTool = {
  name: 'sqlserver_create_filegroup',
  description: 'Create a new filegroup in a SQL Server database. Filegroups allow organizing database objects across different physical files for performance, maintenance, and backup strategies. After creating a filegroup, add files using sqlserver_add_database_file.',
  inputSchema: createFilegroupInputSchema,
  annotations: {
    title: 'Create Filegroup',
    destructive: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof createFilegroupInputSchema>) => {
    try {
      const {
        databaseName,
        filegroupName,
        containsFilestream = false,
        containsMemoryOptimizedData = false,
        makeDefault = false,
      } = input;

      // Build the ADD FILEGROUP statement
      let filegroupType = '';
      if (containsFilestream) {
        filegroupType = 'CONTAINS FILESTREAM';
      } else if (containsMemoryOptimizedData) {
        filegroupType = 'CONTAINS MEMORY_OPTIMIZED_DATA';
      }

      const createQuery = `
        ALTER DATABASE [${databaseName}]
        ADD FILEGROUP [${filegroupName}] ${filegroupType}
      `.trim();

      await connectionManager.executeQuery(createQuery);

      // Set as default if requested
      if (makeDefault && !containsMemoryOptimizedData && !containsFilestream) {
        const defaultQuery = `
          ALTER DATABASE [${databaseName}]
          MODIFY FILEGROUP [${filegroupName}] DEFAULT
        `;
        await connectionManager.executeQuery(defaultQuery);
      }

      // Verify the filegroup was created
      const verifyQuery = `
        SELECT
          fg.name AS filegroup_name,
          fg.type_desc,
          fg.is_default,
          fg.is_read_only,
          COUNT(df.file_id) AS file_count
        FROM sys.filegroups fg
        LEFT JOIN sys.database_files df ON fg.data_space_id = df.data_space_id
        WHERE fg.name = @filegroupName
        GROUP BY fg.name, fg.type_desc, fg.is_default, fg.is_read_only
      `;

      const result = await connectionManager.executeQuery(verifyQuery, { filegroupName });

      return {
        content: [
          {
            type: 'text',
            text: `✅ Filegroup created successfully in database '${databaseName}'!\n\n` +
                  `Filegroup Details:\n` +
                  formatResultsAsTable(result.recordset) +
                  `\n💡 Next Step: Add files to this filegroup using sqlserver_add_database_file.` +
                  (containsMemoryOptimizedData ? '\n⚠️  Memory-optimized filegroup requires at least one file before use.' : ''),
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
      };
    }
  },
};

// Remove filegroup tool
export const removeFilegroupTool = {
  name: 'sqlserver_remove_filegroup',
  description: 'Remove an empty filegroup from a SQL Server database. The filegroup must not contain any files before removal. Remove all files first using sqlserver_remove_database_file.',
  inputSchema: removeFilegroupInputSchema,
  annotations: {
    title: 'Remove Filegroup',
    destructive: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof removeFilegroupInputSchema>) => {
    try {
      const { databaseName, filegroupName } = input;

      // Check if filegroup has files
      const checkQuery = `
        SELECT COUNT(*) AS file_count
        FROM sys.database_files df
        INNER JOIN sys.filegroups fg ON df.data_space_id = fg.data_space_id
        WHERE fg.name = @filegroupName
      `;

      const checkResult = await connectionManager.executeQuery(checkQuery, { filegroupName });
      const fileCount = checkResult.recordset[0]?.file_count || 0;

      if (fileCount > 0) {
        return {
          content: [
            {
              type: 'text',
              text: `❌ Cannot remove filegroup '${filegroupName}' because it contains ${fileCount} file(s).\n\n` +
                  `💡 Remove all files from this filegroup first using sqlserver_remove_database_file.`,
            },
          ],
        };
      }

      // Remove the filegroup
      const removeQuery = `
        ALTER DATABASE [${databaseName}]
        REMOVE FILEGROUP [${filegroupName}]
      `;

      await connectionManager.executeQuery(removeQuery);

      return {
        content: [
          {
            type: 'text',
            text: `✅ Filegroup '${filegroupName}' removed successfully from database '${databaseName}'!`,
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
      };
    }
  },
};

// Modify filegroup tool
export const modifyFilegroupTool = {
  name: 'sqlserver_modify_filegroup',
  description: 'Modify properties of an existing filegroup including setting it as default or making it read-only. Default filegroup is used for new objects when no filegroup is specified.',
  inputSchema: modifyFilegroupInputSchema,
  annotations: {
    title: 'Modify Filegroup',
    destructive: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof modifyFilegroupInputSchema>) => {
    try {
      const { databaseName, filegroupName, makeDefault, readOnly } = input;

      const modifications: string[] = [];

      // Set as default
      if (makeDefault !== undefined) {
        if (makeDefault) {
          const defaultQuery = `
            ALTER DATABASE [${databaseName}]
            MODIFY FILEGROUP [${filegroupName}] DEFAULT
          `;
          await connectionManager.executeQuery(defaultQuery);
          modifications.push('Set as default filegroup');
        }
      }

      // Set read-only or read-write
      if (readOnly !== undefined) {
        const readOnlyQuery = `
          ALTER DATABASE [${databaseName}]
          MODIFY FILEGROUP [${filegroupName}] ${readOnly ? 'READ_ONLY' : 'READ_WRITE'}
        `;
        await connectionManager.executeQuery(readOnlyQuery);
        modifications.push(readOnly ? 'Set to READ_ONLY' : 'Set to READ_WRITE');
      }

      if (modifications.length === 0) {
        return {
          content: [
            {
              type: 'text',
              text: '❌ No modifications specified. Please provide at least one property to modify.',
            },
          ],
        };
      }

      // Verify the modifications
      const verifyQuery = `
        SELECT
          name AS filegroup_name,
          type_desc,
          is_default,
          is_read_only
        FROM sys.filegroups
        WHERE name = @filegroupName
      `;

      const result = await connectionManager.executeQuery(verifyQuery, { filegroupName });

      return {
        content: [
          {
            type: 'text',
            text: `✅ Filegroup modified successfully in '${databaseName}'!\n\n` +
                  `Modifications Applied:\n` +
                  modifications.map(m => `- ${m}`).join('\n') +
                  `\n\nUpdated Filegroup Details:\n` +
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
      };
    }
  },
};

// List filegroups tool
export const listFilegroupsTool = {
  name: 'sqlserver_list_filegroups',
  description: 'List all filegroups in a SQL Server database with their properties and optionally include details of files in each filegroup. Useful for understanding database file organization.',
  inputSchema: listFilegroupsInputSchema,
  annotations: {
    title: 'List Filegroups',
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof listFilegroupsInputSchema>) => {
    try {
      const { databaseName, includeFiles = true } = input;

      const filegroupQuery = `
        SELECT
          fg.data_space_id,
          fg.name AS filegroup_name,
          fg.type_desc,
          fg.is_default,
          fg.is_read_only,
          COUNT(df.file_id) AS file_count,
          ISNULL(SUM(df.size * 8 / 1024), 0) AS total_size_mb,
          ISNULL(SUM(FILEPROPERTY(df.name, 'SpaceUsed') * 8 / 1024), 0) AS used_space_mb
        FROM sys.filegroups fg
        LEFT JOIN sys.database_files df ON fg.data_space_id = df.data_space_id
        GROUP BY fg.data_space_id, fg.name, fg.type_desc, fg.is_default, fg.is_read_only
        ORDER BY fg.is_default DESC, fg.name
      `;

      const filegroupResult = await connectionManager.executeQuery(filegroupQuery);

      let output = `📂 Filegroups in database '${databaseName}':\n\n` +
                   formatResultsAsTable(filegroupResult.recordset);

      // Include file details if requested
      if (includeFiles && filegroupResult.recordset.length > 0) {
        const filesQuery = `
          SELECT
            fg.name AS filegroup_name,
            df.name AS file_logical_name,
            df.physical_name,
            df.size * 8 / 1024 AS size_mb,
            FILEPROPERTY(df.name, 'SpaceUsed') * 8 / 1024 AS used_mb,
            df.state_desc
          FROM sys.database_files df
          INNER JOIN sys.filegroups fg ON df.data_space_id = fg.data_space_id
          ORDER BY fg.name, df.name
        `;

        const filesResult = await connectionManager.executeQuery(filesQuery);

        if (filesResult.recordset.length > 0) {
          output += `\n\n📄 Files in Filegroups:\n\n` + formatResultsAsTable(filesResult.recordset);
        }
      }

      return {
        content: [
          {
            type: 'text',
            text: output,
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
      };
    }
  },
};

// List database files tool
export const listDatabaseFilesTool = {
  name: 'sqlserver_list_database_files',
  description: 'List all data and log files in a SQL Server database with detailed information including size, used space, growth settings, and physical location. Optionally filter by file type (DATA or LOG).',
  inputSchema: listDatabaseFilesInputSchema,
  annotations: {
    title: 'List Database Files',
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof listDatabaseFilesInputSchema>) => {
    try {
      const { databaseName, fileType = 'ALL' } = input;

      let typeFilter = '';
      if (fileType === 'DATA') {
        typeFilter = "WHERE df.type_desc = 'ROWS'";
      } else if (fileType === 'LOG') {
        typeFilter = "WHERE df.type_desc = 'LOG'";
      }

      const query = `
        SELECT
          df.file_id,
          df.name AS logical_name,
          df.physical_name,
          df.type_desc AS file_type,
          ISNULL(fg.name, 'N/A') AS filegroup_name,
          df.size * 8 / 1024 AS size_mb,
          CASE
            WHEN df.type_desc = 'ROWS' THEN FILEPROPERTY(df.name, 'SpaceUsed') * 8 / 1024
            ELSE NULL
          END AS used_mb,
          CASE
            WHEN df.max_size = -1 THEN 'UNLIMITED'
            WHEN df.max_size = 268435456 THEN 'UNLIMITED'
            ELSE CAST(df.max_size * 8 / 1024 AS VARCHAR)
          END AS max_size_mb,
          CASE
            WHEN df.is_percent_growth = 1 THEN CAST(df.growth AS VARCHAR) + '%'
            ELSE CAST(df.growth * 8 / 1024 AS VARCHAR) + ' MB'
          END AS growth,
          df.state_desc
        FROM sys.database_files df
        LEFT JOIN sys.filegroups fg ON df.data_space_id = fg.data_space_id
        ${typeFilter}
        ORDER BY df.type_desc, df.file_id
      `;

      const result = await connectionManager.executeQuery(query);

      return {
        content: [
          {
            type: 'text',
            text: `📁 Database Files in '${databaseName}' (${fileType}):\n\n` +
                  formatResultsAsTable(result.recordset) +
                  `\n\nTotal Files: ${result.recordset.length}`,
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
      };
    }
  },
};
