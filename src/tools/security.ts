import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';
import { formatResultsAsTable } from '../utils/formatters.js';

/**
 * Add Server Role Member Tool
 * Based on dbatools Add-DbaServerRoleMember functionality
 * Adds logins or server roles to server-level roles
 */
const addServerRoleMemberInputSchema = z.object({
  serverRole: z.union([z.string(), z.array(z.string())]).describe('Server-level role(s) to add members to. Can be fixed roles (sysadmin, dbcreator, securityadmin, etc.) or custom roles.'),
  login: z.union([z.string(), z.array(z.string())]).optional().describe('SQL Server login(s) to add to the server role(s). Can be Windows accounts, SQL logins, or Active Directory accounts.'),
  role: z.union([z.string(), z.array(z.string())]).optional().describe('Existing server-level role(s) to nest as members within the target server role(s). Creates role hierarchy.'),
});

export const addServerRoleMemberTool = {
  name: 'sqlserver_add_server_role_member',
  description: 'Add logins or server roles to server-level roles. Supports both built-in roles (sysadmin, dbcreator, securityadmin, etc.) and custom server roles. Can add individual logins or nest roles for role-based access control. Based on dbatools Add-DbaServerRoleMember functionality.',
  inputSchema: addServerRoleMemberInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof addServerRoleMemberInputSchema>) => {
    try {
      const { serverRole, login, role } = input;

      // Validate that at least one of login or role is provided
      if (!login && !role) {
        return {
          content: [{
            type: 'text' as const,
            text: '❌ Error: You must specify either login or role (or both) to add to the server role.',
          }],
          isError: true,
        };
      }

      // Convert to arrays for consistent handling
      const serverRoles = Array.isArray(serverRole) ? serverRole : [serverRole];
      const logins = login ? (Array.isArray(login) ? login : [login]) : [];
      const roles = role ? (Array.isArray(role) ? role : [role]) : [];

      const results: Array<{
        ServerRole: string;
        MemberType: string;
        MemberName: string;
        Status: string;
        Message: string;
      }> = [];

      // Process each server role
      for (const targetRole of serverRoles) {
        // Verify server role exists
        const roleCheckQuery = `
          SELECT name, type_desc, is_fixed_role
          FROM sys.server_principals
          WHERE type IN ('R') AND name = @roleName
        `;
        const roleCheck = await connectionManager.executeQuery(roleCheckQuery, {
          roleName: targetRole,
        });

        if (roleCheck.recordset.length === 0) {
          results.push({
            ServerRole: targetRole,
            MemberType: 'N/A',
            MemberName: 'N/A',
            Status: 'FAILED',
            Message: `Server role '${targetRole}' does not exist`,
          });
          continue;
        }

        // Add logins to the role
        for (const loginName of logins) {
          try {
            // Check if login exists
            const loginCheckQuery = `
              SELECT name
              FROM sys.server_principals
              WHERE type IN ('S', 'U', 'G') AND name = @loginName
            `;
            const loginCheck = await connectionManager.executeQuery(loginCheckQuery, {
              loginName: loginName,
            });

            if (loginCheck.recordset.length === 0) {
              results.push({
                ServerRole: targetRole,
                MemberType: 'Login',
                MemberName: loginName,
                Status: 'FAILED',
                Message: `Login '${loginName}' does not exist`,
              });
              continue;
            }

            // Check if already a member
            const memberCheckQuery = `
              SELECT r.name as RoleName, m.name as MemberName
              FROM sys.server_role_members srm
              INNER JOIN sys.server_principals r ON srm.role_principal_id = r.principal_id
              INNER JOIN sys.server_principals m ON srm.member_principal_id = m.principal_id
              WHERE r.name = @roleName AND m.name = @memberName
            `;
            const memberCheck = await connectionManager.executeQuery(memberCheckQuery, {
              roleName: targetRole,
              memberName: loginName,
            });

            if (memberCheck.recordset.length > 0) {
              results.push({
                ServerRole: targetRole,
                MemberType: 'Login',
                MemberName: loginName,
                Status: 'SKIPPED',
                Message: 'Already a member of this role',
              });
              continue;
            }

            // Add login to role
            const addMemberQuery = `ALTER SERVER ROLE [${targetRole.replace(/'/g, "''")}] ADD MEMBER [${loginName.replace(/'/g, "''")}]`;
            await connectionManager.executeQuery(addMemberQuery);

            results.push({
              ServerRole: targetRole,
              MemberType: 'Login',
              MemberName: loginName,
              Status: 'SUCCESS',
              Message: 'Successfully added to server role',
            });

          } catch (error) {
            results.push({
              ServerRole: targetRole,
              MemberType: 'Login',
              MemberName: loginName,
              Status: 'FAILED',
              Message: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Add roles to the role (nesting)
        for (const memberRole of roles) {
          try {
            // Check if member role exists
            const memberRoleCheckQuery = `
              SELECT name
              FROM sys.server_principals
              WHERE type = 'R' AND name = @roleName
            `;
            const memberRoleCheck = await connectionManager.executeQuery(memberRoleCheckQuery, {
              roleName: memberRole,
            });

            if (memberRoleCheck.recordset.length === 0) {
              results.push({
                ServerRole: targetRole,
                MemberType: 'Role',
                MemberName: memberRole,
                Status: 'FAILED',
                Message: `Role '${memberRole}' does not exist`,
              });
              continue;
            }

            // Check if already a member
            const memberCheckQuery = `
              SELECT r.name as RoleName, m.name as MemberName
              FROM sys.server_role_members srm
              INNER JOIN sys.server_principals r ON srm.role_principal_id = r.principal_id
              INNER JOIN sys.server_principals m ON srm.member_principal_id = m.principal_id
              WHERE r.name = @roleName AND m.name = @memberName
            `;
            const memberCheck = await connectionManager.executeQuery(memberCheckQuery, {
              roleName: targetRole,
              memberName: memberRole,
            });

            if (memberCheck.recordset.length > 0) {
              results.push({
                ServerRole: targetRole,
                MemberType: 'Role',
                MemberName: memberRole,
                Status: 'SKIPPED',
                Message: 'Already a member of this role',
              });
              continue;
            }

            // Add role to role (nesting)
            const addRoleQuery = `ALTER SERVER ROLE [${targetRole.replace(/'/g, "''")}] ADD MEMBER [${memberRole.replace(/'/g, "''")}]`;
            await connectionManager.executeQuery(addRoleQuery);

            results.push({
              ServerRole: targetRole,
              MemberType: 'Role',
              MemberName: memberRole,
              Status: 'SUCCESS',
              Message: 'Successfully added to server role',
            });

          } catch (error) {
            results.push({
              ServerRole: targetRole,
              MemberType: 'Role',
              MemberName: memberRole,
              Status: 'FAILED',
              Message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // Build response
      const successCount = results.filter(r => r.Status === 'SUCCESS').length;
      const failedCount = results.filter(r => r.Status === 'FAILED').length;
      const skippedCount = results.filter(r => r.Status === 'SKIPPED').length;

      let response = `Server Role Member Management Results:\n\n`;
      response += `Total Operations: ${results.length}\n`;
      response += `Successful: ${successCount}\n`;
      response += `Failed: ${failedCount}\n`;
      response += `Skipped: ${skippedCount}\n\n`;
      response += `Details:\n\n`;
      response += formatResultsAsTable(results);

      return {
        content: [{
          type: 'text' as const,
          text: response,
        }],
        isError: failedCount > 0,
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
 * Remove Server Role Member Tool
 * Removes logins or server roles from server-level roles
 */
const removeServerRoleMemberInputSchema = z.object({
  serverRole: z.union([z.string(), z.array(z.string())]).describe('Server-level role(s) to remove members from.'),
  login: z.union([z.string(), z.array(z.string())]).optional().describe('SQL Server login(s) to remove from the server role(s).'),
  role: z.union([z.string(), z.array(z.string())]).optional().describe('Server-level role(s) to remove from the target server role(s).'),
});

export const removeServerRoleMemberTool = {
  name: 'sqlserver_remove_server_role_member',
  description: 'Remove logins or server roles from server-level roles. Supports both built-in roles and custom server roles. Based on dbatools Remove-DbaServerRoleMember functionality.',
  inputSchema: removeServerRoleMemberInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof removeServerRoleMemberInputSchema>) => {
    try {
      const { serverRole, login, role } = input;

      // Validate that at least one of login or role is provided
      if (!login && !role) {
        return {
          content: [{
            type: 'text' as const,
            text: '❌ Error: You must specify either login or role (or both) to remove from the server role.',
          }],
          isError: true,
        };
      }

      // Convert to arrays for consistent handling
      const serverRoles = Array.isArray(serverRole) ? serverRole : [serverRole];
      const logins = login ? (Array.isArray(login) ? login : [login]) : [];
      const roles = role ? (Array.isArray(role) ? role : [role]) : [];

      const results: Array<{
        ServerRole: string;
        MemberType: string;
        MemberName: string;
        Status: string;
        Message: string;
      }> = [];

      // Process each server role
      for (const targetRole of serverRoles) {
        // Verify server role exists
        const roleCheckQuery = `
          SELECT name
          FROM sys.server_principals
          WHERE type = 'R' AND name = @roleName
        `;
        const roleCheck = await connectionManager.executeQuery(roleCheckQuery, {
          roleName: targetRole,
        });

        if (roleCheck.recordset.length === 0) {
          results.push({
            ServerRole: targetRole,
            MemberType: 'N/A',
            MemberName: 'N/A',
            Status: 'FAILED',
            Message: `Server role '${targetRole}' does not exist`,
          });
          continue;
        }

        // Remove logins from the role
        for (const loginName of logins) {
          try {
            // Check if member of the role
            const memberCheckQuery = `
              SELECT r.name as RoleName, m.name as MemberName
              FROM sys.server_role_members srm
              INNER JOIN sys.server_principals r ON srm.role_principal_id = r.principal_id
              INNER JOIN sys.server_principals m ON srm.member_principal_id = m.principal_id
              WHERE r.name = @roleName AND m.name = @memberName
            `;
            const memberCheck = await connectionManager.executeQuery(memberCheckQuery, {
              roleName: targetRole,
              memberName: loginName,
            });

            if (memberCheck.recordset.length === 0) {
              results.push({
                ServerRole: targetRole,
                MemberType: 'Login',
                MemberName: loginName,
                Status: 'SKIPPED',
                Message: 'Not a member of this role',
              });
              continue;
            }

            // Remove login from role
            const removeMemberQuery = `ALTER SERVER ROLE [${targetRole.replace(/'/g, "''")}] DROP MEMBER [${loginName.replace(/'/g, "''")}]`;
            await connectionManager.executeQuery(removeMemberQuery);

            results.push({
              ServerRole: targetRole,
              MemberType: 'Login',
              MemberName: loginName,
              Status: 'SUCCESS',
              Message: 'Successfully removed from server role',
            });

          } catch (error) {
            results.push({
              ServerRole: targetRole,
              MemberType: 'Login',
              MemberName: loginName,
              Status: 'FAILED',
              Message: error instanceof Error ? error.message : String(error),
            });
          }
        }

        // Remove roles from the role
        for (const memberRole of roles) {
          try {
            // Check if member of the role
            const memberCheckQuery = `
              SELECT r.name as RoleName, m.name as MemberName
              FROM sys.server_role_members srm
              INNER JOIN sys.server_principals r ON srm.role_principal_id = r.principal_id
              INNER JOIN sys.server_principals m ON srm.member_principal_id = m.principal_id
              WHERE r.name = @roleName AND m.name = @memberName
            `;
            const memberCheck = await connectionManager.executeQuery(memberCheckQuery, {
              roleName: targetRole,
              memberName: memberRole,
            });

            if (memberCheck.recordset.length === 0) {
              results.push({
                ServerRole: targetRole,
                MemberType: 'Role',
                MemberName: memberRole,
                Status: 'SKIPPED',
                Message: 'Not a member of this role',
              });
              continue;
            }

            // Remove role from role
            const removeRoleQuery = `ALTER SERVER ROLE [${targetRole.replace(/'/g, "''")}] DROP MEMBER [${memberRole.replace(/'/g, "''")}]`;
            await connectionManager.executeQuery(removeRoleQuery);

            results.push({
              ServerRole: targetRole,
              MemberType: 'Role',
              MemberName: memberRole,
              Status: 'SUCCESS',
              Message: 'Successfully removed from server role',
            });

          } catch (error) {
            results.push({
              ServerRole: targetRole,
              MemberType: 'Role',
              MemberName: memberRole,
              Status: 'FAILED',
              Message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      // Build response
      const successCount = results.filter(r => r.Status === 'SUCCESS').length;
      const failedCount = results.filter(r => r.Status === 'FAILED').length;
      const skippedCount = results.filter(r => r.Status === 'SKIPPED').length;

      let response = `Remove Server Role Member Results:\n\n`;
      response += `Total Operations: ${results.length}\n`;
      response += `Successful: ${successCount}\n`;
      response += `Failed: ${failedCount}\n`;
      response += `Skipped: ${skippedCount}\n\n`;
      response += `Details:\n\n`;
      response += formatResultsAsTable(results);

      return {
        content: [{
          type: 'text' as const,
          text: response,
        }],
        isError: failedCount > 0,
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
 * List Server Roles and Members Tool
 */
const listServerRolesInputSchema = z.object({
  serverRole: z.union([z.string(), z.array(z.string())]).optional().describe('Filter by specific server role name(s). If not specified, returns all server roles.'),
  includeMembers: z.boolean().default(true).describe('Include role members in the output (default: true)'),
  includeFixedRoles: z.boolean().default(true).describe('Include fixed server roles (sysadmin, dbcreator, etc.) in results (default: true)'),
});

export const listServerRolesTool = {
  name: 'sqlserver_list_server_roles',
  description: 'List server-level roles with their members. Shows both fixed roles (sysadmin, dbcreator, etc.) and custom roles. Based on dbatools Get-DbaServerRole functionality.',
  inputSchema: listServerRolesInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof listServerRolesInputSchema>) => {
    try {
      const { serverRole, includeMembers = true, includeFixedRoles = true } = input;

      // Build query to get server roles
      let query = `
        SELECT
          sp.name AS RoleName,
          sp.type_desc AS Type,
          CASE WHEN sp.is_fixed_role = 1 THEN 'Fixed' ELSE 'Custom' END AS RoleType,
          sp.create_date AS CreatedDate,
          sp.modify_date AS ModifiedDate,
          owning_principal.name AS Owner
        FROM sys.server_principals sp
        LEFT JOIN sys.server_principals owning_principal ON sp.owning_principal_id = owning_principal.principal_id
        WHERE sp.type = 'R'
      `;

      if (!includeFixedRoles) {
        query += ` AND sp.is_fixed_role = 0`;
      }

      if (serverRole) {
        const roles = Array.isArray(serverRole) ? serverRole : [serverRole];
        const roleList = roles.map(r => `'${r.replace(/'/g, "''")}'`).join(',');
        query += ` AND sp.name IN (${roleList})`;
      }

      query += ` ORDER BY sp.is_fixed_role DESC, sp.name`;

      const result = await connectionManager.executeQuery(query);
      const roles = result.recordset;

      if (roles.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: '⚠️  No server roles found matching the criteria.',
          }],
        };
      }

      let response = `Server Roles (${roles.length}):\n\n`;
      response += formatResultsAsTable(roles);

      // Get members for each role if requested
      if (includeMembers) {
        response += `\n\nRole Members:\n\n`;

        for (const role of roles) {
          const membersQuery = `
            SELECT
              r.name AS RoleName,
              m.name AS MemberName,
              m.type_desc AS MemberType,
              CASE
                WHEN m.type = 'R' THEN 'Server Role'
                WHEN m.type = 'S' THEN 'SQL Login'
                WHEN m.type = 'U' THEN 'Windows Login'
                WHEN m.type = 'G' THEN 'Windows Group'
                ELSE m.type_desc
              END AS MemberTypeDescription
            FROM sys.server_role_members srm
            INNER JOIN sys.server_principals r ON srm.role_principal_id = r.principal_id
            INNER JOIN sys.server_principals m ON srm.member_principal_id = m.principal_id
            WHERE r.name = @roleName
            ORDER BY m.name
          `;

          const membersResult = await connectionManager.executeQuery(membersQuery, {
            roleName: role.RoleName,
          });

          if (membersResult.recordset.length > 0) {
            response += `\n${role.RoleName} (${membersResult.recordset.length} members):\n`;
            response += formatResultsAsTable(membersResult.recordset.map((m: any) => ({
              Member: m.MemberName,
              Type: m.MemberTypeDescription,
            })));
          } else {
            response += `\n${role.RoleName}: (No members)\n`;
          }
        }
      }

      return {
        content: [{
          type: 'text' as const,
          text: response,
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
 * Create Server Role Tool
 */
const createServerRoleInputSchema = z.object({
  serverRole: z.string().describe('Name of the new server-level role to create'),
  owner: z.string().optional().describe('Login name that will own the role (default: current login)'),
});

export const createServerRoleTool = {
  name: 'sqlserver_create_server_role',
  description: 'Create a new custom server-level role. Custom roles allow you to group permissions and assign them to multiple logins. Based on dbatools New-DbaServerRole functionality.',
  inputSchema: createServerRoleInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof createServerRoleInputSchema>) => {
    try {
      const { serverRole, owner } = input;

      // Check if role already exists
      const checkQuery = `
        SELECT name
        FROM sys.server_principals
        WHERE type = 'R' AND name = @roleName
      `;
      const checkResult = await connectionManager.executeQuery(checkQuery, {
        roleName: serverRole,
      });

      if (checkResult.recordset.length > 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Server role '${serverRole}' already exists.`,
          }],
          isError: true,
        };
      }

      // Create the server role
      let createQuery = `CREATE SERVER ROLE [${serverRole.replace(/'/g, "''")}]`;
      if (owner) {
        createQuery += ` AUTHORIZATION [${owner.replace(/'/g, "''")}]`;
      }

      await connectionManager.executeQuery(createQuery);

      // Get the created role info
      const infoQuery = `
        SELECT
          sp.name AS RoleName,
          owning_principal.name AS Owner,
          sp.create_date AS CreatedDate
        FROM sys.server_principals sp
        LEFT JOIN sys.server_principals owning_principal ON sp.owning_principal_id = owning_principal.principal_id
        WHERE sp.name = @roleName
      `;
      const infoResult = await connectionManager.executeQuery(infoQuery, {
        roleName: serverRole,
      });

      const roleInfo = infoResult.recordset[0];

      const response = `✅ Server role created successfully:\n\n` +
        `Role Name: ${roleInfo.RoleName}\n` +
        `Owner: ${roleInfo.Owner}\n` +
        `Created: ${roleInfo.CreatedDate}\n\n` +
        `You can now add members to this role using sqlserver_add_server_role_member.`;

      return {
        content: [{
          type: 'text' as const,
          text: response,
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
 * Drop Server Role Tool
 */
const dropServerRoleInputSchema = z.object({
  serverRole: z.string().describe('Name of the server-level role to drop. Cannot drop fixed server roles.'),
});

export const dropServerRoleTool = {
  name: 'sqlserver_drop_server_role',
  description: 'Drop (delete) a custom server-level role. WARNING: Cannot drop fixed server roles (sysadmin, dbcreator, etc.). All members must be removed before dropping the role.',
  inputSchema: dropServerRoleInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof dropServerRoleInputSchema>) => {
    try {
      const { serverRole } = input;

      // Check if role exists and is not fixed
      const checkQuery = `
        SELECT name, is_fixed_role
        FROM sys.server_principals
        WHERE type = 'R' AND name = @roleName
      `;
      const checkResult = await connectionManager.executeQuery(checkQuery, {
        roleName: serverRole,
      });

      if (checkResult.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Server role '${serverRole}' does not exist.`,
          }],
          isError: true,
        };
      }

      if (checkResult.recordset[0].is_fixed_role) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Cannot drop fixed server role '${serverRole}'. Fixed roles are built-in and cannot be deleted.`,
          }],
          isError: true,
        };
      }

      // Check if role has members
      const membersQuery = `
        SELECT COUNT(*) AS MemberCount
        FROM sys.server_role_members srm
        INNER JOIN sys.server_principals r ON srm.role_principal_id = r.principal_id
        WHERE r.name = @roleName
      `;
      const membersResult = await connectionManager.executeQuery(membersQuery, {
        roleName: serverRole,
      });

      if (membersResult.recordset[0].MemberCount > 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Cannot drop server role '${serverRole}' because it has ${membersResult.recordset[0].MemberCount} member(s). Remove all members first using sqlserver_remove_server_role_member.`,
          }],
          isError: true,
        };
      }

      // Drop the server role
      const dropQuery = `DROP SERVER ROLE [${serverRole.replace(/'/g, "''")}]`;
      await connectionManager.executeQuery(dropQuery);

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Server role '${serverRole}' has been dropped successfully.`,
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
 * Get Login Tool
 * Based on dbatools Get-DbaLogin functionality
 * Retrieves SQL Server login accounts with detailed information
 */
const getLoginInputSchema = z.object({
  login: z.union([z.string(), z.array(z.string())]).optional().describe('Specific login name(s) to retrieve. If not specified, returns all logins.'),
  excludeLogin: z.union([z.string(), z.array(z.string())]).optional().describe('Login name(s) to exclude from results.'),
  excludeSystemLogin: z.boolean().default(false).describe('Exclude built-in system logins (sa, ##MS_*, NT AUTHORITY\\*, etc.)'),
  type: z.enum(['Windows', 'SQL', 'All']).default('All').describe('Filter by authentication type: Windows, SQL, or All'),
  locked: z.boolean().optional().describe('Filter to show only locked logins'),
  disabled: z.boolean().optional().describe('Filter to show only disabled logins'),
  hasAccess: z.boolean().optional().describe('Filter to show only logins with server access'),
});

export const getLoginTool = {
  name: 'sqlserver_get_login',
  description: 'Retrieve detailed information about SQL Server login accounts including authentication type, security status, server roles, and last login times. Supports filtering by type (Windows/SQL), status (locked/disabled), and custom patterns. Based on dbatools Get-DbaLogin functionality.',
  inputSchema: getLoginInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getLoginInputSchema>) => {
    try {
      const { login, excludeLogin, excludeSystemLogin, type, locked, disabled, hasAccess } = input;

      let query = `
        SELECT
          sp.name AS LoginName,
          sp.type_desc AS LoginType,
          CASE
            WHEN sp.type = 'S' THEN 'SQL Login'
            WHEN sp.type = 'U' THEN 'Windows Login'
            WHEN sp.type = 'G' THEN 'Windows Group'
            WHEN sp.type = 'C' THEN 'Certificate'
            WHEN sp.type = 'K' THEN 'Asymmetric Key'
            ELSE sp.type_desc
          END AS AuthenticationType,
          sp.is_disabled AS IsDisabled,
          sp.create_date AS CreateDate,
          sp.modify_date AS ModifyDate,
          sp.default_database_name AS DefaultDatabase,
          sp.default_language_name AS DefaultLanguage,
          LOGINPROPERTY(sp.name, 'IsLocked') AS IsLocked,
          LOGINPROPERTY(sp.name, 'IsExpired') AS IsExpired,
          LOGINPROPERTY(sp.name, 'IsMustChange') AS MustChangePassword,
          LOGINPROPERTY(sp.name, 'BadPasswordCount') AS BadPasswordCount,
          LOGINPROPERTY(sp.name, 'BadPasswordTime') AS BadPasswordTime,
          LOGINPROPERTY(sp.name, 'PasswordLastSetTime') AS PasswordLastSetTime,
          LOGINPROPERTY(sp.name, 'DaysUntilExpiration') AS DaysUntilExpiration,
          CASE WHEN sp.is_disabled = 0 THEN 1 ELSE 0 END AS HasAccess,
          (
            SELECT STRING_AGG(r.name, ', ')
            FROM sys.server_role_members srm
            INNER JOIN sys.server_principals r ON srm.role_principal_id = r.principal_id
            WHERE srm.member_principal_id = sp.principal_id
          ) AS ServerRoles
        FROM sys.server_principals sp
        WHERE sp.type IN ('S', 'U', 'G', 'C', 'K')
      `;

      // Apply filters
      if (login) {
        const logins = Array.isArray(login) ? login : [login];
        const loginList = logins.map(l => `'${l.replace(/'/g, "''")}'`).join(',');
        query += ` AND sp.name IN (${loginList})`;
      }

      if (excludeLogin) {
        const excludeLogins = Array.isArray(excludeLogin) ? excludeLogin : [excludeLogin];
        const excludeList = excludeLogins.map(l => `'${l.replace(/'/g, "''")}'`).join(',');
        query += ` AND sp.name NOT IN (${excludeList})`;
      }

      if (excludeSystemLogin) {
        query += ` AND sp.name NOT IN ('sa', 'BUILTIN\\Administrators')
                   AND sp.name NOT LIKE '##%'
                   AND sp.name NOT LIKE 'NT AUTHORITY%'
                   AND sp.name NOT LIKE 'NT SERVICE%'`;
      }

      if (type !== 'All') {
        if (type === 'Windows') {
          query += ` AND sp.type IN ('U', 'G')`;
        } else if (type === 'SQL') {
          query += ` AND sp.type = 'S'`;
        }
      }

      if (locked !== undefined) {
        query += ` AND LOGINPROPERTY(sp.name, 'IsLocked') = ${locked ? 1 : 0}`;
      }

      if (disabled !== undefined) {
        query += ` AND sp.is_disabled = ${disabled ? 1 : 0}`;
      }

      if (hasAccess !== undefined) {
        query += ` AND sp.is_disabled = ${hasAccess ? 0 : 1}`;
      }

      query += ` ORDER BY sp.name`;

      const result = await connectionManager.executeQuery(query);
      const logins = result.recordset;

      if (logins.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: '⚠️  No logins found matching the specified criteria.',
          }],
        };
      }

      let response = `SQL Server Logins (${logins.length}):\n\n`;
      response += formatResultsAsTable(logins);

      return {
        content: [{
          type: 'text' as const,
          text: response,
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
 * New Login Tool
 * Based on dbatools New-DbaLogin functionality
 * Creates a new SQL Server or Windows login
 */
const newLoginInputSchema = z.object({
  login: z.string().describe('Name of the login to create'),
  loginType: z.enum(['SqlLogin', 'WindowsUser', 'WindowsGroup']).default('SqlLogin').describe('Type of login to create'),
  password: z.string().optional().describe('Password for SQL Login (required for SqlLogin type)'),
  defaultDatabase: z.string().default('master').describe('Default database for the login'),
  defaultLanguage: z.string().optional().describe('Default language for the login'),
  mustChangePassword: z.boolean().default(false).describe('Force password change on first login (SQL Login only)'),
  passwordPolicyEnforced: z.boolean().default(true).describe('Enforce password policy (SQL Login only)'),
  passwordExpirationEnabled: z.boolean().default(false).describe('Enable password expiration (SQL Login only)'),
  disabled: z.boolean().default(false).describe('Create login in disabled state'),
});

export const newLoginTool = {
  name: 'sqlserver_new_login',
  description: 'Create a new SQL Server or Windows login account. Supports SQL authentication with password policies or Windows authentication for domain users and groups. Based on dbatools New-DbaLogin functionality.',
  inputSchema: newLoginInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof newLoginInputSchema>) => {
    try {
      const { login, loginType, password, defaultDatabase, defaultLanguage, mustChangePassword, passwordPolicyEnforced, passwordExpirationEnabled, disabled } = input;

      // Check if login already exists
      const checkQuery = `SELECT name FROM sys.server_principals WHERE name = @loginName`;
      const checkResult = await connectionManager.executeQuery(checkQuery, { loginName: login });

      if (checkResult.recordset.length > 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Login '${login}' already exists.`,
          }],
          isError: true,
        };
      }

      let createQuery = '';

      if (loginType === 'SqlLogin') {
        if (!password) {
          return {
            content: [{
              type: 'text' as const,
              text: '❌ Password is required for SQL Login.',
            }],
            isError: true,
          };
        }

        createQuery = `CREATE LOGIN [${login.replace(/'/g, "''")}] WITH PASSWORD = '${password.replace(/'/g, "''")}'`;

        if (mustChangePassword) {
          createQuery += ', MUST_CHANGE';
        }

        if (passwordPolicyEnforced) {
          createQuery += ', CHECK_POLICY = ON';
        } else {
          createQuery += ', CHECK_POLICY = OFF';
        }

        if (passwordExpirationEnabled) {
          createQuery += ', CHECK_EXPIRATION = ON';
        } else {
          createQuery += ', CHECK_EXPIRATION = OFF';
        }

        createQuery += `, DEFAULT_DATABASE = [${defaultDatabase.replace(/'/g, "''")}]`;

        if (defaultLanguage) {
          createQuery += `, DEFAULT_LANGUAGE = [${defaultLanguage.replace(/'/g, "''")}]`;
        }
      } else {
        // Windows login
        createQuery = `CREATE LOGIN [${login.replace(/'/g, "''")}] FROM WINDOWS WITH DEFAULT_DATABASE = [${defaultDatabase.replace(/'/g, "''")}]`;

        if (defaultLanguage) {
          createQuery += `, DEFAULT_LANGUAGE = [${defaultLanguage.replace(/'/g, "''")}]`;
        }
      }

      await connectionManager.executeQuery(createQuery);

      // Disable if requested
      if (disabled) {
        await connectionManager.executeQuery(`ALTER LOGIN [${login.replace(/'/g, "''")}] DISABLE`);
      }

      // Get created login info
      const infoQuery = `
        SELECT
          name AS LoginName,
          type_desc AS LoginType,
          is_disabled AS IsDisabled,
          create_date AS CreateDate,
          default_database_name AS DefaultDatabase,
          default_language_name AS DefaultLanguage
        FROM sys.server_principals
        WHERE name = @loginName
      `;
      const infoResult = await connectionManager.executeQuery(infoQuery, { loginName: login });
      const loginInfo = infoResult.recordset[0];

      let response = `✅ Login created successfully:\n\n`;
      response += `Login Name: ${loginInfo.LoginName}\n`;
      response += `Type: ${loginInfo.LoginType}\n`;
      response += `Disabled: ${loginInfo.IsDisabled ? 'Yes' : 'No'}\n`;
      response += `Default Database: ${loginInfo.DefaultDatabase}\n`;
      response += `Default Language: ${loginInfo.DefaultLanguage || 'Default'}\n`;
      response += `Created: ${loginInfo.CreateDate}\n`;

      return {
        content: [{
          type: 'text' as const,
          text: response,
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
 * Remove Login Tool
 * Based on dbatools Remove-DbaLogin functionality
 */
const removeLoginInputSchema = z.object({
  login: z.union([z.string(), z.array(z.string())]).describe('Login name(s) to remove'),
  force: z.boolean().default(false).describe('Force removal even if login owns database objects'),
});

export const removeLoginTool = {
  name: 'sqlserver_remove_login',
  description: 'Remove (drop) one or more SQL Server login accounts. WARNING: This permanently deletes the login and all associated permissions. Use force parameter to remove logins that own database objects. Based on dbatools Remove-DbaLogin functionality.',
  inputSchema: removeLoginInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof removeLoginInputSchema>) => {
    try {
      const { login, force } = input;
      const logins = Array.isArray(login) ? login : [login];

      const results: Array<{
        LoginName: string;
        Status: string;
        Message: string;
      }> = [];

      for (const loginName of logins) {
        try {
          // Check if login exists
          const checkQuery = `SELECT name, type_desc FROM sys.server_principals WHERE name = @loginName AND type IN ('S', 'U', 'G')`;
          const checkResult = await connectionManager.executeQuery(checkQuery, { loginName });

          if (checkResult.recordset.length === 0) {
            results.push({
              LoginName: loginName,
              Status: 'SKIPPED',
              Message: 'Login does not exist',
            });
            continue;
          }

          // Check for database ownership
          const ownershipQuery = `
            SELECT COUNT(*) AS OwnedDatabases
            FROM sys.databases
            WHERE owner_sid = SUSER_SID(@loginName)
          `;
          const ownershipResult = await connectionManager.executeQuery(ownershipQuery, { loginName });
          const ownedDatabases = ownershipResult.recordset[0].OwnedDatabases;

          if (ownedDatabases > 0 && !force) {
            results.push({
              LoginName: loginName,
              Status: 'FAILED',
              Message: `Login owns ${ownedDatabases} database(s). Use force parameter to remove anyway.`,
            });
            continue;
          }

          // If force and owns databases, transfer ownership to sa
          if (ownedDatabases > 0 && force) {
            const transferQuery = `
              DECLARE @dbname NVARCHAR(128)
              DECLARE db_cursor CURSOR FOR
              SELECT name FROM sys.databases WHERE owner_sid = SUSER_SID(@loginName)

              OPEN db_cursor
              FETCH NEXT FROM db_cursor INTO @dbname

              WHILE @@FETCH_STATUS = 0
              BEGIN
                EXEC('ALTER AUTHORIZATION ON DATABASE::' + QUOTENAME(@dbname) + ' TO sa')
                FETCH NEXT FROM db_cursor INTO @dbname
              END

              CLOSE db_cursor
              DEALLOCATE db_cursor
            `;
            await connectionManager.executeQuery(transferQuery, { loginName });
          }

          // Drop the login
          await connectionManager.executeQuery(`DROP LOGIN [${loginName.replace(/'/g, "''")}]`);

          results.push({
            LoginName: loginName,
            Status: 'SUCCESS',
            Message: 'Login removed successfully',
          });

        } catch (error) {
          results.push({
            LoginName: loginName,
            Status: 'FAILED',
            Message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      const successCount = results.filter(r => r.Status === 'SUCCESS').length;
      const failedCount = results.filter(r => r.Status === 'FAILED').length;

      let response = `Remove Login Results:\n\n`;
      response += `Total: ${results.length}, Success: ${successCount}, Failed: ${failedCount}\n\n`;
      response += formatResultsAsTable(results);

      return {
        content: [{
          type: 'text' as const,
          text: response,
        }],
        isError: failedCount > 0,
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
 * Set Login Tool
 * Based on dbatools Set-DbaLogin functionality
 */
const setLoginInputSchema = z.object({
  login: z.string().describe('Login name to modify'),
  password: z.string().optional().describe('New password (SQL Login only)'),
  defaultDatabase: z.string().optional().describe('New default database'),
  defaultLanguage: z.string().optional().describe('New default language'),
  enable: z.boolean().optional().describe('Enable the login'),
  disable: z.boolean().optional().describe('Disable the login'),
  unlock: z.boolean().optional().describe('Unlock the login'),
  mustChangePassword: z.boolean().optional().describe('Force password change on next login'),
  passwordPolicyEnforced: z.boolean().optional().describe('Enforce password policy'),
  passwordExpirationEnabled: z.boolean().optional().describe('Enable password expiration'),
  newName: z.string().optional().describe('Rename the login to this new name'),
});

export const setLoginTool = {
  name: 'sqlserver_set_login',
  description: 'Modify properties of an existing SQL Server login including password, default database, enable/disable status, and password policies. Can also rename logins. Based on dbatools Set-DbaLogin functionality.',
  inputSchema: setLoginInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof setLoginInputSchema>) => {
    try {
      const { login, password, defaultDatabase, defaultLanguage, enable, disable, unlock, mustChangePassword, passwordPolicyEnforced, passwordExpirationEnabled, newName } = input;

      // Check if login exists
      const checkQuery = `SELECT name, type FROM sys.server_principals WHERE name = @loginName AND type IN ('S', 'U', 'G')`;
      const checkResult = await connectionManager.executeQuery(checkQuery, { loginName: login });

      if (checkResult.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Login '${login}' does not exist.`,
          }],
          isError: true,
        };
      }

      const loginType = checkResult.recordset[0].type;
      const changes: string[] = [];

      // Change password (SQL Login only)
      if (password && loginType === 'S') {
        let alterQuery = `ALTER LOGIN [${login.replace(/'/g, "''")}] WITH PASSWORD = '${password.replace(/'/g, "''")}'`;

        if (mustChangePassword) {
          alterQuery += ', MUST_CHANGE';
        }

        if (unlock) {
          alterQuery += ' UNLOCK';
        }

        await connectionManager.executeQuery(alterQuery);
        changes.push('Password changed');
      }

      // Change password policy (SQL Login only)
      if (passwordPolicyEnforced !== undefined && loginType === 'S') {
        await connectionManager.executeQuery(
          `ALTER LOGIN [${login.replace(/'/g, "''")}] WITH CHECK_POLICY = ${passwordPolicyEnforced ? 'ON' : 'OFF'}`
        );
        changes.push(`Password policy ${passwordPolicyEnforced ? 'enabled' : 'disabled'}`);
      }

      // Change password expiration (SQL Login only)
      if (passwordExpirationEnabled !== undefined && loginType === 'S') {
        await connectionManager.executeQuery(
          `ALTER LOGIN [${login.replace(/'/g, "''")}] WITH CHECK_EXPIRATION = ${passwordExpirationEnabled ? 'ON' : 'OFF'}`
        );
        changes.push(`Password expiration ${passwordExpirationEnabled ? 'enabled' : 'disabled'}`);
      }

      // Change default database
      if (defaultDatabase) {
        await connectionManager.executeQuery(
          `ALTER LOGIN [${login.replace(/'/g, "''")}] WITH DEFAULT_DATABASE = [${defaultDatabase.replace(/'/g, "''")}]`
        );
        changes.push(`Default database set to ${defaultDatabase}`);
      }

      // Change default language
      if (defaultLanguage) {
        await connectionManager.executeQuery(
          `ALTER LOGIN [${login.replace(/'/g, "''")}] WITH DEFAULT_LANGUAGE = [${defaultLanguage.replace(/'/g, "''")}]`
        );
        changes.push(`Default language set to ${defaultLanguage}`);
      }

      // Enable login
      if (enable) {
        await connectionManager.executeQuery(`ALTER LOGIN [${login.replace(/'/g, "''")}] ENABLE`);
        changes.push('Login enabled');
      }

      // Disable login
      if (disable) {
        await connectionManager.executeQuery(`ALTER LOGIN [${login.replace(/'/g, "''")}] DISABLE`);
        changes.push('Login disabled');
      }

      // Unlock login (SQL Login only)
      if (unlock && !password && loginType === 'S') {
        await connectionManager.executeQuery(`ALTER LOGIN [${login.replace(/'/g, "''")}] WITH PASSWORD = (SELECT CONVERT(NVARCHAR(128), password_hash, 1) FROM sys.sql_logins WHERE name = @loginName) HASHED UNLOCK`, { loginName: login });
        changes.push('Login unlocked');
      }

      // Rename login
      if (newName) {
        await connectionManager.executeQuery(`ALTER LOGIN [${login.replace(/'/g, "''")}] WITH NAME = [${newName.replace(/'/g, "''")}]`);
        changes.push(`Login renamed to ${newName}`);
      }

      if (changes.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: '⚠️  No changes specified. Please provide at least one property to modify.',
          }],
        };
      }

      let response = `✅ Login modified successfully:\n\n`;
      response += `Login: ${login}${newName ? ` → ${newName}` : ''}\n`;
      response += `Changes:\n`;
      changes.forEach(change => {
        response += `  • ${change}\n`;
      });

      return {
        content: [{
          type: 'text' as const,
          text: response,
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
 * Rename Login Tool
 * Based on dbatools Rename-DbaLogin functionality
 */
const renameLoginInputSchema = z.object({
  login: z.string().describe('Current login name'),
  newName: z.string().describe('New login name'),
});

export const renameLoginTool = {
  name: 'sqlserver_rename_login',
  description: 'Rename an existing SQL Server login account. This changes only the login name; all permissions and properties are preserved. Based on dbatools Rename-DbaLogin functionality.',
  inputSchema: renameLoginInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof renameLoginInputSchema>) => {
    try {
      const { login, newName } = input;

      // Check if source login exists
      const checkQuery = `SELECT name FROM sys.server_principals WHERE name = @loginName AND type IN ('S', 'U', 'G')`;
      const checkResult = await connectionManager.executeQuery(checkQuery, { loginName: login });

      if (checkResult.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Login '${login}' does not exist.`,
          }],
          isError: true,
        };
      }

      // Check if new name already exists
      const newNameCheck = await connectionManager.executeQuery(checkQuery, { loginName: newName });
      if (newNameCheck.recordset.length > 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ Login name '${newName}' already exists.`,
          }],
          isError: true,
        };
      }

      // Rename the login
      await connectionManager.executeQuery(`ALTER LOGIN [${login.replace(/'/g, "''")}] WITH NAME = [${newName.replace(/'/g, "''")}]`);

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Login '${login}' has been renamed to '${newName}' successfully.`,
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
 * Test Login Password Tool
 * Based on dbatools Test-DbaLoginPassword functionality
 */
const testLoginPasswordInputSchema = z.object({
  login: z.string().describe('SQL Server login name to test'),
  password: z.string().describe('Password to test'),
});

export const testLoginPasswordTool = {
  name: 'sqlserver_test_login_password',
  description: 'Test if a password is correct for a SQL Server login account. This verifies credentials without locking the account on failure. Based on dbatools Test-DbaLoginPassword functionality.',
  inputSchema: testLoginPasswordInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof testLoginPasswordInputSchema>) => {
    try {
      const { login, password } = input;

      // Check if login exists and is SQL login
      const checkQuery = `SELECT name, type FROM sys.server_principals WHERE name = @loginName AND type = 'S'`;
      const checkResult = await connectionManager.executeQuery(checkQuery, { loginName: login });

      if (checkResult.recordset.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: `❌ SQL Login '${login}' does not exist or is not a SQL Server authentication login.`,
          }],
          isError: true,
        };
      }

      // Test password by checking password hash
      const testQuery = `
        SELECT
          CASE
            WHEN PWDCOMPARE(@password, password_hash) = 1 THEN 1
            ELSE 0
          END AS PasswordMatch
        FROM sys.sql_logins
        WHERE name = @loginName
      `;

      const testResult = await connectionManager.executeQuery(testQuery, {
        loginName: login,
        password: password
      });

      const passwordMatch = testResult.recordset[0].PasswordMatch === 1;

      let response = passwordMatch
        ? `✅ Password is CORRECT for login '${login}'.`
        : `❌ Password is INCORRECT for login '${login}'.`;

      return {
        content: [{
          type: 'text' as const,
          text: response,
        }],
        isError: !passwordMatch,
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
 * Test Windows Login Tool
 * Based on dbatools Test-DbaWindowsLogin functionality
 */
const testWindowsLoginInputSchema = z.object({
  login: z.union([z.string(), z.array(z.string())]).optional().describe('Specific Windows login(s) to test. If not specified, tests all Windows logins.'),
});

export const testWindowsLoginTool = {
  name: 'sqlserver_test_windows_login',
  description: 'Test if Windows logins are still valid in Active Directory. Identifies orphaned Windows accounts that no longer exist in AD but still have SQL Server access. Based on dbatools Test-DbaWindowsLogin functionality.',
  inputSchema: testWindowsLoginInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof testWindowsLoginInputSchema>) => {
    try {
      const { login } = input;

      let query = `
        SELECT
          name AS LoginName,
          type_desc AS LoginType,
          create_date AS CreateDate,
          modify_date AS ModifyDate,
          is_disabled AS IsDisabled,
          SUSER_SID(name) AS SID
        FROM sys.server_principals
        WHERE type IN ('U', 'G')
        AND name NOT LIKE 'NT AUTHORITY%'
        AND name NOT LIKE 'NT SERVICE%'
        AND name NOT LIKE 'BUILTIN%'
      `;

      if (login) {
        const logins = Array.isArray(login) ? login : [login];
        const loginList = logins.map(l => `'${l.replace(/'/g, "''")}'`).join(',');
        query += ` AND name IN (${loginList})`;
      }

      const result = await connectionManager.executeQuery(query);
      const logins = result.recordset;

      if (logins.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: '⚠️  No Windows logins found to test.',
          }],
        };
      }

      const testResults = logins.map((l: any) => ({
        LoginName: l.LoginName,
        LoginType: l.LoginType,
        IsDisabled: l.IsDisabled ? 'Yes' : 'No',
        CreateDate: l.CreateDate,
        Status: l.SID ? 'Valid' : 'Orphaned (AD account not found)',
      }));

      const orphanedCount = testResults.filter((r: any) => r.Status.includes('Orphaned')).length;

      let response = `Windows Login Test Results (${logins.length} logins tested):\n\n`;
      response += formatResultsAsTable(testResults);

      if (orphanedCount > 0) {
        response += `\n⚠️  Found ${orphanedCount} orphaned Windows login(s) that may no longer exist in Active Directory.`;
      } else {
        response += `\n✅ All Windows logins are valid.`;
      }

      return {
        content: [{
          type: 'text' as const,
          text: response,
        }],
        isError: orphanedCount > 0,
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
 * Find Login In Group Tool
 * Based on dbatools Find-DbaLoginInGroup functionality
 */
const findLoginInGroupInputSchema = z.object({
  login: z.string().optional().describe('Specific login to search for in Windows groups'),
  groupName: z.string().optional().describe('Specific Windows group name to search in'),
});

export const findLoginInGroupTool = {
  name: 'sqlserver_find_login_in_group',
  description: 'Find Windows logins that are members of Windows groups with SQL Server access. Helps identify indirect login access through group membership. Based on dbatools Find-DbaLoginInGroup functionality.',
  inputSchema: findLoginInGroupInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof findLoginInGroupInputSchema>) => {
    try {
      const { login, groupName } = input;

      // Get all Windows groups
      let query = `
        SELECT
          name AS GroupName,
          type_desc AS GroupType,
          create_date AS CreateDate,
          (
            SELECT STRING_AGG(r.name, ', ')
            FROM sys.server_role_members srm
            INNER JOIN sys.server_principals r ON srm.role_principal_id = r.principal_id
            WHERE srm.member_principal_id = sp.principal_id
          ) AS ServerRoles
        FROM sys.server_principals sp
        WHERE type = 'G'
      `;

      if (groupName) {
        query += ` AND name = '${groupName.replace(/'/g, "''")}'`;
      }

      const result = await connectionManager.executeQuery(query);
      const groups = result.recordset;

      if (groups.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: '⚠️  No Windows groups found with SQL Server access.',
          }],
        };
      }

      let response = `Windows Groups with SQL Server Access (${groups.length}):\n\n`;
      response += formatResultsAsTable(groups);

      if (login) {
        response += `\n\n⚠️  Note: Membership lookup for specific users requires Windows/AD integration which is not directly available through T-SQL.\n`;
        response += `To check if '${login}' is a member of these groups, use Active Directory tools or PowerShell's Get-ADGroupMember cmdlet.`;
      }

      return {
        content: [{
          type: 'text' as const,
          text: response,
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
 * Export Login Tool
 * Based on dbatools Export-DbaLogin functionality
 */
const exportLoginInputSchema = z.object({
  login: z.union([z.string(), z.array(z.string())]).optional().describe('Specific login(s) to export. If not specified, exports all logins.'),
  excludeSystemLogin: z.boolean().default(true).describe('Exclude system logins from export'),
  includeServerRoles: z.boolean().default(true).describe('Include server role memberships in export script'),
  includePermissions: z.boolean().default(true).describe('Include server-level permissions in export script'),
});

export const exportLoginTool = {
  name: 'sqlserver_export_login',
  description: 'Generate T-SQL scripts to recreate logins with their passwords, server roles, and permissions. Useful for migrating logins between servers or creating login backups. Based on dbatools Export-DbaLogin functionality.',
  inputSchema: exportLoginInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof exportLoginInputSchema>) => {
    try {
      const { login, excludeSystemLogin, includeServerRoles, includePermissions } = input;

      let query = `
        SELECT
          sp.name AS LoginName,
          sp.type AS LoginType,
          sp.type_desc,
          sp.is_disabled,
          sp.default_database_name,
          sp.default_language_name,
          sl.password_hash,
          sl.is_policy_checked,
          sl.is_expiration_checked,
          CONVERT(VARCHAR(256), SUSER_SID(sp.name), 1) AS SID
        FROM sys.server_principals sp
        LEFT JOIN sys.sql_logins sl ON sp.principal_id = sl.principal_id
        WHERE sp.type IN ('S', 'U', 'G')
      `;

      if (login) {
        const logins = Array.isArray(login) ? login : [login];
        const loginList = logins.map(l => `'${l.replace(/'/g, "''")}'`).join(',');
        query += ` AND sp.name IN (${loginList})`;
      }

      if (excludeSystemLogin) {
        query += ` AND sp.name NOT IN ('sa', 'BUILTIN\\Administrators')
                   AND sp.name NOT LIKE '##%'
                   AND sp.name NOT LIKE 'NT AUTHORITY%'
                   AND sp.name NOT LIKE 'NT SERVICE%'`;
      }

      query += ` ORDER BY sp.name`;

      const result = await connectionManager.executeQuery(query);
      const logins = result.recordset;

      if (logins.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: '⚠️  No logins found to export.',
          }],
        };
      }

      let script = `-- Login Export Script\n`;
      script += `-- Generated: ${new Date().toISOString()}\n`;
      script += `-- Total Logins: ${logins.length}\n\n`;

      for (const loginRow of logins) {
        script += `-- Login: ${loginRow.LoginName}\n`;

        // Create login statement
        if (loginRow.LoginType === 'S') {
          // SQL Login
          script += `IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = N'${loginRow.LoginName}')\n`;
          script += `CREATE LOGIN [${loginRow.LoginName}] WITH PASSWORD = ${loginRow.password_hash} HASHED,\n`;
          script += `    CHECK_POLICY = ${loginRow.is_policy_checked ? 'ON' : 'OFF'},\n`;
          script += `    CHECK_EXPIRATION = ${loginRow.is_expiration_checked ? 'ON' : 'OFF'},\n`;
          script += `    DEFAULT_DATABASE = [${loginRow.default_database_name}]`;
          if (loginRow.default_language_name) {
            script += `,\n    DEFAULT_LANGUAGE = [${loginRow.default_language_name}]`;
          }
          script += `;\n`;
        } else {
          // Windows Login
          script += `IF NOT EXISTS (SELECT * FROM sys.server_principals WHERE name = N'${loginRow.LoginName}')\n`;
          script += `CREATE LOGIN [${loginRow.LoginName}] FROM WINDOWS WITH DEFAULT_DATABASE = [${loginRow.default_database_name}]`;
          if (loginRow.default_language_name) {
            script += `,\n    DEFAULT_LANGUAGE = [${loginRow.default_language_name}]`;
          }
          script += `;\n`;
        }

        // Set disabled status
        if (loginRow.is_disabled) {
          script += `ALTER LOGIN [${loginRow.LoginName}] DISABLE;\n`;
        }

        // Add server roles if requested
        if (includeServerRoles) {
          const rolesQuery = `
            SELECT r.name AS RoleName
            FROM sys.server_role_members srm
            INNER JOIN sys.server_principals r ON srm.role_principal_id = r.principal_id
            INNER JOIN sys.server_principals m ON srm.member_principal_id = m.principal_id
            WHERE m.name = @loginName
          `;
          const rolesResult = await connectionManager.executeQuery(rolesQuery, { loginName: loginRow.LoginName });

          for (const roleRow of rolesResult.recordset) {
            script += `ALTER SERVER ROLE [${roleRow.RoleName}] ADD MEMBER [${loginRow.LoginName}];\n`;
          }
        }

        // Add server permissions if requested
        if (includePermissions) {
          const permsQuery = `
            SELECT
              state_desc,
              permission_name,
              class_desc
            FROM sys.server_permissions
            WHERE grantee_principal_id = SUSER_ID(@loginName)
            AND class = 100
          `;
          const permsResult = await connectionManager.executeQuery(permsQuery, { loginName: loginRow.LoginName });

          for (const permRow of permsResult.recordset) {
            script += `${permRow.state_desc} ${permRow.permission_name} TO [${loginRow.LoginName}];\n`;
          }
        }

        script += `\n`;
      }

      script += `-- End of Login Export Script\n`;

      return {
        content: [{
          type: 'text' as const,
          text: `✅ Exported ${logins.length} login(s):\n\n\`\`\`sql\n${script}\n\`\`\``,
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
 * Get Permissions Tool
 * Based on dbatools Get-DbaPermission functionality
 * Retrieves permissions for logins and database users
 */
const getPermissionsInputSchema = z.object({
  database: z.string().optional().describe('Specific database to check permissions. If not specified, shows server-level permissions.'),
  principal: z.string().optional().describe('Specific login or user name to filter permissions. If not specified, shows all permissions.'),
  includeServerPermissions: z.boolean().default(true).describe('Include server-level permissions in results'),
  includeDatabasePermissions: z.boolean().default(true).describe('Include database-level permissions in results'),
  includeObjectPermissions: z.boolean().default(false).describe('Include object-level permissions (can be verbose)'),
});

export const getPermissionsTool = {
  name: 'sqlserver_get_permissions',
  description: 'Retrieve detailed permission information for logins and database users at server, database, and object levels. Shows effective permissions including those inherited from roles. Based on dbatools Get-DbaPermission functionality.',
  inputSchema: getPermissionsInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof getPermissionsInputSchema>) => {
    try {
      const { database, principal, includeServerPermissions, includeDatabasePermissions, includeObjectPermissions } = input;

      let allResults: any[] = [];

      // Get server-level permissions
      if (includeServerPermissions && !database) {
        let serverQuery = `
          SELECT
            'SERVER' AS PermissionLevel,
            sp.name AS PrincipalName,
            sp.type_desc AS PrincipalType,
            perm.state_desc AS PermissionState,
            perm.permission_name AS PermissionName,
            'SERVER' AS ObjectType,
            'SERVER' AS ObjectName,
            '' AS SchemaName
          FROM sys.server_permissions perm
          INNER JOIN sys.server_principals sp ON perm.grantee_principal_id = sp.principal_id
          WHERE perm.class = 100
        `;

        if (principal) {
          serverQuery += ` AND sp.name = '${principal.replace(/'/g, "''")}'`;
        }

        serverQuery += ` ORDER BY sp.name, perm.permission_name`;

        const serverResult = await connectionManager.executeQuery(serverQuery);
        allResults = allResults.concat(serverResult.recordset);
      }

      // Get database-level permissions
      if (includeDatabasePermissions) {
        const targetDatabase = database || (await connectionManager.executeQuery('SELECT DB_NAME() AS CurrentDB')).recordset[0].CurrentDB;

        let dbQuery = `
          USE [${targetDatabase.replace(/'/g, "''")}];
          SELECT
            'DATABASE' AS PermissionLevel,
            dp.name AS PrincipalName,
            dp.type_desc AS PrincipalType,
            perm.state_desc AS PermissionState,
            perm.permission_name AS PermissionName,
            perm.class_desc AS ObjectType,
            CASE
              WHEN perm.class = 0 THEN '${targetDatabase}'
              WHEN perm.class = 1 THEN OBJECT_NAME(perm.major_id)
              WHEN perm.class = 3 THEN SCHEMA_NAME(perm.major_id)
              ELSE CAST(perm.major_id AS VARCHAR)
            END AS ObjectName,
            CASE
              WHEN perm.class = 1 THEN OBJECT_SCHEMA_NAME(perm.major_id)
              ELSE ''
            END AS SchemaName
          FROM sys.database_permissions perm
          INNER JOIN sys.database_principals dp ON perm.grantee_principal_id = dp.principal_id
          WHERE dp.name NOT IN ('public', 'guest')
        `;

        if (principal) {
          dbQuery += ` AND dp.name = '${principal.replace(/'/g, "''")}'`;
        }

        if (!includeObjectPermissions) {
          dbQuery += ` AND perm.class IN (0, 3)`; // Database and schema level only
        }

        dbQuery += ` ORDER BY dp.name, perm.permission_name`;

        const dbResult = await connectionManager.executeQuery(dbQuery);
        allResults = allResults.concat(dbResult.recordset);
      }

      if (allResults.length === 0) {
        return {
          content: [{
            type: 'text' as const,
            text: '⚠️  No permissions found matching the specified criteria.',
          }],
        };
      }

      let response = `Permissions (${allResults.length}):\n\n`;
      response += formatResultsAsTable(allResults);

      // Add summary by principal
      const principalSummary = allResults.reduce((acc: any, perm: any) => {
        const key = perm.PrincipalName;
        if (!acc[key]) {
          acc[key] = { name: key, type: perm.PrincipalType, count: 0 };
        }
        acc[key].count++;
        return acc;
      }, {});

      const summaryArray = Object.values(principalSummary);
      response += `\n\nSummary by Principal:\n`;
      response += formatResultsAsTable(summaryArray.map((s: any) => ({
        Principal: s.name,
        Type: s.type,
        PermissionCount: s.count,
      })));

      return {
        content: [{
          type: 'text' as const,
          text: response,
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
 * Grant Permission Tool
 * Based on dbatools Grant-DbaAgPermission functionality
 * Grants permissions to logins or database users
 */
const grantPermissionInputSchema = z.object({
  principal: z.union([z.string(), z.array(z.string())]).describe('Login or user name(s) to grant permission to'),
  permission: z.union([z.string(), z.array(z.string())]).describe('Permission(s) to grant (e.g., SELECT, INSERT, UPDATE, CONTROL SERVER, VIEW SERVER STATE)'),
  database: z.string().optional().describe('Database name for database-level permissions. If not specified, grants server-level permission.'),
  schema: z.string().optional().describe('Schema name for schema-level permissions'),
  objectName: z.string().optional().describe('Object name (table, view, stored procedure) for object-level permissions'),
  objectType: z.enum(['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION', 'SCHEMA']).optional().describe('Type of database object'),
  withGrantOption: z.boolean().default(false).describe('Allow the principal to grant this permission to others'),
});

export const grantPermissionTool = {
  name: 'sqlserver_grant_permission',
  description: 'Grant permissions to SQL Server logins or database users at server, database, schema, or object level. Supports WITH GRANT OPTION for delegation. Based on dbatools Grant-DbaAgPermission functionality.',
  inputSchema: grantPermissionInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof grantPermissionInputSchema>) => {
    try {
      const { principal, permission, database, schema, objectName, objectType, withGrantOption } = input;

      const principals = Array.isArray(principal) ? principal : [principal];
      const permissions = Array.isArray(permission) ? permission : [permission];

      const results: Array<{
        Principal: string;
        Permission: string;
        Scope: string;
        Status: string;
        Message: string;
      }> = [];

      for (const principalName of principals) {
        for (const permName of permissions) {
          try {
            let grantQuery = '';
            let scope = '';

            if (objectName && database) {
              // Object-level permission
              const objectTypeStr = objectType || 'TABLE';
              const schemaPrefix = schema ? `[${schema.replace(/'/g, "''")}].` : 'dbo.';
              grantQuery = `USE [${database.replace(/'/g, "''")}]; GRANT ${permName} ON ${objectTypeStr}::${schemaPrefix}[${objectName.replace(/'/g, "''")}] TO [${principalName.replace(/'/g, "''")}]`;
              scope = `${database}.${schemaPrefix}${objectName}`;
            } else if (schema && database) {
              // Schema-level permission
              grantQuery = `USE [${database.replace(/'/g, "''")}]; GRANT ${permName} ON SCHEMA::[${schema.replace(/'/g, "''")}] TO [${principalName.replace(/'/g, "''")}]`;
              scope = `${database}.${schema}`;
            } else if (database) {
              // Database-level permission
              grantQuery = `USE [${database.replace(/'/g, "''")}]; GRANT ${permName} TO [${principalName.replace(/'/g, "''")}]`;
              scope = `Database: ${database}`;
            } else {
              // Server-level permission
              grantQuery = `GRANT ${permName} TO [${principalName.replace(/'/g, "''")}]`;
              scope = 'Server';
            }

            if (withGrantOption) {
              grantQuery += ' WITH GRANT OPTION';
            }

            await connectionManager.executeQuery(grantQuery);

            results.push({
              Principal: principalName,
              Permission: permName,
              Scope: scope,
              Status: 'SUCCESS',
              Message: 'Permission granted successfully',
            });

          } catch (error) {
            results.push({
              Principal: principalName,
              Permission: permName,
              Scope: database || 'Server',
              Status: 'FAILED',
              Message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      const successCount = results.filter(r => r.Status === 'SUCCESS').length;
      const failedCount = results.filter(r => r.Status === 'FAILED').length;

      let response = `Grant Permission Results:\n\n`;
      response += `Total: ${results.length}, Success: ${successCount}, Failed: ${failedCount}\n\n`;
      response += formatResultsAsTable(results);

      return {
        content: [{
          type: 'text' as const,
          text: response,
        }],
        isError: failedCount > 0,
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
 * Revoke Permission Tool
 * Based on dbatools Revoke-DbaAgPermission functionality
 * Revokes permissions from logins or database users
 */
const revokePermissionInputSchema = z.object({
  principal: z.union([z.string(), z.array(z.string())]).describe('Login or user name(s) to revoke permission from'),
  permission: z.union([z.string(), z.array(z.string())]).describe('Permission(s) to revoke'),
  database: z.string().optional().describe('Database name for database-level permissions. If not specified, revokes server-level permission.'),
  schema: z.string().optional().describe('Schema name for schema-level permissions'),
  objectName: z.string().optional().describe('Object name for object-level permissions'),
  objectType: z.enum(['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION', 'SCHEMA']).optional().describe('Type of database object'),
  cascade: z.boolean().default(false).describe('Also revoke from principals who received permission through GRANT OPTION'),
});

export const revokePermissionTool = {
  name: 'sqlserver_revoke_permission',
  description: 'Revoke permissions from SQL Server logins or database users. Supports CASCADE option to remove permissions that were granted by the principal. Based on dbatools Revoke-DbaAgPermission functionality.',
  inputSchema: revokePermissionInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof revokePermissionInputSchema>) => {
    try {
      const { principal, permission, database, schema, objectName, objectType, cascade } = input;

      const principals = Array.isArray(principal) ? principal : [principal];
      const permissions = Array.isArray(permission) ? permission : [permission];

      const results: Array<{
        Principal: string;
        Permission: string;
        Scope: string;
        Status: string;
        Message: string;
      }> = [];

      for (const principalName of principals) {
        for (const permName of permissions) {
          try {
            let revokeQuery = '';
            let scope = '';

            if (objectName && database) {
              // Object-level permission
              const objectTypeStr = objectType || 'TABLE';
              const schemaPrefix = schema ? `[${schema.replace(/'/g, "''")}].` : 'dbo.';
              revokeQuery = `USE [${database.replace(/'/g, "''")}]; REVOKE ${permName} ON ${objectTypeStr}::${schemaPrefix}[${objectName.replace(/'/g, "''")}] FROM [${principalName.replace(/'/g, "''")}]`;
              scope = `${database}.${schemaPrefix}${objectName}`;
            } else if (schema && database) {
              // Schema-level permission
              revokeQuery = `USE [${database.replace(/'/g, "''")}]; REVOKE ${permName} ON SCHEMA::[${schema.replace(/'/g, "''")}] FROM [${principalName.replace(/'/g, "''")}]`;
              scope = `${database}.${schema}`;
            } else if (database) {
              // Database-level permission
              revokeQuery = `USE [${database.replace(/'/g, "''")}]; REVOKE ${permName} FROM [${principalName.replace(/'/g, "''")}]`;
              scope = `Database: ${database}`;
            } else {
              // Server-level permission
              revokeQuery = `REVOKE ${permName} FROM [${principalName.replace(/'/g, "''")}]`;
              scope = 'Server';
            }

            if (cascade) {
              revokeQuery += ' CASCADE';
            }

            await connectionManager.executeQuery(revokeQuery);

            results.push({
              Principal: principalName,
              Permission: permName,
              Scope: scope,
              Status: 'SUCCESS',
              Message: 'Permission revoked successfully',
            });

          } catch (error) {
            results.push({
              Principal: principalName,
              Permission: permName,
              Scope: database || 'Server',
              Status: 'FAILED',
              Message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      const successCount = results.filter(r => r.Status === 'SUCCESS').length;
      const failedCount = results.filter(r => r.Status === 'FAILED').length;

      let response = `Revoke Permission Results:\n\n`;
      response += `Total: ${results.length}, Success: ${successCount}, Failed: ${failedCount}\n\n`;
      response += formatResultsAsTable(results);

      return {
        content: [{
          type: 'text' as const,
          text: response,
        }],
        isError: failedCount > 0,
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
 * Deny Permission Tool
 * Explicitly denies permissions to logins or database users
 */
const denyPermissionInputSchema = z.object({
  principal: z.union([z.string(), z.array(z.string())]).describe('Login or user name(s) to deny permission to'),
  permission: z.union([z.string(), z.array(z.string())]).describe('Permission(s) to deny'),
  database: z.string().optional().describe('Database name for database-level permissions. If not specified, denies server-level permission.'),
  schema: z.string().optional().describe('Schema name for schema-level permissions'),
  objectName: z.string().optional().describe('Object name for object-level permissions'),
  objectType: z.enum(['TABLE', 'VIEW', 'PROCEDURE', 'FUNCTION', 'SCHEMA']).optional().describe('Type of database object'),
  cascade: z.boolean().default(false).describe('Also deny to principals who received permission through GRANT OPTION'),
});

export const denyPermissionTool = {
  name: 'sqlserver_deny_permission',
  description: 'Explicitly deny permissions to SQL Server logins or database users. DENY takes precedence over GRANT, preventing access even if granted through role membership. Use carefully as it overrides all grants.',
  inputSchema: denyPermissionInputSchema,
  annotations: {
    readOnlyHint: false,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof denyPermissionInputSchema>) => {
    try {
      const { principal, permission, database, schema, objectName, objectType, cascade } = input;

      const principals = Array.isArray(principal) ? principal : [principal];
      const permissions = Array.isArray(permission) ? permission : [permission];

      const results: Array<{
        Principal: string;
        Permission: string;
        Scope: string;
        Status: string;
        Message: string;
      }> = [];

      for (const principalName of principals) {
        for (const permName of permissions) {
          try {
            let denyQuery = '';
            let scope = '';

            if (objectName && database) {
              // Object-level permission
              const objectTypeStr = objectType || 'TABLE';
              const schemaPrefix = schema ? `[${schema.replace(/'/g, "''")}].` : 'dbo.';
              denyQuery = `USE [${database.replace(/'/g, "''")}]; DENY ${permName} ON ${objectTypeStr}::${schemaPrefix}[${objectName.replace(/'/g, "''")}] TO [${principalName.replace(/'/g, "''")}]`;
              scope = `${database}.${schemaPrefix}${objectName}`;
            } else if (schema && database) {
              // Schema-level permission
              denyQuery = `USE [${database.replace(/'/g, "''")}]; DENY ${permName} ON SCHEMA::[${schema.replace(/'/g, "''")}] TO [${principalName.replace(/'/g, "''")}]`;
              scope = `${database}.${schema}`;
            } else if (database) {
              // Database-level permission
              denyQuery = `USE [${database.replace(/'/g, "''")}]; DENY ${permName} TO [${principalName.replace(/'/g, "''")}]`;
              scope = `Database: ${database}`;
            } else {
              // Server-level permission
              denyQuery = `DENY ${permName} TO [${principalName.replace(/'/g, "''")}]`;
              scope = 'Server';
            }

            if (cascade) {
              denyQuery += ' CASCADE';
            }

            await connectionManager.executeQuery(denyQuery);

            results.push({
              Principal: principalName,
              Permission: permName,
              Scope: scope,
              Status: 'SUCCESS',
              Message: 'Permission denied successfully',
            });

          } catch (error) {
            results.push({
              Principal: principalName,
              Permission: permName,
              Scope: database || 'Server',
              Status: 'FAILED',
              Message: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      const successCount = results.filter(r => r.Status === 'SUCCESS').length;
      const failedCount = results.filter(r => r.Status === 'FAILED').length;

      let response = `Deny Permission Results:\n\n`;
      response += `Total: ${results.length}, Success: ${successCount}, Failed: ${failedCount}\n\n`;
      response += formatResultsAsTable(results);

      if (successCount > 0) {
        response += `\n⚠️  Warning: DENY takes precedence over GRANT. These principals cannot access the resource even if granted through role membership.`;
      }

      return {
        content: [{
          type: 'text' as const,
          text: response,
        }],
        isError: failedCount > 0,
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

