import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';

// Input schemas
const bulkInsertInputSchema = z.object({
  tableName: z.string().min(1).describe('Target table name (can include schema, e.g., dbo.TableName)'),
  columns: z.array(z.string()).min(1).describe('Array of column names to insert into'),
  rows: z.array(z.array(z.any())).min(1).describe('Array of rows, where each row is an array of values matching the columns'),
  batchSize: z.number().int().positive().max(1000).optional().describe('Number of rows to insert per batch (default: 100, max: 1000)'),
});

/**
 * Bulk insert multiple rows into a table
 */
export const bulkInsertTool = {
  name: 'sqlserver_bulk_insert',
  description: 'Insert multiple rows into a table efficiently using bulk insert operations. Supports batching for large datasets.',
  inputSchema: bulkInsertInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof bulkInsertInputSchema>) => {
    try {
      const batchSize = input.batchSize || 100;
      const totalRows = input.rows.length;

      if (input.columns.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'Error: At least one column must be specified.',
            },
          ],
          isError: true,
        };
      }

      // Validate that all rows have the same number of values as columns
      for (let i = 0; i < input.rows.length; i++) {
        if (input.rows[i].length !== input.columns.length) {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: Row ${i + 1} has ${input.rows[i].length} values but ${input.columns.length} columns were specified. All rows must have the same number of values as columns.`,
              },
            ],
            isError: true,
          };
        }
      }

      const startTime = Date.now();
      let totalInserted = 0;

      // Process in batches
      for (let i = 0; i < totalRows; i += batchSize) {
        const batch = input.rows.slice(i, Math.min(i + batchSize, totalRows));

        // Build bulk insert query
        const valuePlaceholders = batch.map((_, rowIndex) => {
          const paramPlaceholders = input.columns.map((_, colIndex) => {
            return `@p${i + rowIndex}_${colIndex}`;
          }).join(', ');
          return `(${paramPlaceholders})`;
        }).join(', ');

        const query = `INSERT INTO ${input.tableName} (${input.columns.join(', ')}) VALUES ${valuePlaceholders}`;

        // Build parameters object
        const parameters: Record<string, any> = {};
        batch.forEach((row, rowIndex) => {
          row.forEach((value, colIndex) => {
            parameters[`p${i + rowIndex}_${colIndex}`] = value;
          });
        });

        // Execute batch
        const result = await connectionManager.executeQuery(query, parameters);
        totalInserted += result.rowsAffected[0] || 0;
      }

      const executionTime = Date.now() - startTime;
      const batchCount = Math.ceil(totalRows / batchSize);

      return {
        content: [
          {
            type: 'text' as const,
            text: `✓ Bulk insert completed successfully\n\n` +
              `Table: ${input.tableName}\n` +
              `Rows inserted: ${totalInserted}\n` +
              `Batches processed: ${batchCount}\n` +
              `Batch size: ${batchSize}\n` +
              `Execution time: ${executionTime}ms\n` +
              `Average: ${(executionTime / totalInserted).toFixed(2)}ms per row`,
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
