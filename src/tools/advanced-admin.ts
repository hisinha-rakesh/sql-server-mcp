import { z } from 'zod';
import { ConnectionManager } from '../connection.js';
import { formatError } from '../utils/errors.js';
import { formatResultsAsTable } from '../utils/formatters.js';

// Helper function to generate random password
function generateRandomPassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  let password = '';
  for (let i = 0; i < 16; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// Input schemas
const detectOrphanLoginsInputSchema = z.object({
  databaseName: z.string().optional().describe('Specific database to check (if not specified, checks current database)'),
});

const fixOrphanLoginInputSchema = z.object({
  userName: z.string().min(1).describe('Database user name to fix'),
  loginName: z.string().optional().describe('SQL Server login name to map to (if different from userName)'),
  autoCreate: z.boolean().optional().describe('Automatically create login if it does not exist (default: false)'),
});

const createLinkedServerInputSchema = z.object({
  serverName: z.string().min(1).describe('Linked server name'),
  dataSource: z.string().min(1).describe('Network name or IP address of the server'),
  providerName: z.string().optional().describe('OLE DB provider name (default: SQLNCLI for SQL Server)'),
  productName: z.string().optional().describe('Product name of the data source (default: SQL Server)'),
  catalog: z.string().optional().describe('Default catalog/database name'),
  useRemoteLogin: z.boolean().optional().describe('Use remote login mapping (default: false)'),
  remoteUser: z.string().optional().describe('Remote user name for login mapping'),
  remotePassword: z.string().optional().describe('Remote password for login mapping'),
});

const dropLinkedServerInputSchema = z.object({
  serverName: z.string().min(1).describe('Linked server name to drop'),
  dropLogins: z.boolean().optional().describe('Also drop associated logins (default: true)'),
});

const listLinkedServersInputSchema = z.object({});

const testLinkedServerInputSchema = z.object({
  serverName: z.string().min(1).describe('Linked server name to test'),
});

const setupReplicationInputSchema = z.object({
  replicationType: z.enum(['TRANSACTIONAL', 'MERGE', 'SNAPSHOT']).describe('Type of replication to set up'),
  publicationName: z.string().min(1).describe('Publication name'),
  publisherServer: z.string().optional().describe('Publisher server name (default: current server)'),
  publisherDatabase: z.string().min(1).describe('Publisher database name'),
  articles: z.array(z.object({
    tableName: z.string().min(1).describe('Table name to include in publication'),
    schema: z.string().optional().describe('Schema name (default: dbo)'),
  })).min(1).describe('Tables to include in the publication'),
});

const createSubscriptionInputSchema = z.object({
  publicationName: z.string().min(1).describe('Publication name to subscribe to'),
  publisherServer: z.string().min(1).describe('Publisher server name'),
  publisherDatabase: z.string().min(1).describe('Publisher database name'),
  subscriberDatabase: z.string().min(1).describe('Subscriber database name'),
  subscriptionType: z.enum(['PUSH', 'PULL']).describe('Subscription type'),
});

const listReplicationsInputSchema = z.object({});

/**
 * Detect orphan logins (database users without corresponding SQL Server logins)
 */
export const detectOrphanLoginsTool = {
  name: 'sqlserver_detect_orphan_logins',
  description: 'Detect orphan database users (users without corresponding SQL Server logins). Orphan users occur after database restore or when logins are deleted.',
  inputSchema: detectOrphanLoginsInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof detectOrphanLoginsInputSchema>) => {
    try {
      // Query to find orphan users
      const query = `
        SELECT
          dp.name AS UserName,
          dp.type_desc AS UserType,
          dp.create_date AS CreateDate,
          dp.modify_date AS ModifyDate,
          CASE
            WHEN dp.sid IS NOT NULL AND NOT EXISTS (
              SELECT 1 FROM sys.server_principals sp WHERE sp.sid = dp.sid
            ) THEN 'ORPHAN'
            ELSE 'OK'
          END AS Status
        FROM sys.database_principals dp
        WHERE dp.type IN ('S', 'U', 'G')  -- SQL user, Windows user, Windows group
          AND dp.name NOT IN ('dbo', 'guest', 'INFORMATION_SCHEMA', 'sys', 'public')
          AND dp.sid IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM sys.server_principals sp WHERE sp.sid = dp.sid
          )
        ORDER BY dp.name
      `;

      const result = await connectionManager.executeQuery(query);
      const orphans = result.recordset;

      if (orphans.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: '✓ No orphan logins detected\n\nAll database users have corresponding SQL Server logins.',
            },
          ],
        };
      }

      let response = `⚠️ Found ${orphans.length} orphan login(s)\n\n`;
      response += 'Orphan users (database users without SQL Server logins):\n\n';
      response += formatResultsAsTable(orphans);
      response += '\n\nTo fix orphan logins, use the sqlserver_fix_orphan_login tool.';

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
 * Fix orphan login by remapping to existing login or creating new login
 */
export const fixOrphanLoginTool = {
  name: 'sqlserver_fix_orphan_login',
  description: 'Fix orphan database user by remapping to an existing SQL Server login or creating a new login.',
  inputSchema: fixOrphanLoginInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof fixOrphanLoginInputSchema>) => {
    try {
      const loginName = input.loginName || input.userName;
      let response = '';

      // Check if login exists
      const checkLoginQuery = `
        SELECT name FROM sys.server_principals
        WHERE name = @loginName AND type IN ('S', 'U', 'G')
      `;
      const loginCheck = await connectionManager.executeQuery(checkLoginQuery, { loginName });

      if (loginCheck.recordset.length === 0) {
        if (input.autoCreate) {
          // Create login with random password (user should change it)
          const createLoginQuery = `
            CREATE LOGIN [${loginName}] WITH PASSWORD = N'${generateRandomPassword()}',
            CHECK_POLICY = OFF, CHECK_EXPIRATION = OFF
          `;
          await connectionManager.executeQuery(createLoginQuery);
          response += `✓ Created new SQL Server login: ${loginName}\n`;
          response += `⚠️ IMPORTANT: Login created with random password. Please reset the password!\n\n`;
        } else {
          return {
            content: [
              {
                type: 'text' as const,
                text: `Error: SQL Server login '${loginName}' does not exist.\n\n` +
                  `Options:\n` +
                  `1. Set autoCreate=true to create the login automatically\n` +
                  `2. Create the login manually first\n` +
                  `3. Specify a different loginName that exists`,
              },
            ],
            isError: true,
          };
        }
      }

      // Remap the orphan user to the login using sp_change_users_login
      const remapQuery = `EXEC sp_change_users_login 'Update_One', @userName, @loginName`;
      await connectionManager.executeQuery(remapQuery, {
        userName: input.userName,
        loginName,
      });

      response += `✓ Successfully remapped orphan user\n\n`;
      response += `User: ${input.userName}\n`;
      response += `Mapped to login: ${loginName}\n`;
      response += `\nThe database user can now access the database using the SQL Server login.`;

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
 * Create a linked server
 */
export const createLinkedServerTool = {
  name: 'sqlserver_create_linked_server',
  description: 'Create a linked server to connect to remote SQL Server or other data sources. Enables distributed queries and remote procedure execution.',
  inputSchema: createLinkedServerInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof createLinkedServerInputSchema>) => {
    try {
      const providerName = input.providerName || 'SQLNCLI';
      const productName = input.productName || 'SQL Server';

      // Create linked server
      let query = `
        EXEC sp_addlinkedserver
          @server = @serverName,
          @srvproduct = @productName,
          @provider = @providerName,
          @datasrc = @dataSource
      `;

      if (input.catalog) {
        query += `, @catalog = @catalog`;
      }

      const params: Record<string, any> = {
        serverName: input.serverName,
        productName,
        providerName,
        dataSource: input.dataSource,
      };

      if (input.catalog) {
        params.catalog = input.catalog;
      }

      await connectionManager.executeQuery(query, params);

      let response = `✓ Linked server created successfully\n\n`;
      response += `Server Name: ${input.serverName}\n`;
      response += `Data Source: ${input.dataSource}\n`;
      response += `Provider: ${providerName}\n`;

      // Configure login mapping if provided
      if (input.useRemoteLogin && input.remoteUser && input.remotePassword) {
        const loginQuery = `
          EXEC sp_addlinkedsrvlogin
            @rmtsrvname = @serverName,
            @useself = 'FALSE',
            @rmtuser = @remoteUser,
            @rmtpassword = @remotePassword
        `;

        await connectionManager.executeQuery(loginQuery, {
          serverName: input.serverName,
          remoteUser: input.remoteUser,
          remotePassword: input.remotePassword,
        });

        response += `\n✓ Remote login mapping configured`;
      }

      response += `\n\nYou can now query the linked server using four-part names:\n`;
      response += `SELECT * FROM [${input.serverName}].[DatabaseName].[Schema].[TableName]`;

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
 * Drop a linked server
 */
export const dropLinkedServerTool = {
  name: 'sqlserver_drop_linked_server',
  description: 'Drop (remove) an existing linked server and optionally its associated logins.',
  inputSchema: dropLinkedServerInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof dropLinkedServerInputSchema>) => {
    try {
      const dropLogins = input.dropLogins !== false; // Default to true

      const query = `
        EXEC sp_dropserver
          @server = @serverName,
          @droplogins = @dropLogins
      `;

      await connectionManager.executeQuery(query, {
        serverName: input.serverName,
        dropLogins: dropLogins ? 'droplogins' : null,
      });

      return {
        content: [
          {
            type: 'text' as const,
            text: `✓ Linked server dropped successfully\n\n` +
              `Server Name: ${input.serverName}\n` +
              `Logins Dropped: ${dropLogins ? 'Yes' : 'No'}`,
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
 * List all linked servers
 */
export const listLinkedServersTool = {
  name: 'sqlserver_list_linked_servers',
  description: 'List all configured linked servers with their connection details.',
  inputSchema: listLinkedServersInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager) => {
    try {
      const query = `
        SELECT
          s.name AS ServerName,
          s.product AS Product,
          s.provider AS Provider,
          s.data_source AS DataSource,
          s.catalog AS Catalog,
          s.is_remote_login_enabled AS IsRemoteLoginEnabled,
          s.is_rpc_out_enabled AS IsRPCOutEnabled,
          s.is_data_access_enabled AS IsDataAccessEnabled,
          s.modify_date AS ModifyDate
        FROM sys.servers s
        WHERE s.is_linked = 1
        ORDER BY s.name
      `;

      const result = await connectionManager.executeQuery(query);
      const servers = result.recordset;

      if (servers.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No linked servers configured.',
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Linked Servers (${servers.length}):\n\n` + formatResultsAsTable(servers),
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
 * Test linked server connection
 */
export const testLinkedServerTool = {
  name: 'sqlserver_test_linked_server',
  description: 'Test connectivity to a linked server by executing a simple query.',
  inputSchema: testLinkedServerInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof testLinkedServerInputSchema>) => {
    try {
      const startTime = Date.now();

      // Test connection with a simple query
      const query = `SELECT @@SERVERNAME AS RemoteServerName FROM [${input.serverName}].master.sys.objects WHERE 1=0`;

      await connectionManager.executeQuery(query);

      const executionTime = Date.now() - startTime;

      return {
        content: [
          {
            type: 'text' as const,
            text: `✓ Linked server connection successful\n\n` +
              `Server: ${input.serverName}\n` +
              `Response Time: ${executionTime}ms\n\n` +
              `The linked server is accessible and ready for queries.`,
          },
        ],
      };
    } catch (error) {
      return {
        content: [
          {
            type: 'text' as const,
            text: `✗ Linked server connection failed\n\n` +
              `Server: ${input.serverName}\n\n` +
              formatError(error) +
              `\n\nTroubleshooting:\n` +
              `1. Verify the linked server exists (use sqlserver_list_linked_servers)\n` +
              `2. Check network connectivity to the remote server\n` +
              `3. Verify login mappings are configured correctly\n` +
              `4. Ensure the remote server allows remote connections`,
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Setup SQL Server replication
 */
export const setupReplicationTool = {
  name: 'sqlserver_setup_replication',
  description: 'Set up SQL Server replication (Transactional, Merge, or Snapshot) by creating a publication with specified articles.',
  inputSchema: setupReplicationInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof setupReplicationInputSchema>) => {
    try {
      let response = `Setting up ${input.replicationType} replication...\n\n`;

      // Enable database for replication
      const enableDbQuery = `
        USE [${input.publisherDatabase}];
        EXEC sp_replicationdboption
          @dbname = @dbname,
          @optname = 'publish',
          @value = 'true'
      `;

      await connectionManager.executeQuery(enableDbQuery, { dbname: input.publisherDatabase });
      response += `✓ Enabled database for replication\n`;

      // Create publication
      const replType = input.replicationType === 'TRANSACTIONAL' ? 'tran' :
                       input.replicationType === 'MERGE' ? 'merge' : 'snapshot';

      const createPubQuery = `
        USE [${input.publisherDatabase}];
        EXEC sp_addpublication
          @publication = @publication,
          @description = @description,
          @sync_method = 'concurrent',
          @retention = 0,
          @allow_push = 'true',
          @allow_pull = 'true',
          @allow_anonymous = 'false',
          @enabled_for_internet = 'false',
          @snapshot_in_defaultfolder = 'true',
          @compress_snapshot = 'false',
          @ftp_port = 21,
          @allow_subscription_copy = 'false',
          @add_to_active_directory = 'false',
          @repl_freq = 'continuous',
          @status = 'active',
          @independent_agent = 'true',
          @immediate_sync = 'false',
          @allow_sync_tran = 'false',
          @allow_queued_tran = 'false',
          @allow_dts = 'false',
          @replicate_ddl = 1
      `;

      await connectionManager.executeQuery(createPubQuery, {
        publication: input.publicationName,
        description: `${input.replicationType} publication - ${input.publicationName}`,
      });

      response += `✓ Created publication: ${input.publicationName}\n`;

      // Add articles (tables) to publication
      for (const article of input.articles) {
        const schema = article.schema || 'dbo';
        const articleName = `${schema}_${article.tableName}`;

        const addArticleQuery = `
          USE [${input.publisherDatabase}];
          EXEC sp_addarticle
            @publication = @publication,
            @article = @article,
            @source_owner = @sourceOwner,
            @source_object = @sourceObject,
            @type = 'logbased',
            @description = null,
            @creation_script = null,
            @pre_creation_cmd = 'drop',
            @schema_option = 0x000000000803509F,
            @identityrangemanagementoption = 'manual',
            @destination_table = @sourceObject,
            @destination_owner = @sourceOwner
        `;

        await connectionManager.executeQuery(addArticleQuery, {
          publication: input.publicationName,
          article: articleName,
          sourceOwner: schema,
          sourceObject: article.tableName,
        });

        response += `✓ Added article: ${schema}.${article.tableName}\n`;
      }

      response += `\n✓ Replication setup completed successfully\n\n`;
      response += `Publication: ${input.publicationName}\n`;
      response += `Type: ${input.replicationType}\n`;
      response += `Database: ${input.publisherDatabase}\n`;
      response += `Articles: ${input.articles.length}\n\n`;
      response += `Next steps:\n`;
      response += `1. Create a snapshot agent job\n`;
      response += `2. Create subscriptions using sqlserver_create_subscription\n`;
      response += `3. Start the snapshot agent to initialize replication`;

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
            text: `Error setting up replication:\n\n${formatError(error)}\n\n` +
              `Common issues:\n` +
              `1. SQL Server Agent must be running\n` +
              `2. Distributor must be configured (sp_adddistributor)\n` +
              `3. User must have appropriate permissions\n` +
              `4. Tables must have primary keys for transactional replication`,
          },
        ],
        isError: true,
      };
    }
  },
};

/**
 * Create a replication subscription
 */
export const createSubscriptionTool = {
  name: 'sqlserver_create_subscription',
  description: 'Create a subscription to a replication publication. Supports both push and pull subscriptions.',
  inputSchema: createSubscriptionInputSchema,
  annotations: {
    destructiveHint: true,
  },
  handler: async (connectionManager: ConnectionManager, input: z.infer<typeof createSubscriptionInputSchema>) => {
    try {
      const isPush = input.subscriptionType === 'PUSH';

      const query = `
        USE [${input.publisherDatabase}];
        EXEC sp_addsubscription
          @publication = @publication,
          @subscriber = @subscriber,
          @destination_db = @destinationDb,
          @subscription_type = @subType,
          @sync_type = 'automatic',
          @article = 'all',
          @update_mode = 'read only',
          @subscriber_type = 0
      `;

      await connectionManager.executeQuery(query, {
        publication: input.publicationName,
        subscriber: input.publisherServer, // For simplicity, using same server
        destinationDb: input.subscriberDatabase,
        subType: isPush ? 'push' : 'pull',
      });

      let response = `✓ Subscription created successfully\n\n`;
      response += `Publication: ${input.publicationName}\n`;
      response += `Publisher: ${input.publisherServer}\n`;
      response += `Publisher Database: ${input.publisherDatabase}\n`;
      response += `Subscriber Database: ${input.subscriberDatabase}\n`;
      response += `Type: ${input.subscriptionType}\n\n`;

      if (isPush) {
        response += `Push subscription created. The distribution agent runs at the distributor.`;
      } else {
        response += `Pull subscription created. The distribution agent must be configured to run at the subscriber.`;
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

/**
 * List all replication publications
 */
export const listReplicationsTool = {
  name: 'sqlserver_list_replications',
  description: 'List all replication publications configured on the server.',
  inputSchema: listReplicationsInputSchema,
  annotations: {
    readOnlyHint: true,
  },
  handler: async (connectionManager: ConnectionManager) => {
    try {
      const query = `
        SELECT
          p.name AS PublicationName,
          p.description AS Description,
          CASE p.repl_freq
            WHEN 0 THEN 'Transactional'
            WHEN 1 THEN 'Snapshot'
            ELSE 'Unknown'
          END AS ReplicationType,
          p.status AS Status,
          DB_NAME() AS DatabaseName,
          COUNT(a.article_id) AS ArticleCount
        FROM syspublications p
        LEFT JOIN sysarticles a ON p.pubid = a.pubid
        GROUP BY p.name, p.description, p.repl_freq, p.status
        ORDER BY p.name
      `;

      const result = await connectionManager.executeQuery(query);
      const publications = result.recordset;

      if (publications.length === 0) {
        return {
          content: [
            {
              type: 'text' as const,
              text: 'No replication publications configured in the current database.',
            },
          ],
        };
      }

      return {
        content: [
          {
            type: 'text' as const,
            text: `Replication Publications (${publications.length}):\n\n` + formatResultsAsTable(publications),
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
