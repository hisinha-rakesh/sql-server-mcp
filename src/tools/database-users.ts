import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';
import { formatResultsAsTable } from '../utils/formatters.js';

/**
 * Get Database Users Tool
 * Based on dbatools Get-DbaDbUser functionality
 * Lists all database users with their authentication type and role memberships
 */
const getDatabaseUsersInputSchema = z.object({
  database: z.string().describe('Database name to get users from'),
  excludeSystemUsers: z.boolean().default(true).optional().describe('Exclude system users (default: true)'),
  userName: z.string().optional().describe('Filter by specific user name'),
});

export const getDatabaseUsersTool = {
  name: 'sqlserver_get_database_users',
  description: 'Get all database users with their authentication type, default schema, and role memberships. Based on dbatools Get-DbaDbUser functionality.',
  inputSchema: getDatabaseUsersInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getDatabaseUsersInputSchema>) => {
    try {
      const { database, excludeSystemUsers, userName } = input;

      const query = `
        USE [${database}];

        SELECT
          dp.name AS UserName,
          dp.type_desc AS UserType,
          dp.authentication_type_desc AS AuthenticationType,
          dp.default_schema_name AS DefaultSchema,
          dp.create_date AS CreateDate,
          CASE
            WHEN dp.principal_id IN (0, 1, 2, 3, 4) THEN 1
            ELSE 0
          END AS IsSystemUser,
          STUFF((
            SELECT ', ' + r.name
            FROM sys.database_role_members drm
            INNER JOIN sys.database_principals r ON drm.role_principal_id = r.principal_id
            WHERE drm.member_principal_id = dp.principal_id
            FOR XML PATH(''), TYPE
          ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS DatabaseRoles,
          sl.name AS LinkedServerLogin
        FROM sys.database_principals dp
        LEFT JOIN sys.server_principals sl ON dp.sid = sl.sid
        WHERE dp.type IN ('S', 'U', 'G', 'A', 'E', 'X')
          ${excludeSystemUsers ? `AND dp.principal_id > 4` : ''}
          ${userName ? `AND dp.name = @userName` : ''}
        ORDER BY dp.name;
      `;

      const result = await connectionManager.executeQuery(query, userName ? { userName } : undefined);

      if (result.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No users found in database '${database}'.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Database Users in '${database}':\n\n${formatResultsAsTable(result.recordset)}\n\n` +
                `Total users: ${result.recordset.length}`,
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
 * Create Database User Tool
 * Based on dbatools New-DbaDbUser functionality
 * Creates a new database user mapped to a login or without login (contained user)
 */
const createDatabaseUserInputSchema = z.object({
  database: z.string().describe('Database name where the user will be created'),
  userName: z.string().describe('Name of the database user to create'),
  loginName: z.string().optional().describe('SQL Server login to map to the user. If not specified, creates a user without login.'),
  defaultSchema: z.string().default('dbo').optional().describe('Default schema for the user (default: dbo)'),
  password: z.string().optional().describe('Password for contained database user (SQL Server 2012+)'),
});

export const createDatabaseUserTool = {
  name: 'sqlserver_create_database_user',
  description: 'Create a new database user mapped to a login or as a contained user without login. Supports both traditional users and contained database users. Based on dbatools New-DbaDbUser functionality.',
  inputSchema: createDatabaseUserInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof createDatabaseUserInputSchema>) => {
    try {
      const { database, userName, loginName, defaultSchema, password } = input;

      // Check if user already exists
      const userCheckQuery = `
        USE [${database}];
        SELECT name FROM sys.database_principals WHERE name = @userName;
      `;
      const userCheck = await connectionManager.executeQuery(userCheckQuery, { userName });

      if (userCheck.recordset.length > 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Error: User '${userName}' already exists in database '${database}'.`,
          }],
          isError: true,
        };
      }

      let createUserQuery: string;

      if (password) {
        // Contained database user with password
        createUserQuery = `
          USE [${database}];
          CREATE USER [${userName}] WITH PASSWORD = '${password}', DEFAULT_SCHEMA = [${defaultSchema}];
        `;
      } else if (loginName) {
        // User mapped to login
        createUserQuery = `
          USE [${database}];
          CREATE USER [${userName}] FOR LOGIN [${loginName}] WITH DEFAULT_SCHEMA = [${defaultSchema}];
        `;
      } else {
        // User without login
        createUserQuery = `
          USE [${database}];
          CREATE USER [${userName}] WITHOUT LOGIN WITH DEFAULT_SCHEMA = [${defaultSchema}];
        `;
      }

      await connectionManager.executeQuery(createUserQuery);

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Successfully created database user '${userName}' in database '${database}'.\n\n` +
                `Details:\n` +
                `- User Name: ${userName}\n` +
                `- Login Name: ${loginName || 'None (user without login)'}\n` +
                `- Default Schema: ${defaultSchema}\n` +
                `- Type: ${password ? 'Contained User' : loginName ? 'Mapped User' : 'User Without Login'}`,
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
 * Remove Database User Tool
 * Based on dbatools Remove-DbaDbUser functionality
 * Drops a database user from the database
 */
const removeDatabaseUserInputSchema = z.object({
  database: z.string().describe('Database name containing the user'),
  userName: z.union([z.string(), z.array(z.string())]).describe('User name(s) to remove from the database'),
});

export const removeDatabaseUserTool = {
  name: 'sqlserver_remove_database_user',
  description: 'Remove (drop) one or more database users. WARNING: This permanently deletes the user and all associated permissions. Based on dbatools Remove-DbaDbUser functionality.',
  inputSchema: removeDatabaseUserInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof removeDatabaseUserInputSchema>) => {
    try {
      const { database, userName } = input;
      const userNames = Array.isArray(userName) ? userName : [userName];

      const results: Array<{
        Database: string;
        UserName: string;
        Status: string;
        Message: string;
      }> = [];

      for (const user of userNames) {
        try {
          // Check if user exists
          const userCheckQuery = `
            USE [${database}];
            SELECT name, principal_id FROM sys.database_principals WHERE name = @userName;
          `;
          const userCheck = await connectionManager.executeQuery(userCheckQuery, { userName: user });

          if (userCheck.recordset.length === 0) {
            results.push({
              Database: database,
              UserName: user,
              Status: 'SKIPPED',
              Message: `User '${user}' does not exist in database '${database}'`,
            });
            continue;
          }

          // Check if user owns any schemas
          const schemaCheckQuery = `
            USE [${database}];
            SELECT COUNT(*) AS SchemaCount
            FROM sys.schemas
            WHERE principal_id = ${userCheck.recordset[0].principal_id};
          `;
          const schemaCheck = await connectionManager.executeQuery(schemaCheckQuery);

          if (schemaCheck.recordset[0].SchemaCount > 0) {
            results.push({
              Database: database,
              UserName: user,
              Status: 'FAILED',
              Message: `User '${user}' owns schemas. Drop or reassign schemas first.`,
            });
            continue;
          }

          // Drop the user
          const dropUserQuery = `
            USE [${database}];
            DROP USER [${user}];
          `;
          await connectionManager.executeQuery(dropUserQuery);

          results.push({
            Database: database,
            UserName: user,
            Status: 'SUCCESS',
            Message: `User '${user}' successfully removed`,
          });
        } catch (error: any) {
          results.push({
            Database: database,
            UserName: user,
            Status: 'FAILED',
            Message: error.message || String(error),
          });
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Database User Removal Results:\n\n${formatResultsAsTable(results)}\n\n` +
                `Processed: ${results.length} user(s)`,
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
 * Set Database User Tool
 * Based on dbatools Set-DbaDbUser functionality
 * Modifies properties of an existing database user
 */
const setDatabaseUserInputSchema = z.object({
  database: z.string().describe('Database name containing the user'),
  userName: z.string().describe('User name to modify'),
  newName: z.string().optional().describe('Rename the user to this new name'),
  defaultSchema: z.string().optional().describe('Set new default schema'),
  loginName: z.string().optional().describe('Map user to a different login'),
});

export const setDatabaseUserTool = {
  name: 'sqlserver_set_database_user',
  description: 'Modify properties of an existing database user including name, default schema, or login mapping. Based on dbatools Set-DbaDbUser functionality.',
  inputSchema: setDatabaseUserInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof setDatabaseUserInputSchema>) => {
    try {
      const { database, userName, newName, defaultSchema, loginName } = input;

      // Check if user exists
      const userCheckQuery = `
        USE [${database}];
        SELECT name FROM sys.database_principals WHERE name = @userName;
      `;
      const userCheck = await connectionManager.executeQuery(userCheckQuery, { userName });

      if (userCheck.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Error: User '${userName}' does not exist in database '${database}'.`,
          }],
          isError: true,
        };
      }

      const changes: string[] = [];

      // Rename user
      if (newName) {
        const renameQuery = `
          USE [${database}];
          ALTER USER [${userName}] WITH NAME = [${newName}];
        `;
        await connectionManager.executeQuery(renameQuery);
        changes.push(`Renamed to '${newName}'`);
      }

      // Change default schema
      if (defaultSchema) {
        const currentUserName = newName || userName;
        const schemaQuery = `
          USE [${database}];
          ALTER USER [${currentUserName}] WITH DEFAULT_SCHEMA = [${defaultSchema}];
        `;
        await connectionManager.executeQuery(schemaQuery);
        changes.push(`Default schema set to '${defaultSchema}'`);
      }

      // Change login mapping
      if (loginName) {
        const currentUserName = newName || userName;
        const loginQuery = `
          USE [${database}];
          ALTER USER [${currentUserName}] WITH LOGIN = [${loginName}];
        `;
        await connectionManager.executeQuery(loginQuery);
        changes.push(`Mapped to login '${loginName}'`);
      }

      if (changes.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `⚠️  No changes specified for user '${userName}'. Specify newName, defaultSchema, or loginName.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Successfully modified user '${userName}' in database '${database}'.\n\n` +
                `Changes applied:\n${changes.map(c => `- ${c}`).join('\n')}`,
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
 * Get Database Roles Tool
 * Based on dbatools Get-DbaDbRole functionality
 * Lists all database roles with their members
 */
const getDatabaseRolesInputSchema = z.object({
  database: z.string().describe('Database name to get roles from'),
  roleName: z.string().optional().describe('Filter by specific role name'),
  includeMembers: z.boolean().default(true).optional().describe('Include role members in the output'),
  excludeFixedRoles: z.boolean().default(false).optional().describe('Exclude fixed database roles'),
});

export const getDatabaseRolesTool = {
  name: 'sqlserver_get_database_roles',
  description: 'List all database roles with their members and properties. Shows both fixed roles (db_owner, db_datareader, etc.) and custom roles. Based on dbatools Get-DbaDbRole functionality.',
  inputSchema: getDatabaseRolesInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getDatabaseRolesInputSchema>) => {
    try {
      const { database, roleName, includeMembers, excludeFixedRoles } = input;

      const query = `
        USE [${database}];

        SELECT
          r.name AS RoleName,
          r.type_desc AS RoleType,
          r.is_fixed_role AS IsFixedRole,
          r.create_date AS CreateDate,
          USER_NAME(r.owning_principal_id) AS Owner,
          ${includeMembers ? `
          STUFF((
            SELECT ', ' + m.name
            FROM sys.database_role_members rm
            INNER JOIN sys.database_principals m ON rm.member_principal_id = m.principal_id
            WHERE rm.role_principal_id = r.principal_id
            FOR XML PATH(''), TYPE
          ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS Members
          ` : `NULL AS Members`}
        FROM sys.database_principals r
        WHERE r.type = 'R'
          ${excludeFixedRoles ? `AND r.is_fixed_role = 0` : ''}
          ${roleName ? `AND r.name = @roleName` : ''}
        ORDER BY r.is_fixed_role DESC, r.name;
      `;

      const result = await connectionManager.executeQuery(query, roleName ? { roleName } : undefined);

      if (result.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `No roles found in database '${database}'.`,
          }],
        };
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Database Roles in '${database}':\n\n${formatResultsAsTable(result.recordset)}\n\n` +
                `Total roles: ${result.recordset.length}`,
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
 * Create Database Role Tool
 * Based on dbatools New-DbaDbRole functionality
 * Creates a new custom database role
 */
const createDatabaseRoleInputSchema = z.object({
  database: z.string().describe('Database name where the role will be created'),
  roleName: z.string().describe('Name of the database role to create'),
  owner: z.string().optional().describe('Owner of the role (default: dbo)'),
});

export const createDatabaseRoleTool = {
  name: 'sqlserver_create_database_role',
  description: 'Create a new custom database role. Custom roles allow you to group permissions and assign them to multiple users. Based on dbatools New-DbaDbRole functionality.',
  inputSchema: createDatabaseRoleInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof createDatabaseRoleInputSchema>) => {
    try {
      const { database, roleName, owner } = input;

      // Check if role already exists
      const roleCheckQuery = `
        USE [${database}];
        SELECT name FROM sys.database_principals WHERE type = 'R' AND name = @roleName;
      `;
      const roleCheck = await connectionManager.executeQuery(roleCheckQuery, { roleName });

      if (roleCheck.recordset.length > 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Error: Role '${roleName}' already exists in database '${database}'.`,
          }],
          isError: true,
        };
      }

      const createRoleQuery = owner
        ? `USE [${database}]; CREATE ROLE [${roleName}] AUTHORIZATION [${owner}];`
        : `USE [${database}]; CREATE ROLE [${roleName}];`;

      await connectionManager.executeQuery(createRoleQuery);

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Successfully created database role '${roleName}' in database '${database}'.\n\n` +
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
 * Drop Database Role Tool
 * Based on dbatools Remove-DbaDbRole functionality
 * Drops a custom database role
 */
const dropDatabaseRoleInputSchema = z.object({
  database: z.string().describe('Database name containing the role'),
  roleName: z.string().describe('Name of the custom database role to drop'),
});

export const dropDatabaseRoleTool = {
  name: 'sqlserver_drop_database_role',
  description: 'Drop (delete) a custom database role. WARNING: Cannot drop fixed database roles (db_owner, db_datareader, etc.). All members must be removed before dropping the role. Based on dbatools Remove-DbaDbRole functionality.',
  inputSchema: dropDatabaseRoleInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof dropDatabaseRoleInputSchema>) => {
    try {
      const { database, roleName } = input;

      // Check if role exists and is not fixed
      const roleCheckQuery = `
        USE [${database}];
        SELECT name, is_fixed_role
        FROM sys.database_principals
        WHERE type = 'R' AND name = @roleName;
      `;
      const roleCheck = await connectionManager.executeQuery(roleCheckQuery, { roleName });

      if (roleCheck.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Error: Role '${roleName}' does not exist in database '${database}'.`,
          }],
          isError: true,
        };
      }

      if (roleCheck.recordset[0].is_fixed_role) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Error: Cannot drop fixed database role '${roleName}'. Fixed roles cannot be dropped.`,
          }],
          isError: true,
        };
      }

      const dropRoleQuery = `USE [${database}]; DROP ROLE [${roleName}];`;
      await connectionManager.executeQuery(dropRoleQuery);

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Successfully dropped database role '${roleName}' from database '${database}'.`,
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
 * Add Database Role Member Tool
 * Based on dbatools Add-DbaDbRoleMember functionality
 * Adds users or roles to database roles
 */
const addDatabaseRoleMemberInputSchema = z.object({
  database: z.string().describe('Database name containing the role'),
  roleName: z.union([z.string(), z.array(z.string())]).describe('Database role(s) to add members to'),
  memberName: z.union([z.string(), z.array(z.string())]).describe('Database user(s) or role(s) to add to the role'),
});

export const addDatabaseRoleMemberTool = {
  name: 'sqlserver_add_database_role_member',
  description: 'Add database users or roles to database roles. Supports both fixed roles (db_owner, db_datareader, etc.) and custom roles. Based on dbatools Add-DbaDbRoleMember functionality.',
  inputSchema: addDatabaseRoleMemberInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof addDatabaseRoleMemberInputSchema>) => {
    try {
      const { database, roleName, memberName } = input;
      const roleNames = Array.isArray(roleName) ? roleName : [roleName];
      const memberNames = Array.isArray(memberName) ? memberName : [memberName];

      const results: Array<{
        Database: string;
        Role: string;
        Member: string;
        Status: string;
        Message: string;
      }> = [];

      for (const role of roleNames) {
        for (const member of memberNames) {
          try {
            const addMemberQuery = `
              USE [${database}];
              ALTER ROLE [${role}] ADD MEMBER [${member}];
            `;
            await connectionManager.executeQuery(addMemberQuery);

            results.push({
              Database: database,
              Role: role,
              Member: member,
              Status: 'SUCCESS',
              Message: `Member '${member}' added to role '${role}'`,
            });
          } catch (error: any) {
            results.push({
              Database: database,
              Role: role,
              Member: member,
              Status: 'FAILED',
              Message: error.message || String(error),
            });
          }
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Database Role Member Addition Results:\n\n${formatResultsAsTable(results)}\n\n` +
                `Processed: ${results.length} operation(s)`,
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
 * Remove Database Role Member Tool
 * Based on dbatools Remove-DbaDbRoleMember functionality
 * Removes users or roles from database roles
 */
const removeDatabaseRoleMemberInputSchema = z.object({
  database: z.string().describe('Database name containing the role'),
  roleName: z.union([z.string(), z.array(z.string())]).describe('Database role(s) to remove members from'),
  memberName: z.union([z.string(), z.array(z.string())]).describe('Database user(s) or role(s) to remove from the role'),
});

export const removeDatabaseRoleMemberTool = {
  name: 'sqlserver_remove_database_role_member',
  description: 'Remove database users or roles from database roles. Based on dbatools Remove-DbaDbRoleMember functionality.',
  inputSchema: removeDatabaseRoleMemberInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof removeDatabaseRoleMemberInputSchema>) => {
    try {
      const { database, roleName, memberName } = input;
      const roleNames = Array.isArray(roleName) ? roleName : [roleName];
      const memberNames = Array.isArray(memberName) ? memberName : [memberName];

      const results: Array<{
        Database: string;
        Role: string;
        Member: string;
        Status: string;
        Message: string;
      }> = [];

      for (const role of roleNames) {
        for (const member of memberNames) {
          try {
            const removeMemberQuery = `
              USE [${database}];
              ALTER ROLE [${role}] DROP MEMBER [${member}];
            `;
            await connectionManager.executeQuery(removeMemberQuery);

            results.push({
              Database: database,
              Role: role,
              Member: member,
              Status: 'SUCCESS',
              Message: `Member '${member}' removed from role '${role}'`,
            });
          } catch (error: any) {
            results.push({
              Database: database,
              Role: role,
              Member: member,
              Status: 'FAILED',
              Message: error.message || String(error),
            });
          }
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: `Database Role Member Removal Results:\n\n${formatResultsAsTable(results)}\n\n` +
                `Processed: ${results.length} operation(s)`,
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
