# SQL Server Agent Management Features

## Overview
The SQL Server MCP server now includes comprehensive SQL Server Agent management capabilities. This allows you to manage jobs, schedules, and monitor agent status directly through the MCP interface.

## New Tools Added

### 1. Agent Status
- **`sqlserver_get_agent_status`** - Check if SQL Server Agent service is running

### 2. Job Management
- **`sqlserver_list_agent_jobs`** - List all SQL Server Agent jobs with status
  - Optional filter by enabled status
  - Shows job details, last run status, next run time, step count

- **`sqlserver_get_job_details`** - Get detailed information about a specific job
  - Job configuration
  - All job steps with commands
  - Associated schedules

- **`sqlserver_create_job`** - Create a new SQL Server Agent job
  - Define job name, description, and enabled status
  - Add T-SQL step with command and target database
  - Automatically configures job server

- **`sqlserver_delete_job`** - Delete a SQL Server Agent job
  - Optionally delete job history
  - WARNING: Permanent deletion

- **`sqlserver_start_job`** - Start execution of a job immediately
- **`sqlserver_stop_job`** - Stop a currently running job
- **`sqlserver_toggle_job`** - Enable or disable a job

### 3. Job History
- **`sqlserver_get_job_history`** - Get execution history for a job
  - Configurable number of recent executions (default: 20, max: 100)
  - Shows run status, duration, messages, and retry attempts

### 4. Schedule Management
- **`sqlserver_list_job_schedules`** - List all job schedules
  - Optional filter by job name
  - Shows frequency type, active dates, and times

## Usage Examples

### Check Agent Status
```typescript
// Check if SQL Server Agent is running
sqlserver_get_agent_status()
```

### List All Jobs
```typescript
// List all jobs
sqlserver_list_agent_jobs()

// List only enabled jobs
sqlserver_list_agent_jobs({ enabled: true })
```

### Get Job Details
```typescript
sqlserver_get_job_details({
  jobName: "Daily Backup"
})
```

### Create a New Job
```typescript
sqlserver_create_job({
  jobName: "Cleanup Old Records",
  description: "Delete records older than 90 days",
  enabled: true,
  stepName: "Delete Old Data",
  command: "DELETE FROM Logs WHERE CreatedDate < DATEADD(day, -90, GETDATE())",
  databaseName: "MyDatabase"
})
```

### Start and Stop Jobs
```typescript
// Start a job
sqlserver_start_job({ jobName: "Daily Backup" })

// Stop a running job
sqlserver_stop_job({ jobName: "Long Running Process" })
```

### Enable/Disable Jobs
```typescript
// Disable a job
sqlserver_toggle_job({
  jobName: "Maintenance Job",
  enabled: false
})

// Enable a job
sqlserver_toggle_job({
  jobName: "Maintenance Job",
  enabled: true
})
```

### View Job History
```typescript
// Get last 20 executions
sqlserver_get_job_history({
  jobName: "Daily Backup"
})

// Get last 50 executions
sqlserver_get_job_history({
  jobName: "Daily Backup",
  topN: 50
})
```

### Delete a Job
```typescript
sqlserver_delete_job({
  jobName: "Old Job",
  deleteHistory: true
})
```

### List Job Schedules
```typescript
// List all schedules
sqlserver_list_job_schedules()

// List schedules for a specific job
sqlserver_list_job_schedules({
  jobName: "Daily Backup"
})
```

## Requirements

- SQL Server Agent must be installed and running
- User must have appropriate permissions:
  - `SQLAgentUserRole`, `SQLAgentReaderRole`, or `SQLAgentOperatorRole` for read operations
  - `SQLAgentOperatorRole` or sysadmin for job execution
  - sysadmin for job creation, modification, and deletion

## Features

### Comprehensive Job Information
- Job status (enabled/disabled)
- Owner and category
- Creation and modification dates
- Next scheduled run time
- Last run status and time
- Number of steps

### Job Step Details
- Step commands and subsystem
- Target database
- Success/failure actions
- Retry configuration

### Job History Tracking
- Execution status (succeeded, failed, retry, canceled, in progress)
- Duration of each execution
- Error messages
- Retry attempts

### Schedule Information
- Frequency types (once, daily, weekly, monthly, etc.)
- Active date ranges
- Active time ranges
- Recurrence factors

## Error Handling

All tools include comprehensive error handling:
- Job not found errors
- Permission errors
- SQL Server Agent not running warnings
- Validation errors for invalid parameters

## Notes

1. **Permissions**: Ensure your SQL Server login has appropriate Agent permissions
2. **Agent Service**: The Agent service must be running for jobs to execute
3. **Job Ownership**: Created jobs are owned by the current login
4. **History Retention**: Job history is subject to SQL Server Agent history retention settings
5. **Transactions**: Job operations are not transactional - use with caution in production

## Integration

The SQL Server Agent tools are fully integrated into the MCP server and work alongside existing database management tools. They use the same connection configuration and error handling mechanisms.

## Future Enhancements

Potential future additions:
- Advanced schedule creation
- Job step modification
- Operator management
- Alert configuration
- Multi-server job management
- Job templates and cloning
