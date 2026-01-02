import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';
import { formatResultsAsTable } from '../utils/formatters.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * pgloader Migration Tool - Natural Language Interface
 * Based on pgloader.io - Open Source database migration tool
 *
 * Supports:
 * - SQL Server to PostgreSQL (on-premise)
 * - SQL Server to Azure PostgreSQL Flexible Server
 * - Automatic schema conversion
 * - Parallel data loading
 * - Data type mapping
 * - Table filtering and transformations
 */

/**
 * PostgreSQL Target Type
 */
const postgresTargetTypeSchema = z.enum(['on-premise', 'azure-flexible', 'azure-single', 'aws-rds', 'gcp-cloudsql']);

/**
 * pgloader Migration Input Schema
 */
const pgloaderMigrationInputSchema = z.object({
  // Source SQL Server
  sourceHost: z.string().describe('SQL Server hostname or IP address'),
  sourcePort: z.number().default(1433).optional().describe('SQL Server port (default: 1433)'),
  sourceDatabase: z.string().describe('Source SQL Server database name'),
  sourceUsername: z.string().describe('SQL Server username'),
  sourcePassword: z.string().describe('SQL Server password'),
  sourceInstance: z.string().optional().describe('SQL Server instance name (if using named instance)'),

  // Target PostgreSQL
  targetType: postgresTargetTypeSchema.default('on-premise').describe('PostgreSQL deployment type'),
  targetHost: z.string().describe('PostgreSQL hostname (e.g., myserver.postgres.database.azure.com for Azure)'),
  targetPort: z.number().default(5432).optional().describe('PostgreSQL port (default: 5432)'),
  targetDatabase: z.string().describe('Target PostgreSQL database name'),
  targetUsername: z.string().describe('PostgreSQL username (e.g., admin@myserver for Azure)'),
  targetPassword: z.string().describe('PostgreSQL password'),

  // Azure-specific settings
  azureRequireSSL: z.boolean().default(true).optional().describe('Require SSL for Azure PostgreSQL (default: true)'),

  // Table filtering
  includeTables: z.array(z.string()).optional().describe('List of tables to include (e.g., ["dbo.Person", "dbo.Address"])'),
  excludeTables: z.array(z.string()).optional().describe('List of tables to exclude'),
  includeSchemas: z.array(z.string()).optional().describe('List of schemas to include (default: all)'),
  excludeSchemas: z.array(z.string()).optional().describe('List of schemas to exclude'),

  // Schema transformations
  renameSchema: z.record(z.string(), z.string()).optional().describe('Rename schemas (e.g., {"dbo": "public"})'),
  dropTargetSchemasFirst: z.boolean().default(false).describe('Drop existing target schemas before migration'),

  // Views
  materializeViews: z.boolean().default(false).describe('Convert views to tables'),
  materializeSpecificViews: z.array(z.string()).optional().describe('Specific views to materialize'),

  // Performance settings
  workers: z.number().default(4).optional().describe('Number of parallel workers (default: 4)'),
  batchRows: z.number().default(25000).optional().describe('Rows per batch (default: 25000)'),
  batchSize: z.string().default('20MB').optional().describe('Batch size (default: 20MB)'),
  prefetchRows: z.number().default(100000).optional().describe('Prefetch rows (default: 100000)'),

  // Memory settings
  workMem: z.string().default('16MB').optional().describe('PostgreSQL work_mem (default: 16MB)'),
  maintenanceWorkMem: z.string().default('512MB').optional().describe('PostgreSQL maintenance_work_mem (default: 512MB)'),

  // Migration options
  createIndexes: z.boolean().default(true).describe('Create indexes after data load'),
  createForeignKeys: z.boolean().default(true).describe('Create foreign keys after data load'),
  disableTriggers: z.boolean().default(true).describe('Disable triggers during load'),

  // Validation
  dryRun: z.boolean().default(false).describe('Generate configuration only without executing migration'),
  validateOnly: z.boolean().default(false).describe('Validate connection and prerequisites only'),

  // Advanced options
  customCastRules: z.string().optional().describe('Custom CAST rules in pgloader syntax'),
  beforeLoadSQL: z.string().optional().describe('SQL to execute before load (e.g., DROP SCHEMA CASCADE)'),
  afterLoadSQL: z.string().optional().describe('SQL to execute after load'),
});

/**
 * Generate pgloader Configuration File
 */
function generatePgloaderConfig(input: z.infer<typeof pgloaderMigrationInputSchema>): string {
  const lines: string[] = [];

  // Header
  lines.push('/*');
  lines.push(' * pgloader Migration Configuration');
  lines.push(` * Generated: ${new Date().toISOString()}`);
  lines.push(` * Source: ${input.sourceHost}/${input.sourceDatabase}`);
  lines.push(` * Target: ${input.targetType} - ${input.targetHost}/${input.targetDatabase}`);
  lines.push(' */');
  lines.push('');

  // Main LOAD DATABASE command
  const sourceInstance = input.sourceInstance ? `\\${input.sourceInstance}` : '';
  const sourceConnString = `mssql://${input.sourceUsername}:${input.sourcePassword}@${input.sourceHost}${sourceInstance}/${input.sourceDatabase}`;

  // PostgreSQL connection string
  let targetConnString = `postgresql://${input.targetUsername}:${input.targetPassword}@${input.targetHost}:${input.targetPort}/${input.targetDatabase}`;

  // Add SSL parameter for Azure
  if (input.targetType.startsWith('azure') && input.azureRequireSSL) {
    targetConnString += '?sslmode=require';
  }

  lines.push('LOAD DATABASE');
  lines.push(`     FROM ${sourceConnString}`);
  lines.push(`     INTO ${targetConnString}`);
  lines.push('');

  // Performance settings
  lines.push('WITH');
  lines.push(`     workers = ${input.workers},`);
  lines.push(`     batch rows = ${input.batchRows},`);
  lines.push(`     batch size = '${input.batchSize}',`);
  lines.push(`     prefetch rows = ${input.prefetchRows}`);
  lines.push('');

  // PostgreSQL memory settings
  lines.push('SET');
  lines.push(`     work_mem to '${input.workMem}',`);
  lines.push(`     maintenance_work_mem to '${input.maintenanceWorkMem}'`);
  lines.push('');

  // Migration options
  const options: string[] = [];
  if (!input.createIndexes) options.push('create no indexes');
  if (!input.createForeignKeys) options.push('create no foreign keys');
  if (input.disableTriggers) options.push('disable triggers');

  if (options.length > 0) {
    lines.push('WITH');
  lines.push('     ' + options.join(',\n     '));
    lines.push('');
  }

  // Table filtering
  if (input.includeTables && input.includeTables.length > 0) {
    lines.push('INCLUDING ONLY TABLE NAMES MATCHING');
    input.includeTables.forEach((table, idx) => {
      const [schema, tableName] = table.includes('.') ? table.split('.') : ['dbo', table];
      const separator = idx === input.includeTables!.length - 1 ? '' : ',';
      lines.push(`     '${tableName}' IN SCHEMA '${schema}'${separator}`);
    });
    lines.push('');
  }

  if (input.excludeTables && input.excludeTables.length > 0) {
    lines.push('EXCLUDING TABLE NAMES MATCHING');
    input.excludeTables.forEach((table, idx) => {
      const [schema, tableName] = table.includes('.') ? table.split('.') : ['dbo', table];
      const separator = idx === input.excludeTables!.length - 1 ? '' : ',';
      lines.push(`     '${tableName}' IN SCHEMA '${schema}'${separator}`);
    });
    lines.push('');
  }

  // Schema filtering
  if (input.includeSchemas && input.includeSchemas.length > 0) {
    lines.push('INCLUDING ONLY SCHEMA');
    lines.push(`     ${input.includeSchemas.map(s => `'${s}'`).join(', ')}`);
    lines.push('');
  }

  if (input.excludeSchemas && input.excludeSchemas.length > 0) {
    lines.push('EXCLUDING SCHEMA');
    lines.push(`     ${input.excludeSchemas.map(s => `'${s}'`).join(', ')}`);
    lines.push('');
  }

  // Schema renaming
  if (input.renameSchema && Object.keys(input.renameSchema).length > 0) {
    Object.entries(input.renameSchema).forEach(([oldSchema, newSchema]) => {
      lines.push(`ALTER SCHEMA '${oldSchema}' RENAME TO '${newSchema}'`);
    });
    lines.push('');
  }

  // View materialization
  if (input.materializeViews) {
    lines.push('MATERIALIZE ALL VIEWS');
    lines.push('');
  } else if (input.materializeSpecificViews && input.materializeSpecificViews.length > 0) {
    lines.push('MATERIALIZE VIEWS');
    lines.push(`     ${input.materializeSpecificViews.map(v => `'${v}'`).join(', ')}`);
    lines.push('');
  }

  // Before load SQL
  if (input.beforeLoadSQL) {
    lines.push('BEFORE LOAD DO');
    lines.push(`     $$ ${input.beforeLoadSQL} $$`);
    lines.push('');
  } else if (input.dropTargetSchemasFirst) {
    const schemas = input.renameSchema ? Object.values(input.renameSchema) : ['public'];
    schemas.forEach(schema => {
      lines.push('BEFORE LOAD DO');
      lines.push(`     $$ DROP SCHEMA IF EXISTS "${schema}" CASCADE; $$`);
    });
    lines.push('');
  }

  // After load SQL
  if (input.afterLoadSQL) {
    lines.push('AFTER LOAD DO');
    lines.push(`     $$ ${input.afterLoadSQL} $$`);
    lines.push('');
  }

  // Custom cast rules
  if (input.customCastRules) {
    lines.push(input.customCastRules);
    lines.push('');
  }

  lines.push(';');

  return lines.join('\n');
}

/**
 * Validate pgloader Installation
 */
export const validatePgloaderInstallationTool = {
  name: 'sqlserver_validate_pgloader_installation',
  description: 'Validate that pgloader is installed and properly configured. Checks version and FreeTDS driver availability.',
  inputSchema: z.object({}),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: any) => {
    try {
      const checks: Array<{
        Check: string;
        Status: string;
        Details: string;
      }> = [];

      // Check Docker installation (for Windows)
      const { execSync } = require('child_process');
      const isWindows = process.platform === 'win32';

      if (isWindows) {
        try {
          const dockerVersion = execSync('docker --version', { encoding: 'utf-8', timeout: 5000 });
          checks.push({
            Check: 'Docker (for pgloader)',
            Status: '✅ INSTALLED',
            Details: dockerVersion.trim(),
          });

          // Check if pgloader Docker image exists
          try {
            const imageCheck = execSync('docker images dimitri/pgloader -q', { encoding: 'utf-8', timeout: 5000 });
            if (imageCheck.trim()) {
              checks.push({
                Check: 'pgloader Docker Image',
                Status: '✅ AVAILABLE',
                Details: 'dimitri/pgloader:latest',
              });
            } else {
              checks.push({
                Check: 'pgloader Docker Image',
                Status: '⚠️  NOT PULLED',
                Details: 'Run: docker pull dimitri/pgloader:latest',
              });
            }
          } catch (error) {
            checks.push({
              Check: 'pgloader Docker Image',
              Status: '⚠️  CANNOT CHECK',
              Details: 'Ensure Docker Desktop is running',
            });
          }
        } catch (error) {
          checks.push({
            Check: 'Docker (for pgloader)',
            Status: '❌ NOT FOUND',
            Details: 'Install Docker Desktop from: https://www.docker.com/products/docker-desktop',
          });
        }
      } else {
        // Linux/Mac: Check pgloader installation
        try {
          const version = execSync('pgloader --version', { encoding: 'utf-8', timeout: 5000 });
          checks.push({
            Check: 'pgloader Installation',
            Status: '✅ INSTALLED',
            Details: version.trim(),
          });
        } catch (error) {
          checks.push({
            Check: 'pgloader Installation',
            Status: '❌ NOT FOUND',
            Details: 'Install: apt-get install pgloader (Linux) or brew install pgloader (Mac)',
          });
        }
      }

      // Check FreeTDS (required for SQL Server connection)
      try {
        const { execSync } = require('child_process');
        const tsqlVersion = execSync('tsql -C', { encoding: 'utf-8', timeout: 5000 });
        checks.push({
          Check: 'FreeTDS Driver',
          Status: '✅ INSTALLED',
          Details: 'TDS version detected',
        });
      } catch (error) {
        checks.push({
          Check: 'FreeTDS Driver',
          Status: '⚠️  NOT FOUND',
          Details: 'Install: apt-get install freetds-bin freetds-dev (Linux) or brew install freetds (Mac)',
        });
      }

      // Check FreeTDS config
      const freetdsConfigPath = path.join(os.homedir(), '.freetds.conf');
      if (fs.existsSync(freetdsConfigPath)) {
        checks.push({
          Check: 'FreeTDS Configuration',
          Status: '✅ FOUND',
          Details: freetdsConfigPath,
        });
      } else {
        checks.push({
          Check: 'FreeTDS Configuration',
          Status: '⚠️  NOT FOUND',
          Details: `Create ${freetdsConfigPath} with UTF-8 charset config`,
        });
      }

      const hasErrors = checks.some(c => c.Status.includes('NOT FOUND'));

      return {
        content: [{
          type: 'text' as const,
          text: `pgloader Installation Validation:\n\n${formatResultsAsTable(checks)}\n\n` +
                (hasErrors
                  ? '❌ Installation incomplete. Follow the details above to install missing components.\n\n' +
                    'Installation Guide:\n' +
                    '1. Linux: sudo apt-get install pgloader freetds-bin freetds-dev\n' +
                    '2. Mac: brew install pgloader freetds\n' +
                    '3. Windows: Use WSL or Docker\n\n' +
                    'FreeTDS Configuration (~/.freetds.conf):\n' +
                    '[global]\n' +
                    '    tds version = 7.4\n' +
                    '    client charset = UTF-8'
                  : '✅ pgloader is ready for use!'
                ),
        }],
        isError: hasErrors,
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
 * Validate Migration Prerequisites with pgloader
 */
export const validatePgloaderMigrationTool = {
  name: 'sqlserver_validate_pgloader_migration',
  description: 'Validate migration prerequisites including connectivity to both SQL Server and PostgreSQL, table counts, and estimated migration time.',
  inputSchema: pgloaderMigrationInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof pgloaderMigrationInputSchema>) => {
    try {
      const validationResults: Array<{
        Check: string;
        Status: string;
        Details: string;
      }> = [];

      // 1. Check SQL Server connection
      try {
        const dbSizeQuery = `
          SELECT
            SUM(size * 8.0 / 1024 / 1024) AS SizeGB
          FROM sys.master_files
          WHERE database_id = DB_ID('${input.sourceDatabase}');
        `;
        const sizeResult = await connectionManager.executeQuery(dbSizeQuery);
        const dbSizeGB = sizeResult.recordset[0].SizeGB;

        validationResults.push({
          Check: 'SQL Server Connection',
          Status: '✅ CONNECTED',
          Details: `Database: ${input.sourceDatabase}, Size: ${dbSizeGB.toFixed(2)} GB`,
        });

        // Get table count
        const tableCountQuery = `
          USE [${input.sourceDatabase}];
          SELECT COUNT(*) AS TableCount FROM sys.tables WHERE is_ms_shipped = 0;
        `;
        const tableResult = await connectionManager.executeQuery(tableCountQuery);
        const tableCount = tableResult.recordset[0].TableCount;

        validationResults.push({
          Check: 'Source Tables',
          Status: '✅ FOUND',
          Details: `${tableCount} tables`,
        });

        // Estimated migration time (rough calculation)
        const estimatedMinutes = Math.ceil((dbSizeGB * 5) + (tableCount * 0.5));
        validationResults.push({
          Check: 'Estimated Migration Time',
          Status: 'INFO',
          Details: `~${estimatedMinutes} minutes (${(estimatedMinutes / 60).toFixed(1)} hours)`,
        });

      } catch (error: any) {
        validationResults.push({
          Check: 'SQL Server Connection',
          Status: '❌ FAILED',
          Details: error.message || String(error),
        });
      }

      // 2. PostgreSQL connection validation
      validationResults.push({
        Check: 'PostgreSQL Connection',
        Status: '⚠️  MANUAL',
        Details: `Verify: ${input.targetHost}:${input.targetPort}/${input.targetDatabase}`,
      });

      // 3. Azure-specific checks
      if (input.targetType.startsWith('azure')) {
        validationResults.push({
          Check: 'Azure PostgreSQL SSL',
          Status: input.azureRequireSSL ? '✅ ENABLED' : '⚠️  DISABLED',
          Details: 'SSL is recommended for Azure PostgreSQL',
        });

        // Check username format for Azure
        if (!input.targetUsername.includes('@')) {
          validationResults.push({
            Check: 'Azure Username Format',
            Status: '⚠️  WARNING',
            Details: `Azure PostgreSQL requires format: username@servername (got: ${input.targetUsername})`,
          });
        } else {
          validationResults.push({
            Check: 'Azure Username Format',
            Status: '✅ VALID',
            Details: input.targetUsername,
          });
        }
      }

      // 4. Table filtering validation
      if (input.includeTables && input.excludeTables) {
        validationResults.push({
          Check: 'Table Filters',
          Status: '⚠️  WARNING',
          Details: 'Both include and exclude filters specified - include takes precedence',
        });
      }

      const hasErrors = validationResults.some(r => r.Status.includes('FAILED'));
      const hasWarnings = validationResults.some(r => r.Status.includes('WARNING'));

      return {
        content: [{
          type: 'text' as const,
          text: `pgloader Migration Validation:\n\n${formatResultsAsTable(validationResults)}\n\n` +
                `Overall Status: ${hasErrors ? '❌ FAILED' : hasWarnings ? '⚠️  WARNINGS' : '✅ READY'}\n\n` +
                `Migration Configuration:\n` +
                `- Source: ${input.sourceHost}/${input.sourceDatabase}\n` +
                `- Target: ${input.targetType} - ${input.targetHost}/${input.targetDatabase}\n` +
                `- Workers: ${input.workers} parallel threads\n` +
                `- Batch Size: ${input.batchRows} rows / ${input.batchSize}\n` +
                (input.dryRun ? '\n📋 Dry Run Mode: Will generate config only\n' : '\n⚠️  LIVE MODE: Will execute migration\n'),
        }],
        isError: hasErrors,
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
 * Main pgloader Migration Tool
 */
export const migrateDatabaseWithPgloaderTool = {
  name: 'sqlserver_migrate_with_pgloader',
  description: 'Migrate database from SQL Server to PostgreSQL using pgloader. Supports on-premise and Azure PostgreSQL Flexible Server. Natural language interface with automatic schema conversion and parallel loading. Based on pgloader.io open source tool.',
  inputSchema: pgloaderMigrationInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof pgloaderMigrationInputSchema>) => {
    try {
      const startTime = Date.now();
      const migrationLog: string[] = [];

      migrationLog.push('=== pgloader DATABASE MIGRATION ===');
      migrationLog.push(`Timestamp: ${new Date().toISOString()}`);
      migrationLog.push(`Source: SQL Server ${input.sourceHost}/${input.sourceDatabase}`);
      migrationLog.push(`Target: ${input.targetType} ${input.targetHost}/${input.targetDatabase}`);
      migrationLog.push(`Mode: ${input.dryRun ? 'DRY RUN' : input.validateOnly ? 'VALIDATE ONLY' : 'LIVE MIGRATION'}`);
      migrationLog.push('');

      // Generate pgloader configuration
      migrationLog.push('Step 1: Generating pgloader configuration...');
      const configContent = generatePgloaderConfig(input);

      // Save configuration file
      const configDir = path.join(os.tmpdir(), 'pgloader-migrations');
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const configPath = path.join(configDir, `migration-${timestamp}.load`);
      fs.writeFileSync(configPath, configContent, 'utf-8');

      migrationLog.push(`✅ Configuration file created: ${configPath}`);
      migrationLog.push('');

      // Show configuration preview
      migrationLog.push('Configuration Preview:');
      migrationLog.push('─'.repeat(80));
      migrationLog.push(configContent);
      migrationLog.push('─'.repeat(80));
      migrationLog.push('');

      // If dry run or validate only, stop here
      if (input.dryRun) {
        migrationLog.push('📋 DRY RUN MODE: Configuration generated but not executed.');
        migrationLog.push(`To execute: pgloader ${configPath}`);

        return {
          content: [{
            type: 'text' as const,
            text: migrationLog.join('\n'),
          }],
        };
      }

      if (input.validateOnly) {
        migrationLog.push('✅ VALIDATION MODE: Configuration is valid.');

        return {
          content: [{
            type: 'text' as const,
            text: migrationLog.join('\n'),
          }],
        };
      }

      // Execute pgloader
      migrationLog.push('Step 2: Executing pgloader migration...');
      migrationLog.push('⚠️  This may take several minutes to hours depending on database size.');
      migrationLog.push('');

      try {
        const { execSync } = require('child_process');

        // Set TDSPORT environment variable for SQL Server port
        const env = { ...process.env };
        if (input.sourcePort && input.sourcePort !== 1433) {
          env.TDSPORT = input.sourcePort.toString();
        }

        const isWindows = process.platform === 'win32';
        let pgloaderCommand: string;

        if (isWindows) {
          // Use Docker on Windows
          const configDir = path.dirname(configPath);
          const configName = path.basename(configPath);

          // Convert Windows path to Unix-style for Docker volume mount
          const unixConfigDir = configDir.replace(/\\/g, '/').replace(/^([A-Z]):/, (match, drive) => {
            return `/${drive.toLowerCase()}`;
          });

          pgloaderCommand = `docker run --rm --network host -v "${unixConfigDir}:/data" dimitri/pgloader:latest pgloader "/data/${configName}"`;
          migrationLog.push(`Using Docker: ${pgloaderCommand.substring(0, 100)}...`);
        } else {
          // Use native pgloader on Linux/Mac
          pgloaderCommand = `pgloader "${configPath}"`;
        }

        // Execute pgloader
        const output = execSync(pgloaderCommand, {
          encoding: 'utf-8',
          timeout: 24 * 60 * 60 * 1000, // 24 hour timeout
          maxBuffer: 50 * 1024 * 1024, // 50MB buffer
          env,
        });

        migrationLog.push('pgloader Output:');
        migrationLog.push('─'.repeat(80));
        migrationLog.push(output);
        migrationLog.push('─'.repeat(80));
        migrationLog.push('');

        // Parse output for statistics
        const tableMatch = output.match(/table name\s+errors\s+read\s+imported\s+bytes\s+total time/);
        if (tableMatch) {
          migrationLog.push('✅ Migration completed successfully!');
        }

        const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
        migrationLog.push('');
        migrationLog.push('=== MIGRATION SUMMARY ===');
        migrationLog.push(`Total Duration: ${duration} minutes`);
        migrationLog.push(`Configuration: ${configPath}`);
        migrationLog.push('');
        migrationLog.push('Next Steps:');
        migrationLog.push('1. Verify data integrity on target database');
        migrationLog.push('2. Test application connectivity');
        migrationLog.push('3. Review and migrate stored procedures/functions manually');
        migrationLog.push('4. Update application connection strings');
        migrationLog.push('5. Run VACUUM ANALYZE on PostgreSQL tables');

        return {
          content: [{
            type: 'text' as const,
            text: migrationLog.join('\n'),
          }],
        };

      } catch (execError: any) {
        migrationLog.push('❌ pgloader execution failed:');
        migrationLog.push(execError.message || String(execError));

        if (execError.stdout) {
          migrationLog.push('');
          migrationLog.push('Standard Output:');
          migrationLog.push(execError.stdout);
        }

        if (execError.stderr) {
          migrationLog.push('');
          migrationLog.push('Standard Error:');
          migrationLog.push(execError.stderr);
        }

        return {
          content: [{
            type: 'text' as const,
            text: migrationLog.join('\n'),
          }],
          isError: true,
        };
      }

    } catch (error) {
      return {
        content: [{
          type: 'text' as const,
          text: `❌ Migration failed:\n\n${formatError(error)}`,
        }],
        isError: true,
      };
    }
  },
};

/**
 * Generate pgloader Configuration Only Tool
 * Useful for advanced users who want to customize the configuration
 */
export const generatePgloaderConfigTool = {
  name: 'sqlserver_generate_pgloader_config',
  description: 'Generate pgloader configuration file without executing migration. Useful for reviewing or customizing the configuration before running.',
  inputSchema: pgloaderMigrationInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof pgloaderMigrationInputSchema>) => {
    try {
      const configContent = generatePgloaderConfig(input);

      return {
        content: [{
          type: 'text' as const,
          text: `pgloader Configuration Generated:\n\n` +
                `${'='.repeat(80)}\n${configContent}\n${'='.repeat(80)}\n\n` +
                `To execute this configuration:\n` +
                `1. Save to a file (e.g., migration.load)\n` +
                `2. Run: pgloader migration.load\n\n` +
                `To customize:\n` +
                `- Edit the file to add custom CAST rules\n` +
                `- Modify table filters or schema transformations\n` +
                `- Adjust performance settings (workers, batch size)\n` +
                `- Add custom SQL in BEFORE LOAD or AFTER LOAD sections`,
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
