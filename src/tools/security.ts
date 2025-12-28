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
