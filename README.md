# SQL Server MCP Server

A Model Context Protocol (MCP) server that provides LLMs with comprehensive access to SQL Server databases, supporting both Windows Authentication (on-premises) and Microsoft Entra ID authentication (Azure SQL Database).

## Features

- **Dual Authentication Support**
  - Windows Authentication for on-premises SQL Server
  - Microsoft Entra ID (Azure AD) authentication for Azure SQL Database (6 auth methods)

- **Comprehensive SQL Operations** (55 Tools Total)
  - Execute SELECT queries with pagination
  - Execute INSERT/UPDATE/DELETE statements
  - Execute stored procedures with parameters
  - Run batch operations

- **✨ Transaction Management** (NEW)
  - Begin/Commit/Rollback transactions with isolation levels
  - Execute multiple statements in a single transaction
  - Automatic rollback on errors

- **✨ Bulk Operations** (NEW)
  - Efficient bulk insert with batching
  - Insert thousands of rows with optimal performance

- **✨ DDL Operations** (NEW)
  - Create/drop/alter tables
  - Truncate tables
  - Create/drop indexes
  - Full schema management

- **✨ File and Filegroup Management** (NEW)
  - Add/remove/modify database files (MDF/NDF)
  - Create and manage filegroups for data organization
  - Shrink database files to reclaim space
  - List filegroups and files with detailed information
  - Distribute data across multiple files and file groups
  - Equivalent to dbatools Add-DbaDbFile functionality

- **Schema Discovery**
  - List databases, tables, columns, and stored procedures
  - Get detailed table metadata including indexes and foreign keys

- **Server Administration**
  - Get SQL Server version and configuration
  - Monitor database size and connections

- **✨ Advanced Administration** (NEW)
  - Detect and fix orphan database logins
  - Manage linked servers for distributed queries
  - Configure SQL Server replication (transactional, merge, snapshot)
  - Test linked server connectivity

- **✨ SQL Server Agent Automation** (NEW)
  - List, create, start, stop, and manage SQL Server Agent jobs
  - View job execution history and schedules
  - Check SQL Server Agent service status
  - ⭐ **Maintenance Plan Wizard Guidance** - Get comprehensive best practice guidance for configuring database backups and maintenance using SQL Server Maintenance Plan Wizard (RECOMMENDED for production environments)
- **✨ Performance Monitoring** (NEW)
  - Monitor CPU usage by session with SPID to KPID correlation
  - Identify top CPU-consuming queries from plan cache
  - Analyze wait statistics to diagnose performance bottlenecks
  - Track query execution metrics and resource consumption
  - Inspired by dbatools Get-DbaCpuUsage PowerShell cmdlet

- **✨ Backup and Restore** (NEW)
  - Full, Differential, and Transaction Log backups with dbatools Backup-DbaDatabase features
  - Backup compression and encryption (AES128, AES192, AES256, TRIPLEDES)
  - Azure blob storage support with credential-based and SAS authentication
  - Backup striping across multiple files/paths for improved performance
  - Checksum verification and RESTORE VERIFYONLY validation
  - Copy-only backups for ad-hoc scenarios
  - Comprehensive backup history with filtering and search
  - Dynamic file naming with tokens (database, timestamp, server, instance, backup type)
  - Advanced options: MaxTransferSize, BufferCount, BlockSize tuning

- **✨ Security and Role Management** (NEW)
  - Add/remove logins and roles to server-level roles (dbatools Add-DbaServerRoleMember)
  - Support for both fixed roles (sysadmin, dbcreator, etc.) and custom roles
  - Role nesting for hierarchical permission structures
  - Bulk operations for multiple logins/roles
  - Create and drop custom server roles
  - List all server roles with their members
  - Complete role-based access control (RBAC) management

- **Built-in Safety**
  - Parameterized queries to prevent SQL injection
  - Tool annotations for read-only and destructive operations
  - Actionable error messages with troubleshooting guidance

## Prerequisites

- Node.js 18 or higher
- SQL Server (on-premises) or Azure SQL Database
- Appropriate database access permissions

### For Windows Authentication
- Windows-based environment
- SQL Server configured for Windows Authentication
- Account with SQL Server login

### For Entra ID Authentication
- Azure SQL Database
- Managed identity or service principal configured
- Database user mapped to the identity

## Installation

1. Clone or download this repository

2. Install dependencies:
```bash
npm install

3. Copy `.env.example` to `.env` and configure:
```bash
cp .env.example .env

4. Edit `.env` with your SQL Server connection details:

### Windows Authentication Example
```env
SQL_AUTH_TYPE=windows
SQL_SERVER=localhost
SQL_DATABASE=master
SQL_TRUSTED_CONNECTION=true

### Entra ID Authentication Example
```env
SQL_AUTH_TYPE=entra
SQL_SERVER=myserver.database.windows.net
SQL_DATABASE=mydatabase
SQL_ENTRA_AUTH_TYPE=azure-active-directory-default

5. Build the project:
```bash
npm run build

## Usage

### Running the Server

#### Development Mode
```bash
npm run dev

#### Production Mode
```bash
npm start

### Testing with MCP Inspector

The MCP Inspector is a great tool for testing your server:

```bash
npm run inspect

This will open an interactive interface where you can:
- View all available tools
- Test tool calls with different parameters
- Inspect responses and errors

### Connecting from Claude Desktop

Add this server to your Claude Desktop configuration file:

**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "sql-server": {
      "command": "node",
      "args": ["C:\\path\\to\\sql-server-mcp\\dist\\index.js"],
      "env": {
        "SQL_AUTH_TYPE": "windows",
        "SQL_SERVER": "localhost",
        "SQL_DATABASE": "master",
        "SQL_TRUSTED_CONNECTION": "true"
      }
    }
  }
}

## Available Tools (55 Total)

### Connection Management
- **sqlserver_test_connection** - Test database connectivity and verify authentication

### Query Operations
- **sqlserver_execute_query** - Execute SELECT queries with pagination support
- **sqlserver_execute_non_query** - Execute INSERT/UPDATE/DELETE statements
- **sqlserver_execute_stored_procedure** - Execute stored procedures with parameters
- **sqlserver_execute_batch** - Execute multiple statements as a batch

### Transaction Management ✨ NEW
- **sqlserver_begin_transaction** - Begin a new database transaction with optional isolation level
- **sqlserver_commit_transaction** - Commit the current transaction
- **sqlserver_rollback_transaction** - Rollback the current transaction
- **sqlserver_execute_in_transaction** - Execute multiple statements in a single transaction

### Bulk Operations ✨ NEW
- **sqlserver_bulk_insert** - Insert multiple rows efficiently with batching support

### DDL (Data Definition Language) ✨ NEW
- **sqlserver_create_table** - Create a new table with columns and constraints
- **sqlserver_drop_table** - Drop (delete) an existing table
- **sqlserver_alter_table** - Modify table structure (add/drop columns, constraints)
- **sqlserver_truncate_table** - Remove all rows from a table quickly
- **sqlserver_create_index** - Create an index to improve query performance
- **sqlserver_drop_index** - Drop an existing index

### File and Filegroup Management ✨ NEW
- **sqlserver_add_database_file** - Add a new data file (.mdf or .ndf) to an existing filegroup with configurable size and growth settings
- **sqlserver_remove_database_file** - Remove a data file from the database (automatically empties and deletes physical file)
- **sqlserver_modify_database_file** - Modify file properties including size, max size, growth increment, or physical path
- **sqlserver_shrink_database_file** - Shrink a database file using DBCC SHRINKFILE to reclaim unused space
- **sqlserver_create_filegroup** - Create a new filegroup (standard, FILESTREAM, or memory-optimized) for data organization
- **sqlserver_remove_filegroup** - Remove an empty filegroup from the database
- **sqlserver_modify_filegroup** - Modify filegroup properties (set as default or read-only)
- **sqlserver_list_filegroups** - List all filegroups with file details, sizes, and usage statistics
- **sqlserver_list_database_files** - List all database files (data and log) with detailed size and growth information

### Schema Discovery
- **sqlserver_list_databases** - List all databases on the server
- **sqlserver_list_tables** - List tables in the database
- **sqlserver_list_columns** - Get detailed column information for a table
- **sqlserver_list_stored_procedures** - List stored procedures
- **sqlserver_get_table_info** - Get comprehensive table metadata

### Administration
- **sqlserver_get_server_info** - Get SQL Server version and configuration
- **sqlserver_get_database_size** - Get database size information
- **sqlserver_get_current_connections** - View active database connections

### Advanced Administration ✨ NEW
- **sqlserver_detect_orphan_logins** - Detect orphan database users (users without SQL Server logins)
- **sqlserver_fix_orphan_login** - Fix orphan login by remapping or creating new login
- **sqlserver_create_linked_server** - Create a linked server for distributed queries
- **sqlserver_drop_linked_server** - Drop (delete) a linked server
- **sqlserver_list_linked_servers** - List all linked servers configured on the server
- **sqlserver_test_linked_server** - Test connectivity and query execution on a linked server
- **sqlserver_setup_replication** - Configure SQL Server replication (transactional, merge, or snapshot)
- **sqlserver_create_subscription** - Create a subscription for replication (push or pull)
- **sqlserver_list_replications** - List all publications and their articles

### SQL Server Agent ✨ NEW
- **sqlserver_list_agent_jobs** - List all SQL Server Agent jobs with status and schedule information
- **sqlserver_get_job_details** - Get detailed information about a specific job including steps and schedules
- **sqlserver_get_job_history** - Get execution history for a job
- **sqlserver_start_job** - Start execution of a SQL Server Agent job
- **sqlserver_stop_job** - Stop execution of a running job
- **sqlserver_toggle_job** - Enable or disable a job
- **sqlserver_create_job** - Create a new job with a T-SQL step
- **sqlserver_delete_job** - Delete a job (WARNING: permanent deletion)
- **sqlserver_list_job_schedules** - List all job schedules
- **sqlserver_get_agent_status** - Check if SQL Server Agent service is running
- **sqlserver_maintenance_plan_guidance** ⭐ - Get comprehensive guidance on using SQL Server Maintenance Plan Wizard for configuring backups, integrity checks, index maintenance, and other routine maintenance tasks. **RECOMMENDED** for production environments.


### Performance Monitoring ✨ NEW
- **sqlserver_get_cpu_usage** - Correlates SQL Server sessions (SPIDs) with Windows threads (KPIDs) to identify which queries are consuming CPU resources. Shows CPU percentage, session/request metrics, wait types, and query text. Supports threshold filtering and optional system process inclusion. Inspired by dbatools Get-DbaCpuUsage.
- **sqlserver_get_top_cpu_queries** - Get the top CPU-consuming queries from the query plan cache. Shows total/average/min/max CPU time, execution counts, query text, and database name. Useful for identifying queries that should be optimized.
- **sqlserver_get_wait_stats** - Get SQL Server wait statistics showing what the server is waiting on. Helps identify performance bottlenecks by analyzing wait types (locks, I/O, CPU, etc.), wait times, and percentages. Filters out benign wait types automatically.

### Backup and Restore ✨ NEW
- **sqlserver_backup_database** - Create Full, Differential, or Transaction Log backups with enterprise features including compression, encryption (AES128/192/256, TRIPLEDES), checksum verification, and Azure blob storage support. Supports backup striping across multiple files/paths, copy-only backups, dynamic file naming with tokens, and performance tuning (MaxTransferSize, BufferCount, BlockSize). Based on dbatools Backup-DbaDatabase functionality.
- **sqlserver_list_backup_history** - List backup history from msdb with comprehensive details including backup type, size, duration, compression ratio, encryption status, and file locations. Filter by database, backup type, and date range. Based on dbatools Get-DbaDbBackupHistory functionality.
- **sqlserver_verify_backup** - Verify backup file integrity using RESTORE VERIFYONLY without actually restoring the database. Returns backup metadata including database name, backup type, date, compression status, encryption algorithm, and file list. Supports both local and Azure blob storage backups.
- **sqlserver_list_backup_devices** - List all backup devices configured on the SQL Server instance, including permanent backup devices and their physical locations (disk, tape, pipe, virtual device).

### Security and Role Management ✨ NEW
- **sqlserver_add_server_role_member** - Add logins or server roles to server-level roles. Supports both built-in roles (sysadmin, dbcreator, securityadmin, serveradmin, setupadmin, processadmin, diskadmin, bulkadmin, public) and custom server roles. Can add individual logins or nest roles for role-based access control hierarchies. Bulk operations supported for adding multiple logins/roles to multiple server roles simultaneously. Based on dbatools Add-DbaServerRoleMember functionality.
- **sqlserver_remove_server_role_member** - Remove logins or server roles from server-level roles. Supports removing multiple members from multiple roles in a single operation. Essential for revoking server-level permissions and managing role memberships. Based on dbatools Remove-DbaServerRoleMember functionality.
- **sqlserver_list_server_roles** - List all server-level roles with their members, owners, and metadata. Shows both fixed server roles and custom roles. Optionally include or exclude role membership details. Filter by specific role names. Based on dbatools Get-DbaServerRole functionality.
- **sqlserver_create_server_role** - Create new custom server-level roles for implementing role-based access control. Custom roles allow you to group permissions and assign them to multiple logins without granting individual permissions. Optionally specify role owner. Based on dbatools New-DbaServerRole functionality.
- **sqlserver_drop_server_role** - Drop (delete) custom server-level roles. Cannot drop fixed server roles. All members must be removed before dropping a role. Use with caution as this permanently removes the role and its permissions.

## Authentication Setup

### Windows Authentication

Windows Authentication uses your Windows credentials to connect to SQL Server.

**Requirements:**
- Windows environment
- SQL Server configured for Windows Authentication mode
- Windows account with SQL Server login permissions

**Configuration:**
```env
SQL_AUTH_TYPE=windows
SQL_SERVER=localhost
SQL_DATABASE=yourdb
SQL_TRUSTED_CONNECTION=true

### Microsoft Entra ID Authentication

Entra ID (formerly Azure AD) authentication is supported for Azure SQL Database.

**Supported Authentication Methods:**

1. **Default / Managed Identity** (Recommended for Azure-hosted apps)
```env
SQL_ENTRA_AUTH_TYPE=azure-active-directory-default

2. **Username/Password**
```env
SQL_ENTRA_AUTH_TYPE=azure-active-directory-password
SQL_USERNAME=user@domain.com
SQL_PASSWORD=yourpassword

3. **Service Principal**
```env
SQL_ENTRA_AUTH_TYPE=azure-active-directory-service-principal-secret
SQL_CLIENT_ID=your-client-id
SQL_CLIENT_SECRET=your-client-secret
SQL_TENANT_ID=your-tenant-id

**Setting up Entra ID Authentication:**

1. Create a managed identity or service principal in Azure
2. Grant the identity access to your Azure SQL Database:
```sql
CREATE USER [your-managed-identity-name] FROM EXTERNAL PROVIDER;
ALTER ROLE db_datareader ADD MEMBER [your-managed-identity-name];
ALTER ROLE db_datawriter ADD MEMBER [your-managed-identity-name];

## Security Best Practices

1. **Use Parameterized Queries**
   - Always use the `parameters` option when executing queries
   - Never concatenate user input into SQL strings

2. **Least Privilege Access**
   - Grant only necessary database permissions
   - Use read-only accounts when possible
   - Consider separate accounts for read vs. write operations

3. **Connection Security**
   - Keep `SQL_ENCRYPT=true` in production
   - Validate SSL certificates (`SQL_TRUST_SERVER_CERTIFICATE=false`)
   - Use managed identities in Azure when possible

4. **Secrets Management**
   - Never commit `.env` files to version control
   - Use Azure Key Vault or similar for production credentials
   - Rotate credentials regularly

## Example Queries

### Query with Pagination
```json
{
  "name": "sqlserver_execute_query",
  "arguments": {
    "query": "SELECT * FROM Customers WHERE Country = @country",
    "parameters": {
      "country": "USA"
    },
    "limit": 50,
    "offset": 0,
    "orderBy": "CustomerID"
  }
}

### Execute Stored Procedure
```json
{
  "name": "sqlserver_execute_stored_procedure",
  "arguments": {
    "procedureName": "dbo.GetOrdersByCustomer",
    "parameters": {
      "CustomerId": {
        "value": 12345
      }
    }
  }
}

### Get Table Structure
```json
{
  "name": "sqlserver_get_table_info",
  "arguments": {
    "tableName": "dbo.Orders"
  }
}

### Transaction Management ✨ NEW
```json
{
  "name": "sqlserver_execute_in_transaction",
  "arguments": {
    "statements": [
      {
        "statement": "UPDATE Accounts SET Balance = Balance - @amount WHERE AccountID = @fromAccount",
        "parameters": {
          "amount": 100,
          "fromAccount": 1
        }
      },
      {
        "statement": "UPDATE Accounts SET Balance = Balance + @amount WHERE AccountID = @toAccount",
        "parameters": {
          "amount": 100,
          "toAccount": 2
        }
      }
    ],
    "isolationLevel": "READ_COMMITTED"
  }
}

### Bulk Insert ✨ NEW
```json
{
  "name": "sqlserver_bulk_insert",
  "arguments": {
    "tableName": "dbo.Products",
    "columns": ["ProductName", "Price", "Stock"],
    "rows": [
      ["Product A", 29.99, 100],
      ["Product B", 49.99, 50],
      ["Product C", 19.99, 200]
    ],
    "batchSize": 100
  }
}

### Create Table ✨ NEW
```json
{
  "name": "sqlserver_create_table",
  "arguments": {
    "tableName": "dbo.Customers",
    "columns": [
      {
        "name": "CustomerID",
        "dataType": "INT",
        "primaryKey": true,
        "identity": true
      },
      {
        "name": "CustomerName",
        "dataType": "VARCHAR(100)",
        "nullable": false
      },
      {
        "name": "Email",
        "dataType": "VARCHAR(255)"
      }
    ]
  }
}

### Create Index ✨ NEW
```json
{
  "name": "sqlserver_create_index",
  "arguments": {
    "indexName": "IX_Customers_Email",
    "tableName": "dbo.Customers",
    "columns": ["Email"],
    "unique": true
  }
}

```
### Add Database File ✨ NEW
```json
{
  "name": "sqlserver_add_database_file",
  "arguments": {
    "databaseName": "AdventureWorks2022",
    "filegroupName": "FG_HumanResources",
    "logicalFileName": "AdventureWorks2022_HR_Data1",
    "physicalFilePath": "C:\Data\AdventureWorks2022_HR_Data1.ndf",
    "sizeMB": 100,
    "maxSizeMB": 1000,
    "filegrowthMB": 50
  }
}
```

### Create Filegroup ✨ NEW
```json
{
  "name": "sqlserver_create_filegroup",
  "arguments": {
    "databaseName": "AdventureWorks2022",
    "filegroupName": "FG_Sales",
    "makeDefault": false
  }
}
```

### List Filegroups ✨ NEW
```json
{
  "name": "sqlserver_list_filegroups",
  "arguments": {
    "databaseName": "AdventureWorks2022",
    "includeFiles": true
  }
}
```

### Shrink Database File ✨ NEW
```json
{
  "name": "sqlserver_shrink_database_file",
  "arguments": {
    "databaseName": "AdventureWorks2022",
    "logicalFileName": "AdventureWorks2022_Data2",
    "targetSizeMB": 50,
    "emptyFile": false
  }
}
```

### CPU Usage Monitoring ✨ NEW
```json
{
  "name": "sqlserver_get_cpu_usage",
  "arguments": {
    "threshold": 10,
    "includeSystemProcesses": false
  }
}
```

### Top CPU-Consuming Queries ✨ NEW
```json
{
  "name": "sqlserver_get_top_cpu_queries",
  "arguments": {
    "topN": 20
  }
}
```

### Wait Statistics Analysis ✨ NEW
```json
{
  "name": "sqlserver_get_wait_stats",
  "arguments": {
    "topN": 15
  }
}
```

### Full Database Backup ✨ NEW
```json
{
  "name": "sqlserver_backup_database",
  "arguments": {
    "database": "AdventureWorks2022",
    "backupType": "Full",
    "path": "C:\\Backup",
    "compression": true,
    "checksum": true,
    "verify": true,
    "description": "Monthly full backup"
  }
}
```

### Differential Backup with Encryption ✨ NEW
```json
{
  "name": "sqlserver_backup_database",
  "arguments": {
    "database": "AdventureWorks2022",
    "backupType": "Differential",
    "path": "C:\\Backup",
    "compression": true,
    "encryptionAlgorithm": "AES_256",
    "encryptionCertificate": "BackupCert",
    "description": "Encrypted differential backup"
  }
}
```

### Striped Backup for Performance ✨ NEW
```json
{
  "name": "sqlserver_backup_database",
  "arguments": {
    "database": "LargeDatabase",
    "backupType": "Full",
    "striping": {
      "fileCount": 4
    },
    "path": "C:\\Backup",
    "compression": true
  }
}
```

### Azure Blob Storage Backup ✨ NEW
```json
{
  "name": "sqlserver_backup_database",
  "arguments": {
    "database": "AdventureWorks2022",
    "backupType": "Full",
    "azureStorage": {
      "baseUrl": "https://mystorageaccount.blob.core.windows.net/backups/",
      "credential": "AzureStorageCredential"
    },
    "compression": true,
    "checksum": true
  }
}
```

### Backup All Databases with Dynamic Naming ✨ NEW
```json
{
  "name": "sqlserver_backup_database",
  "arguments": {
    "backupType": "Full",
    "path": "\\\\fileserver\\backups\\{servername}\\{instancename}",
    "fileName": "{dbname}_{backuptype}_{timestamp}.bak",
    "compression": true,
    "excludeDatabase": ["tempdb", "TestDB"]
  }
}
```

### List Backup History ✨ NEW
```json
{
  "name": "sqlserver_list_backup_history",
  "arguments": {
    "database": "AdventureWorks2022",
    "backupType": "All",
    "days": 30,
    "limit": 100
  }
}
```

### Verify Backup File ✨ NEW
```json
{
  "name": "sqlserver_verify_backup",
  "arguments": {
    "backupFile": "C:\\Backup\\AdventureWorks2022_202512281200.bak"
  }
}
```

### Verify Azure Backup ✨ NEW
```json
{
  "name": "sqlserver_verify_backup",
  "arguments": {
    "backupFile": "https://mystorageaccount.blob.core.windows.net/backups/MyDB_Full.bak",
    "azureCredential": "AzureStorageCredential"
  }
}
```

### Add Login to Server Role ✨ NEW
```json
{
  "name": "sqlserver_add_server_role_member",
  "arguments": {
    "serverRole": "dbcreator",
    "login": "MyDomain\\ServiceAccount"
  }
}
```

### Add Multiple Logins to Multiple Roles ✨ NEW
```json
{
  "name": "sqlserver_add_server_role_member",
  "arguments": {
    "serverRole": ["bulkadmin", "dbcreator"],
    "login": ["login1", "login2", "login3"]
  }
}
```

### Nest Roles for Role Hierarchy ✨ NEW
```json
{
  "name": "sqlserver_add_server_role_member",
  "arguments": {
    "serverRole": "CustomAdminRole",
    "role": "dbcreator"
  }
}
```

### Create Custom Server Role ✨ NEW
```json
{
  "name": "sqlserver_create_server_role",
  "arguments": {
    "serverRole": "AppAdministrators",
    "owner": "sa"
  }
}
```

### List All Server Roles with Members ✨ NEW
```json
{
  "name": "sqlserver_list_server_roles",
  "arguments": {
    "includeMembers": true,
    "includeFixedRoles": true
  }
}
```

### List Specific Server Roles ✨ NEW
```json
{
  "name": "sqlserver_list_server_roles",
  "arguments": {
    "serverRole": ["sysadmin", "dbcreator", "CustomAdminRole"],
    "includeMembers": true
  }
}
```

### Remove Login from Server Role ✨ NEW
```json
{
  "name": "sqlserver_remove_server_role_member",
  "arguments": {
    "serverRole": "sysadmin",
    "login": "UserToRemove"
  }
}
```

### Drop Custom Server Role ✨ NEW
```json
{
  "name": "sqlserver_drop_server_role",
  "arguments": {
    "serverRole": "ObsoleteCustomRole"
  }
}
```

## Troubleshooting

### Windows Authentication Issues

**Error: "Login failed for user"**
- Verify the Windows account has a SQL Server login
- Check SQL Server is configured for Windows Authentication mode
- Ensure the account has appropriate database permissions

### Entra ID Authentication Issues

**Error: "Token not found"**
- Verify managed identity is assigned to the application
- Check the identity has been granted database access
- Ensure using Azure SQL Database (not on-premises)

### Connection Timeout

**Error: "Connection timeout"**
- Verify SQL Server address and port are correct
- Check firewall rules allow connection
- Increase `SQL_CONNECTION_TIMEOUT` if needed

### Query Timeout

**Error: "Request timeout"**
- Simplify complex queries or add indexes
- Increase `SQL_REQUEST_TIMEOUT`
- Check for blocking queries or locks

## Development

### Project Structure
sql-server-mcp/
├── src/
│   ├── index.ts              # Main server entry point
│   ├── config.ts             # Configuration management
│   ├── connection.ts         # SQL Server connection pool
│   ├── tools/
│   │   ├── connection.ts     # Connection testing tools
│   │   ├── query.ts          # Query execution tools
│   │   ├── schema.ts         # Schema discovery tools
│   │   └── admin.ts          # Administrative tools
│   └── utils/
│       ├── errors.ts         # Error handling
│       ├── pagination.ts     # Pagination helpers
│       └── formatters.ts     # Result formatting
├── dist/                     # Compiled JavaScript
├── package.json
├── tsconfig.json
└── .env                      # Configuration (not in repo)

### Building
```bash
npm run build

### Running Tests
```bash
npm test

## License

MIT

## Contributing

Contributions are welcome! Please ensure:
- Code follows TypeScript best practices
- All tools include proper error handling
- Security best practices are followed
- Documentation is updated

## References

- [Model Context Protocol](https://modelcontextprotocol.io)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [mssql npm package](https://www.npmjs.com/package/mssql)
- [Azure SQL Database - Node.js Quickstart](https://learn.microsoft.com/en-us/azure/azure-sql/database/azure-sql-javascript-mssql-quickstart)
- [Passwordless Migration Guide](https://learn.microsoft.com/en-us/azure/azure-sql/database/azure-sql-passwordless-migration-nodejs)
- [dbatools - Get-DbaCpuUsage](https://github.com/dataplat/dbatools/blob/master/public/Get-DbaCpuUsage.ps1) - PowerShell cmdlet that inspired our CPU monitoring implementation
- [dbatools - Backup-DbaDatabase](https://github.com/dataplat/dbatools/blob/master/public/Backup-DbaDatabase.ps1) - PowerShell cmdlet that inspired our comprehensive backup implementation
- [dbatools - Add-DbaServerRoleMember](https://github.com/dataplat/dbatools/blob/master/public/Add-DbaServerRoleMember.ps1) - PowerShell cmdlet that inspired our server role management implementation
- [How to Find Out How Much CPU a SQL Server Process is Really Using](https://www.mssqltips.com/sqlservertip/2454/how-to-find-out-how-much-cpu-a-sql-server-process-is-really-using/) - SQL Server CPU usage troubleshooting guide
