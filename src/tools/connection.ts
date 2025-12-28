import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';

/**
 * Test SQL Server connection
 */
export const testConnectionTool = {
  name: 'sqlserver_test_connection',
  description: 'Test connectivity to SQL Server and verify authentication',
  inputSchema: z.object({}),
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager) => {
    try {
      const result = await connectionManager.testConnection();

      if (result.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `✓ Connection successful!\n\n` +
                `Server version:\n${result.version}\n\n` +
                `Authentication and database access verified.`,
            },
          ],
        };
      } else {
        return {
          content: [
            {
              type: 'text' as const,
              text: `✗ Connection failed:\n${result.message}`,
            },
          ],
          isError: true,
        };
      }
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
