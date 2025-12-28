# SQL Server MCP - 30 New Tools Specification

This document provides detailed specifications for the 30 new tools added to the SQL Server MCP server, organized into Performance Monitoring (12 tools) and Database Management (18 tools) categories.

---

## Performance Monitoring Tools (12 Tools)

### Memory Management (6 Tools)

#### 1. sqlserver_get_memory_usage
**Description:** Get SQL Server memory usage statistics showing how much memory is allocated and used.

**Category:** Performance Monitoring > Memory Management

**Based on:** dbatools `Get-DbaMemoryUsage`

**Input Parameters:** None

**Returns:**
- Process memory statistics (physical memory in use, locked pages, virtual address space)
- System memory statistics (total/available physical memory, page file, system cache)
- Top 10 memory clerks by usage (buffer pool, query execution, optimizer, etc.)

**Read-Only:** Yes

**Usage Example:**
```typescript
// Get comprehensive memory usage statistics
sqlserver_get_memory_usage()
```

---

#### 2. sqlserver_get_db_memory_usage
**Description:** Get memory usage breakdown by database showing buffer pool allocation per database.

**Category:** Performance Monitoring > Memory Management

**Based on:** dbatools `Get-DbaDbMemoryUsage`

**Input Parameters:** None

**Returns:**
- Database name
- Buffer pool pages allocated
- Memory used in MB
- Percentage of total buffer pool

**Read-Only:** Yes

**Usage Example:**
```typescript
// Get memory usage by database
sqlserver_get_db_memory_usage()
```

---

#### 3. sqlserver_get_memory_condition
**Description:** Get current memory pressure condition and memory state indicators.

**Category:** Performance Monitoring > Memory Management

**Based on:** dbatools `Get-DbaMemoryCondition`

**Input Parameters:** None

**Returns:**
- System memory state (Available, Low, or Critical)
- Process memory pressure indicators
- Memory utilization percentage
- Available commit limit

**Read-Only:** Yes

**Usage Example:**
```typescript
// Check current memory pressure
sqlserver_get_memory_condition()
```

---

#### 4. sqlserver_get_dbcc_memory_status
**Description:** Run DBCC MEMORYSTATUS for detailed memory allocation information across all memory components.

**Category:** Performance Monitoring > Memory Management

**Based on:** dbatools `Get-DbaDbccMemoryStatus`

**Input Parameters:** None

**Returns:** Multiple result sets from DBCC MEMORYSTATUS including:
- Memory Manager
- Buffer Distribution
- Buffer Pool
- Procedure Cache
- Global Memory Objects
- Query Memory Objects
- Optimization Queue
- Memory Brokers
- And more detailed memory components

**Read-Only:** Yes

**Warning:** Resource-intensive operation

**Usage Example:**
```typescript
// Get detailed DBCC MEMORYSTATUS output
sqlserver_get_dbcc_memory_status()
```

---

#### 5. sqlserver_get_max_memory
**Description:** Get current min and max server memory configuration settings.

**Category:** Performance Monitoring > Memory Management

**Based on:** dbatools `Get-DbaMaxMemory`

**Input Parameters:** None

**Returns:**
- Current min server memory (MB)
- Current max server memory (MB)
- Recommended max memory based on system RAM

**Read-Only:** Yes

**Usage Example:**
```typescript
// Get memory configuration
sqlserver_get_max_memory()
```

---

#### 6. sqlserver_set_max_memory
**Description:** Configure SQL Server min and max server memory settings.

**Category:** Performance Monitoring > Memory Management

**Based on:** dbatools `Set-DbaMaxMemory`

**Input Parameters:**
- `maxMemoryMB` (required): Maximum server memory in MB
- `minMemoryMB` (optional): Minimum server memory in MB (default: 0)

**Returns:** Confirmation with old and new values

**Read-Only:** No (Write operation)

**Usage Example:**
```typescript
// Set max memory to 8GB
sqlserver_set_max_memory({ maxMemoryMB: 8192 })

// Set max memory to 16GB and min memory to 4GB
sqlserver_set_max_memory({ maxMemoryMB: 16384, minMemoryMB: 4096 })
```

---

### Plan Cache Management (2 Tools)

#### 7. sqlserver_get_plan_cache
**Description:** Analyze plan cache size, entry count, and breakdown by object type (stored procedures, ad-hoc queries, prepared statements).

**Category:** Performance Monitoring > Plan Cache

**Based on:** dbatools `Get-DbaPlanCache`

**Input Parameters:** None

**Returns:**
- Total plan cache size (MB)
- Number of cached plans
- Breakdown by object type (Proc, Adhoc, Prepared, etc.)
- Memory usage per type

**Read-Only:** Yes

**Usage Example:**
```typescript
// Analyze plan cache
sqlserver_get_plan_cache()
```

---

#### 8. sqlserver_clear_plan_cache
**Description:** Clear SQL Server plan cache to remove cached execution plans. Can clear entire cache or for specific database.

**Category:** Performance Monitoring > Plan Cache

**Based on:** dbatools `Clear-DbaPlanCache`

**Input Parameters:**
- `database` (optional): Specific database name to clear cache for

**Returns:** Confirmation message

**Read-Only:** No (Write operation)

**Warning:** Impacts performance temporarily as plans need to be recompiled

**Usage Example:**
```typescript
// Clear entire plan cache
sqlserver_clear_plan_cache()

// Clear plan cache for specific database
sqlserver_clear_plan_cache({ database: "MyDatabase" })
```

---

### IO Performance (2 Tools)

#### 9. sqlserver_get_io_latency
**Description:** Get IO latency statistics by database file showing read/write latency and throughput.

**Category:** Performance Monitoring > IO Performance

**Based on:** dbatools `Get-DbaIoLatency`

**Input Parameters:** None

**Returns:** Per database file:
- Database name
- File name and type (data/log)
- Read latency (ms)
- Write latency (ms)
- Total IO operations
- IO stall percentage
- Read/Write MB throughput

**Read-Only:** Yes

**Usage Example:**
```typescript
// Get IO latency statistics
sqlserver_get_io_latency()
```

---

#### 10. sqlserver_get_disk_space
**Description:** Get database file sizes and drive space information showing disk utilization.

**Category:** Performance Monitoring > IO Performance

**Based on:** dbatools `Get-DbaDiskSpace`

**Input Parameters:** None

**Returns:**
- Database files: name, size, used space
- Drives: mount point, total space (GB), available space (GB), percent free
- Warning for drives with < 15% free space

**Read-Only:** Yes

**Usage Example:**
```typescript
// Get disk space information
sqlserver_get_disk_space()
```

---

### Blocking & Process Monitoring (2 Tools)

#### 11. sqlserver_get_blocking
**Description:** Identify blocking sessions and blocked sessions showing wait chains and blocking hierarchy.

**Category:** Performance Monitoring > Blocking & Process

**Based on:** dbatools `Get-DbaBlocking`

**Input Parameters:** None

**Returns:**
- Blocking session ID (blocker)
- Blocked session ID
- Wait time (seconds)
- Wait type
- Blocking query text
- Database name

**Read-Only:** Yes

**Usage Example:**
```typescript
// Get current blocking sessions
sqlserver_get_blocking()
```

---

#### 12. sqlserver_get_process
**Description:** Get active session details including queries, status, CPU/memory usage, and wait information.

**Category:** Performance Monitoring > Blocking & Process

**Based on:** dbatools `Get-DbaProcess`

**Input Parameters:**
- `sessionId` (optional): Filter by specific session ID
- `database` (optional): Filter by database name
- `login` (optional): Filter by login name
- `hostname` (optional): Filter by hostname
- `excludeSystemProcesses` (optional, default: true): Exclude system processes

**Returns:** Per session:
- Session ID
- Login name
- Hostname
- Database name
- Status
- Command
- CPU time
- Memory usage
- Reads/Writes
- Wait type and time
- Query text

**Read-Only:** Yes

**Usage Example:**
```typescript
// Get all active sessions
sqlserver_get_process()

// Get specific session
sqlserver_get_process({ sessionId: 52 })

// Get sessions for specific database
sqlserver_get_process({ database: "MyDatabase" })
```

---

## Database Management Tools (18 Tools)

### Database CRUD Operations (4 Tools)

#### 13. sqlserver_get_database
**Description:** Get detailed database information including size, status, recovery model, compatibility level, and configuration.

**Category:** Database Management > CRUD

**Based on:** dbatools `Get-DbaDatabase`

**Input Parameters:**
- `database` (optional): Specific database name to query
- `excludeSystem` (optional, default: false): Exclude system databases

**Returns:** Per database:
- Database name
- Database ID
- Owner
- Status
- Recovery model
- Compatibility level
- Collation
- Size (MB)
- Space available (MB)
- Creation date
- Last backup date

**Read-Only:** Yes

**Usage Example:**
```typescript
// Get all databases
sqlserver_get_database()

// Get specific database
sqlserver_get_database({ database: "MyDatabase" })

// Get only user databases
sqlserver_get_database({ excludeSystem: true })
```

---

#### 14. sqlserver_new_database
**Description:** Create a new SQL Server database with optional configuration for data/log file paths, collation, and recovery model.

**Category:** Database Management > CRUD

**Based on:** dbatools `New-DbaDatabase`

**Input Parameters:**
- `database` (required): Database name to create
- `dataFilePath` (optional): Physical path for data file
- `logFilePath` (optional): Physical path for log file
- `collation` (optional): Database collation
- `recoveryModel` (optional): Recovery model (SIMPLE, FULL, BULK_LOGGED)
- `owner` (optional): Database owner login

**Returns:** Confirmation with database details

**Read-Only:** No (Write operation)

**Usage Example:**
```typescript
// Create simple database
sqlserver_new_database({ database: "MyNewDB" })

// Create with full configuration
sqlserver_new_database({
  database: "ProductionDB",
  dataFilePath: "D:\\Data\\ProductionDB.mdf",
  logFilePath: "E:\\Logs\\ProductionDB_log.ldf",
  collation: "SQL_Latin1_General_CP1_CI_AS",
  recoveryModel: "FULL",
  owner: "sa"
})
```

---

#### 15. sqlserver_remove_database
**Description:** Drop (delete) a SQL Server database. WARNING: This permanently deletes the database and all its data.

**Category:** Database Management > CRUD

**Based on:** dbatools `Remove-DbaDatabase`

**Input Parameters:**
- `database` (required): Database name to drop
- `force` (optional, default: false): Kill active connections before dropping

**Returns:** Confirmation message

**Read-Only:** No (Write operation)

**Warning:** Permanent data loss

**Usage Example:**
```typescript
// Drop database
sqlserver_remove_database({ database: "OldDatabase" })

// Force drop with active connections
sqlserver_remove_database({
  database: "OldDatabase",
  force: true
})
```

---

#### 16. sqlserver_set_database
**Description:** Modify database properties including renaming and changing collation.

**Category:** Database Management > CRUD

**Based on:** dbatools `Set-DbaDatabase`

**Input Parameters:**
- `database` (required): Current database name
- `newName` (optional): New database name (for renaming)
- `collation` (optional): New collation

**Returns:** Confirmation message

**Read-Only:** No (Write operation)

**Usage Example:**
```typescript
// Rename database
sqlserver_set_database({
  database: "OldName",
  newName: "NewName"
})

// Change collation
sqlserver_set_database({
  database: "MyDatabase",
  collation: "Latin1_General_CI_AS"
})
```

---

### Database State Management (2 Tools)

#### 17. sqlserver_get_db_state
**Description:** Get database state (ONLINE/OFFLINE/RESTORING/RECOVERING), user access mode, and read-only status.

**Category:** Database Management > State

**Based on:** dbatools `Get-DbaDbState`

**Input Parameters:**
- `database` (required): Database name to query

**Returns:**
- Database state
- User access mode (MULTI_USER/SINGLE_USER/RESTRICTED_USER)
- Read-only status
- Status description

**Read-Only:** Yes

**Usage Example:**
```typescript
// Get database state
sqlserver_get_db_state({ database: "MyDatabase" })
```

---

#### 18. sqlserver_set_db_state
**Description:** Change database state and access mode (ONLINE, OFFLINE, EMERGENCY, SINGLE_USER, MULTI_USER, READ_ONLY, READ_WRITE).

**Category:** Database Management > State

**Based on:** dbatools `Set-DbaDbState`

**Input Parameters:**
- `database` (required): Database name
- `state` (optional): Target state (ONLINE, OFFLINE, EMERGENCY)
- `access` (optional): User access (SINGLE_USER, RESTRICTED_USER, MULTI_USER)
- `readOnly` (optional): Read-only mode (true/false)
- `force` (optional, default: false): Use WITH ROLLBACK IMMEDIATE

**Returns:** Confirmation message

**Read-Only:** No (Write operation)

**Usage Example:**
```typescript
// Take database offline
sqlserver_set_db_state({
  database: "MyDatabase",
  state: "OFFLINE"
})

// Set to single user mode
sqlserver_set_db_state({
  database: "MyDatabase",
  access: "SINGLE_USER",
  force: true
})

// Set to read-only
sqlserver_set_db_state({
  database: "MyDatabase",
  readOnly: true
})
```

---

### Database Owner Management (2 Tools)

#### 19. sqlserver_get_db_owner
**Description:** Get the current database owner login name.

**Category:** Database Management > Owner

**Based on:** dbatools `Get-DbaDbOwner`

**Input Parameters:**
- `database` (required): Database name

**Returns:**
- Database name
- Owner login name

**Read-Only:** Yes

**Usage Example:**
```typescript
// Get database owner
sqlserver_get_db_owner({ database: "MyDatabase" })
```

---

#### 20. sqlserver_set_db_owner
**Description:** Change database owner to a different login.

**Category:** Database Management > Owner

**Based on:** dbatools `Set-DbaDbOwner`

**Input Parameters:**
- `database` (required): Database name
- `owner` (required): New owner login name

**Returns:** Confirmation message

**Read-Only:** No (Write operation)

**Usage Example:**
```typescript
// Change database owner
sqlserver_set_db_owner({
  database: "MyDatabase",
  owner: "sa"
})
```

---

### Recovery Model Management (2 Tools)

#### 21. sqlserver_get_db_recovery_model
**Description:** Get the current recovery model (SIMPLE, FULL, or BULK_LOGGED).

**Category:** Database Management > Recovery Model

**Based on:** dbatools `Get-DbaDbRecoveryModel`

**Input Parameters:**
- `database` (required): Database name

**Returns:**
- Database name
- Recovery model
- Recovery model description

**Read-Only:** Yes

**Usage Example:**
```typescript
// Get recovery model
sqlserver_get_db_recovery_model({ database: "MyDatabase" })
```

---

#### 22. sqlserver_set_db_recovery_model
**Description:** Change database recovery model to SIMPLE, FULL, or BULK_LOGGED.

**Category:** Database Management > Recovery Model

**Based on:** dbatools `Set-DbaDbRecoveryModel`

**Input Parameters:**
- `database` (required): Database name
- `recoveryModel` (required): New recovery model (SIMPLE, FULL, BULK_LOGGED)

**Returns:** Confirmation message

**Read-Only:** No (Write operation)

**Usage Example:**
```typescript
// Change to full recovery model
sqlserver_set_db_recovery_model({
  database: "MyDatabase",
  recoveryModel: "FULL"
})

// Change to simple recovery model
sqlserver_set_db_recovery_model({
  database: "MyDatabase",
  recoveryModel: "SIMPLE"
})
```

---

### Compatibility Level Management (2 Tools)

#### 23. sqlserver_get_db_compatibility
**Description:** Get the current database compatibility level.

**Category:** Database Management > Compatibility

**Based on:** dbatools `Get-DbaDbCompatibility`

**Input Parameters:**
- `database` (required): Database name

**Returns:**
- Database name
- Compatibility level (90-160)
- SQL Server version equivalent

**Read-Only:** Yes

**Compatibility Levels:**
- 90 = SQL Server 2005
- 100 = SQL Server 2008
- 110 = SQL Server 2012
- 120 = SQL Server 2014
- 130 = SQL Server 2016
- 140 = SQL Server 2017
- 150 = SQL Server 2019
- 160 = SQL Server 2022

**Usage Example:**
```typescript
// Get compatibility level
sqlserver_get_db_compatibility({ database: "MyDatabase" })
```

---

#### 24. sqlserver_set_db_compatibility
**Description:** Set database compatibility level (90-160 corresponding to SQL Server 2005-2022).

**Category:** Database Management > Compatibility

**Based on:** dbatools `Set-DbaDbCompatibility`

**Input Parameters:**
- `database` (required): Database name
- `compatibilityLevel` (required): Compatibility level (90, 100, 110, 120, 130, 140, 150, 160)

**Returns:** Confirmation message

**Read-Only:** No (Write operation)

**Usage Example:**
```typescript
// Set to SQL Server 2019 compatibility (150)
sqlserver_set_db_compatibility({
  database: "MyDatabase",
  compatibilityLevel: 150
})

// Set to SQL Server 2022 compatibility (160)
sqlserver_set_db_compatibility({
  database: "MyDatabase",
  compatibilityLevel: 160
})
```

---

### Database Snapshot Management (4 Tools)

#### 25. sqlserver_new_db_snapshot
**Description:** Create a point-in-time, read-only database snapshot for querying or recovery purposes.

**Category:** Database Management > Snapshots

**Based on:** dbatools `New-DbaDatabaseSnapshot`

**Input Parameters:**
- `database` (required): Source database name
- `snapshotName` (optional): Snapshot name (auto-generated if not specified)
- `path` (optional): Physical path for snapshot files

**Returns:** Snapshot details (name, source database, creation time)

**Read-Only:** No (Write operation)

**Note:** Snapshots use copy-on-write technology and are read-only

**Usage Example:**
```typescript
// Create snapshot with auto-generated name
sqlserver_new_db_snapshot({ database: "MyDatabase" })

// Create snapshot with custom name
sqlserver_new_db_snapshot({
  database: "ProductionDB",
  snapshotName: "ProductionDB_BeforeUpgrade",
  path: "D:\\Snapshots"
})
```

---

#### 26. sqlserver_get_db_snapshot
**Description:** List all database snapshots with their source database and creation time.

**Category:** Database Management > Snapshots

**Based on:** dbatools `Get-DbaDatabaseSnapshot`

**Input Parameters:**
- `database` (optional): Filter by source database name
- `snapshotName` (optional): Filter by specific snapshot name

**Returns:** Per snapshot:
- Snapshot name
- Source database
- Creation date/time
- Size (MB)

**Read-Only:** Yes

**Usage Example:**
```typescript
// List all snapshots
sqlserver_get_db_snapshot()

// List snapshots for specific database
sqlserver_get_db_snapshot({ database: "ProductionDB" })

// Get specific snapshot
sqlserver_get_db_snapshot({ snapshotName: "ProductionDB_Snapshot" })
```

---

#### 27. sqlserver_remove_db_snapshot
**Description:** Drop (delete) a database snapshot.

**Category:** Database Management > Snapshots

**Based on:** dbatools `Remove-DbaDatabaseSnapshot`

**Input Parameters:**
- `snapshotName` (required): Snapshot name to drop

**Returns:** Confirmation message

**Read-Only:** No (Write operation)

**Usage Example:**
```typescript
// Drop snapshot
sqlserver_remove_db_snapshot({
  snapshotName: "ProductionDB_Snapshot"
})
```

---

#### 28. sqlserver_restore_db_snapshot
**Description:** Restore a database to the state captured in a snapshot. WARNING: This reverts all changes made since snapshot creation.

**Category:** Database Management > Snapshots

**Based on:** dbatools `Restore-DbaDatabaseSnapshot`

**Input Parameters:**
- `database` (required): Database name to restore
- `snapshotName` (required): Snapshot to restore from
- `force` (optional, default: false): Kill active connections

**Returns:** Confirmation message

**Read-Only:** No (Write operation)

**Warning:** Reverts database to snapshot point-in-time, losing all changes made after snapshot creation

**Usage Example:**
```typescript
// Restore from snapshot
sqlserver_restore_db_snapshot({
  database: "ProductionDB",
  snapshotName: "ProductionDB_BeforeUpgrade"
})

// Force restore with active connections
sqlserver_restore_db_snapshot({
  database: "ProductionDB",
  snapshotName: "ProductionDB_BeforeUpgrade",
  force: true
})
```

---

### Database Operations (2 Tools)

#### 29. sqlserver_shrink_database
**Description:** Shrink database to reclaim unused space. Can shrink data files, log files, or both.

**Category:** Database Management > Operations

**Based on:** dbatools `Invoke-DbaDbShrink`

**Input Parameters:**
- `database` (required): Database name to shrink
- `fileType` (optional, default: "ALL"): File type to shrink (DATA, LOG, ALL)
- `targetPercent` (optional): Target free space percentage
- `shrinkMethod` (optional, default: "DEFAULT"): Shrink method (DEFAULT, EMPTYFILE, NOTRUNCATE, TRUNCATEONLY)

**Returns:** Shrink operation results with space reclaimed

**Read-Only:** No (Write operation)

**Warning:** Can cause index fragmentation and impact performance

**Usage Example:**
```typescript
// Shrink entire database
sqlserver_shrink_database({ database: "MyDatabase" })

// Shrink only log files
sqlserver_shrink_database({
  database: "MyDatabase",
  fileType: "LOG"
})

// Shrink to 10% free space
sqlserver_shrink_database({
  database: "MyDatabase",
  targetPercent: 10
})
```

---

#### 30. sqlserver_set_db_collation
**Description:** Change database collation. WARNING: This only changes the database default collation, not existing column collations.

**Category:** Database Management > Operations

**Based on:** dbatools `Set-DbaDbCollation`

**Input Parameters:**
- `database` (required): Database name
- `collation` (required): New collation name

**Returns:** Confirmation message

**Read-Only:** No (Write operation)

**Warning:** Only changes database default collation. Existing tables/columns retain their collation unless explicitly changed.

**Usage Example:**
```typescript
// Change database collation
sqlserver_set_db_collation({
  database: "MyDatabase",
  collation: "Latin1_General_CI_AS"
})

// Change to case-sensitive collation
sqlserver_set_db_collation({
  database: "MyDatabase",
  collation: "SQL_Latin1_General_CP1_CS_AS"
})
```

---

## Summary

### Tool Count by Category

**Performance Monitoring (12 tools):**
- Memory Management: 6 tools
- Plan Cache: 2 tools
- IO Performance: 2 tools
- Blocking & Process: 2 tools

**Database Management (18 tools):**
- Database CRUD: 4 tools
- Database State: 2 tools
- Database Owner: 2 tools
- Recovery Model: 2 tools
- Compatibility: 2 tools
- Database Snapshots: 4 tools
- Database Operations: 2 tools

**Total: 30 new tools**

**Grand Total: 101 tools in SQL Server MCP**

### Read-Only vs Write Operations

**Read-Only Operations (17 tools):**
1. sqlserver_get_memory_usage
2. sqlserver_get_db_memory_usage
3. sqlserver_get_memory_condition
4. sqlserver_get_dbcc_memory_status
5. sqlserver_get_max_memory
6. sqlserver_get_plan_cache
7. sqlserver_get_io_latency
8. sqlserver_get_disk_space
9. sqlserver_get_blocking
10. sqlserver_get_process
11. sqlserver_get_database
12. sqlserver_get_db_state
13. sqlserver_get_db_owner
14. sqlserver_get_db_recovery_model
15. sqlserver_get_db_compatibility
16. sqlserver_get_db_snapshot
17. sqlserver_get_db_snapshot

**Write Operations (13 tools):**
1. sqlserver_set_max_memory
2. sqlserver_clear_plan_cache
3. sqlserver_new_database
4. sqlserver_remove_database
5. sqlserver_set_database
6. sqlserver_set_db_state
7. sqlserver_set_db_owner
8. sqlserver_set_db_recovery_model
9. sqlserver_set_db_compatibility
10. sqlserver_new_db_snapshot
11. sqlserver_remove_db_snapshot
12. sqlserver_restore_db_snapshot
13. sqlserver_shrink_database
14. sqlserver_set_db_collation

---

## Implementation Details

### Technology Stack
- **TypeScript** for type-safe implementation
- **Zod** for input schema validation
- **MCP SDK** for Model Context Protocol integration
- **mssql** for SQL Server connectivity

### Code Organization
- **performance.ts**: 15 performance monitoring tools (3 existing + 12 new)
- **database-management.ts**: 18 database management tools (all new)
- **index.ts**: Central registration and request handling

### Security Features
- Read/write mode enforcement via `SQL_MODE` environment variable
- Parameterized queries to prevent SQL injection
- Input validation with Zod schemas
- Proper error handling and sanitization

### Based on dbatools
All 30 tools are based on the popular PowerShell module **dbatools**, providing battle-tested SQL Server DBA functionality through a modern TypeScript API accessible to Large Language Models via the Model Context Protocol.

---

**Document Version:** 1.0
**Created:** 2025-12-28
**Total Tools Documented:** 30 new tools (101 total in SQL Server MCP)
