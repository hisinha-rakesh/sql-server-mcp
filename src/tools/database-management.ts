import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';
import { formatResultsAsTable } from '../utils/formatters.js';

// ==================== DATABASE CRUD TOOLS (4) ====================

const getDatabaseInputSchema = z.object({
  database: z.string().optional().describe('Specific database name (if not specified, returns all databases)'),
  excludeSystem: z.boolean().default(true).describe('Exclude system databases'),
});

export const getDatabaseTool = {
  name: 'sqlserver_get_database',
  description: `Get detailed database information including size, status, recovery model, compatibility. Based on dbatools Get-DbaDatabase.`,
  inputSchema: getDatabaseInputSchema,
  annotations: { readOnlyHint: true },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getDatabaseInputSchema>) => {
    try {
      const whereClause = input.database ? 'WHERE d.name = @database' : (input.excludeSystem ? 'WHERE d.database_id > 4' : '');
      const query = `SELECT d.name AS database_name, d.database_id, d.create_date, d.state_desc AS status,
        d.recovery_model_desc AS recovery_model, d.compatibility_level,
        SUSER_SNAME(d.owner_sid) AS owner, d.collation_name, d.user_access_desc AS user_access,
        d.is_read_only, d.is_auto_close_on, d.is_auto_shrink_on, d.is_auto_create_stats_on, d.is_auto_update_stats_on,
        CAST((SELECT SUM(size)*8.0/1024 FROM sys.master_files WHERE database_id=d.database_id AND type=0) AS DECIMAL(10,2)) AS data_size_mb,
        CAST((SELECT SUM(size)*8.0/1024 FROM sys.master_files WHERE database_id=d.database_id AND type=1) AS DECIMAL(10,2)) AS log_size_mb
        FROM sys.databases d ${whereClause} ORDER BY d.name;`;
      const result = await connectionManager.executeQuery(query, input.database ? { database: input.database } : {});
      if (result.recordset.length === 0) return { content: [{ type: 'text' as const, text: 'No databases found' }] };
      let response = `Database Information (${result.recordset.length} database(s)):\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const newDatabaseInputSchema = z.object({
  database: z.string().describe('Database name to create'),
  dataFilePath: z.string().optional().describe('Physical path for data file'),
  logFilePath: z.string().optional().describe('Physical path for log file'),
  collation: z.string().optional().describe('Database collation'),
  recoveryModel: z.enum(['SIMPLE', 'FULL', 'BULK_LOGGED']).default('FULL').describe('Recovery model'),
});

export const newDatabaseTool = {
  name: 'sqlserver_new_database',
  description: `Create a new SQL Server database. Based on dbatools New-DbaDatabase.`,
  inputSchema: newDatabaseInputSchema,
  annotations: { readOnlyHint: false },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof newDatabaseInputSchema>) => {
    try {
      const dataFile = input.dataFilePath ? `FILENAME = '${input.dataFilePath}'` : '';
      const logFile = input.logFilePath ? `, LOG ON (NAME = ${input.database}_log, FILENAME = '${input.logFilePath}')` : '';
      const collation = input.collation ? `COLLATE ${input.collation}` : '';
      const query = `CREATE DATABASE [${input.database}] ${dataFile ? `ON (NAME = ${input.database}_data, ${dataFile})` : ''} ${logFile} ${collation};
        ALTER DATABASE [${input.database}] SET RECOVERY ${input.recoveryModel};`;
      await connectionManager.executeQuery(query, {});
      const verifyQuery = `SELECT name, state_desc, recovery_model_desc FROM sys.databases WHERE name = @database;`;
      const result = await connectionManager.executeQuery(verifyQuery, { database: input.database });
      let response = `✓ Database '${input.database}' created successfully\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const removeDatabaseInputSchema = z.object({
  database: z.string().describe('Database name to drop'),
  force: z.boolean().default(false).describe('Kill connections and drop database'),
});

export const removeDatabaseTool = {
  name: 'sqlserver_remove_database',
  description: `Drop (delete) a SQL Server database. WARNING: Permanently deletes database. Based on dbatools Remove-DbaDatabase.`,
  inputSchema: removeDatabaseInputSchema,
  annotations: { readOnlyHint: false },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof removeDatabaseInputSchema>) => {
    try {
      if (input.force) {
        await connectionManager.executeQuery(`ALTER DATABASE [${input.database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;`, {});
      }
      await connectionManager.executeQuery(`DROP DATABASE [${input.database}];`, {});
      let response = `✓ Database '${input.database}' has been dropped`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const setDatabaseInputSchema = z.object({
  database: z.string().describe('Database name'),
  newName: z.string().optional().describe('New database name (rename)'),
  collation: z.string().optional().describe('New collation'),
});

export const setDatabaseTool = {
  name: 'sqlserver_set_database',
  description: `Modify database properties (rename, change collation). Based on dbatools Set-DbaDatabase.`,
  inputSchema: setDatabaseInputSchema,
  annotations: { readOnlyHint: false },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof setDatabaseInputSchema>) => {
    try {
      const operations: string[] = [];
      if (input.newName) {
        await connectionManager.executeQuery(`ALTER DATABASE [${input.database}] MODIFY NAME = [${input.newName}];`, {});
        operations.push(`✓ Renamed to '${input.newName}'`);
      }
      if (input.collation) {
        await connectionManager.executeQuery(`ALTER DATABASE [${input.database}] COLLATE ${input.collation};`, {});
        operations.push(`✓ Collation set to '${input.collation}'`);
      }
      if (operations.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No changes specified' }], isError: true };
      }
      let response = `Database modified:\n\n${operations.join('\n')}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

// ==================== DATABASE STATE TOOLS (2) ====================

const getDbStateInputSchema = z.object({
  database: z.string().optional().describe('Specific database'),
});

export const getDbStateTool = {
  name: 'sqlserver_get_db_state',
  description: `Get database state (online/offline/restoring/etc), user access mode, and read-only status. Based on dbatools Get-DbaDbState.`,
  inputSchema: getDbStateInputSchema,
  annotations: { readOnlyHint: true },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getDbStateInputSchema>) => {
    try {
      const whereClause = input.database ? 'WHERE name = @database' : 'WHERE database_id > 4';
      const query = `SELECT name AS database_name, state_desc AS state, user_access_desc AS user_access,
        is_read_only, is_in_standby FROM sys.databases ${whereClause} ORDER BY name;`;
      const result = await connectionManager.executeQuery(query, input.database ? { database: input.database } : {});
      if (result.recordset.length === 0) return { content: [{ type: 'text' as const, text: 'No databases found' }] };
      let response = `Database State:\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const setDbStateInputSchema = z.object({
  database: z.string().describe('Database name'),
  online: z.boolean().optional().describe('Set database ONLINE'),
  offline: z.boolean().optional().describe('Set database OFFLINE'),
  emergency: z.boolean().optional().describe('Set database to EMERGENCY mode'),
  singleUser: z.boolean().optional().describe('Set SINGLE_USER mode'),
  multiUser: z.boolean().optional().describe('Set MULTI_USER mode'),
  readOnly: z.boolean().optional().describe('Set READ_ONLY'),
  readWrite: z.boolean().optional().describe('Set READ_WRITE'),
  force: z.boolean().default(false).describe('Force state change with ROLLBACK IMMEDIATE'),
});

export const setDbStateTool = {
  name: 'sqlserver_set_db_state',
  description: `Change database state, user access, or read-only mode. Based on dbatools Set-DbaDbState.`,
  inputSchema: setDbStateInputSchema,
  annotations: { readOnlyHint: false },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof setDbStateInputSchema>) => {
    try {
      const rollback = input.force ? 'WITH ROLLBACK IMMEDIATE' : '';
      const operations: string[] = [];

      if (input.online) {
        await connectionManager.executeQuery(`ALTER DATABASE [${input.database}] SET ONLINE ${rollback};`, {});
        operations.push('✓ Set ONLINE');
      }
      if (input.offline) {
        await connectionManager.executeQuery(`ALTER DATABASE [${input.database}] SET OFFLINE ${rollback};`, {});
        operations.push('✓ Set OFFLINE');
      }
      if (input.emergency) {
        await connectionManager.executeQuery(`ALTER DATABASE [${input.database}] SET EMERGENCY;`, {});
        operations.push('✓ Set EMERGENCY');
      }
      if (input.singleUser) {
        await connectionManager.executeQuery(`ALTER DATABASE [${input.database}] SET SINGLE_USER ${rollback};`, {});
        operations.push('✓ Set SINGLE_USER');
      }
      if (input.multiUser) {
        await connectionManager.executeQuery(`ALTER DATABASE [${input.database}] SET MULTI_USER;`, {});
        operations.push('✓ Set MULTI_USER');
      }
      if (input.readOnly) {
        await connectionManager.executeQuery(`ALTER DATABASE [${input.database}] SET READ_ONLY ${rollback};`, {});
        operations.push('✓ Set READ_ONLY');
      }
      if (input.readWrite) {
        await connectionManager.executeQuery(`ALTER DATABASE [${input.database}] SET READ_WRITE;`, {});
        operations.push('✓ Set READ_WRITE');
      }

      if (operations.length === 0) {
        return { content: [{ type: 'text' as const, text: 'No state changes specified' }], isError: true };
      }

      let response = `Database '${input.database}' state changed:\n\n${operations.join('\n')}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

// ==================== DATABASE OWNER TOOLS (2) ====================

const getDbOwnerInputSchema = z.object({
  database: z.string().optional().describe('Specific database'),
});

export const getDbOwnerTool = {
  name: 'sqlserver_get_db_owner',
  description: `Get database owner information. Based on dbatools Get-DbaDbOwner.`,
  inputSchema: getDbOwnerInputSchema,
  annotations: { readOnlyHint: true },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getDbOwnerInputSchema>) => {
    try {
      const whereClause = input.database ? 'WHERE d.name = @database' : 'WHERE d.database_id > 4';
      const query = `SELECT d.name AS database_name, SUSER_SNAME(d.owner_sid) AS owner, d.owner_sid
        FROM sys.databases d ${whereClause} ORDER BY d.name;`;
      const result = await connectionManager.executeQuery(query, input.database ? { database: input.database } : {});
      if (result.recordset.length === 0) return { content: [{ type: 'text' as const, text: 'No databases found' }] };
      let response = `Database Owners:\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const setDbOwnerInputSchema = z.object({
  database: z.string().describe('Database name'),
  owner: z.string().default('sa').describe('New owner login (default: sa)'),
});

export const setDbOwnerTool = {
  name: 'sqlserver_set_db_owner',
  description: `Change database owner. Commonly used after restoring databases. Based on dbatools Set-DbaDbOwner.`,
  inputSchema: setDbOwnerInputSchema,
  annotations: { readOnlyHint: false },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof setDbOwnerInputSchema>) => {
    try {
      await connectionManager.executeQuery(`ALTER AUTHORIZATION ON DATABASE::[${input.database}] TO [${input.owner}];`, {});
      const verifyQuery = `SELECT name, SUSER_SNAME(owner_sid) AS owner FROM sys.databases WHERE name = @database;`;
      const result = await connectionManager.executeQuery(verifyQuery, { database: input.database });
      let response = `✓ Database owner changed\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

// ==================== DATABASE RECOVERY MODEL TOOLS (2) ====================

const getDbRecoveryModelInputSchema = z.object({
  database: z.string().optional().describe('Specific database'),
});

export const getDbRecoveryModelTool = {
  name: 'sqlserver_get_db_recovery_model',
  description: `Get database recovery model (SIMPLE/FULL/BULK_LOGGED). Based on dbatools Get-DbaDbRecoveryModel.`,
  inputSchema: getDbRecoveryModelInputSchema,
  annotations: { readOnlyHint: true },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getDbRecoveryModelInputSchema>) => {
    try {
      const whereClause = input.database ? 'WHERE name = @database' : 'WHERE database_id > 4';
      const query = `SELECT name AS database_name, recovery_model_desc AS recovery_model FROM sys.databases ${whereClause} ORDER BY name;`;
      const result = await connectionManager.executeQuery(query, input.database ? { database: input.database } : {});
      if (result.recordset.length === 0) return { content: [{ type: 'text' as const, text: 'No databases found' }] };
      let response = `Database Recovery Models:\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const setDbRecoveryModelInputSchema = z.object({
  database: z.string().describe('Database name'),
  recoveryModel: z.enum(['SIMPLE', 'FULL', 'BULK_LOGGED']).describe('Recovery model to set'),
});

export const setDbRecoveryModelTool = {
  name: 'sqlserver_set_db_recovery_model',
  description: `Change database recovery model. SIMPLE=No log backups, FULL=Point-in-time recovery, BULK_LOGGED=Minimally logged bulk ops. Based on dbatools Set-DbaDbRecoveryModel.`,
  inputSchema: setDbRecoveryModelInputSchema,
  annotations: { readOnlyHint: false },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof setDbRecoveryModelInputSchema>) => {
    try {
      await connectionManager.executeQuery(`ALTER DATABASE [${input.database}] SET RECOVERY ${input.recoveryModel};`, {});
      const verifyQuery = `SELECT name, recovery_model_desc FROM sys.databases WHERE name = @database;`;
      const result = await connectionManager.executeQuery(verifyQuery, { database: input.database });
      let response = `✓ Recovery model changed to ${input.recoveryModel}\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

// ==================== DATABASE COMPATIBILITY TOOLS (2) ====================

const getDbCompatibilityInputSchema = z.object({
  database: z.string().optional().describe('Specific database'),
});

export const getDbCompatibilityTool = {
  name: 'sqlserver_get_db_compatibility',
  description: `Get database compatibility level (80=SQL2000, 90=SQL2005, 100=SQL2008, 110=SQL2012, 120=SQL2014, 130=SQL2016, 140=SQL2017, 150=SQL2019, 160=SQL2022). Based on dbatools Get-DbaDbCompatibility.`,
  inputSchema: getDbCompatibilityInputSchema,
  annotations: { readOnlyHint: true },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getDbCompatibilityInputSchema>) => {
    try {
      const whereClause = input.database ? 'WHERE name = @database' : 'WHERE database_id > 4';
      const query = `SELECT name AS database_name, compatibility_level,
        CASE compatibility_level
          WHEN 80 THEN 'SQL Server 2000' WHEN 90 THEN 'SQL Server 2005' WHEN 100 THEN 'SQL Server 2008'
          WHEN 110 THEN 'SQL Server 2012' WHEN 120 THEN 'SQL Server 2014' WHEN 130 THEN 'SQL Server 2016'
          WHEN 140 THEN 'SQL Server 2017' WHEN 150 THEN 'SQL Server 2019' WHEN 160 THEN 'SQL Server 2022'
          ELSE 'Unknown' END AS version_name
        FROM sys.databases ${whereClause} ORDER BY name;`;
      const result = await connectionManager.executeQuery(query, input.database ? { database: input.database } : {});
      if (result.recordset.length === 0) return { content: [{ type: 'text' as const, text: 'No databases found' }] };
      let response = `Database Compatibility Levels:\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const setDbCompatibilityInputSchema = z.object({
  database: z.string().describe('Database name'),
  compatibilityLevel: z.number().int().describe('Compatibility level (80, 90, 100, 110, 120, 130, 140, 150, 160)'),
});

export const setDbCompatibilityTool = {
  name: 'sqlserver_set_db_compatibility',
  description: `Change database compatibility level. Use server's compatibility level after upgrades. Based on dbatools Set-DbaDbCompatibility.`,
  inputSchema: setDbCompatibilityInputSchema,
  annotations: { readOnlyHint: false },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof setDbCompatibilityInputSchema>) => {
    try {
      await connectionManager.executeQuery(`ALTER DATABASE [${input.database}] SET COMPATIBILITY_LEVEL = ${input.compatibilityLevel};`, {});
      const verifyQuery = `SELECT name, compatibility_level FROM sys.databases WHERE name = @database;`;
      const result = await connectionManager.executeQuery(verifyQuery, { database: input.database });
      let response = `✓ Compatibility level set to ${input.compatibilityLevel}\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

// ==================== DATABASE SNAPSHOT TOOLS (4) ====================

const newDbSnapshotInputSchema = z.object({
  database: z.string().describe('Source database name'),
  snapshotName: z.string().optional().describe('Snapshot name (default: database_yyyyMMddHHmmss)'),
  path: z.string().optional().describe('Directory for snapshot files'),
});

export const newDbSnapshotTool = {
  name: 'sqlserver_new_db_snapshot',
  description: `Create database snapshot(s). Snapshots are read-only, point-in-time copies using copy-on-write. Based on dbatools New-DbaDbSnapshot.`,
  inputSchema: newDbSnapshotInputSchema,
  annotations: { readOnlyHint: false },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof newDbSnapshotInputSchema>) => {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '').slice(0, 14);
      const snapshotName = input.snapshotName || `${input.database}_${timestamp}`;

      // Get source database files
      const filesQuery = `SELECT name, physical_name FROM sys.master_files WHERE database_id = DB_ID(@database) AND type = 0;`;
      const filesResult = await connectionManager.executeQuery(filesQuery, { database: input.database });

      if (filesResult.recordset.length === 0) {
        return { content: [{ type: 'text' as const, text: `Database '${input.database}' not found` }], isError: true };
      }

      const fileSpecs = filesResult.recordset.map(f => {
        const basePath = input.path || f.physical_name.substring(0, f.physical_name.lastIndexOf('\\'));
        const extension = '.ss';
        const snapshotFile = `${basePath}\\${f.name}_${timestamp}${extension}`;
        return `(NAME = [${f.name}], FILENAME = '${snapshotFile}')`;
      }).join(', ');

      const createQuery = `CREATE DATABASE [${snapshotName}] ON ${fileSpecs} AS SNAPSHOT OF [${input.database}];`;
      await connectionManager.executeQuery(createQuery, {});

      const verifyQuery = `SELECT name, create_date, source_database_id FROM sys.databases WHERE name = @snapshotName;`;
      const result = await connectionManager.executeQuery(verifyQuery, { snapshotName });

      let response = `✓ Snapshot '${snapshotName}' created from '${input.database}'\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const getDbSnapshotInputSchema = z.object({
  database: z.string().optional().describe('Filter by source database'),
});

export const getDbSnapshotTool = {
  name: 'sqlserver_get_db_snapshot',
  description: `List all database snapshots with source database and creation time. Based on dbatools Get-DbaDbSnapshot.`,
  inputSchema: getDbSnapshotInputSchema,
  annotations: { readOnlyHint: true },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getDbSnapshotInputSchema>) => {
    try {
      const whereClause = input.database ? 'AND DB_NAME(d.source_database_id) = @database' : '';
      const query = `SELECT d.name AS snapshot_name, DB_NAME(d.source_database_id) AS source_database,
        d.create_date, d.state_desc, CAST((SELECT SUM(size)*8.0/1024 FROM sys.master_files WHERE database_id=d.database_id) AS DECIMAL(10,2)) AS size_mb
        FROM sys.databases d WHERE d.source_database_id IS NOT NULL ${whereClause} ORDER BY d.create_date DESC;`;
      const result = await connectionManager.executeQuery(query, input.database ? { database: input.database } : {});
      if (result.recordset.length === 0) return { content: [{ type: 'text' as const, text: 'No snapshots found' }] };
      let response = `Database Snapshots (${result.recordset.length}):\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const removeDbSnapshotInputSchema = z.object({
  snapshotName: z.string().describe('Snapshot name to drop'),
});

export const removeDbSnapshotTool = {
  name: 'sqlserver_remove_db_snapshot',
  description: `Drop (delete) a database snapshot. Based on dbatools Remove-DbaDbSnapshot.`,
  inputSchema: removeDbSnapshotInputSchema,
  annotations: { readOnlyHint: false },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof removeDbSnapshotInputSchema>) => {
    try {
      await connectionManager.executeQuery(`DROP DATABASE [${input.snapshotName}];`, {});
      let response = `✓ Snapshot '${input.snapshotName}' has been dropped`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const restoreDbSnapshotInputSchema = z.object({
  database: z.string().describe('Database to restore'),
  snapshotName: z.string().optional().describe('Specific snapshot name (default: latest snapshot)'),
  force: z.boolean().default(false).describe('Force restore by killing connections'),
});

export const restoreDbSnapshotTool = {
  name: 'sqlserver_restore_db_snapshot',
  description: `Restore database from snapshot. WARNING: Reverts database to snapshot point-in-time. Based on dbatools Restore-DbaDbSnapshot.`,
  inputSchema: restoreDbSnapshotInputSchema,
  annotations: { readOnlyHint: false },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof restoreDbSnapshotInputSchema>) => {
    try {
      let snapshotName = input.snapshotName;

      // If no snapshot specified, find latest
      if (!snapshotName) {
        const findQuery = `SELECT TOP 1 name FROM sys.databases WHERE source_database_id = DB_ID(@database) ORDER BY create_date DESC;`;
        const findResult = await connectionManager.executeQuery(findQuery, { database: input.database });
        if (findResult.recordset.length === 0) {
          return { content: [{ type: 'text' as const, text: `No snapshots found for database '${input.database}'` }], isError: true };
        }
        snapshotName = findResult.recordset[0].name;
      }

      if (input.force) {
        await connectionManager.executeQuery(`ALTER DATABASE [${input.database}] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;`, {});
      }

      await connectionManager.executeQuery(`RESTORE DATABASE [${input.database}] FROM DATABASE_SNAPSHOT = '${snapshotName}';`, {});

      if (input.force) {
        await connectionManager.executeQuery(`ALTER DATABASE [${input.database}] SET MULTI_USER;`, {});
      }

      let response = `✓ Database '${input.database}' restored from snapshot '${snapshotName}'`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

// ==================== DATABASE OPERATIONS TOOLS (2) ====================

const shrinkDatabaseInputSchema = z.object({
  database: z.string().describe('Database name to shrink'),
  targetPercent: z.number().int().min(0).max(100).default(10).describe('Target free space percentage (default: 10)'),
  noTruncate: z.boolean().default(false).describe('Keep freed space in file'),
});

export const shrinkDatabaseTool = {
  name: 'sqlserver_shrink_database',
  description: `Shrink database to reclaim unused space. WARNING: Causes fragmentation. Use sparingly. Based on dbatools Invoke-DbaDbShrink.`,
  inputSchema: shrinkDatabaseInputSchema,
  annotations: { readOnlyHint: false },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof shrinkDatabaseInputSchema>) => {
    try {
      const noTruncate = input.noTruncate ? 'NOTRUNCATE' : 'TRUNCATEONLY';
      const beforeQuery = `SELECT name, CAST(size*8.0/1024 AS DECIMAL(10,2)) AS size_mb FROM sys.master_files WHERE database_id = DB_ID(@database);`;
      const beforeResult = await connectionManager.executeQuery(beforeQuery, { database: input.database });

      await connectionManager.executeQuery(`DBCC SHRINKDATABASE([${input.database}], ${input.targetPercent}, ${noTruncate});`, {});

      const afterResult = await connectionManager.executeQuery(beforeQuery, { database: input.database });

      let response = `✓ Database '${input.database}' shrunk\n\nBefore:\n${formatResultsAsTable(beforeResult.recordset)}\n\nAfter:\n${formatResultsAsTable(afterResult.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};

const setDbCollationInputSchema = z.object({
  database: z.string().describe('Database name'),
  collation: z.string().describe('New collation (e.g., SQL_Latin1_General_CP1_CI_AS)'),
});

export const setDbCollationTool = {
  name: 'sqlserver_set_db_collation',
  description: `Change database collation. WARNING: Requires database to be empty or may fail on existing objects. Based on dbatools Set-DbaDbCollation.`,
  inputSchema: setDbCollationInputSchema,
  annotations: { readOnlyHint: false },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof setDbCollationInputSchema>) => {
    try {
      await connectionManager.executeQuery(`ALTER DATABASE [${input.database}] COLLATE ${input.collation};`, {});
      const verifyQuery = `SELECT name, collation_name FROM sys.databases WHERE name = @database;`;
      const result = await connectionManager.executeQuery(verifyQuery, { database: input.database });
      let response = `✓ Collation changed to '${input.collation}'\n\n${formatResultsAsTable(result.recordset)}`;
      return { content: [{ type: 'text' as const, text: response }] };
    } catch (error) {
      return { content: [{ type: 'text' as const, text: formatError(error) }], isError: true };
    }
  },
};
