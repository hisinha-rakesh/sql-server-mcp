# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Model Context Protocol (MCP) server that provides SQL Server database access to LLMs with support for Windows Authentication, SQL Authentication, and Microsoft Entra ID authentication. It exposes 55+ tools for database operations including queries, transactions, DDL, performance monitoring, backups, and administration.

## Build Commands

```bash
# Install dependencies
npm install

# Build TypeScript to JavaScript
npm run build

# Development mode (auto-reload)
npm run dev

# Start the MCP server
npm start

# Inspect with MCP Inspector
npm run inspect
```

## Testing

Test scripts are in the root directory (`.cjs` files):

```bash
# Test Windows Authentication
node test-msnodesqlv8-import.cjs

# Test SQL Authentication
node test-simple.cjs

# Test connection with specific config
node test-connection-options.cjs
```

## Architecture

### Core Components

1. **src/index.ts** - Main MCP server entry point
   - Registers all 55+ tools with the MCP SDK
   - Initializes ConnectionManager with loaded config
   - Handles tool execution routing

2. **src/config.ts** - Configuration management
   - Loads settings from environment variables
   - Validates config using Zod schemas
   - Converts config to mssql connection options
   - Supports 3 auth types: `windows`, `sql`, `entra`

3. **src/connection.ts** - Database connection management
   - **CRITICAL**: Dynamically loads the correct driver based on auth type
   - For `windows` auth: imports `mssql/msnodesqlv8` (supports Windows auth)
   - For `sql`/`entra` auth: imports `mssql` (tedious driver)
   - Manages connection pool lifecycle
   - Provides executeQuery, executeStoredProcedure methods

4. **src/tools/** - Individual tool implementations (15 files)
   - `query.ts` - Execute queries, non-queries, stored procedures, batches
   - `schema.ts` - Database schema discovery
   - `ddl.ts` - CREATE/DROP/ALTER table and index operations
   - `transactions.ts` - BEGIN/COMMIT/ROLLBACK transaction control
   - `bulk-operations.ts` - Bulk insert with batching
   - `admin.ts` - Server info, database size, connections, service restart
   - `advanced-admin.ts` - Orphan logins, linked servers, replication
   - `agent.ts` - SQL Server Agent jobs and maintenance plan guidance
   - `performance.ts` - CPU usage, wait stats, memory, blocking, I/O latency
   - `database-management.ts` - Create/drop/alter databases, snapshots, recovery models
   - `file-management.ts` - Database files and filegroups
   - `backup.ts` - Database backup operations with compression and encryption
   - `security.ts` - Server roles, logins, permissions (GRANT/REVOKE/DENY)
   - `connection.ts` - Connection testing
   - `performance_backup.ts` - Performance monitoring backup

5. **src/utils/** - Utility functions
   - `errors.ts` - Error handling and formatting
   - `formatters.ts` - Result formatting utilities

### Authentication Architecture

**IMPORTANT**: The driver selection is handled dynamically in `connection.ts`:

- **Windows Authentication** requires the `msnodesqlv8` driver which is loaded via `import('mssql/msnodesqlv8')`
- **SQL/Entra Authentication** uses the `tedious` driver which is loaded via `import('mssql')`
- The correct driver is imported at runtime based on `config.authType`

**Why this matters**: The default `mssql` package uses tedious, which does NOT support Windows Authentication. Attempting to use Windows auth with tedious results in "Login failed for user ''" errors. The dynamic import solution in `connection.ts` ensures the correct driver is loaded for each auth type.

### Configuration

Configuration is loaded from environment variables (see `.env.example`):

**Windows Authentication** (default):
```
SQL_AUTH_TYPE=windows
SQL_SERVER=localhost
SQL_DATABASE=master
SQL_TRUSTED_CONNECTION=true
SQL_ENCRYPT=true
SQL_TRUST_SERVER_CERTIFICATE=true
```

**SQL Authentication**:
```
SQL_AUTH_TYPE=sql
SQL_USERNAME=myuser
SQL_PASSWORD=mypassword
SQL_SERVER=localhost
SQL_DATABASE=master
```

**Entra ID Authentication**:
```
SQL_AUTH_TYPE=entra
SQL_ENTRA_AUTH_TYPE=azure-active-directory-password
SQL_USERNAME=user@domain.com
SQL_PASSWORD=password
SQL_SERVER=myserver.database.windows.net
SQL_DATABASE=mydatabase
```

## MCP Server Deployment

This MCP server is typically configured in Claude Desktop's config file:

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
        "SQL_ENCRYPT": "true",
        "SQL_TRUST_SERVER_CERTIFICATE": "true"
      }
    }
  }
}
```

**After code changes**: Restart Claude Desktop to reload the MCP server.

## Common Development Tasks

### Adding a New Tool

1. Create tool definition in appropriate file in `src/tools/`
2. Export the tool from that file
3. Import and register it in `src/index.ts` in the `tools` array
4. Build with `npm run build`
5. Restart Claude Desktop to test

### Modifying Connection Logic

When modifying `src/connection.ts` or `src/config.ts`:
- Be careful with the dynamic driver loading logic
- Test both Windows and SQL authentication modes
- Remember that Windows auth needs `mssql/msnodesqlv8`, not `mssql`

### Debugging Connection Issues

1. Check environment variables in Claude Desktop config
2. Test connection directly with test scripts (`.cjs` files)
3. Verify SQL Server is running: `Get-Service MSSQLSERVER` (PowerShell)
4. Check SQL Server error logs for authentication failures
5. For Windows auth: Ensure current user has SQL Server login permissions

## Key Technical Details

### Why Two Different Driver Imports?

The `mssql` npm package is a wrapper that supports multiple drivers:
- `tedious` (default) - Pure JavaScript, cross-platform, supports SQL and Entra auth
- `msnodesqlv8` - Native Windows driver, supports Windows Authentication via SSPI

**Problem**: When you `import sql from 'mssql'`, you get tedious, which cannot do Windows auth.

**Solution**: Use `import sql from 'mssql/msnodesqlv8'` for Windows auth, which loads the native driver.

Our code dynamically chooses the correct import based on `config.authType`.

### TypeScript and ES Modules

- This project uses ES modules (`"type": "module"` in package.json)
- TypeScript compiles to ES modules (not CommonJS)
- Import statements must include `.js` extensions (e.g., `'./config.js'`)
- The `@ts-ignore` comment in connection.ts is needed because `mssql/msnodesqlv8` lacks type definitions

### Error Handling Philosophy

Tools return structured error messages with:
- Clear description of what went wrong
- Actionable troubleshooting steps
- Context about authentication, permissions, or configuration issues

See `src/utils/errors.ts` for error formatting utilities.

## Documentation Files

- **README.md** - User-facing documentation with all 55 tools documented
- **WINDOWS_AUTH_SETUP.md** - Detailed Windows Authentication setup guide
- **IMPLEMENTATION_PLAN.md** - Original implementation planning
- **NEW_FEATURES.md** - Feature additions and enhancements
- **TOOLS_SPECIFICATION.md** - Detailed tool specifications
- **COMPARISON.md** - Comparison with other SQL MCP servers
- **PROJECT_SUMMARY.md** - Project overview and status

## Dependencies

**Runtime**:
- `@modelcontextprotocol/sdk` - MCP protocol implementation
- `mssql` - SQL Server client (tedious driver)
- `msnodesqlv8` - Native Windows Authentication driver
- `tedious` - Pure JS SQL Server driver
- `zod` - Schema validation
- `dotenv` - Environment variable loading

**Development**:
- `typescript` - TypeScript compiler
- `tsx` - TypeScript execution for development
- `@types/mssql`, `@types/node` - Type definitions

## Platform Support

- **Windows**: Full support (Windows auth, SQL auth, Entra auth)
- **Linux/Mac**: SQL auth and Entra auth only (no Windows auth)

The `msnodesqlv8` driver only works on Windows. On other platforms, use SQL or Entra ID authentication.
