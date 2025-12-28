import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';

// Input schemas
const createTableInputSchema = z.object({
  tableName: z.string().min(1).describe('Table name (can include schema, e.g., dbo.TableName)'),
  columns: z.array(z.object({
    name: z.string().min(1).describe('Column name'),
    dataType: z.string().min(1).describe('SQL Server data type (e.g., VARCHAR(50), INT, DATETIME, DECIMAL(10,2))'),
    nullable: z.boolean().optional().describe('Whether column allows NULL values (default: true)'),
    primaryKey: z.boolean().optional().describe('Whether column is primary key'),
    identity: z.boolean().optional().describe('Whether column is an identity column (auto-increment)'),
    defaultValue: z.string().optional().describe('Default value for the column'),
  })).min(1).describe('Array of column definitions'),
  constraints: z.array(z.object({
    type: z.enum(['PRIMARY_KEY', 'UNIQUE', 'FOREIGN_KEY', 'CHECK']).describe('Constraint type'),
    name: z.string().optional().describe('Constraint name'),
    columns: z.array(z.string()).optional().describe('Columns involved in constraint'),
    referencedTable: z.string().optional().describe('Referenced table for foreign key'),
    referencedColumns: z.array(z.string()).optional().describe('Referenced columns for foreign key'),
    checkExpression: z.string().optional().describe('Check constraint expression'),
  })).optional().describe('Table constraints'),
});

const dropTableInputSchema = z.object({
  tableName: z.string().min(1).describe('Table name to drop (can include schema, e.g., dbo.TableName)'),
  ifExists: z.boolean().optional().describe('Only drop if table exists (default: false)'),
});

const alterTableInputSchema = z.object({
  tableName: z.string().min(1).describe('Table name to alter (can include schema, e.g., dbo.TableName)'),
  operation: z.enum(['ADD_COLUMN', 'DROP_COLUMN', 'MODIFY_COLUMN', 'ADD_CONSTRAINT', 'DROP_CONSTRAINT']).describe('Alteration operation'),
  columnName: z.string().optional().describe('Column name for column operations'),
  dataType: z.string().optional().describe('Data type for ADD_COLUMN or MODIFY_COLUMN'),
  nullable: z.boolean().optional().describe('Nullable for ADD_COLUMN or MODIFY_COLUMN'),
  defaultValue: z.string().optional().describe('Default value for ADD_COLUMN'),
  constraintName: z.string().optional().describe('Constraint name for constraint operations'),
  constraintDefinition: z.string().optional().describe('Constraint definition for ADD_CONSTRAINT'),
});

const truncateTableInputSchema = z.object({
  tableName: z.string().min(1).describe('Table name to truncate (can include schema, e.g., dbo.TableName)'),
});

const createIndexInputSchema = z.object({
  indexName: z.string().min(1).describe('Index name'),
  tableName: z.string().min(1).describe('Table name (can include schema, e.g., dbo.TableName)'),
  columns: z.array(z.string()).min(1).describe('Columns to include in the index'),
  unique: z.boolean().optional().describe('Create unique index (default: false)'),
  clustered: z.boolean().optional().describe('Create clustered index (default: false)'),
});

const dropIndexInputSchema = z.object({
  indexName: z.string().min(1).describe('Index name to drop'),
  tableName: z.string().min(1).describe('Table name (can include schema, e.g., dbo.TableName)'),
});

/**
 * Create a new table
 */
export const createTableTool = {
  name: 'sqlserver_create_table',
  description: 'Create a new table with specified columns and constraints.',
  inputSchema: createTableInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof createTableInputSchema>) => {
    try {
      let query = `CREATE TABLE ${input.tableName} (\n`;

      // Add columns
      const columnDefs = input.columns.map((col) => {
        let def = `  ${col.name} ${col.dataType}`;

        if (col.identity) {
          def += ' IDENTITY(1,1)';
        }

        if (col.primaryKey) {
          def += ' PRIMARY KEY';
        }

        if (col.nullable === false || col.primaryKey) {
          def += ' NOT NULL';
        }

        if (col.defaultValue) {
          def += ` DEFAULT ${col.defaultValue}`;
        }

        return def;
      });

      query += columnDefs.join(',\n');

      // Add constraints
      if (input.constraints && input.constraints.length > 0) {
        const constraintDefs = input.constraints.map((constraint) => {
          const name = constraint.name || `${input.tableName}_${constraint.type}_${Date.now()}`;

          switch (constraint.type) {
            case 'PRIMARY_KEY':
              return `  CONSTRAINT ${name} PRIMARY KEY (${constraint.columns?.join(', ')})`;
            case 'UNIQUE':
              return `  CONSTRAINT ${name} UNIQUE (${constraint.columns?.join(', ')})`;
            case 'FOREIGN_KEY':
              return `  CONSTRAINT ${name} FOREIGN KEY (${constraint.columns?.join(', ')}) REFERENCES ${constraint.referencedTable} (${constraint.referencedColumns?.join(', ')})`;
            case 'CHECK':
              return `  CONSTRAINT ${name} CHECK (${constraint.checkExpression})`;
            default:
              return '';
          }
        }).filter(def => def !== '');

        if (constraintDefs.length > 0) {
          query += ',\n' + constraintDefs.join(',\n');
        }
      }

      query += '\n)';

      const startTime = Date.now();
      await connectionManager.executeQuery(query);
      const executionTime = Date.now() - startTime;

      return {
        content: [
          {
            type: 'text' as const,
            text: `✓ Table created successfully\n\n` +
              `Table: ${input.tableName}\n` +
              `Columns: ${input.columns.length}\n` +
              `Constraints: ${input.constraints?.length || 0}\n` +
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

/**
 * Drop a table
 */
export const dropTableTool = {
  name: 'sqlserver_drop_table',
  description: 'Drop (delete) an existing table. WARNING: This permanently deletes the table and all its data.',
  inputSchema: dropTableInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof dropTableInputSchema>) => {
    try {
      let query = 'DROP TABLE ';
      if (input.ifExists) {
        query += 'IF EXISTS ';
      }
      query += input.tableName;

      const startTime = Date.now();
      await connectionManager.executeQuery(query);
      const executionTime = Date.now() - startTime;

      return {
        content: [
          {
            type: 'text' as const,
            text: `✓ Table dropped successfully\n\n` +
              `Table: ${input.tableName}\n` +
              `Execution time: ${executionTime}ms\n\n` +
              `WARNING: All data in this table has been permanently deleted.`,
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
 * Alter a table
 */
export const alterTableTool = {
  name: 'sqlserver_alter_table',
  description: 'Modify an existing table structure by adding/dropping columns or constraints.',
  inputSchema: alterTableInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof alterTableInputSchema>) => {
    try {
      let query = `ALTER TABLE ${input.tableName} `;

      switch (input.operation) {
        case 'ADD_COLUMN':
          if (!input.columnName || !input.dataType) {
            throw new Error('columnName and dataType are required for ADD_COLUMN operation');
          }
          query += `ADD ${input.columnName} ${input.dataType}`;
          if (input.nullable === false) {
            query += ' NOT NULL';
          }
          if (input.defaultValue) {
            query += ` DEFAULT ${input.defaultValue}`;
          }
          break;

        case 'DROP_COLUMN':
          if (!input.columnName) {
            throw new Error('columnName is required for DROP_COLUMN operation');
          }
          query += `DROP COLUMN ${input.columnName}`;
          break;

        case 'MODIFY_COLUMN':
          if (!input.columnName || !input.dataType) {
            throw new Error('columnName and dataType are required for MODIFY_COLUMN operation');
          }
          query += `ALTER COLUMN ${input.columnName} ${input.dataType}`;
          if (input.nullable === false) {
            query += ' NOT NULL';
          }
          break;

        case 'ADD_CONSTRAINT':
          if (!input.constraintName || !input.constraintDefinition) {
            throw new Error('constraintName and constraintDefinition are required for ADD_CONSTRAINT operation');
          }
          query += `ADD CONSTRAINT ${input.constraintName} ${input.constraintDefinition}`;
          break;

        case 'DROP_CONSTRAINT':
          if (!input.constraintName) {
            throw new Error('constraintName is required for DROP_CONSTRAINT operation');
          }
          query += `DROP CONSTRAINT ${input.constraintName}`;
          break;

        default:
          throw new Error(`Unknown operation: ${input.operation}`);
      }

      const startTime = Date.now();
      await connectionManager.executeQuery(query);
      const executionTime = Date.now() - startTime;

      return {
        content: [
          {
            type: 'text' as const,
            text: `✓ Table altered successfully\n\n` +
              `Table: ${input.tableName}\n` +
              `Operation: ${input.operation}\n` +
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

/**
 * Truncate a table
 */
export const truncateTableTool = {
  name: 'sqlserver_truncate_table',
  description: 'Remove all rows from a table without logging individual row deletions. Faster than DELETE but cannot be rolled back.',
  inputSchema: truncateTableInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof truncateTableInputSchema>) => {
    try {
      const query = `TRUNCATE TABLE ${input.tableName}`;

      const startTime = Date.now();
      await connectionManager.executeQuery(query);
      const executionTime = Date.now() - startTime;

      return {
        content: [
          {
            type: 'text' as const,
            text: `✓ Table truncated successfully\n\n` +
              `Table: ${input.tableName}\n` +
              `Execution time: ${executionTime}ms\n\n` +
              `All rows have been removed from the table. The table structure remains intact.`,
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
 * Create an index
 */
export const createIndexTool = {
  name: 'sqlserver_create_index',
  description: 'Create an index on a table to improve query performance.',
  inputSchema: createIndexInputSchema,
  annotations: {
    destructiveHint: false,
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof createIndexInputSchema>) => {
    try {
      let query = 'CREATE ';

      if (input.unique) {
        query += 'UNIQUE ';
      }

      if (input.clustered) {
        query += 'CLUSTERED ';
      } else {
        query += 'NONCLUSTERED ';
      }

      query += `INDEX ${input.indexName} ON ${input.tableName} (${input.columns.join(', ')})`;

      const startTime = Date.now();
      await connectionManager.executeQuery(query);
      const executionTime = Date.now() - startTime;

      return {
        content: [
          {
            type: 'text' as const,
            text: `✓ Index created successfully\n\n` +
              `Index: ${input.indexName}\n` +
              `Table: ${input.tableName}\n` +
              `Columns: ${input.columns.join(', ')}\n` +
              `Type: ${input.clustered ? 'Clustered' : 'Nonclustered'}\n` +
              `Unique: ${input.unique ? 'Yes' : 'No'}\n` +
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

/**
 * Drop an index
 */
export const dropIndexTool = {
  name: 'sqlserver_drop_index',
  description: 'Drop (delete) an existing index from a table.',
  inputSchema: dropIndexInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof dropIndexInputSchema>) => {
    try {
      const query = `DROP INDEX ${input.indexName} ON ${input.tableName}`;

      const startTime = Date.now();
      await connectionManager.executeQuery(query);
      const executionTime = Date.now() - startTime;

      return {
        content: [
          {
            type: 'text' as const,
            text: `✓ Index dropped successfully\n\n` +
              `Index: ${input.indexName}\n` +
              `Table: ${input.tableName}\n` +
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
