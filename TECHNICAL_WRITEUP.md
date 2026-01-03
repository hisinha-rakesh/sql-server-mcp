# SQL Server MCP: Enterprise Database Management via Natural Language

## Executive Summary

SQL Server MCP is a comprehensive Model Context Protocol (MCP) server that bridges the gap between Large Language Models (LLMs) like Claude and SQL Server databases. This project enables database administrators and DevOps engineers to interact with SQL Server using natural language, while maintaining enterprise-grade security, comprehensive functionality, and integration with industry-standard tools.

With **55+ specialized tools** spanning query operations, performance monitoring, backup/restore, security management, and administrative tasks, this MCP server brings the power of conversational AI to SQL Server administration while drawing inspiration from the renowned **dbatools PowerShell module**.

---

## Table of Contents

1. [Why This Project Exists](#why-this-project-exists)
2. [The dbatools Connection](#the-dbatools-connection)
3. [Architecture Overview](#architecture-overview)
4. [Comprehensive Feature Set](#comprehensive-feature-set)
5. [Real-World DBA Workflows](#real-world-dba-workflows)
6. [Advantages and Limitations](#advantages-and-limitations)
7. [Security Considerations](#security-considerations)
8. [Configuration Guide](#configuration-guide)
9. [Practical Use Cases](#practical-use-cases)
10. [Future Roadmap](#future-roadmap)

---

## Why This Project Exists

### The Traditional DBA Pain Points

SQL Server database administrators face several recurring challenges in their daily work:

**1. Context Switching Between Tools**

DBAs constantly switch between SQL Server Management Studio (SSMS), PowerShell scripts, Azure Portal, monitoring tools, and documentation. Each context switch introduces cognitive overhead and workflow interruption. A typical performance investigation might require:
- Opening SSMS for query analysis
- Running PowerShell dbatools cmdlets for server metrics
- Checking Azure Portal for cloud resource metrics
- Consulting documentation for DMV queries
- Searching Stack Overflow for optimization techniques

**2. Complex DMV Queries Are Not Intuitive**

Dynamic Management Views (DMVs) are powerful but cryptic. Finding high-CPU queries requires memorizing complex joins:

```sql
SELECT TOP 10
    qs.total_worker_time/1000 AS TotalCPU_ms,
    qs.execution_count,
    SUBSTRING(qt.text, qs.statement_start_offset/2+1,
        (CASE WHEN qs.statement_end_offset=-1
            THEN LEN(CONVERT(nvarchar(max), qt.text))*2
            ELSE qs.statement_end_offset
        END - qs.statement_start_offset)/2+1) AS QueryText
FROM sys.dm_exec_query_stats qs
CROSS APPLY sys.dm_exec_sql_text(qs.sql_handle) qt
ORDER BY qs.total_worker_time DESC;
```

DBAs shouldn't need to memorize this. A simple natural language request like "Show me the top 10 CPU-consuming queries" should suffice.

**3. Automation Requires Programming Skills**

Not all DBAs are proficient in PowerShell or Python. Creating automated maintenance scripts, health checks, or performance monitoring requires programming expertise that may be outside a DBA's core competency. This creates dependency on development teams or limits automation adoption.

**4. Knowledge Silos and Institutional Memory**

Experienced DBAs accumulate years of troubleshooting knowledge, optimization techniques, and operational best practices. This knowledge often exists only in senior engineers' heads, making it difficult to:
- Onboard junior DBAs quickly
- Maintain consistency across teams
- Preserve knowledge when engineers leave
- Share expertise across geographically distributed teams

**5. Slow Emergency Response**

During production incidents, every second counts. Finding the right DMV query, locating the correct PowerShell script, or remembering the exact syntax for killing blocking sessions can waste critical time when systems are down.

### The Solution: Natural Language Database Administration

SQL Server MCP addresses these pain points by providing:

- **Unified Interface**: All database operations through conversational AI
- **Zero Memorization**: Natural language replaces complex DMV queries and syntax
- **Instant Expertise**: Access to dbatools-inspired best practices without PowerShell knowledge
- **Context Preservation**: Claude maintains conversation history, remembering your environment and previous actions
- **Rapid Incident Response**: Ask questions and execute commands in plain English during emergencies
- **Knowledge Democratization**: Junior DBAs can perform expert-level operations safely

Instead of searching for "how to find blocking sessions in SQL Server," DBAs can simply ask Claude: "Show me all blocking sessions right now and identify the blocking chain." The MCP server translates this intent into the appropriate DMV queries and returns formatted results.

---

## The dbatools Connection

### What is dbatools?

[dbatools](https://github.com/dataplat/dbatools) is the de facto standard PowerShell module for SQL Server administration, maintained by the community and widely adopted across the industry. With over **600 cmdlets**, dbatools automates virtually every aspect of SQL Server management:

- Backup and restore operations
- Database migrations and synchronization
- Performance monitoring and diagnostics
- Security auditing and compliance
- High availability and disaster recovery
- Capacity planning and maintenance

dbatools has become essential infrastructure for SQL Server DBAs because it:
1. **Codifies best practices** from decades of community SQL Server experience
2. **Eliminates repetitive manual tasks** through comprehensive automation
3. **Provides consistent interfaces** across different SQL Server versions
4. **Reduces human error** with well-tested, production-hardened code
5. **Accelerates troubleshooting** with purpose-built diagnostic cmdlets

### Why dbatools Inspired This MCP Server

This SQL Server MCP project draws heavily from dbatools' design philosophy and functionality for several critical reasons:

**1. Proven Patterns and Best Practices**

dbatools represents collective wisdom from thousands of DBAs and millions of production deployments. Rather than reinventing the wheel, this MCP server implements dbatools-inspired functionality in TypeScript, making these battle-tested patterns accessible through natural language.

For example, our `sqlserver_backup_database` tool implements features from dbatools' `Backup-DbaDatabase`:
- Compression and encryption support
- Azure blob storage integration
- Striping across multiple files for performance
- Checksum verification
- Dynamic file naming with tokens
- Copy-only backups for ad-hoc scenarios

**2. Bridging the PowerShell Knowledge Gap**

Many SQL Server DBAs work in environments where PowerShell is restricted, unavailable, or outside their skill set. By implementing dbatools functionality in an MCP server accessible through natural language, we make these powerful capabilities available to a broader audience.

A DBA can ask: "Create a compressed backup of the Production database to Azure blob storage with AES256 encryption"—without knowing PowerShell, without memorizing cmdlet parameters, and without writing scripts.

**3. Cross-Platform Compatibility**

While dbatools is PowerShell-based (primarily Windows-centric), this MCP server is built on Node.js, enabling it to run on Linux, macOS, and containerized environments. It supports:
- Windows Authentication (on-premises, Windows only)
- SQL Server Authentication (cross-platform)
- Microsoft Entra ID (Azure SQL Database, cross-platform)

This makes dbatools-inspired functionality available in modern cloud-native and DevOps workflows.

**4. Examples of dbatools-Inspired Tools**

| MCP Tool | Inspired By | Functionality |
|----------|-------------|---------------|
| `sqlserver_get_cpu_usage` | `Get-DbaCpuUsage` | Correlates SPIDs to Windows thread IDs for CPU analysis |
| `sqlserver_backup_database` | `Backup-DbaDatabase` | Full/differential/log backups with Azure support |
| `sqlserver_add_server_role_member` | `Add-DbaServerRoleMember` | Bulk role membership management |
| `sqlserver_detect_orphan_logins` | `Find-DbaOrphanUser` | Identifies orphaned database users after migrations |
| `sqlserver_set_max_memory` | `Set-DbaMaxMemory` | Configures SQL Server memory settings with recommended values |
| `sqlserver_get_database` | `Get-DbaDatabase` | Retrieves comprehensive database information |
| `sqlserver_list_backup_history` | `Get-DbaDbBackupHistory` | Queries backup history from msdb |

**5. Documentation and Attribution**

Throughout our README and tool documentation, we explicitly reference dbatools cmdlets that inspired each implementation. This serves multiple purposes:
- **Educational**: DBAs learn which dbatools cmdlets address specific needs
- **Credit**: Proper attribution to the dbatools community
- **Bridging**: DBAs can transition between MCP and PowerShell workflows seamlessly
- **Validation**: Users can verify our implementations match dbatools patterns

### dbatools as a Critical Dependency (Conceptually)

While this MCP server doesn't technically depend on the dbatools PowerShell module (it's a pure TypeScript implementation), **dbatools serves as our reference architecture**. Every tool we build asks: "How does dbatools solve this? What parameters does dbatools expose? What error handling does dbatools implement?"

This ensures our MCP server embodies the same production-ready reliability, comprehensive feature coverage, and operational safety that has made dbatools the industry standard.

---

## Architecture Overview

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         User (DBA)                               │
│                  "Show me blocking sessions"                     │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ Natural Language
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     Claude (LLM)                                 │
│  - Understands intent                                            │
│  - Selects appropriate MCP tool                                  │
│  - Formats results for human readability                         │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ MCP Protocol (JSON-RPC)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              SQL Server MCP Server (This Project)                │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ src/index.ts - MCP Server Entry Point                     │  │
│  │ - Registers 55+ tools                                     │  │
│  │ - Routes tool execution                                   │  │
│  │ - Enforces read-only mode if configured                  │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ src/config.ts - Configuration Management                  │  │
│  │ - Zod schema validation                                   │  │
│  │ - Environment variable loading                            │  │
│  │ - Supports 3 auth types, 6 Entra ID methods              │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ src/connection.ts - Connection Pool Manager               │  │
│  │ - Dynamic driver loading (Windows vs SQL/Entra)          │  │
│  │ - Connection pooling (min: 2, max: 10)                   │  │
│  │ - Query execution methods                                 │  │
│  └───────────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ src/tools/* - 55+ Specialized Tools                       │  │
│  │ - query.ts, schema.ts, ddl.ts                            │  │
│  │ - performance.ts (15 tools)                              │  │
│  │ - security.ts (19 tools)                                 │  │
│  │ - backup.ts, agent.ts, admin.ts, etc.                   │  │
│  └───────────────────────────────────────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ TDS Protocol (Tabular Data Stream)
                             │ Windows Auth: msnodesqlv8 driver
                             │ SQL/Entra Auth: tedious driver
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                   SQL Server                                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Databases   │  │   DMVs       │  │  SQL Agent   │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │  Backups     │  │   Security   │  │  Replication │          │
│  └──────────────┘  └──────────────┘  └──────────────┘          │
└─────────────────────────────────────────────────────────────────┘
```

### Key Architectural Decisions

**1. Dynamic Driver Selection (Critical)**

The most important technical feature is dynamic driver loading in `src/connection.ts`:

```typescript
async function getSqlModule(authType: string): Promise<any> {
  if (authType === 'windows') {
    // Use msnodesqlv8 driver (native Windows driver supporting SSPI)
    const sql = await import('mssql/msnodesqlv8.js');
    return sql.default || sql;
  } else {
    // Use tedious driver (pure JavaScript, supports SQL & Entra ID)
    const sql = await import('mssql');
    return sql.default || sql;
  }
}
```

**Why this matters**: The default `mssql` package uses the tedious driver, which does NOT support Windows Authentication. Attempting Windows auth with tedious results in "Login failed for user ''" errors. By dynamically loading `mssql/msnodesqlv8` for Windows auth, we enable all three authentication types in a single codebase.

**2. Connection Pool Management**

Rather than creating/destroying connections per request, we maintain a connection pool:
- **Min Connections**: 2 (always warm)
- **Max Connections**: 10 (prevents resource exhaustion)
- **Reuse**: Connections are recycled across requests
- **Timeout**: 30-second connection timeout, 30-second request timeout
- **Graceful Shutdown**: Pool closes cleanly on process exit

**3. Tool Organization by Functional Area**

Tools are organized into 21 TypeScript modules by DBA functional area:
- **query.ts** - Basic CRUD operations
- **performance.ts** - 15 performance monitoring tools
- **security.ts** - 19 role, login, and permission tools
- **backup.ts** - Comprehensive backup/restore
- **agent.ts** - SQL Server Agent automation
- **database-management.ts** - Database lifecycle
- **file-management.ts** - Filegroups and database files

This mirrors how DBAs think about their responsibilities and makes the codebase maintainable.

**4. Error Handling Philosophy**

Every tool implements context-aware error handling:
- **Authentication Errors**: Guides on Windows auth setup, SQL user permissions, Entra ID configuration
- **Connection Errors**: Checks server availability, firewall rules, network connectivity
- **Permission Errors**: Explains required SQL Server permissions, suggests GRANT statements
- **Syntax Errors**: Highlights query issues with actionable fixes

Example error message:
```
❌ Connection failed: Login failed for user 'NT AUTHORITY\SYSTEM'

Troubleshooting:
1. Verify the Windows user has a SQL Server login:
   CREATE LOGIN [DOMAIN\User] FROM WINDOWS;

2. Grant appropriate permissions:
   ALTER SERVER ROLE sysadmin ADD MEMBER [DOMAIN\User];

3. Check SQL Server authentication mode (Windows auth must be enabled)
4. Verify SQL Server service is running under correct account
```

**5. Read-Only Mode Support**

For production safety, the MCP server supports read-only mode via `SQL_MODE=readonly` environment variable. In this mode:
- All write operations (40+ tools) are blocked
- SELECT queries, schema inspection, and monitoring tools work normally
- Read-only mode is enforced at the MCP server level, not database level
- Useful for giving junior DBAs or auditors safe access

**6. Result Formatting**

Tool results are formatted for terminal/chat display:
- **Markdown Tables**: Structured data in readable tables
- **JSON Output**: Alternative format for programmatic consumption
- **Column Truncation**: Long text truncated to prevent terminal overflow
- **Execution Time**: Query performance reported for every operation
- **Row Count**: Result set size reported
- **Pagination**: Large result sets limited (default 100, max 1000 rows)

---

## Comprehensive Feature Set

### 55+ Tools Across 11 Categories

**1. Query Operations (4 tools)**
- Execute SELECT queries with pagination
- Execute INSERT/UPDATE/DELETE statements
- Execute stored procedures with parameters (input/output)
- Execute multiple statements as batches

**2. Transaction Management (4 tools)**
- Begin transaction with isolation levels (READ UNCOMMITTED, READ COMMITTED, REPEATABLE READ, SERIALIZABLE, SNAPSHOT)
- Commit transaction
- Rollback transaction
- Execute multiple statements in a single transaction atomically

**3. Schema Discovery (5 tools)**
- List all databases on server
- List tables with schema filtering
- Get column metadata (types, nullability, defaults)
- List stored procedures
- Get comprehensive table information (indexes, foreign keys, constraints)

**4. DDL Operations (7 tools)**
- Create tables with columns and constraints
- Drop tables with IF EXISTS support
- Alter tables (add/drop/modify columns, constraints)
- Truncate tables for fast data removal
- Create indexes (clustered, non-clustered, unique)
- Drop indexes
- Find duplicate and overlapping indexes

**5. Performance Monitoring (15 tools)**
- **CPU Analysis**: Get CPU usage by session with SPID-to-KPID correlation, identify top CPU-consuming queries from plan cache
- **Memory Analysis**: Get overall memory usage, per-database memory consumption, memory pressure indicators, DBCC MEMORYSTATUS output, configure min/max memory settings
- **Wait Statistics**: Analyze wait types to identify bottlenecks (locks, I/O, CPU)
- **Plan Cache**: Analyze plan cache for single-use plans consuming memory, clear plan cache
- **I/O Analysis**: Get I/O latency by database file (>15-20ms indicates storage issues)
- **Blocking**: Identify blocking sessions and blocking chains
- **Processes**: List all running SQL processes and sessions
- **Disk Space**: Get disk space for database files and drives

**6. Backup and Restore (5 tools)**
- **Comprehensive Backups**: Full, differential, and transaction log backups
- **Advanced Features**: Compression, encryption (AES128/192/256, TRIPLEDES), Azure blob storage support, backup striping across multiple files/paths, checksum verification, copy-only backups, dynamic file naming with tokens
- **Restore**: Restore from backup files with automatic file relocation
- **Validation**: RESTORE VERIFYONLY to verify backup integrity
- **History**: Query backup history from msdb with filtering
- **Devices**: List all backup devices

**7. SQL Server Agent (11 tools)**
- List all jobs with status and schedules
- Get job details including steps and history
- Start, stop, enable, disable jobs
- Create new jobs with T-SQL steps
- Delete jobs with history
- List job schedules
- Check SQL Server Agent service status
- **⭐ Maintenance Plan Wizard Guidance**: Get comprehensive best practice guidance for configuring backups and maintenance using SQL Server's Maintenance Plan Wizard (RECOMMENDED for production)

**8. Security Management (19 tools)**
- **Server Roles**: Add/remove logins to server roles (sysadmin, dbcreator, securityadmin, etc.), create/drop custom server roles, list all server roles with members
- **Login Management**: Get login details, create logins (SQL, Windows, Windows groups), remove logins, modify login properties, rename logins, test login passwords, validate Windows logins against Active Directory, find logins in Windows groups, export login scripts for migration
- **Permissions**: Get permissions at server/database/object level, grant permissions (with GRANT OPTION), revoke permissions (with CASCADE), deny permissions (overrides GRANT)

**9. Database Management (16 tools)**
- Get detailed database information
- Create new databases with collation and recovery model
- Drop databases (with force option to kill connections)
- Rename databases or change collation
- Get/set database state (online, offline, emergency, single-user, multi-user)
- Get/set database owner (commonly used after migrations)
- Get/set recovery model (SIMPLE, FULL, BULK_LOGGED)
- Get/set compatibility level (80-160 for SQL 2000-2022)
- Create database snapshots (point-in-time copies using copy-on-write)
- List and restore from database snapshots
- Shrink databases to reclaim unused space (WARNING: causes fragmentation)

**10. File and Filegroup Management (9 tools)**
- Add data files (MDF/NDF) to filegroups
- Remove database files (with EMPTYFILE option)
- Modify file properties (size, max size, growth, path)
- Shrink database files using DBCC SHRINKFILE
- Create filegroups (standard, FILESTREAM, memory-optimized)
- Remove empty filegroups
- Modify filegroup properties (set as default, read-only)
- List filegroups with file details
- List all database files with size and used space

**11. Advanced Administration (13 tools)**
- **Linked Servers**: Create, drop, list, and test linked servers for distributed queries
- **Replication**: Setup replication (transactional, merge, snapshot), create subscriptions
- **Orphan Logins**: Detect and fix orphan database users after migrations
- **Service Management**: Restart SQL Server services (Engine, Agent, Browser, FullText, SSAS, SSIS, SSRS, PolyBase, Launchpad) with dependency handling
- **DBCC Commands**: Integrity checks (CHECKDB, CHECKTABLE, CHECKCONSTRAINTS), show statistics, clear caches, manage trace flags

**12. Database Migration (4 tools)**
- Validate pgloader installation and FreeTDS driver
- Validate migration prerequisites (connectivity, table counts, estimates)
- Execute SQL Server to PostgreSQL migration using pgloader
- Generate pgloader configuration files for review

---

## Real-World DBA Workflows

### Workflow 1: Performance Troubleshooting

**Traditional Approach** (15-30 minutes):
1. DBA receives alert: "Application slow"
2. Opens SSMS, connects to server
3. Searches Google for "SQL Server high CPU DMV query"
4. Copies complex DMV query, modifies it
5. Runs query, analyzes results
6. Searches for wait stats DMV query
7. Runs second query, correlates with CPU data
8. Opens Azure Portal to check VM metrics
9. Searches for blocking session query
10. Runs third query
11. Manually correlates all data points
12. Formulates hypothesis
13. Tests solution

**With SQL Server MCP** (2-5 minutes):
```
DBA: "We're experiencing slow application performance. Help me diagnose the issue."

Claude (via MCP):
Let me check several key areas:
1. Current CPU usage by session
2. Wait statistics
3. Blocking sessions
4. Top CPU-consuming queries

[Executes 4 tools in parallel]

Analysis:
- SPID 73 (login: AppUser) consuming 45% CPU
- Wait type: CXPACKET (parallelism pressure)
- Query: SELECT * FROM Orders WHERE OrderDate > '2024-01-01' (missing index)
- No blocking detected

Recommendation: Add index on Orders.OrderDate

Would you like me to generate the CREATE INDEX statement?
```

**Time saved**: 10-25 minutes
**Cognitive load**: Significantly reduced
**Junior DBA friendly**: Yes, requires no DMV knowledge

### Workflow 2: Database Backup and Disaster Recovery

**Traditional Approach** (10-20 minutes):
1. DBA needs to backup critical database
2. Opens SSMS, writes BACKUP DATABASE T-SQL
3. Forgets compression syntax, Googles it
4. Adds compression, realizes encryption is also needed
5. Googles encryption syntax, updates script
6. Wants backup in Azure blob, Googles that syntax
7. Creates SQL credential for Azure storage
8. Updates backup command with URL
9. Executes, waits 10 minutes
10. Realizes forgot CHECKSUM for verification
11. Re-runs backup with CHECKSUM

**With SQL Server MCP** (1-2 minutes):
```
DBA: "Create a compressed, encrypted backup of ProductionDB to Azure blob storage
      sqlbackupstg2022/sqlbackup with AES256 encryption. Use certificate BackupCert
      and verify with checksum."

Claude (via MCP):
Creating backup with:
- Type: Full backup
- Compression: Enabled
- Encryption: AES_256
- Target: Azure blob storage
- Verification: CHECKSUM + RESTORE VERIFYONLY after completion

[Executes sqlserver_backup_database tool]

✓ Backup completed successfully in 8 minutes 32 seconds
✓ Backup file: ProductionDB_20260103_143022.bak
✓ Size: 2.4 GB (compressed from 5.1 GB)
✓ Verification: PASSED

The backup is available at:
https://sqlbackupstg2022.blob.core.windows.net/sqlbackup/ProductionDB_20260103_143022.bak
```

**Time saved**: 8-18 minutes
**Error prevention**: No syntax mistakes, all best practices applied
**Consistency**: Same parameters and quality every time

### Workflow 3: Security Audit and Compliance

**Traditional Approach** (30-60 minutes):
1. Auditor requests: "List all sysadmin members"
2. DBA writes query against sys.server_principals and sys.server_role_members
3. Exports to Excel
4. Auditor asks: "What database permissions does AppUser have?"
5. DBA writes complex query joining sys.database_permissions, sys.database_principals, sys.objects
6. Exports results
7. Auditor asks: "Has anyone granted permissions with GRANT OPTION?"
8. DBA modifies query to check grant_option column
9. Continues for 15 more audit questions

**With SQL Server MCP** (5-10 minutes):
```
DBA: "I need to complete a security audit. Start with listing all sysadmin members."

Claude (via MCP):
[Executes sqlserver_list_server_roles with filter for sysadmin]

Sysadmin Members:
- sa (SQL Server system account)
- DOMAIN\DBA-Team (Windows group)
- AdminUser (SQL login)

DBA: "Show me all permissions for AppUser across all databases."

Claude:
[Executes sqlserver_get_permissions for AppUser]

AppUser Permissions:
Database: ProductionDB
  - db_datareader role (inherited)
  - EXECUTE on schema dbo
  - SELECT on Orders table (explicit)

Database: StagingDB
  - db_owner role (inherited)

DBA: "Flag any permissions granted with GRANT OPTION."

Claude:
Scanning for GRANT OPTION permissions...

⚠️ Found 2 permissions with GRANT OPTION:
1. AppUser has SELECT on Orders with GRANT OPTION (ProductionDB)
2. ReportUser has VIEW DEFINITION with GRANT OPTION (ProductionDB)

These users can grant their permissions to others. Review if this is intended.
```

**Time saved**: 20-50 minutes
**Audit quality**: More comprehensive, less likely to miss permissions
**Report generation**: Instant, formatted results

### Workflow 4: SQL Server Agent Job Management

**Traditional Approach** (15-30 minutes):
1. DBA needs to create backup job
2. Opens SSMS, navigates to SQL Server Agent
3. Right-clicks Jobs → New Job
4. Fills out job properties form
5. Creates job step with T-SQL
6. Configures schedule through UI wizards
7. Tests job manually
8. Checks job history in UI
9. Realizes job failed, checks error messages
10. Modifies job step, reruns

**With SQL Server MCP** (3-5 minutes):
```
DBA: "Create a SQL Server Agent job to backup all user databases nightly at 11 PM."

Claude (via MCP):
I'll create a comprehensive backup job:

[Executes sqlserver_create_job]

✓ Job created: "Nightly User Database Backups"
✓ Step 1: "Backup All User Databases"
✓ Command: BACKUP DATABASE script with error handling
✓ Schedule: Daily at 11:00 PM

DBA: "Test the job now and show me the results."

Claude:
[Executes sqlserver_start_job]
[Waits for completion]
[Executes sqlserver_get_job_history]

Job Execution Results:
- Status: Success
- Duration: 12 minutes 34 seconds
- Databases backed up: 5
- Total backup size: 8.2 GB

All backups completed successfully.
```

**Time saved**: 10-25 minutes
**Best practices**: Job created with proper error handling automatically
**Testing**: Immediate validation without UI navigation

---

## Advantages and Limitations

### Advantages

**1. Dramatically Lower Barrier to Entry**
- Junior DBAs can perform expert-level operations safely
- No need to memorize DMV queries, PowerShell syntax, or complex T-SQL
- Natural language eliminates need to consult documentation constantly
- Reduces onboarding time from months to weeks

**2. Increased Productivity for Senior DBAs**
- Eliminate context switching between SSMS, PowerShell, Azure Portal, documentation
- Parallel execution of multiple diagnostics (CPU + wait stats + blocking in single request)
- Instant access to dbatools-inspired best practices without writing PowerShell
- Faster incident response during production emergencies

**3. Knowledge Democratization**
- Institutional knowledge encoded in MCP tools
- Consistent operational procedures across teams
- Junior DBAs learn from Claude's explanations while executing tasks
- Reduces dependency on senior staff for routine operations

**4. Reduced Human Error**
- Parameterized queries prevent SQL injection
- Validation built into tools (e.g., max memory recommendations, backup verification)
- Confirmation prompts for destructive operations
- Read-only mode for safe exploration

**5. Cross-Platform Support**
- Runs on Windows, Linux, macOS, and containers
- Supports Windows Authentication (on-premises) and Entra ID (Azure)
- Enables modern DevOps workflows with SQL Server

**6. Comprehensive Coverage**
- 55+ tools spanning the entire SQL Server lifecycle
- From basic queries to advanced replication setup
- Performance monitoring comparable to commercial APM tools
- Security management rivaling enterprise IAM solutions

**7. Conversation Context**
- Claude remembers previous queries and results within session
- Can reference earlier findings ("Show me the blocking chain for SPID 73")
- Builds on previous work without repeating context

**8. Enterprise-Grade Authentication**
- Windows Authentication with SSPI for on-premises
- 6 Entra ID authentication methods for Azure SQL Database
- Managed identities for cloud deployments
- Service principal support for CI/CD pipelines

### Limitations

**1. Requires Claude or MCP-Compatible Client**
- Not a standalone tool; requires Claude Desktop or MCP client
- Monthly Claude subscription cost ($20/month for Claude Pro)
- Internet connectivity required (unless self-hosting Claude)

**2. LLM Non-Determinism**
- LLM might misunderstand ambiguous requests
- Occasional incorrect tool selection for complex multi-step operations
- Requires careful prompt engineering for reliable automation
- Best for interactive use, not headless automation

**3. Limited to Defined Tools**
- Can only execute pre-defined MCP tools (55+ available)
- Cannot create arbitrary new functionality without code changes
- Complex stored procedures or custom logic requires traditional SSMS

**4. Performance Overhead**
- Network latency for Claude API calls (typically 1-3 seconds)
- Not suitable for high-frequency, low-latency operations
- Connection pool helps but not comparable to direct SSMS connection

**5. No GUI Visualization**
- Results are text/table-based, no graphical charts
- No equivalent to SSMS graphical execution plans
- Cannot replace GUI-heavy tools like SSMS query designer

**6. Windows Authentication Limited to Windows**
- msnodesqlv8 driver only works on Windows
- Linux/Mac deployments limited to SQL auth and Entra ID
- Not an issue for Azure SQL Database (Entra ID recommended)

**7. Learning Curve for Advanced Features**
- DBAs must understand what tools exist and when to use them
- Claude's tool selection improves with clearer, more specific requests
- May require experimentation to find optimal phrasing

**8. Security Risks (See Next Section)**
- Executing LLM-generated commands requires trust
- Credentials in environment variables (mitigated by Claude Desktop config)
- Read-write mode enables destructive operations

---

## Security Considerations

### Critical Security Risks

**1. Execution of LLM-Generated Commands**

**Risk**: An LLM might misinterpret a request and execute destructive SQL.

**Example**:
```
DBA Request: "Delete old orders from the Orders table"
Possible Misinterpretation: DELETE FROM Orders; (deletes ALL orders)
Intended Query: DELETE FROM Orders WHERE OrderDate < '2024-01-01';
```

**Mitigations**:
- **Read-Only Mode**: Deploy with `SQL_MODE=readonly` for exploratory access
- **Human-in-the-Loop**: Always review commands before execution, especially DELETE/DROP/TRUNCATE
- **Transaction Rollback**: Begin transaction, execute, review results, then commit or rollback
- **Backup Verification**: Ensure recent backups exist before bulk modifications
- **Least Privilege**: Use SQL accounts with minimal required permissions

**2. Credential Storage and Exposure**

**Risk**: SQL Server credentials stored in environment variables or config files could be exposed.

**Mitigations**:
- **Claude Desktop Config**: Store credentials in Claude Desktop's config (user-level file permissions)
- **Windows Authentication**: Prefer Windows auth (no stored credentials) for on-premises
- **Managed Identities**: Use Azure Managed Identities for cloud deployments (no secrets)
- **Environment Variables**: Better than hardcoded, but still risky if process accessible
- **Secrets Management**: Integrate with Azure Key Vault, AWS Secrets Manager, or HashiCorp Vault (future enhancement)
- **File Permissions**: Ensure .env files and config files have restrictive permissions (chmod 600 on Linux)

**3. Excessive Permissions**

**Risk**: Running MCP server with sysadmin account grants unrestricted access to all databases.

**Mitigations**:
- **Principle of Least Privilege**: Create dedicated SQL account with minimal permissions
- **Read-Only Account**: For monitoring/diagnostics, grant only VIEW SERVER STATE, VIEW DATABASE STATE
- **Database-Scoped**: Grant permissions only to specific databases, not server-level
- **Tool-Specific Roles**: Create custom roles with permissions for specific tool categories

**Recommended Permissions by Use Case**:

| Use Case | Required Permissions |
|----------|----------------------|
| Read-Only Monitoring | VIEW SERVER STATE, VIEW DATABASE STATE, SELECT on DMVs |
| Query Execution | db_datareader, db_datawriter on specific databases |
| Schema Management | db_ddladmin on specific databases |
| Backup/Restore | db_backupoperator, ALTER ANY DATABASE |
| Security Auditing | VIEW ANY DEFINITION, VIEW SERVER STATE |
| Full Administration | db_owner on specific databases (NOT sysadmin unless required) |

**4. Network Exposure**

**Risk**: If MCP server is network-accessible, it could be exploited.

**Mitigations**:
- **Local Only**: Run MCP server on localhost (default), not exposed to network
- **No HTTP Server**: This MCP server uses stdio, not HTTP, so no open ports
- **Firewall Rules**: SQL Server firewall rules still apply (defense in depth)
- **VPN/Bastion**: Access SQL Server through VPN or bastion host for cloud deployments

**5. Logging and Auditing**

**Risk**: Without logging, destructive operations or security incidents go unnoticed.

**Mitigations**:
- **SQL Server Audit**: Enable SQL Server Audit to log all queries executed
- **Extended Events**: Configure Extended Events for detailed query logging
- **Application Logging**: MCP server logs all tool executions to stdout (redirect to file)
- **Change Data Capture**: Enable CDC on critical tables to track modifications
- **Regular Review**: Periodically review logs for suspicious activity

**6. Injection Attacks**

**Risk**: If LLM incorporates user input directly into SQL, SQL injection is possible.

**Mitigations**:
- **Parameterized Queries**: All tools use parameterized queries (built-in protection)
- **Input Validation**: Zod schemas validate all inputs before execution
- **No Dynamic SQL**: Tools avoid dynamic SQL construction where possible
- **Whitelist Validation**: Object names validated against schema metadata

**Example** (sqlserver_execute_query tool):
```typescript
// Safe: Uses parameterized query
await request.input('id', sql.Int, 123);
await request.query('SELECT * FROM Users WHERE UserId = @id');

// Unsafe (NOT done in this codebase):
const userId = '123; DROP TABLE Users;--';
await request.query(`SELECT * FROM Users WHERE UserId = ${userId}`);
```

### Security Best Practices

**1. Use Windows Authentication When Possible**
- No stored credentials
- Audited by Active Directory
- Centralized access control

**2. Deploy in Read-Only Mode for Exploration**
```json
{
  "mcpServers": {
    "sql-server-readonly": {
      "command": "node",
      "args": ["C:\\path\\to\\sql-server-mcp\\dist\\index.js"],
      "env": {
        "SQL_MODE": "readonly",
        "SQL_AUTH_TYPE": "windows",
        "SQL_SERVER": "localhost",
        "SQL_DATABASE": "master"
      }
    }
  }
}
```

**3. Regular Permission Audits**
```
DBA: "List all logins with sysadmin privileges"
Claude: [Executes sqlserver_list_server_roles filtering for sysadmin]

DBA: "Show me all users with db_owner role across all databases"
Claude: [Executes sqlserver_get_permissions filtering for db_owner]
```

**4. Transaction-Based Testing**
```
DBA: "Begin a transaction"
Claude: [Executes sqlserver_begin_transaction]

DBA: "Delete orders older than 2 years"
Claude: [Executes DELETE within transaction]
Result: 1,247 rows deleted

DBA: "Review the remaining orders"
Claude: [Executes SELECT COUNT(*)]
Result: 3,892 orders remain

DBA: "This looks wrong. Rollback the transaction"
Claude: [Executes sqlserver_rollback_transaction]
✓ Transaction rolled back. No data lost.
```

**5. Enable SQL Server Audit**
```sql
-- Create server audit
CREATE SERVER AUDIT MCP_Server_Audit
TO FILE (FILEPATH = 'C:\SQLAudit\', MAXSIZE = 100 MB);
ALTER SERVER AUDIT MCP_Server_Audit WITH (STATE = ON);

-- Create audit specification
CREATE SERVER AUDIT SPECIFICATION MCP_Queries_Spec
FOR SERVER AUDIT MCP_Server_Audit
ADD (BATCH_COMPLETED_GROUP),
ADD (FAILED_LOGIN_GROUP);
ALTER SERVER AUDIT SPECIFICATION MCP_Queries_Spec WITH (STATE = ON);
```

---

## Configuration Guide

### Prerequisites

**Required**:
- **Node.js**: 18.0.0 or higher ([Download](https://nodejs.org/))
- **SQL Server**: 2012 or higher (on-premises, Azure SQL Database, or Managed Instance)
- **Operating System**: Windows, Linux, or macOS
- **Claude Desktop**: [Download](https://claude.ai/download) or Claude Code CLI

**For Windows Authentication**:
- Windows operating system (msnodesqlv8 driver requirement)
- SQL Server configured for Windows Authentication or Mixed Mode
- Windows account with SQL Server login and appropriate permissions

**For Entra ID Authentication**:
- Azure SQL Database
- Managed Identity, Service Principal, or Azure AD user configured
- Database user mapped to the identity

### Installation Steps

**Step 1: Clone or Download Repository**

```bash
git clone https://github.com/your-username/sql-server-mcp.git
cd sql-server-mcp
```

**Step 2: Install Dependencies**

```bash
npm install
```

This installs:
- @modelcontextprotocol/sdk
- mssql (wrapper for SQL Server drivers)
- msnodesqlv8 (Windows Authentication driver)
- tedious (SQL/Entra ID authentication driver)
- zod (schema validation)
- dotenv (environment config)

**Step 3: Configure Environment Variables**

Copy the example configuration:

```bash
cp .env.example .env
```

Edit `.env` for your environment:

**Windows Authentication** (On-Premises):
```env
SQL_AUTH_TYPE=windows
SQL_SERVER=localhost
SQL_DATABASE=master
SQL_TRUSTED_CONNECTION=true
SQL_ENCRYPT=true
SQL_TRUST_SERVER_CERTIFICATE=true

# Optional: Connection pool settings
SQL_POOL_MIN=2
SQL_POOL_MAX=10
SQL_CONNECTION_TIMEOUT=30000
SQL_REQUEST_TIMEOUT=30000
```

**SQL Authentication**:
```env
SQL_AUTH_TYPE=sql
SQL_SERVER=localhost
SQL_DATABASE=master
SQL_USERNAME=dbuser
SQL_PASSWORD=SecurePassword123!
SQL_ENCRYPT=true
SQL_TRUST_SERVER_CERTIFICATE=true
```

**Entra ID Authentication** (Azure SQL Database):
```env
SQL_AUTH_TYPE=entra
SQL_SERVER=myserver.database.windows.net
SQL_DATABASE=mydatabase
SQL_ENTRA_AUTH_TYPE=azure-active-directory-default

# For Managed Identity (azure-active-directory-msi-vm or azure-active-directory-msi-app-service):
# No additional config required

# For Service Principal (azure-active-directory-service-principal-secret):
SQL_CLIENT_ID=your-app-id
SQL_CLIENT_SECRET=your-app-secret
SQL_TENANT_ID=your-tenant-id

# For Password Auth (azure-active-directory-password):
SQL_USERNAME=user@yourdomain.com
SQL_PASSWORD=yourpassword
```

**Read-Only Mode** (Optional, for safety):
```env
SQL_MODE=readonly
```

**Step 4: Build the TypeScript Project**

```bash
npm run build
```

This compiles TypeScript to JavaScript in `dist/` directory.

**Step 5: Test the Connection**

```bash
# Test Windows Authentication
node test-msnodesqlv8-import.cjs

# Test SQL Authentication
node test-simple.cjs

# Test MCP connection
node test-mcp-connection.cjs
```

Expected output:
```
✓ Connection successful
✓ SQL Server version: Microsoft SQL Server 2022 (RTM) - 16.0.1000.6
✓ Current database: master
✓ Server name: localhost
```

### Claude Desktop Integration

**Step 6: Configure Claude Desktop**

Locate your Claude Desktop configuration file:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Add the MCP server configuration:

```json
{
  "mcpServers": {
    "sql-server": {
      "command": "node",
      "args": [
        "C:\\Users\\YourUsername\\sql-server-mcp\\dist\\index.js"
      ],
      "env": {
        "SQL_AUTH_TYPE": "windows",
        "SQL_SERVER": "localhost",
        "SQL_DATABASE": "master",
        "SQL_TRUSTED_CONNECTION": "true",
        "SQL_ENCRYPT": "true",
        "SQL_TRUST_SERVER_CERTIFICATE": "true"
      }
    }
  }
}
```

**Important**: Use **absolute paths** in the `args` array.

**Step 7: Restart Claude Desktop**

After modifying the configuration:
1. Completely quit Claude Desktop (not just close window)
2. Relaunch Claude Desktop
3. Open a new conversation

**Step 8: Verify MCP Server**

In Claude, type:

```
Show me all databases on the SQL Server
```

Claude should respond with a list of databases. If this works, configuration is successful!

### Troubleshooting

**Issue: "Login failed for user ''"**

**Cause**: Using tedious driver for Windows Authentication

**Solution**: Verify `SQL_AUTH_TYPE=windows` in config and that `src/connection.ts` is loading `mssql/msnodesqlv8`

**Issue: "Cannot find module 'mssql/msnodesqlv8'"**

**Cause**: msnodesqlv8 not installed

**Solution**:
```bash
npm install msnodesqlv8
npm rebuild msnodesqlv8
```

**Issue: "Connection timeout"**

**Cause**: SQL Server not accessible

**Solution**:
1. Verify SQL Server is running: `Get-Service MSSQLSERVER` (PowerShell)
2. Check firewall allows port 1433
3. For Azure: Check firewall rules and VNet configuration
4. Test connectivity: `telnet localhost 1433` or `Test-NetConnection -ComputerName localhost -Port 1433`

**Issue: "MCP server not appearing in Claude"**

**Solution**:
1. Verify JSON syntax in `claude_desktop_config.json` (use JSON validator)
2. Check absolute paths are correct
3. Ensure `dist/index.js` exists (run `npm run build`)
4. Restart Claude Desktop completely (quit and relaunch)
5. Check Claude Desktop logs (Help → View Logs)

---

## Practical Use Cases

### Use Case 1: Daily Health Check

**Scenario**: DBA needs to perform daily health checks across multiple SQL Servers.

**Traditional Approach**: Manual checklist, SSMS on each server, Excel spreadsheet

**With SQL Server MCP**:
```
DBA: "Perform a comprehensive health check on this SQL Server and report any issues."

Claude (executes multiple tools in parallel):
1. Server Information
2. Database Status and Sizes
3. Error Log (last 24 hours)
4. Backup Status (verify all databases backed up recently)
5. SQL Server Agent Job Failures
6. Long-Running Queries
7. Blocking Sessions
8. Disk Space
9. Memory Pressure Indicators

Health Check Report:

✓ Server: SQL2022PROD (Version 16.0.1000.6)
✓ Uptime: 45 days
✓ Databases: 12 online, 0 offline

⚠️ Issues Found:
1. Database [OldApp] not backed up in 14 days (last backup: 2025-12-20)
2. SQL Agent job "ETL_Nightly" failed last 3 runs
3. Disk C: only 8% free space (12 GB remaining)
4. 2 blocking sessions detected (SPID 184 blocking SPID 209)

Recommendations:
1. Initiate backup for OldApp database immediately
2. Investigate ETL_Nightly job failure (check job history)
3. Plan disk space expansion or archive old backups
4. Review blocking session query and consider query optimization

Would you like me to take action on any of these issues?
```

**Outcome**: 5-minute health check vs. 30-minute manual process. Issues identified proactively.

### Use Case 2: Emergency Response

**Scenario**: 2 AM production alert - "Users reporting slow application response"

**Traditional Approach**: VPN in, open SSMS, scramble to remember diagnostic queries

**With SQL Server MCP**:
```
DBA (from phone at 2 AM): "Emergency. Production is slow. Show me what's happening."

Claude (immediate diagnostics):
Analyzing SQL Server ProductionDB...

🔴 CRITICAL ISSUES:
1. BLOCKING CHAIN DETECTED
   - Head Blocker: SPID 347 (login: ETLServiceAccount)
   - Blocking: 23 other sessions
   - Duration: 00:18:43 (18 minutes)
   - Wait Type: LCK_M_X (exclusive lock)
   - Resource: KEY: DB_ID=5, HOBT_ID=72057594043957248, KEY=...

2. HIGH CPU USAGE
   - SPID 347 consuming 78% CPU
   - Query: UPDATE Inventory SET LastSync = GETDATE() WHERE 1=1
   - Problem: WHERE 1=1 means full table scan and update (all 8.3M rows)

ROOT CAUSE:
ETL process is performing full table update with exclusive locks,
blocking all other queries.

IMMEDIATE ACTIONS:
1. Kill SPID 347: KILL 347
2. This will rollback the ETL transaction
3. All 23 blocked sessions will resume

PERMANENT FIX:
1. Fix ETL query to update only changed rows
2. Add WHERE clause: WHERE NeedsSync = 1
3. Add index on NeedsSync column
4. Consider using READ COMMITTED SNAPSHOT isolation

Would you like me to kill SPID 347 now? (Type YES to confirm)
```

```
DBA: YES

Claude:
[Executes: KILL 347]

✓ SPID 347 killed
✓ Transaction rolled back
✓ Blocking cleared
✓ All 23 sessions resumed

Monitoring CPU usage...
CPU: 78% → 12% (normalized)

Crisis resolved. Production is operational.

Next steps:
1. Contact ETL team about the faulty query
2. Implement the index I recommended
3. Set up alerts for long-running queries (>5 minutes)
```

**Outcome**: 3-minute resolution vs. 15-30 minutes of frantic troubleshooting. From phone, without opening laptop.

### Use Case 3: Migration Preparation

**Scenario**: Migrating application from SQL Server 2014 to SQL Server 2022

**With SQL Server MCP**:
```
DBA: "I'm migrating from SQL Server 2014 to 2022. What should I check?"

Claude:
Migration checklist for SQL Server 2014 → 2022:

1. Compatibility Level Assessment:
[Executes sqlserver_get_db_compatibility]

Current databases running at compatibility level 120 (SQL 2014):
- ProductionDB
- ArchiveDB
- ReportingDB

2. Deprecated Features Check:
Let me scan for deprecated features in your databases...
[Analyzes stored procedures, views, functions]

⚠️ Deprecated features found:
- Using legacy RAISERROR syntax (21 occurrences)
- INDEXDEFRAG (use ALTER INDEX REORGANIZE)
- sp_dboption (use ALTER DATABASE)

3. Linked Servers:
[Executes sqlserver_list_linked_servers]
2 linked servers found - these will need re-creation

4. SQL Agent Jobs:
[Executes sqlserver_list_agent_jobs]
37 jobs found - job definitions should be scripted out

5. Logins and Permissions:
[Executes sqlserver_export_login]
Generated script to recreate all logins with passwords

DBA: "Generate a migration plan with scripts."

Claude:
Migration Plan for SQL Server 2014 → 2022:

PHASE 1: Pre-Migration (Do this NOW)
1. Export all logins (script generated: logins_export.sql)
2. Document all linked servers (script generated: linked_servers.sql)
3. Script out all SQL Agent jobs (use sqlserver_export_login for each job)
4. Full backup of all databases with CHECKSUM
5. Test restore on SQL 2022 test environment

PHASE 2: Code Remediation (Before migration day)
1. Update RAISERROR to THROW statements
2. Replace deprecated functions
3. Test compatibility level 160 (SQL 2022) on test server

PHASE 3: Migration Day
1. Quiesce application (maintenance mode)
2. Final backup with CHECKSUM and COPY_ONLY
3. Restore to SQL 2022 server
4. Run sqlserver_set_db_compatibility (set to 160)
5. Update database statistics: UPDATE STATISTICS
6. Recompile procedures: sp_recompile
7. Re-create linked servers
8. Re-create SQL Agent jobs
9. Re-create logins
10. Test application thoroughly
11. Monitor performance for 24 hours

PHASE 4: Post-Migration
1. Enable Query Store for all databases
2. Baseline performance metrics
3. Deprecate old SQL 2014 server (keep for 30 days as fallback)

Would you like me to generate the SQL scripts for any of these phases?
```

**Outcome**: Comprehensive migration plan in 5 minutes. All edge cases considered.

### Use Case 4: Capacity Planning

**Scenario**: CFO asks "How much database storage will we need next quarter?"

**With SQL Server MCP**:
```
DBA: "I need to forecast database storage growth for Q1 2026."

Claude:
Let me analyze historical growth patterns...

[Executes sqlserver_get_database to get current sizes]
[Executes sqlserver_find_db_growth_event to analyze growth history]

Storage Growth Analysis:

Current Total: 482 GB across 12 databases

Database Growth (Last 90 days):
ProductionDB:    +42 GB  (14% growth, +0.47 GB/day)
LogArchive:      +18 GB  (9% growth, +0.20 GB/day)
Analytics:       +31 GB  (22% growth, +0.34 GB/day)
StagingDB:       +5 GB   (3% growth)
[Other databases with minimal growth]

Total Growth: +96 GB in 90 days = 1.07 GB/day average

Q1 2026 Forecast (90 days):
Linear Projection: 482 GB + (1.07 GB/day × 90 days) = 578 GB
Growth Rate: +96 GB (+20% increase)
Recommended Capacity: 650 GB (12% buffer for headroom)

Recommendations:
1. Current storage: 1 TB (48% utilized)
2. After Q1 growth: 578 GB (58% utilized)
3. No immediate storage expansion needed (plenty of headroom)
4. Monitor ProductionDB closely (fastest growth rate)
5. Consider archiving strategy for LogArchive database

Would you like me to generate:
1. Detailed growth charts by database?
2. Auto-growth event analysis?
3. File/filegroup distribution recommendations?
```

**Outcome**: CFO gets answer in 5 minutes with executive summary and technical details.

---

## Future Roadmap

### Planned Enhancements

**1. Query Store Integration**
- Analyze Query Store for performance regressions
- Identify forced plans and plan guide recommendations
- Automatic Performance Tuning Advisor integration

**2. Extended Events Integration**
- Define and manage Extended Event sessions
- Real-time event monitoring and alerting
- Historical event analysis and reporting

**3. Always On Availability Groups**
- Monitor AG health and synchronization status
- Failover automation with validation
- Readable secondary query routing

**4. Azure Arc Integration**
- Manage on-premises SQL Server via Azure Arc
- Unified management for hybrid deployments
- Azure Policy compliance scanning

**5. PowerShell dbatools Direct Integration**
- Execute actual dbatools cmdlets where beneficial
- Leverage full 600+ cmdlet library
- Hybrid TypeScript + PowerShell architecture

**6. Security Enhancements**
- Azure Key Vault integration for credential storage
- Certificate-based authentication
- Multi-factor authentication for sensitive operations
- Audit logging with tamper-proof storage

**7. Cost Analysis**
- Azure SQL Database cost recommendations
- Identify idle or underutilized resources
- Right-sizing recommendations for DTU/vCore

**8. Intelligent Automation**
- Auto-remediation for common issues (blocking, deadlocks, high CPU)
- Predictive maintenance based on historical patterns
- Intelligent index recommendations using Machine Learning

**9. Multi-Server Management**
- Register and manage multiple SQL Server instances
- Execute commands across server groups
- Centralized inventory and compliance reporting

**10. Backup Lifecycle Management**
- Automated backup rotation and archival
- Backup encryption key management
- Backup restore testing automation

### Known Limitations to Address

**1. No Support for SQL Server 2008 and Earlier**
- Current implementation targets SQL Server 2012+
- Older versions have deprecated T-SQL syntax

**2. Limited Graph Database Support**
- SQL Server 2017+ graph database features not yet implemented
- MATCH clause in queries not supported

**3. No Stretch Database Support**
- Stretch Database (archived cold data to Azure) not implemented
- Limited demand for this deprecated feature

**4. No SQL Server R Services / Machine Learning Services**
- sp_execute_external_script not supported
- Python/R integration not exposed

**5. Limited SSIS Integration**
- SQL Server Integration Services (SSIS) package execution not supported
- Focus on T-SQL and database operations, not ETL orchestration

**6. No Polybase External Tables**
- External tables via PolyBase not yet supported
- Focus on core SQL Server functionality

**7. Temporal Tables Basic Support**
- System-versioned temporal tables can be queried
- No specialized temporal table management tools yet

---

## Conclusion

SQL Server MCP represents a paradigm shift in database administration. By combining the power of Large Language Models (Claude) with comprehensive SQL Server tooling inspired by industry-standard dbatools, we enable DBAs to:

- **Work faster** through natural language interfaces
- **Work smarter** with built-in best practices and expert guidance
- **Work safer** with validation, read-only modes, and transaction support
- **Work anywhere** with cross-platform support and cloud authentication

This project is not about replacing DBAs—it's about **augmenting their capabilities**, reducing toil, and democratizing database expertise. Junior DBAs gain instant access to senior-level knowledge. Senior DBAs eliminate context switching and automate routine tasks.

With 55+ tools spanning the entire SQL Server lifecycle, enterprise-grade authentication, and dbatools-inspired functionality, SQL Server MCP is the most comprehensive LLM-accessible SQL Server management solution available today.

---

## Contributing and Support

**GitHub Repository**: [https://github.com/your-username/sql-server-mcp](https://github.com/your-username/sql-server-mcp)

**License**: MIT

**Contributing**: Pull requests welcome! See CONTRIBUTING.md for guidelines.

**Issues**: Report bugs or request features via GitHub Issues.

**Community**: Join our Discord server for discussions and support.

---

## Acknowledgments

- **dbatools Community**: For creating the definitive PowerShell toolkit for SQL Server administration
- **Model Context Protocol**: Anthropic's MCP specification enabling LLM tool integration
- **Claude**: Anthropic's AI assistant making natural language database administration possible
- **Microsoft SQL Server Team**: For building a powerful, enterprise-grade database platform
- **Open Source Community**: For the libraries and tools that make this project possible

---

**Build Date**: January 3, 2026
**Version**: 1.0.0
**Maintainer**: [Your Name]
**Documentation**: See README.md for user guide, CLAUDE.md for development guide

**Star this repository** if you find it useful! Contributions and feedback are highly appreciated.
