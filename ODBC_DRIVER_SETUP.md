# ODBC Driver Missing Error - Complete Setup Guide

## The Error

```
✗ Connection failed:
Connection failed: [Microsoft][ODBC Driver Manager] Data source name not found
and no default driver specified
```

---

## Understanding the Problem

### What's Happening?

The SQL Server MCP server requires **Microsoft ODBC Driver for SQL Server** to be installed on the machine where it runs. This error occurs when:

1. **Fresh Windows VM** - No ODBC drivers installed by default
2. **Missing Driver Package** - SQL Server client tools not installed
3. **Wrong Driver Version** - Outdated or incompatible driver
4. **Architecture Mismatch** - 32-bit vs 64-bit driver mismatch

### Important Distinction

❗ **SQL Server Installation ≠ ODBC Driver Installation**

- Installing SQL Server on a machine does NOT automatically install client ODBC drivers
- ODBC drivers are client components needed to CONNECT to SQL Server
- You need ODBC drivers even if SQL Server is on the same machine
- Fresh Windows VMs typically have NO ODBC drivers installed

---

## Quick Diagnosis

### Step 1: Check Which ODBC Drivers Are Installed

**PowerShell (Run this first):**

```powershell
# List all ODBC drivers installed on your system
Get-OdbcDriver | Where-Object {$_.Name -like "*SQL Server*"} |
    Format-Table Name, Platform -AutoSize
```

**Expected Output (Good):**
```
Name                              Platform
----                              --------
ODBC Driver 18 for SQL Server     64-bit
SQL Server                        64-bit
```

**Problem Output (Bad - No Drivers):**
```
(Empty - no results)
```

**Problem Output (Bad - Old Driver Only):**
```
Name                              Platform
----                              --------
SQL Server                        64-bit
```

### Step 2: Check ODBC Data Source Administrator

**GUI Method:**

1. Press `Windows + R`
2. Type: `odbcad32.exe`
3. Go to **Drivers** tab
4. Look for:
   - ✅ **ODBC Driver 18 for SQL Server** (Recommended)
   - ✅ **ODBC Driver 17 for SQL Server** (Also good)
   - ⚠️ **SQL Server** (Old legacy driver - not recommended)

**Screenshot of Drivers Tab:**
```
[Drivers]
┌────────────────────────────────────────────────┐
│ Name                     │ Version             │
├──────────────────────────┼─────────────────────┤
│ ODBC Driver 18 for SQL   │ 18.03.02.01         │ ← Need this!
│ SQL Server               │ 10.00.19041.1       │ ← Legacy
└──────────────────────────┴─────────────────────┘
```

### Step 3: Identify Your Situation

**Situation A: No ODBC Drivers** (Most Common)
- Get-OdbcDriver returns empty
- Fresh Windows VM
- Never installed SQL Server client tools
- **Solution:** Install ODBC Driver 18

**Situation B: Only Legacy "SQL Server" Driver**
- Shows "SQL Server" driver but not "ODBC Driver 17/18"
- Old Windows installation
- **Solution:** Install ODBC Driver 18 (modern driver)

**Situation C: Wrong Architecture (32-bit vs 64-bit)**
- Driver is installed but wrong bitness
- Rare but possible
- **Solution:** Install correct 64-bit driver

---

## Solution: Install Microsoft ODBC Driver for SQL Server

### Option 1: Install ODBC Driver 18 (Recommended - Latest)

**Step 1: Download**

Visit Microsoft's official download page:
- **URL:** https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server
- **Or direct download:** https://go.microsoft.com/fwlink/?linkid=2249004

**Or use PowerShell to download:**

```powershell
# Download ODBC Driver 18 for SQL Server
$url = "https://go.microsoft.com/fwlink/?linkid=2249004"
$output = "$env:TEMP\msodbcsql.msi"

Write-Host "Downloading ODBC Driver 18 for SQL Server..."
Invoke-WebRequest -Uri $url -OutFile $output

Write-Host "Download complete: $output"
Write-Host "Run this to install: msiexec /i $output /qn IACCEPTMSODBCSQLLICENSETERMS=YES"
```

**Step 2: Install**

**GUI Installation:**
1. Double-click the downloaded `msodbcsql.msi` file
2. Click **Next** through the wizard
3. Accept license agreement
4. Click **Install**
5. Click **Finish**

**Silent Installation (PowerShell - Run as Administrator):**

```powershell
# Install ODBC Driver 18 silently
$msiPath = "$env:TEMP\msodbcsql.msi"

Start-Process msiexec.exe -Wait -ArgumentList @(
    '/i',
    $msiPath,
    '/qn',
    'IACCEPTMSODBCSQLLICENSETERMS=YES'
)

Write-Host "✓ ODBC Driver 18 installed successfully"
```

**One-Line PowerShell (Download + Install):**

```powershell
# Download and install ODBC Driver 18 in one command
# Run as Administrator
$url = "https://go.microsoft.com/fwlink/?linkid=2249004"
$output = "$env:TEMP\msodbcsql.msi"
Invoke-WebRequest -Uri $url -OutFile $output
Start-Process msiexec.exe -Wait -ArgumentList "/i", $output, "/qn", "IACCEPTMSODBCSQLLICENSETERMS=YES"
Write-Host "✓ ODBC Driver 18 installed"
```

**Step 3: Verify Installation**

```powershell
# Check if ODBC Driver 18 is installed
Get-OdbcDriver | Where-Object {$_.Name -like "*ODBC Driver 18*"}
```

Expected output:
```
Name                           Platform Attribute
----                           -------- ---------
ODBC Driver 18 for SQL Server  64-bit   {}
```

---

### Option 2: Install ODBC Driver 17 (Alternative - Older but Still Supported)

If ODBC Driver 18 has compatibility issues (rare), use Driver 17:

**Download:**
- **URL:** https://go.microsoft.com/fwlink/?linkid=2249006

**Install:**
```powershell
$url = "https://go.microsoft.com/fwlink/?linkid=2249006"
$output = "$env:TEMP\msodbcsql17.msi"
Invoke-WebRequest -Uri $url -OutFile $output
Start-Process msiexec.exe -Wait -ArgumentList "/i", $output, "/qn", "IACCEPTMSODBCSQLLICENSETERMS=YES"
Write-Host "✓ ODBC Driver 17 installed"
```

---

### Option 3: Install via Chocolatey (If You Use Package Managers)

```powershell
# Install Chocolatey if not already installed
Set-ExecutionPolicy Bypass -Scope Process -Force
[System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072
iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Install ODBC Driver
choco install sqlserver-odbcdriver -y
```

---

## Configure SQL Server MCP After Driver Installation

### Step 1: Verify Driver Installation

```powershell
# List all SQL Server ODBC drivers
Get-OdbcDriver | Where-Object {$_.Name -like "*SQL Server*"} |
    Select-Object Name, Platform | Format-Table -AutoSize
```

You should see:
```
Name                              Platform
----                              --------
ODBC Driver 18 for SQL Server     64-bit
SQL Server                        64-bit
```

### Step 2: Update MCP Server Configuration (If Needed)

**For Windows Authentication (Most Common):**

Your `.env` file or Claude Desktop config should look like this:

```env
SQL_AUTH_TYPE=windows
SQL_SERVER=localhost
SQL_DATABASE=master
SQL_TRUSTED_CONNECTION=true
SQL_ENCRYPT=true
SQL_TRUST_SERVER_CERTIFICATE=true
```

**For SQL Authentication:**

```env
SQL_AUTH_TYPE=sql
SQL_USERNAME=sa
SQL_PASSWORD=YourPassword
SQL_SERVER=localhost
SQL_DATABASE=master
SQL_ENCRYPT=true
SQL_TRUST_SERVER_CERTIFICATE=true
```

### Step 3: Restart MCP Server

**If using MCP Inspector:**
- Stop the inspector (Ctrl+C)
- Start again: `npx @modelcontextprotocol/inspector dist/index.js`

**If using Claude Desktop:**
- Restart Claude Desktop completely
- MCP server will reload with new ODBC driver

**If running standalone:**
```bash
# Stop current process (Ctrl+C)
# Start again
node dist/index.js
```

### Step 4: Test Connection

**Method 1: Using MCP Inspector**

1. Open MCP Inspector (http://localhost:5173)
2. Select a tool like `sqlserver_list_databases`
3. Click **Run**
4. Should see: `✓ Connected successfully`

**Method 2: Using PowerShell**

```powershell
# Test ODBC connection directly
$connectionString = "Driver={ODBC Driver 18 for SQL Server};Server=localhost;Database=master;Trusted_Connection=yes;TrustServerCertificate=yes;"

$connection = New-Object System.Data.Odbc.OdbcConnection($connectionString)

try {
    $connection.Open()
    Write-Host "✓ Connection successful!"
    Write-Host "  Server Version: $($connection.ServerVersion)"
    $connection.Close()
} catch {
    Write-Host "✗ Connection failed: $($_.Exception.Message)"
}
```

**Method 3: Using Test Script**

Create a test file `test-odbc.js`:

```javascript
const sql = require('mssql');

const config = {
  server: 'localhost',
  database: 'master',
  driver: 'msnodesqlv8',
  options: {
    trustedConnection: true
  }
};

sql.connect(config)
  .then(pool => {
    console.log('✓ Connected to SQL Server');
    return pool.request().query('SELECT @@VERSION AS Version');
  })
  .then(result => {
    console.log('✓ Query executed successfully');
    console.log('SQL Server Version:', result.recordset[0].Version);
    sql.close();
  })
  .catch(err => {
    console.error('✗ Connection failed:', err.message);
  });
```

Run:
```bash
node test-odbc.js
```

---

## Troubleshooting Connection Issues After Driver Installation

### Issue 1: Still Getting "Driver Not Found" Error

**Check 1: Did Installation Complete?**

```powershell
# Verify driver is registered
Get-OdbcDriver | Where-Object {$_.Name -like "*ODBC Driver 18*"}
```

If empty, reinstall:
```powershell
# Uninstall first
wmic product where "name like '%ODBC Driver%SQL%'" call uninstall

# Reinstall
# (Run installation commands from above)
```

**Check 2: Restart Required?**

Some systems require a reboot after ODBC driver installation:
```powershell
Restart-Computer -Force
```

**Check 3: 32-bit vs 64-bit**

Ensure you installed the 64-bit version (x64):
```powershell
# Check platform
Get-OdbcDriver | Where-Object {$_.Name -like "*ODBC Driver 18*"} |
    Select-Object Name, Platform
```

Should show `Platform: 64-bit`

### Issue 2: "Named Pipes Provider" Error

**Error:**
```
Named Pipes Provider: Could not open a connection to SQL Server
```

**Solution: Enable TCP/IP Protocol**

```powershell
# Check if SQL Server service is running
Get-Service -Name "MSSQL*" | Format-Table Name, Status -AutoSize
```

**Or via SQL Server Configuration Manager:**

1. Open **SQL Server Configuration Manager**
2. Expand **SQL Server Network Configuration**
3. Click **Protocols for [INSTANCE NAME]**
4. Right-click **TCP/IP** → **Enable**
5. Restart SQL Server service

### Issue 3: "Login Failed for User" Error

This is an AUTHENTICATION issue, not an ODBC driver issue.

**For Windows Authentication:**

Check if your Windows user has SQL Server login:
```sql
-- Run in SSMS as admin
CREATE LOGIN [DOMAIN\Username] FROM WINDOWS;
ALTER SERVER ROLE sysadmin ADD MEMBER [DOMAIN\Username];
```

**For SQL Authentication:**

Check if SQL Authentication is enabled:
```sql
-- Check authentication mode
EXEC xp_instance_regread
    N'HKEY_LOCAL_MACHINE',
    N'Software\Microsoft\MSSQLServer\MSSQLServer',
    N'LoginMode';
-- 1 = Windows Auth only
-- 2 = Mixed mode (Windows + SQL Auth)
```

Enable mixed mode:
1. Open SSMS
2. Right-click server → **Properties**
3. Go to **Security** page
4. Select **SQL Server and Windows Authentication mode**
5. Click **OK**
6. Restart SQL Server

### Issue 4: SSL Certificate Error

```
The certificate chain was issued by an authority that is not trusted
```

**Quick Fix:**

Add to your MCP configuration:
```env
SQL_TRUST_SERVER_CERTIFICATE=true
```

**See:** [SSL_CERTIFICATE_TROUBLESHOOTING.md](./SSL_CERTIFICATE_TROUBLESHOOTING.md) for complete guide

---

## Common Configuration Mistakes

### ❌ Mistake 1: Wrong Driver Name in Connection String

**Wrong:**
```javascript
driver: 'SQL Server'  // Legacy driver
```

**Correct:**
```javascript
driver: 'ODBC Driver 18 for SQL Server'  // Modern driver
```

### ❌ Mistake 2: Not Using msnodesqlv8 for Windows Auth

The MCP server uses `msnodesqlv8` package for Windows Authentication, which requires ODBC drivers.

**Correct import in MCP server (already done):**
```javascript
// For Windows Auth
const sql = await import('mssql/msnodesqlv8');

// For SQL Auth
const sql = await import('mssql');
```

### ❌ Mistake 3: Missing TrustServerCertificate

For local development with self-signed certificates:

```env
SQL_ENCRYPT=true
SQL_TRUST_SERVER_CERTIFICATE=true  ← Don't forget this!
```

### ❌ Mistake 4: SQL Server Not Running

Check service status:
```powershell
Get-Service -Name "MSSQL*"

# If stopped, start it
Start-Service -Name "MSSQLSERVER"
```

---

## Complete Fresh VM Setup Checklist

Use this checklist when setting up SQL Server MCP on a fresh Windows VM:

### Phase 1: Prerequisites
- [ ] Windows VM with internet connection
- [ ] Node.js 18+ installed
- [ ] Git installed (for cloning repository)
- [ ] SQL Server installed (or access to remote SQL Server)
- [ ] Administrator privileges on VM

### Phase 2: Install ODBC Driver
- [ ] Download ODBC Driver 18 for SQL Server
- [ ] Install ODBC driver (GUI or silent)
- [ ] Verify installation: `Get-OdbcDriver`
- [ ] See "ODBC Driver 18 for SQL Server" in list
- [ ] Confirm Platform is "64-bit"

### Phase 3: Install SQL Server MCP
- [ ] Clone repository: `git clone https://github.com/hisinha-rakesh/sql-server-mcp`
- [ ] Navigate to directory: `cd sql-server-mcp`
- [ ] Install dependencies: `npm install`
- [ ] Build TypeScript: `npm run build`
- [ ] Verify build: `ls dist/index.js`

### Phase 4: Configure Connection
- [ ] Create `.env` file or configure Claude Desktop config
- [ ] Set `SQL_AUTH_TYPE` (windows or sql)
- [ ] Set `SQL_SERVER` (localhost or server name)
- [ ] Set `SQL_DATABASE` (master or your database)
- [ ] Set `SQL_ENCRYPT=true`
- [ ] Set `SQL_TRUST_SERVER_CERTIFICATE=true` (for dev)

### Phase 5: Test Connection
- [ ] Start MCP Inspector: `npm run inspect`
- [ ] Open browser to http://localhost:5173
- [ ] Select tool: `sqlserver_test_connection`
- [ ] Click **Run**
- [ ] Should see: ✓ Connection successful
- [ ] Test query: `sqlserver_list_databases`
- [ ] Should see list of databases

### Phase 6: Integration
- [ ] Configure Claude Desktop (if using)
- [ ] Restart Claude Desktop
- [ ] Verify MCP server appears in Claude
- [ ] Test query: "List all databases"
- [ ] Should get formatted response

---

## Quick Reference Commands

### Check Installed Drivers
```powershell
Get-OdbcDriver | Where-Object {$_.Name -like "*SQL Server*"} | Format-Table -AutoSize
```

### Install ODBC Driver 18 (One Command)
```powershell
# Run as Administrator
$url = "https://go.microsoft.com/fwlink/?linkid=2249004"
$output = "$env:TEMP\msodbcsql.msi"
Invoke-WebRequest -Uri $url -OutFile $output
Start-Process msiexec.exe -Wait -ArgumentList "/i", $output, "/qn", "IACCEPTMSODBCSQLLICENSETERMS=YES"
```

### Test ODBC Connection
```powershell
$connectionString = "Driver={ODBC Driver 18 for SQL Server};Server=localhost;Database=master;Trusted_Connection=yes;TrustServerCertificate=yes;"
$connection = New-Object System.Data.Odbc.OdbcConnection($connectionString)
$connection.Open()
Write-Host "✓ Connected!"
$connection.Close()
```

### Check SQL Server Service
```powershell
Get-Service -Name "MSSQL*" | Format-Table Name, Status -AutoSize
```

### Start MCP Inspector
```bash
cd sql-server-mcp
npm run inspect
# Open: http://localhost:5173
```

---

## Architecture: How ODBC Drivers Fit In

```
┌─────────────────────────────────────────────────────┐
│                   Your Application                  │
│              (Claude Desktop / MCP CLI)             │
└─────────────────────┬───────────────────────────────┘
                      │
                      v
┌─────────────────────────────────────────────────────┐
│              SQL Server MCP Server                  │
│              (Node.js + TypeScript)                 │
└─────────────────────┬───────────────────────────────┘
                      │
                      v
┌─────────────────────────────────────────────────────┐
│              mssql / msnodesqlv8                    │
│              (Node.js SQL Server Driver)            │
└─────────────────────┬───────────────────────────────┘
                      │
                      v
┌─────────────────────────────────────────────────────┐
│        Microsoft ODBC Driver for SQL Server         │ ← YOU ARE HERE
│              (Native Windows Driver)                │
│                                                     │
│   This component MUST be installed on the VM       │
└─────────────────────┬───────────────────────────────┘
                      │
                      v
┌─────────────────────────────────────────────────────┐
│                 SQL Server Instance                 │
│              (Database Engine / TDS)                │
└─────────────────────────────────────────────────────┘
```

**Key Points:**

- The ODBC driver is a **client component** (runs on MCP server VM)
- It translates Node.js commands into SQL Server's native TDS protocol
- Without ODBC driver, the Node.js packages can't communicate with SQL Server
- This is separate from SQL Server installation (even on same machine)

---

## Driver Version Comparison

| Driver | Release Year | Support Status | Use Case |
|--------|-------------|----------------|----------|
| **SQL Server** (Legacy) | 2000 | ⚠️ Deprecated | Avoid - old driver |
| **ODBC Driver 11** | 2012 | ❌ Unsupported | Don't use |
| **ODBC Driver 13** | 2016 | ⚠️ Extended support ended | Legacy only |
| **ODBC Driver 17** | 2018 | ✅ Supported | Good for older systems |
| **ODBC Driver 18** | 2022 | ✅ **RECOMMENDED** | Best choice |

**Recommendation:** Always install **ODBC Driver 18** on new systems.

---

## Support and Resources

### Official Microsoft Documentation
- [Download ODBC Driver](https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server)
- [ODBC Driver Features](https://learn.microsoft.com/en-us/sql/connect/odbc/windows/features-of-the-microsoft-odbc-driver-for-sql-server-on-windows)
- [Connection String Keywords](https://learn.microsoft.com/en-us/sql/connect/odbc/windows/dsn-connection-string-attribute)

### SQL Server MCP Documentation
- [GitHub Repository](https://github.com/hisinha-rakesh/sql-server-mcp)
- [Technical Write-up](./TECHNICAL_WRITEUP.md)
- [Windows Authentication Setup](./WINDOWS_AUTH_SETUP.md)
- [SSL Certificate Troubleshooting](./SSL_CERTIFICATE_TROUBLESHOOTING.md)

### Getting Help
- GitHub Issues: https://github.com/hisinha-rakesh/sql-server-mcp/issues
- Stack Overflow: Tag with [sql-server] [odbc]
- Microsoft SQL Server Forums

---

## Summary

### The Problem
```
Data source name not found and no default driver specified
```

### Root Cause
Microsoft ODBC Driver for SQL Server is not installed on the Windows VM.

### Solution
1. Install ODBC Driver 18 for SQL Server:
   ```powershell
   # One-line install (Run as Administrator)
   $url = "https://go.microsoft.com/fwlink/?linkid=2249004"
   $output = "$env:TEMP\msodbcsql.msi"
   Invoke-WebRequest -Uri $url -OutFile $output
   Start-Process msiexec.exe -Wait -ArgumentList "/i", $output, "/qn", "IACCEPTMSODBCSQLLICENSETERMS=YES"
   ```

2. Verify installation:
   ```powershell
   Get-OdbcDriver | Where-Object {$_.Name -like "*ODBC Driver 18*"}
   ```

3. Restart MCP server and test connection

### Result
MCP Inspector should now connect successfully:
```
✓ Connection successful
✓ Server: localhost
✓ Database: master
✓ Tools: 123 available
```

---

**Last Updated:** 2026-01-03
**Tested With:** Windows Server 2019/2022, Windows 10/11
**MCP Server Version:** 1.0.0
**ODBC Driver Version:** 18.3.2.1
