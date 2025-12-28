import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';
import { normalizePagination, addPagination } from '../utils/pagination.js';
import { formatResultsAsTable, formatQuerySummary } from '../utils/formatters.js';

// Input schemas
const executeQueryInputSchema = z.object({
  query: z.string().min(1).describe('SQL SELECT query to execute. Use @paramName for parameters.'),
  parameters: z.record(z.any()).optional().describe('Query parameters as key-value pairs. Keys should match @paramName in query.'),
  limit: z.number().int().positive().max(1000).optional().describe('Maximum number of rows to return (default: 100, max: 1000)'),
  offset: z.number().int().min(0).optional().describe('Number of rows to skip (default: 0)'),
  orderBy: z.string().optional().describe('Column name to order by for pagination (required if using limit/offset)'),
});

/**
 * Execute a SELECT query with pagination support
 */
export const executeQueryTool = {
  name: 'sqlserver_execute_query',
  description: 'Execute a SELECT query and return results with pagination support. Use parameterized queries to prevent SQL injection.',
  inputSchema: executeQueryInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof executeQueryInputSchema>) => {
    try {
      const pagination = normalizePagination({
        limit: input.limit,
        offset: input.offset,
      });

      // Add pagination to query if specified
      let finalQuery = input.query;
      if (input.limit || input.offset) {
        const orderByClause = input.orderBy || '(SELECT NULL)';
        finalQuery = addPagination(input.query, pagination, orderByClause);
      }

      const startTime = Date.now();
      const result = await connectionManager.executeQuery(finalQuery, input.parameters);
      const executionTime = Date.now() - startTime;

      const records = result.recordset;

      if (records.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Query executed successfully but returned no results.\n\n' +
                `Execution time: ${executionTime}ms`,
            },
          ],
        };
      }

      const table = formatResultsAsTable(records);

      return {
        content: [
          {
            type: 'text' as const,
            text: `Query Results (${records.length} rows):\n\n` +
              table +
              `\n\nExecution time: ${executionTime}ms` +
              (input.limit ? `\nShowing ${pagination.offset + 1}-${pagination.offset + records.length} of total results` : ''),
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

const executeNonQueryInputSchema = z.object({
  statement: z.string().min(1).describe('SQL statement to execute (INSERT, UPDATE, DELETE, etc.). Use @paramName for parameters.'),
  parameters: z.record(z.any()).optional().describe('Statement parameters as key-value pairs. Keys should match @paramName in statement.'),
});

/**
 * Execute INSERT, UPDATE, DELETE, or other non-query statements
 */
export const executeNonQueryTool = {
  name: 'sqlserver_execute_non_query',
  description: 'Execute INSERT, UPDATE, DELETE, or other data modification statements. Returns number of rows affected.',
  inputSchema: executeNonQueryInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof executeNonQueryInputSchema>) => {
    try {
      const startTime = Date.now();
      const result = await connectionManager.executeQuery(input.statement, input.parameters);
      const executionTime = Date.now() - startTime;

      const rowsAffected = result.rowsAffected[0] || 0;

      return {
        content: [
          {
            type: 'text' as const,
            text: `✓ Statement executed successfully\n\n` +
              formatQuerySummary(rowsAffected, executionTime),
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

const executeStoredProcedureInputSchema = z.object({
  procedureName: z.string().min(1).describe('Name of the stored procedure to execute (e.g., dbo.GetCustomers)'),
  parameters: z.record(z.object({
    value: z.any().describe('Parameter value'),
    output: z.boolean().optional().describe('Whether this is an output parameter'),
  })).optional().describe('Procedure parameters with their values and direction'),
});

/**
 * Execute a stored procedure
 */
export const executeStoredProcedureTool = {
  name: 'sqlserver_execute_stored_procedure',
  description: 'Execute a stored procedure with input and output parameters. Returns result sets and output parameter values.',
  inputSchema: executeStoredProcedureInputSchema,
  annotations: {
    destructiveHint: false,
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof executeStoredProcedureInputSchema>) => {
    try {
      const startTime = Date.now();
      const result = await connectionManager.executeStoredProcedure(
        input.procedureName,
        input.parameters
      );
      const executionTime = Date.now() - startTime;

      let response = `✓ Stored procedure executed successfully\n\n`;

      // Show result sets
      if (result.recordsets && Array.isArray(result.recordsets) && result.recordsets.length > 0) {
        result.recordsets.forEach((recordset: any, index: number) => {
          if (Array.isArray(recordset) && recordset.length > 0) {
            response += `Result Set ${index + 1} (${recordset.length} rows):\n`;
            response += formatResultsAsTable(recordset);
            response += '\n\n';
          }
        });
      }

      // Show output parameters
      if (result.output && Object.keys(result.output).length > 0) {
        response += 'Output Parameters:\n';
        for (const [key, value] of Object.entries(result.output)) {
          response += `- ${key}: ${value}\n`;
        }
        response += '\n';
      }

      response += `Execution time: ${executionTime}ms`;

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

const executeBatchInputSchema = z.object({
  batch: z.string().min(1).describe('Batch of SQL statements to execute'),
});

/**
 * Execute a batch of statements
 */
export const executeBatchTool = {
  name: 'sqlserver_execute_batch',
  description: 'Execute multiple SQL statements as a batch. Statements are separated by semicolons or GO statements.',
  inputSchema: executeBatchInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof executeBatchInputSchema>) => {
    try {
      const startTime = Date.now();
      const result = await connectionManager.executeQuery(input.batch);
      const executionTime = Date.now() - startTime;

      return {
        content: [
          {
            type: 'text' as const,
            text: `✓ Batch executed successfully\n\n` +
              `Execution time: ${executionTime}ms`,
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
