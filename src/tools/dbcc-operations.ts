import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';
import { formatResultsAsTable } from '../utils/formatters.js';

/**
 * DBCC CHECKDB Tool
 * Based on dbatools Invoke-DbaDbCcCheck functionality
 * Checks the logical and physical integrity of all objects in the specified database
 */
const dbccCheckDbInputSchema = z.object({
  database: z.string().describe('Database name to check for integrity'),
  options: z.enum(['PHYSICAL_ONLY', 'DATA_PURITY', 'EXTENDED_LOGICAL_CHECKS', 'NONE']).default('NONE').optional().describe('DBCC CHECKDB options'),
  noIndex: z.boolean().default(false).optional().describe('Skip nonclustered indexes (faster but less thorough)'),
});

export const dbccCheckDbTool = {
  name: 'sqlserver_dbcc_checkdb',
  description: 'Check database integrity using DBCC CHECKDB. Validates the logical and physical integrity of all objects. WARNING: Resource-intensive operation, best run during maintenance windows. Based on dbatools Invoke-DbaDbCcCheck functionality.',
  inputSchema: dbccCheckDbInputSchema,
  annotations: {
    readOnlyHint: true,  // Though it locks tables temporarily, it doesn't modify data
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof dbccCheckDbInputSchema>) => {
    try {
      const { database, options, noIndex } = input;

      let dbccOptions = '';
      if (options !== 'NONE') {
        dbccOptions = ` WITH ${options}`;
      }
      if (noIndex) {
        dbccOptions += dbccOptions ? ', NOINDEX' : ' WITH NOINDEX';
      }

      const startTime = Date.now();
      const checkQuery = `DBCC CHECKDB('${database}')${dbccOptions};`;

      const result = await connectionManager.executeQuery(checkQuery);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      // Extract summary information from DBCC output
      const messages = result.recordset || [];
      const hasErrors = messages.some((m: any) =>
        m.MessageText?.toLowerCase().includes('error') ||
        m.MessageText?.toLowerCase().includes('corrupt')
      );

      return {
        content: [{
          type: 'text' as const,
          text: `DBCC CHECKDB Results for database '${database}':\n\n` +
                `Execution time: ${duration} seconds\n` +
                `Options: ${options}${noIndex ? ', NOINDEX' : ''}\n\n` +
                `${messages.length > 0 ? formatResultsAsTable(messages) : 'No detailed messages returned.'}\n\n` +
                `${hasErrors
                  ? '❌ ERRORS DETECTED! Database integrity issues found. Review messages above and consider repair options.'
                  : '✅ CHECKDB completed successfully. No errors detected.'
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
 * DBCC CHECKTABLE Tool
 * Checks the integrity of a specific table
 */
const dbccCheckTableInputSchema = z.object({
  database: z.string().describe('Database name containing the table'),
  tableName: z.string().describe('Table name to check (can include schema, e.g., dbo.TableName)'),
  options: z.enum(['PHYSICAL_ONLY', 'DATA_PURITY', 'EXTENDED_LOGICAL_CHECKS', 'NONE']).default('NONE').optional(),
});

export const dbccCheckTableTool = {
  name: 'sqlserver_dbcc_checktable',
  description: 'Check integrity of a specific table using DBCC CHECKTABLE. Faster than CHECKDB when you need to verify only one table.',
  inputSchema: dbccCheckTableInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof dbccCheckTableInputSchema>) => {
    try {
      const { database, tableName, options } = input;

      const dbccOptions = options !== 'NONE' ? ` WITH ${options}` : '';
      const startTime = Date.now();
      const checkQuery = `
        USE [${database}];
        DBCC CHECKTABLE('${tableName}')${dbccOptions};
      `;

      const result = await connectionManager.executeQuery(checkQuery);
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      const messages = result.recordset || [];
      const hasErrors = messages.some((m: any) =>
        m.MessageText?.toLowerCase().includes('error') ||
        m.MessageText?.toLowerCase().includes('corrupt')
      );

      return {
        content: [{
          type: 'text' as const,
          text: `DBCC CHECKTABLE Results for table '${tableName}':\n\n` +
                `Execution time: ${duration} seconds\n` +
                `${messages.length > 0 ? formatResultsAsTable(messages) : 'No detailed messages returned.'}\n\n` +
                `${hasErrors
                  ? '❌ ERRORS DETECTED! Table integrity issues found.'
                  : '✅ CHECKTABLE completed successfully. No errors detected.'
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
 * DBCC CHECKCONSTRAINTS Tool
 * Checks the integrity of constraints on a table or all tables in a database
 */
const dbccCheckConstraintsInputSchema = z.object({
  database: z.string().describe('Database name'),
  tableName: z.string().optional().describe('Specific table name. If not specified, checks all tables in the database.'),
});

export const dbccCheckConstraintsTool = {
  name: 'sqlserver_dbcc_checkconstraints',
  description: 'Check constraint integrity using DBCC CHECKCONSTRAINTS. Validates that all CHECK and FOREIGN KEY constraints are satisfied.',
  inputSchema: dbccCheckConstraintsInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof dbccCheckConstraintsInputSchema>) => {
    try {
      const { database, tableName } = input;

      const checkQuery = tableName
        ? `USE [${database}]; DBCC CHECKCONSTRAINTS('${tableName}') WITH ALL_CONSTRAINTS;`
        : `USE [${database}]; DBCC CHECKCONSTRAINTS WITH ALL_CONSTRAINTS;`;

      const result = await connectionManager.executeQuery(checkQuery);

      if (result.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `✅ All constraints are satisfied for ${tableName || 'all tables'} in database '${database}'.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `❌ Constraint Violations Found:\n\n${formatResultsAsTable(result.recordset)}\n\n` +
                `Total violations: ${result.recordset.length}\n\n` +
                `Action required: Fix the data or drop/recreate constraints.`,
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
 * DBCC SHOW_STATISTICS Tool
 * Shows statistics information for a table
 */
const dbccShowStatisticsInputSchema = z.object({
  database: z.string().describe('Database name'),
  tableName: z.string().describe('Table name'),
  statisticsName: z.string().describe('Statistics or index name'),
});

export const dbccShowStatisticsTool = {
  name: 'sqlserver_dbcc_show_statistics',
  description: 'Display statistics information for a table using DBCC SHOW_STATISTICS. Useful for query optimization and understanding distribution statistics.',
  inputSchema: dbccShowStatisticsInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof dbccShowStatisticsInputSchema>) => {
    try {
      const { database, tableName, statisticsName } = input;

      const query = `
        USE [${database}];
        DBCC SHOW_STATISTICS('${tableName}', '${statisticsName}');
      `;

      const result = await connectionManager.executeQuery(query);

      if (result.recordsets && result.recordsets.length > 0) {
        let output = `Statistics for '${statisticsName}' on table '${tableName}':\n\n`;

        result.recordsets.forEach((recordset: any[], index: number) => {
          const sectionName = index === 0 ? 'Statistics Header' : index === 1 ? 'Density Vector' : `Histogram (Step ${index - 1})`;
          output += `${sectionName}:\n${formatResultsAsTable(recordset)}\n\n`;
        });

        return {
          content: [{
            type: 'text' as const,
            text: output,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `No statistics information found for '${statisticsName}' on table '${tableName}'.`,
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
 * DBCC FREEPROCCACHE Tool (already exists in performance.ts as clear_plan_cache, but adding DBCC variant for completeness)
 */
const dbccFreeSystemCacheInputSchema = z.object({
  cacheType: z.enum(['PLAN_CACHE', 'SYSTEM_CACHE', 'ALL']).default('PLAN_CACHE').describe('Type of cache to clear'),
});

export const dbccFreeSystemCacheTool = {
  name: 'sqlserver_dbcc_free_cache',
  description: 'Clear SQL Server caches using DBCC commands. WARNING: Clearing caches will cause recompilation and cold cache performance. Use in testing or troubleshooting only.',
  inputSchema: dbccFreeSystemCacheInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof dbccFreeSystemCacheInputSchema>) => {
    try {
      const { cacheType } = input;

      let queries: string[] = [];
      let description = '';

      switch (cacheType) {
        case 'PLAN_CACHE':
          queries.push('DBCC FREEPROCCACHE;');
          description = 'Cleared plan cache. All query plans will be recompiled on next execution.';
          break;
        case 'SYSTEM_CACHE':
          queries.push('DBCC FREESYSTEMCACHE(\'ALL\');');
          description = 'Cleared system cache entries (excluding plan cache).';
          break;
        case 'ALL':
          queries.push('DBCC FREEPROCCACHE;');
          queries.push('DBCC FREESYSTEMCACHE(\'ALL\');');
          queries.push('DBCC DROPCLEANBUFFERS;');
          description = 'Cleared all caches including plan cache, system cache, and clean buffers.';
          break;
      }

      for (const query of queries) {
        await connectionManager.executeQuery(query);
      }

      return {
        content: [{
          type: 'text' as const,
          text: `✅ ${description}\n\n` +
                `⚠️  Note: Cache clearing causes:\n` +
                `  - Query plan recompilation (CPU overhead)\n` +
                `  - Cold cache performance (slower queries initially)\n` +
                `  - Memory pressure as caches rebuild`,
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
 * DBCC TRACESTATUS Tool
 * Shows the status of trace flags
 */
const dbccTraceStatusInputSchema = z.object({
  traceFlag: z.number().optional().describe('Specific trace flag number to check. If not specified, shows all active trace flags.'),
});

export const dbccTraceStatusTool = {
  name: 'sqlserver_dbcc_tracestatus',
  description: 'Display status of trace flags using DBCC TRACESTATUS. Shows which trace flags are currently enabled.',
  inputSchema: dbccTraceStatusInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof dbccTraceStatusInputSchema>) => {
    try {
      const { traceFlag } = input;

      const query = traceFlag
        ? `DBCC TRACESTATUS(${traceFlag});`
        : `DBCC TRACESTATUS(-1);`;

      const result = await connectionManager.executeQuery(query);

      if (!result.recordset || result.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: traceFlag
              ? `Trace flag ${traceFlag} is not enabled.`
              : 'No trace flags are currently enabled.',
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Active Trace Flags:\n\n${formatResultsAsTable(result.recordset)}`,
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
 * DBCC TRACEON Tool
 * Enables a trace flag
 */
const dbccTraceOnInputSchema = z.object({
  traceFlag: z.union([z.number(), z.array(z.number())]).describe('Trace flag number(s) to enable'),
  global: z.boolean().default(true).describe('Enable globally for all sessions (default: true)'),
});

export const dbccTraceOnTool = {
  name: 'sqlserver_dbcc_traceon',
  description: 'Enable trace flag(s) using DBCC TRACEON. Trace flags modify SQL Server behavior for diagnostics or optimization. Use with caution and consult documentation.',
  inputSchema: dbccTraceOnInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof dbccTraceOnInputSchema>) => {
    try {
      const { traceFlag, global } = input;
      const traceFlags = Array.isArray(traceFlag) ? traceFlag : [traceFlag];

      const results: string[] = [];

      for (const flag of traceFlags) {
        const query = global
          ? `DBCC TRACEON(${flag}, -1);`
          : `DBCC TRACEON(${flag});`;

        await connectionManager.executeQuery(query);
        results.push(`✅ Trace flag ${flag} enabled ${global ? 'globally' : 'for current session'}`);
      }

      return {
        content: [{
          type: 'text' as const,
          text: results.join('\n') + '\n\n' +
                `⚠️  Note: ${global ? 'Global' : 'Session'} trace flags ${global ? 'persist until server restart' : 'only affect current session'}`,
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
 * DBCC TRACEOFF Tool
 * Disables a trace flag
 */
const dbccTraceOffInputSchema = z.object({
  traceFlag: z.union([z.number(), z.array(z.number())]).describe('Trace flag number(s) to disable'),
  global: z.boolean().default(true).describe('Disable globally for all sessions (default: true)'),
});

export const dbccTraceOffTool = {
  name: 'sqlserver_dbcc_traceoff',
  description: 'Disable trace flag(s) using DBCC TRACEOFF. Removes previously enabled trace flags.',
  inputSchema: dbccTraceOffInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof dbccTraceOffInputSchema>) => {
    try {
      const { traceFlag, global } = input;
      const traceFlags = Array.isArray(traceFlag) ? traceFlag : [traceFlag];

      const results: string[] = [];

      for (const flag of traceFlags) {
        const query = global
          ? `DBCC TRACEOFF(${flag}, -1);`
          : `DBCC TRACEOFF(${flag});`;

        await connectionManager.executeQuery(query);
        results.push(`✅ Trace flag ${flag} disabled ${global ? 'globally' : 'for current session'}`);
      }

      return {
        content: [{
          type: 'text' as const,
          text: results.join('\n'),
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
