import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';

// Input schemas
const beginTransactionInputSchema = z.object({
  isolationLevel: z.enum([
    'READ_UNCOMMITTED',
    'READ_COMMITTED',
    'REPEATABLE_READ',
    'SERIALIZABLE',
    'SNAPSHOT'
  ]).optional().describe('Transaction isolation level (default: READ_COMMITTED)'),
  transactionName: z.string().optional().describe('Optional transaction name for identification'),
});

const commitTransactionInputSchema = z.object({});

const rollbackTransactionInputSchema = z.object({
  transactionName: z.string().optional().describe('Optional transaction name to rollback'),
});

const executeInTransactionInputSchema = z.object({
  statements: z.array(z.object({
    statement: z.string().min(1).describe('SQL statement to execute'),
    parameters: z.record(z.any()).optional().describe('Statement parameters'),
  })).min(1).describe('Array of SQL statements to execute within a transaction'),
  isolationLevel: z.enum([
    'READ_UNCOMMITTED',
    'READ_COMMITTED',
    'REPEATABLE_READ',
    'SERIALIZABLE',
    'SNAPSHOT'
  ]).optional().describe('Transaction isolation level (default: READ_COMMITTED)'),
});

/**
 * Begin a new transaction
 */
export const beginTransactionTool = {
  name: 'sqlserver_begin_transaction',
  description: 'Begin a new database transaction with optional isolation level. Must be followed by COMMIT or ROLLBACK.',
  inputSchema: beginTransactionInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof beginTransactionInputSchema>) => {
    try {
      const pool = await connectionManager.getPool();
      const transaction = pool.transaction();

      // Set isolation level if specified
      if (input.isolationLevel) {
        const isolationLevelMap: Record<string, number> = {
          'READ_UNCOMMITTED': 1,
          'READ_COMMITTED': 2,
          'REPEATABLE_READ': 3,
          'SERIALIZABLE': 4,
          'SNAPSHOT': 5,
        };
        (transaction as any).isolationLevel = isolationLevelMap[input.isolationLevel];
      }

      await transaction.begin();

      let response = '✓ Transaction started successfully\n\n';
      if (input.isolationLevel) {
        response += `Isolation Level: ${input.isolationLevel}\n`;
      }
      if (input.transactionName) {
        response += `Transaction Name: ${input.transactionName}\n`;
      }
      response += '\nIMPORTANT: Remember to either COMMIT or ROLLBACK this transaction.';

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
 * Commit the current transaction
 */
export const commitTransactionTool = {
  name: 'sqlserver_commit_transaction',
  description: 'Commit the current transaction, making all changes permanent.',
  inputSchema: commitTransactionInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager) => {
    try {
      const pool = await connectionManager.getPool();

      // Execute commit
      await pool.request().query('COMMIT TRANSACTION');

      return {
        content: [
          {
            type: 'text' as const,
            text: '✓ Transaction committed successfully\n\nAll changes have been permanently saved to the database.',
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
 * Rollback the current transaction
 */
export const rollbackTransactionTool = {
  name: 'sqlserver_rollback_transaction',
  description: 'Rollback the current transaction, discarding all changes since BEGIN TRANSACTION.',
  inputSchema: rollbackTransactionInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof rollbackTransactionInputSchema>) => {
    try {
      const pool = await connectionManager.getPool();

      // Execute rollback
      let query = 'ROLLBACK TRANSACTION';
      if (input.transactionName) {
        query += ` ${input.transactionName}`;
      }

      await pool.request().query(query);

      return {
        content: [
          {
            type: 'text' as const,
            text: '✓ Transaction rolled back successfully\n\nAll changes have been discarded.',
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
 * Execute multiple statements within a transaction
 */
export const executeInTransactionTool = {
  name: 'sqlserver_execute_in_transaction',
  description: 'Execute multiple SQL statements within a single transaction. Automatically commits on success or rolls back on error.',
  inputSchema: executeInTransactionInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof executeInTransactionInputSchema>) => {
    try {
      const pool = await connectionManager.getPool();
      const transaction = pool.transaction();

      // Set isolation level if specified
      if (input.isolationLevel) {
        const isolationLevelMap: Record<string, number> = {
          'READ_UNCOMMITTED': 1,
          'READ_COMMITTED': 2,
          'REPEATABLE_READ': 3,
          'SERIALIZABLE': 4,
          'SNAPSHOT': 5,
        };
        (transaction as any).isolationLevel = isolationLevelMap[input.isolationLevel];
      }

      const startTime = Date.now();

      // Begin transaction
      await transaction.begin();

      const results: Array<{ rowsAffected: number; statement: string }> = [];

      try {
        // Execute each statement
        for (const stmt of input.statements) {
          const request = transaction.request();

          // Add parameters if provided
          if (stmt.parameters) {
            for (const [key, value] of Object.entries(stmt.parameters)) {
              request.input(key, value);
            }
          }

          const result = await request.query(stmt.statement);
          results.push({
            rowsAffected: result.rowsAffected[0] || 0,
            statement: stmt.statement.substring(0, 50) + (stmt.statement.length > 50 ? '...' : ''),
          });
        }

        // Commit transaction
        await transaction.commit();

        const executionTime = Date.now() - startTime;

        let response = `✓ Transaction completed successfully\n\n`;
        response += `Statements executed: ${results.length}\n`;
        response += `Total execution time: ${executionTime}ms\n\n`;
        response += `Results:\n`;
        results.forEach((result, index) => {
          response += `${index + 1}. ${result.statement}\n`;
          response += `   Rows affected: ${result.rowsAffected}\n`;
        });

        return {
          content: [
            {
              type: 'text' as const,
              text: response,
            },
          ],
        };
      } catch (error) {
        // Rollback on error
        await transaction.rollback();
        throw error;
      }
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `Transaction rolled back due to error:\n\n${formatError(error)}`,
          },
        ],
        isError: true,
      };
    }
  },
};
