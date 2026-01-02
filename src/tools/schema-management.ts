import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';
import { formatResultsAsTable } from '../utils/formatters.js';

/**
 * Get Database Schemas Tool
 * Based on dbatools Get-DbaDbSchema functionality
 * Lists all schemas in a database with their owners and object counts
 */
const getDatabaseSchemasInputSchema = z.object({
  database: z.string().describe('Database name to get schemas from'),
  schemaName: z.string().optional().describe('Filter by specific schema name'),
  excludeSystemSchemas: z.boolean().default(false).optional().describe('Exclude system schemas (sys, INFORMATION_SCHEMA, etc.)'),
});

export const getDatabaseSchemasTool = {
  name: 'sqlserver_get_database_schemas',
  description: 'List all schemas in a database with their owners and object counts. Shows both system schemas and user-defined schemas. Based on dbatools Get-DbaDbSchema functionality.',
  inputSchema: getDatabaseSchemasInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getDatabaseSchemasInputSchema>) => {
    try {
      const { database, schemaName, excludeSystemSchemas } = input;

      const query = `
        USE [${database}];

        SELECT
          s.name AS SchemaName,
          USER_NAME(s.principal_id) AS Owner,
          s.schema_id AS SchemaID,
          (SELECT COUNT(*)
           FROM sys.objects o
           WHERE o.schema_id = s.schema_id
           AND o.type IN ('U', 'V', 'P', 'FN', 'IF', 'TF', 'TR')) AS ObjectCount,
          (SELECT COUNT(*)
           FROM sys.objects o
           WHERE o.schema_id = s.schema_id
           AND o.type = 'U') AS TableCount,
          (SELECT COUNT(*)
           FROM sys.objects o
           WHERE o.schema_id = s.schema_id
           AND o.type = 'V') AS ViewCount,
          (SELECT COUNT(*)
           FROM sys.objects o
           WHERE o.schema_id = s.schema_id
           AND o.type = 'P') AS StoredProcCount
        FROM sys.schemas s
        WHERE 1=1
          ${excludeSystemSchemas ? `
          AND s.name NOT IN ('sys', 'INFORMATION_SCHEMA', 'guest', 'db_owner',
                              'db_accessadmin', 'db_securityadmin', 'db_ddladmin',
                              'db_backupoperator', 'db_datareader', 'db_datawriter',
                              'db_denydatareader', 'db_denydatawriter')
          AND s.principal_id > 4
          ` : ''}
          ${schemaName ? `AND s.name = @schemaName` : ''}
        ORDER BY s.name;
      `;

      const result = await connectionManager.executeQuery(query, schemaName ? { schemaName } : undefined);

      if (result.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No schemas found in database '${database}'.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Schemas in database '${database}':\n\n${formatResultsAsTable(result.recordset)}\n\n` +
                `Total schemas: ${result.recordset.length}`,
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
 * Create Database Schema Tool
 * Based on dbatools New-DbaDbSchema functionality
 * Creates a new schema in a database
 */
const createDatabaseSchemaInputSchema = z.object({
  database: z.string().describe('Database name where the schema will be created'),
  schemaName: z.string().describe('Name of the schema to create'),
  owner: z.string().optional().describe('Owner of the schema (default: dbo)'),
});

export const createDatabaseSchemaTool = {
  name: 'sqlserver_create_database_schema',
  description: 'Create a new schema in a database. Schemas are used to organize database objects and manage permissions at a higher level. Based on dbatools New-DbaDbSchema functionality.',
  inputSchema: createDatabaseSchemaInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof createDatabaseSchemaInputSchema>) => {
    try {
      const { database, schemaName, owner } = input;

      // Check if schema already exists
      const schemaCheckQuery = `
        USE [${database}];
        SELECT name FROM sys.schemas WHERE name = @schemaName;
      `;
      const schemaCheck = await connectionManager.executeQuery(schemaCheckQuery, { schemaName });

      if (schemaCheck.recordset.length > 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Error: Schema '${schemaName}' already exists in database '${database}'.`,
          }],
          isError: true,
        };
      }

      // Validate owner exists if specified
      if (owner) {
        const ownerCheckQuery = `
          USE [${database}];
          SELECT name FROM sys.database_principals WHERE name = @owner;
        `;
        const ownerCheck = await connectionManager.executeQuery(ownerCheckQuery, { owner });

        if (ownerCheck.recordset.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: `❌ Error: Owner '${owner}' does not exist in database '${database}'.`,
            }],
            isError: true,
          };
        }
      }

      const createSchemaQuery = owner
        ? `USE [${database}]; CREATE SCHEMA [${schemaName}] AUTHORIZATION [${owner}];`
        : `USE [${database}]; CREATE SCHEMA [${schemaName}];`;

      await connectionManager.executeQuery(createSchemaQuery);

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Successfully created schema '${schemaName}' in database '${database}'.\n\n` +
                `Owner: ${owner || 'dbo'}`,
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
 * Drop Database Schema Tool
 * Based on dbatools Remove-DbaDbSchema functionality
 * Drops a schema from a database (schema must be empty)
 */
const dropDatabaseSchemaInputSchema = z.object({
  database: z.string().describe('Database name containing the schema'),
  schemaName: z.string().describe('Name of the schema to drop'),
});

export const dropDatabaseSchemaTool = {
  name: 'sqlserver_drop_database_schema',
  description: 'Drop (delete) a schema from a database. WARNING: Schema must be empty (no objects). All objects must be dropped or moved before dropping the schema. Based on dbatools Remove-DbaDbSchema functionality.',
  inputSchema: dropDatabaseSchemaInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof dropDatabaseSchemaInputSchema>) => {
    try {
      const { database, schemaName } = input;

      // Check if schema exists
      const schemaCheckQuery = `
        USE [${database}];
        SELECT schema_id, name FROM sys.schemas WHERE name = @schemaName;
      `;
      const schemaCheck = await connectionManager.executeQuery(schemaCheckQuery, { schemaName });

      if (schemaCheck.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Error: Schema '${schemaName}' does not exist in database '${database}'.`,
          }],
          isError: true,
        };
      }

      const schemaId = schemaCheck.recordset[0].schema_id;

      // Check if schema contains any objects
      const objectCheckQuery = `
        USE [${database}];
        SELECT COUNT(*) AS ObjectCount
        FROM sys.objects
        WHERE schema_id = ${schemaId};
      `;
      const objectCheck = await connectionManager.executeQuery(objectCheckQuery);

      if (objectCheck.recordset[0].ObjectCount > 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Error: Schema '${schemaName}' contains ${objectCheck.recordset[0].ObjectCount} object(s). Drop or move all objects before dropping the schema.`,
          }],
          isError: true,
        };
      }

      const dropSchemaQuery = `USE [${database}]; DROP SCHEMA [${schemaName}];`;
      await connectionManager.executeQuery(dropSchemaQuery);

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Successfully dropped schema '${schemaName}' from database '${database}'.`,
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
 * Set Database Schema Owner Tool
 * Based on dbatools Set-DbaDbSchema functionality
 * Changes the owner of a schema
 */
const setDatabaseSchemaOwnerInputSchema = z.object({
  database: z.string().describe('Database name containing the schema'),
  schemaName: z.string().describe('Name of the schema to modify'),
  newOwner: z.string().describe('New owner for the schema'),
});

export const setDatabaseSchemaOwnerTool = {
  name: 'sqlserver_set_database_schema_owner',
  description: 'Change the owner of a schema. This is useful when transferring schema ownership or after user deletion. Based on dbatools Set-DbaDbSchema functionality.',
  inputSchema: setDatabaseSchemaOwnerInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof setDatabaseSchemaOwnerInputSchema>) => {
    try {
      const { database, schemaName, newOwner } = input;

      // Check if schema exists
      const schemaCheckQuery = `
        USE [${database}];
        SELECT name, USER_NAME(principal_id) AS CurrentOwner
        FROM sys.schemas
        WHERE name = @schemaName;
      `;
      const schemaCheck = await connectionManager.executeQuery(schemaCheckQuery, { schemaName });

      if (schemaCheck.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Error: Schema '${schemaName}' does not exist in database '${database}'.`,
          }],
          isError: true,
        };
      }

      const currentOwner = schemaCheck.recordset[0].CurrentOwner;

      // Check if new owner exists
      const ownerCheckQuery = `
        USE [${database}];
        SELECT name FROM sys.database_principals WHERE name = @newOwner;
      `;
      const ownerCheck = await connectionManager.executeQuery(ownerCheckQuery, { newOwner });

      if (ownerCheck.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Error: New owner '${newOwner}' does not exist in database '${database}'.`,
          }],
          isError: true,
        };
      }

      const alterSchemaQuery = `
        USE [${database}];
        ALTER AUTHORIZATION ON SCHEMA::[${schemaName}] TO [${newOwner}];
      `;
      await connectionManager.executeQuery(alterSchemaQuery);

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Successfully changed owner of schema '${schemaName}' in database '${database}'.\n\n` +
                `Previous owner: ${currentOwner}\n` +
                `New owner: ${newOwner}`,
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
 * Get Schema Objects Tool
 * Lists all objects within a specific schema
 */
const getSchemaObjectsInputSchema = z.object({
  database: z.string().describe('Database name'),
  schemaName: z.string().describe('Schema name to list objects from'),
  objectType: z.enum(['ALL', 'TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION']).default('ALL').optional().describe('Filter by object type'),
});

export const getSchemaObjectsTool = {
  name: 'sqlserver_get_schema_objects',
  description: 'List all objects (tables, views, procedures, functions) within a specific schema. Useful for schema inventory and impact analysis.',
  inputSchema: getSchemaObjectsInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getSchemaObjectsInputSchema>) => {
    try {
      const { database, schemaName, objectType } = input;

      const typeFilter = objectType === 'ALL'
        ? `o.type IN ('U', 'V', 'P', 'FN', 'IF', 'TF', 'TR')`
        : objectType === 'TABLE' ? `o.type = 'U'`
        : objectType === 'VIEW' ? `o.type = 'V'`
        : objectType === 'PROCEDURE' ? `o.type = 'P'`
        : `o.type IN ('FN', 'IF', 'TF')`;

      const query = `
        USE [${database}];

        SELECT
          SCHEMA_NAME(o.schema_id) AS SchemaName,
          o.name AS ObjectName,
          CASE o.type
            WHEN 'U' THEN 'Table'
            WHEN 'V' THEN 'View'
            WHEN 'P' THEN 'Stored Procedure'
            WHEN 'FN' THEN 'Scalar Function'
            WHEN 'IF' THEN 'Inline Table Function'
            WHEN 'TF' THEN 'Table Function'
            WHEN 'TR' THEN 'Trigger'
            ELSE o.type_desc
          END AS ObjectType,
          o.create_date AS CreateDate,
          o.modify_date AS ModifyDate
        FROM sys.objects o
        WHERE SCHEMA_NAME(o.schema_id) = @schemaName
          AND ${typeFilter}
        ORDER BY ObjectType, o.name;
      `;

      const result = await connectionManager.executeQuery(query, { schemaName });

      if (result.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No objects found in schema '${schemaName}' in database '${database}'.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Objects in schema '${schemaName}':\n\n${formatResultsAsTable(result.recordset)}\n\n` +
                `Total objects: ${result.recordset.length}`,
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
