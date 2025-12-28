import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';
import { formatResultsAsTable, formatColumnsInfo } from '../utils/formatters.js';

// Input schemas
const listDatabasesInputSchema = z.object({});
const listTablesInputSchema = z.object({
  schema: z.string().optional().describe('Schema name to filter tables (e.g., dbo). If not specified, shows all schemas.'),
});
const listColumnsInputSchema = z.object({
  tableName: z.string().min(1).describe('Table name (can include schema, e.g., dbo.TableName)'),
});
const listStoredProceduresInputSchema = z.object({
  schema: z.string().optional().describe('Schema name to filter procedures (e.g., dbo)'),
});
const getTableInfoInputSchema = z.object({
  tableName: z.string().min(1).describe('Table name (can include schema, e.g., dbo.TableName)'),
});

/**
 * List all databases
 */
export const listDatabasesTool = {
  name: 'sqlserver_list_databases',
  description: 'List all databases on the SQL Server instance',
  inputSchema: listDatabasesInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager) => {
    try {
      const query = `
        SELECT
          name AS database_name,
          database_id,
          create_date,
          state_desc AS state,
          recovery_model_desc AS recovery_model,
          compatibility_level
        FROM sys.databases
        ORDER BY name
      `;

      const result = await connectionManager.executeQuery(query);
      const databases = result.recordset;

      return {
        content: [
          {
            type: 'text' as const,
            text: `Databases (${databases.length}):\n\n` + formatResultsAsTable(databases),
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
 * List tables in a database
 */
export const listTablesTool = {
  name: 'sqlserver_list_tables',
  description: 'List all tables in the current database or specified schema',
  inputSchema: listTablesInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof listTablesInputSchema>) => {
    try {
      let query = `
        SELECT
          SCHEMA_NAME(t.schema_id) AS schema_name,
          t.name AS table_name,
          t.create_date,
          t.modify_date,
          p.rows AS row_count
        FROM sys.tables t
        INNER JOIN sys.partitions p ON t.object_id = p.object_id
        WHERE p.index_id IN (0, 1)
      `;

      if (input.schema) {
        query += ` AND SCHEMA_NAME(t.schema_id) = @schema`;
      }

      query += ` ORDER BY schema_name, table_name`;

      const result = await connectionManager.executeQuery(query, input.schema ? { schema: input.schema } : undefined);
      const tables = result.recordset;

      return {
        content: [
          {
            type: 'text' as const,
            text: `Tables (${tables.length}):\n\n` + formatResultsAsTable(tables),
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
 * List columns in a table
 */
export const listColumnsTool = {
  name: 'sqlserver_list_columns',
  description: 'Get detailed information about columns in a table including data types, nullability, and defaults',
  inputSchema: listColumnsInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof listColumnsInputSchema>) => {
    try {
      const query = `
        SELECT
          c.name AS column_name,
          t.name AS data_type,
          c.max_length,
          c.precision,
          c.scale,
          c.is_nullable,
          c.is_identity,
          dc.definition AS column_default,
          ic.is_primary_key,
          c.column_id AS ordinal_position
        FROM sys.columns c
        INNER JOIN sys.types t ON c.user_type_id = t.user_type_id
        LEFT JOIN sys.default_constraints dc ON c.default_object_id = dc.object_id
        LEFT JOIN (
          SELECT ic.object_id, ic.column_id, 1 AS is_primary_key
          FROM sys.index_columns ic
          INNER JOIN sys.indexes i ON ic.object_id = i.object_id AND ic.index_id = i.index_id
          WHERE i.is_primary_key = 1
        ) ic ON c.object_id = ic.object_id AND c.column_id = ic.column_id
        WHERE c.object_id = OBJECT_ID(@tableName)
        ORDER BY c.column_id
      `;

      const result = await connectionManager.executeQuery(query, { tableName: input.tableName });
      const columns = result.recordset;

      if (columns.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Table '${input.tableName}' not found or has no columns.`,
            },
          ],
          isError: true,
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Columns for ${input.tableName} (${columns.length}):\n\n` + formatResultsAsTable(columns),
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
 * List stored procedures
 */
export const listStoredProceduresTool = {
  name: 'sqlserver_list_stored_procedures',
  description: 'List all stored procedures in the current database',
  inputSchema: listStoredProceduresInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof listStoredProceduresInputSchema>) => {
    try {
      let query = `
        SELECT
          SCHEMA_NAME(p.schema_id) AS schema_name,
          p.name AS procedure_name,
          p.create_date,
          p.modify_date
        FROM sys.procedures p
        WHERE 1=1
      `;

      if (input.schema) {
        query += ` AND SCHEMA_NAME(p.schema_id) = @schema`;
      }

      query += ` ORDER BY schema_name, procedure_name`;

      const result = await connectionManager.executeQuery(query, input.schema ? { schema: input.schema } : undefined);
      const procedures = result.recordset;

      return {
        content: [
          {
            type: 'text' as const,
            text: `Stored Procedures (${procedures.length}):\n\n` + formatResultsAsTable(procedures),
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
 * Get detailed table information
 */
export const getTableInfoTool = {
  name: 'sqlserver_get_table_info',
  description: 'Get comprehensive information about a table including indexes, foreign keys, and constraints',
  inputSchema: getTableInfoInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getTableInfoInputSchema>) => {
    try {
      // Get table basic info
      const tableInfoQuery = `
        SELECT
          SCHEMA_NAME(t.schema_id) AS schema_name,
          t.name AS table_name,
          t.create_date,
          t.modify_date,
          p.rows AS row_count
        FROM sys.tables t
        INNER JOIN sys.partitions p ON t.object_id = p.object_id
        WHERE t.object_id = OBJECT_ID(@tableName)
          AND p.index_id IN (0, 1)
      `;

      // Get indexes
      const indexesQuery = `
        SELECT
          i.name AS index_name,
          i.type_desc AS index_type,
          i.is_unique,
          i.is_primary_key,
          STRING_AGG(c.name, ', ') AS columns
        FROM sys.indexes i
        INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        INNER JOIN sys.columns c ON ic.object_id = c.object_id AND ic.column_id = c.column_id
        WHERE i.object_id = OBJECT_ID(@tableName)
        GROUP BY i.name, i.type_desc, i.is_unique, i.is_primary_key
        ORDER BY i.is_primary_key DESC, i.name
      `;

      // Get foreign keys
      const foreignKeysQuery = `
        SELECT
          fk.name AS foreign_key_name,
          OBJECT_NAME(fk.parent_object_id) AS table_name,
          COL_NAME(fkc.parent_object_id, fkc.parent_column_id) AS column_name,
          OBJECT_NAME(fk.referenced_object_id) AS referenced_table,
          COL_NAME(fkc.referenced_object_id, fkc.referenced_column_id) AS referenced_column
        FROM sys.foreign_keys fk
        INNER JOIN sys.foreign_key_columns fkc ON fk.object_id = fkc.constraint_object_id
        WHERE fk.parent_object_id = OBJECT_ID(@tableName)
        ORDER BY fk.name
      `;

      const [tableInfo, indexes, foreignKeys] = await Promise.all([
        connectionManager.executeQuery(tableInfoQuery, { tableName: input.tableName }),
        connectionManager.executeQuery(indexesQuery, { tableName: input.tableName }),
        connectionManager.executeQuery(foreignKeysQuery, { tableName: input.tableName }),
      ]);

      if (tableInfo.recordset.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: `Table '${input.tableName}' not found.`,
            },
          ],
          isError: true,
        };
      }

      let response = `Table Information:\n\n`;
      response += formatResultsAsTable(tableInfo.recordset);
      response += `\n\n`;

      if (indexes.recordset.length > 0) {
        response += `Indexes (${indexes.recordset.length}):\n\n`;
        response += formatResultsAsTable(indexes.recordset);
        response += `\n\n`;
      }

      if (foreignKeys.recordset.length > 0) {
        response += `Foreign Keys (${foreignKeys.recordset.length}):\n\n`;
        response += formatResultsAsTable(foreignKeys.recordset);
      } else {
        response += `No foreign keys defined.`;
      }

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
