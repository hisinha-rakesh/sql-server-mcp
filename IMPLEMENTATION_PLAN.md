# SQL Server MCP Server - Implementation Plan

## Overview

Build an MCP (Model Context Protocol) server for SQL Server that supports:
- **Windows Authentication** (on-premises SQL Server)
- **Microsoft Entra ID Authentication** (Azure SQL Database)
- Comprehensive SQL operations via well-designed tools

## Technology Stack

### Language & Framework
- **TypeScript** - MCP SDK recommendation for best compatibility
- **MCP SDK v1.x** - Stable production version
- **Node.js 18+** - Required by mssql@12.x

### SQL Server Connectivity
- **mssql** (v12.2.0+) - Main SQL Server client
- **tedious** (v19.0.0+) - Default driver, supports Entra ID auth
- **msnodesqlv8** (v0.7.1+) - Optional driver for Windows Authentication

### Authentication Support

#### Windows Authentication (On-Premises)
- Requires `msnodesqlv8` driver
- Uses Windows Integrated Security / Trusted Connection
- Format: `trustedConnection: true` in config

#### Microsoft Entra ID (Azure SQL Database)
- Requires `tedious` driver v13.0.0+
- Supported authentication types:
  - `azure-active-directory-default`
  - `azure-active-directory-password`
  - `azure-active-directory-access-token`
  - `azure-active-directory-msi-vm`
  - `azure-active-directory-msi-app-service`
  - `azure-active-directory-service-principal-secret`

**Important**: Entra ID and managed identities are NOT supported for on-premises SQL Server.

## Tool Design

### Core Principles
- **Comprehensive API Coverage** - Cover all major SQL Server operations
- **Clear Naming** - Use `sqlserver_` prefix for all tools
- **Actionable Errors** - Provide specific guidance in error messages
- **Pagination Support** - Handle large result sets efficiently
- **Read-Only Hints** - Mark destructive operations appropriately

### Planned Tools

#### Connection Management
1. **sqlserver_test_connection** - Test database connectivity
   - Annotations: `readOnlyHint: true`

#### Query Operations
2. **sqlserver_execute_query** - Execute SELECT queries with pagination
   - Annotations: `readOnlyHint: true`
   - Support for parameterized queries
   - Result pagination (limit/offset)

3. **sqlserver_execute_non_query** - Execute INSERT/UPDATE/DELETE
   - Annotations: `destructiveHint: true`
   - Returns rows affected
   - Support for parameterized queries

4. **sqlserver_execute_stored_procedure** - Execute stored procedures
   - Annotations: `destructiveHint: varies by procedure`
   - Support for input/output parameters
   - Handle multiple result sets

#### Schema Discovery
5. **sqlserver_list_databases** - List available databases
   - Annotations: `readOnlyHint: true`

6. **sqlserver_list_tables** - List tables in database
   - Annotations: `readOnlyHint: true`
   - Include schema information

7. **sqlserver_list_columns** - Get table column details
   - Annotations: `readOnlyHint: true`
   - Include data types, nullability, keys

8. **sqlserver_list_stored_procedures** - List stored procedures
   - Annotations: `readOnlyHint: true`

9. **sqlserver_get_table_info** - Get detailed table metadata
   - Annotations: `readOnlyHint: true`
   - Include indexes, foreign keys, constraints

#### Administrative Operations
10. **sqlserver_get_server_info** - Get SQL Server version and configuration
    - Annotations: `readOnlyHint: true`

11. **sqlserver_execute_batch** - Execute multiple statements as a batch
    - Annotations: `destructiveHint: true`

## Project Structure

```
sql-server-mcp/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Main server entry point
│   ├── config.ts             # Configuration types and validation
│   ├── connection.ts         # SQL Server connection management
│   ├── tools/
│   │   ├── connection.ts     # Connection testing tools
│   │   ├── query.ts          # Query execution tools
│   │   ├── schema.ts         # Schema discovery tools
│   │   └── admin.ts          # Administrative tools
│   └── utils/
│       ├── errors.ts         # Error handling utilities
│       ├── pagination.ts     # Pagination helpers
│       └── formatters.ts     # Response formatting
├── .env.example              # Configuration template
└── README.md                 # Documentation

## Configuration

### Environment Variables

```env
# Connection Type (windows | entra)
SQL_AUTH_TYPE=windows

# Common Settings
SQL_SERVER=localhost
SQL_DATABASE=master
SQL_PORT=1433

# Windows Authentication
SQL_TRUSTED_CONNECTION=true

# Entra ID Authentication (Azure SQL)
SQL_ENTRA_AUTH_TYPE=azure-active-directory-default
# Optional for service principal:
# SQL_CLIENT_ID=your-client-id
# SQL_CLIENT_SECRET=your-client-secret
# SQL_TENANT_ID=your-tenant-id

# Connection Pool Settings
SQL_POOL_MIN=2
SQL_POOL_MAX=10
SQL_CONNECTION_TIMEOUT=30000
SQL_REQUEST_TIMEOUT=30000
```

## Security Considerations

1. **SQL Injection Prevention**
   - Use parameterized queries exclusively
   - Validate all input schemas with Zod
   - Never concatenate user input into SQL

2. **Connection Security**
   - Enforce encryption (`encrypt: true`)
   - Validate SSL certificates in production
   - Use managed identities when available

3. **Least Privilege**
   - Document minimum required permissions
   - Support read-only connection mode
   - Mark destructive operations clearly

4. **Secrets Management**
   - Never log connection strings or credentials
   - Support Azure Key Vault for credentials
   - Use environment variables for configuration

## Development Phases

### Phase 1: Core Infrastructure ✅ (Current)
- [x] Research SQL Server auth options
- [x] Design tool architecture
- [x] Plan project structure
- [ ] Set up TypeScript project
- [ ] Create configuration system
- [ ] Implement connection management

### Phase 2: Tool Implementation
- [ ] Implement connection tools
- [ ] Implement query execution tools
- [ ] Implement schema discovery tools
- [ ] Implement administrative tools
- [ ] Add comprehensive error handling
- [ ] Add result pagination

### Phase 3: Testing & Quality
- [ ] Build project successfully
- [ ] Test with MCP Inspector
- [ ] Test Windows Authentication
- [ ] Test Entra ID Authentication
- [ ] Create comprehensive test cases
- [ ] Document all tools

### Phase 4: Evaluations
- [ ] Create 10 evaluation questions
- [ ] Verify answers independently
- [ ] Generate evaluation XML
- [ ] Test evaluations

## Transport Method

**Recommendation**: Streamable HTTP (stateless JSON)
- Easier to scale and deploy
- Better for remote connections
- Simpler state management
- Good for containerized deployments

Alternative: stdio for local-only usage

## Dependencies

```json
{
  "@modelcontextprotocol/server": "^1.x",
  "zod": "^3.25.0",
  "mssql": "^12.2.0",
  "tedious": "^19.0.0",
  "dotenv": "^16.0.0"
}
```

Optional for Windows Auth:
```json
{
  "msnodesqlv8": "^0.7.1"
}
```

## References

- [MCP Specification](https://modelcontextprotocol.io)
- [TypeScript SDK v1.x](https://github.com/modelcontextprotocol/typescript-sdk/tree/v1.x)
- [mssql npm package](https://www.npmjs.com/package/mssql)
- [Azure SQL Passwordless Migration](https://learn.microsoft.com/en-us/azure/azure-sql/database/azure-sql-passwordless-migration-nodejs)
- [Node.js SQL Server Quickstart](https://learn.microsoft.com/en-us/azure/azure-sql/database/azure-sql-javascript-mssql-quickstart)

## Next Steps

1. Set up TypeScript project with MCP SDK
2. Create configuration and connection management
3. Implement tools one by one with tests
4. Create comprehensive documentation
5. Build evaluation suite
