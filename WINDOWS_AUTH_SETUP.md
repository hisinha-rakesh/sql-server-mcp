# Windows Authentication Setup Guide

This guide explains how to configure the SQL Server MCP server to use Windows Authentication.

## Overview

The SQL Server MCP server supports three authentication methods:
1. **Windows Authentication** (default) - Uses current Windows user credentials
2. **SQL Server Authentication** - Uses username/password
3. **Entra ID (Azure AD) Authentication** - Uses Azure Active Directory

## Windows Authentication Configuration

### Prerequisites

- **msnodesqlv8 driver** (automatically installed with `npm install`)
- Windows operating system
- SQL Server accessible via Windows Authentication
- Current Windows user must have SQL Server login permissions

### Environment Variables

For Windows Authentication, set the following in your `.env` file or MCP settings:

#### Minimal Configuration (Defaults)
```bash
# Authentication type (defaults to 'windows' if not specified)
SQL_AUTH_TYPE=windows

# SQL Server address (defaults to 'localhost')
SQL_SERVER=localhost

# Database name (defaults to 'master')
SQL_DATABASE=master
```

#### Full Configuration Options
```bash
# Authentication
SQL_AUTH_TYPE=windows

# Server Connection
SQL_SERVER=localhost
SQL_PORT=1433
SQL_DATABASE=master

# Windows Authentication (these are optional with defaults shown)
# SQL_TRUSTED_CONNECTION defaults to true for Windows auth
# Set to false only if you need to override
SQL_TRUSTED_CONNECTION=true
SQL_DOMAIN=MYDOMAIN

# Connection Mode
SQL_MODE=readwrite  # or 'read' for read-only

# Security Settings
SQL_ENCRYPT=true  # Use encrypted connection
SQL_TRUST_SERVER_CERTIFICATE=false  # Set to true for self-signed certs

# Connection Pool Settings
SQL_POOL_MIN=2
SQL_POOL_MAX=10
SQL_CONNECTION_TIMEOUT=30000  # milliseconds
SQL_REQUEST_TIMEOUT=30000     # milliseconds
```

### MCP Settings Configuration

Add to your `.mcp.json` or Claude Desktop config:

```json
{
  "mcpServers": {
    "sql-server": {
      "command": "node",
      "args": ["C:\\path\\to\\sql-server-mcp\\dist\\index.js"],
      "env": {
        "SQL_AUTH_TYPE": "windows",
        "SQL_SERVER": "localhost",
        "SQL_DATABASE": "MyDatabase",
        "SQL_MODE": "readwrite",
        "SQL_ENCRYPT": "true",
        "SQL_TRUST_SERVER_CERTIFICATE": "false"
      }
    }
  }
}
```

### Quick Start Examples

#### Example 1: Local SQL Server (Default Instance)
```json
{
  "env": {
    "SQL_AUTH_TYPE": "windows",
    "SQL_SERVER": "localhost",
    "SQL_DATABASE": "master"
  }
}
```

#### Example 2: Named Instance
```json
{
  "env": {
    "SQL_AUTH_TYPE": "windows",
    "SQL_SERVER": "MYSERVER\\SQLEXPRESS",
    "SQL_DATABASE": "MyAppDB"
  }
}
```

#### Example 3: Remote Server
```json
{
  "env": {
    "SQL_AUTH_TYPE": "windows",
    "SQL_SERVER": "sql-server-01.mycompany.local",
    "SQL_PORT": "1433",
    "SQL_DATABASE": "Production",
    "SQL_ENCRYPT": "true"
  }
}
```

#### Example 4: Read-Only Mode (Safe for Production)
```json
{
  "env": {
    "SQL_AUTH_TYPE": "windows",
    "SQL_SERVER": "prod-sql-01",
    "SQL_DATABASE": "ProductionDB",
    "SQL_MODE": "read",
    "SQL_ENCRYPT": "true"
  }
}
```

## How Windows Authentication Works

1. **msnodesqlv8 Driver**: Uses native SQL Server driver that supports Windows Authentication
2. **Trusted Connection**: Automatically uses the credentials of the Windows user running the MCP server
3. **No Password Required**: Authentication happens via Windows Security Subsystem (SSPI/Kerberos)

### Connection String Generated

For Windows Authentication, the server generates a connection string like:
```
Server=localhost;Database=master;Trusted_Connection=Yes;Driver={SQL Server Native Client 11.0};
```

## Troubleshooting

### Error: "Cannot find module 'msnodesqlv8'"

**Solution:** Run `npm install` in the sql-server-mcp directory:
```bash
cd C:\path\to\sql-server-mcp
npm install
npm run build
```

### Error: "Login failed for user 'DOMAIN\Username'"

**Causes:**
1. Windows user doesn't have SQL Server login permissions
2. SQL Server not configured to allow Windows Authentication

**Solutions:**

1. **Grant SQL Server access** (run as SQL Server admin):
```sql
-- Create login for Windows user
CREATE LOGIN [DOMAIN\Username] FROM WINDOWS;

-- Grant access to database
USE MyDatabase;
CREATE USER [DOMAIN\Username] FOR LOGIN [DOMAIN\Username];

-- Grant necessary permissions
ALTER ROLE db_datareader ADD MEMBER [DOMAIN\Username];
ALTER ROLE db_datawriter ADD MEMBER [DOMAIN\Username];
```

2. **Enable Windows Authentication** in SQL Server:
   - Open SQL Server Management Studio
   - Right-click server → Properties → Security
   - Select "SQL Server and Windows Authentication mode"
   - Restart SQL Server service

### Error: "Cannot open database requested by the login"

**Solution:** User has SQL Server login but not database access:
```sql
USE MyDatabase;
CREATE USER [DOMAIN\Username] FOR LOGIN [DOMAIN\Username];
ALTER ROLE db_datareader ADD MEMBER [DOMAIN\Username];
```

### Error: "SSL Security error" or "Certificate validation failed"

**Solution:** For development/self-signed certificates:
```json
{
  "env": {
    "SQL_TRUST_SERVER_CERTIFICATE": "true"
  }
}
```

**Note:** Only use `SQL_TRUST_SERVER_CERTIFICATE=true` in development. In production, use proper SSL certificates.

## Verifying Connection

After configuration, the MCP server will test the connection on startup. Check the logs:

```
SQL Server MCP Server starting...
Authentication Type: windows
Server: localhost
Database: master
Mode: readwrite

SQL Server MCP Server running on stdio
```

You can also test connection using the `sqlserver_test_connection` tool through Claude.

## Security Best Practices

### 1. Use Read-Only Mode for Production Queries
```json
{
  "env": {
    "SQL_MODE": "read"
  }
}
```

### 2. Always Use Encrypted Connections
```json
{
  "env": {
    "SQL_ENCRYPT": "true",
    "SQL_TRUST_SERVER_CERTIFICATE": "false"
  }
}
```

### 3. Limit Database Permissions

Grant minimum required permissions:
```sql
-- Read-only access
ALTER ROLE db_datareader ADD MEMBER [DOMAIN\Username];

-- Read-write access (if needed)
ALTER ROLE db_datareader ADD MEMBER [DOMAIN\Username];
ALTER ROLE db_datawriter ADD MEMBER [DOMAIN\Username];

-- Avoid these unless absolutely necessary:
-- ALTER ROLE db_owner ADD MEMBER [DOMAIN\Username];
-- ALTER ROLE sysadmin ADD MEMBER [DOMAIN\Username];
```

### 4. Use Service Accounts

For production, create dedicated service accounts:
```sql
-- Create service account login
CREATE LOGIN [DOMAIN\SQLMCPService] FROM WINDOWS;
USE MyDatabase;
CREATE USER [DOMAIN\SQLMCPService] FOR LOGIN [DOMAIN\SQLMCPService];
ALTER ROLE db_datareader ADD MEMBER [DOMAIN\SQLMCPService];
```

Then run the MCP server under this service account.

## Comparing Authentication Methods

| Feature | Windows Auth | SQL Auth | Entra ID |
|---------|-------------|----------|----------|
| **No password in config** | ✅ | ❌ | Depends |
| **Uses Windows identity** | ✅ | ❌ | ❌ |
| **Works on Linux** | ❌ | ✅ | ✅ |
| **Azure SQL support** | ❌ | ✅ | ✅ |
| **Single Sign-On** | ✅ | ❌ | ✅ |
| **Driver required** | msnodesqlv8 | tedious | tedious |

## Additional Resources

- [SQL Server Windows Authentication Documentation](https://learn.microsoft.com/en-us/sql/relational-databases/security/choose-an-authentication-mode)
- [msnodesqlv8 GitHub Repository](https://github.com/TimelordUK/node-sqlserver-v8)
- [SQL Server MCP README](./README.md)

## Support

For issues with Windows Authentication:
1. Check that msnodesqlv8 is installed: `npm list msnodesqlv8`
2. Verify Windows user has SQL Server permissions
3. Check SQL Server error logs
4. Enable detailed logging in MCP server

---

**Last Updated:** 2025-12-28
