# SQL Server SSL Certificate Error - Complete Troubleshooting Guide

## The Error

```
TITLE: Error

Encryption was enabled on this connection, review your SSL and certificate
configuration for the target SQL Server, or enable 'Trust server certificate'
in the connection dialog.

ADDITIONAL INFORMATION:

A connection was successfully established with the server, but then an error
occurred during the login process. (provider: SSL Provider, error: 0 -
The certificate chain was issued by an authority that is not trusted.)
(Microsoft SQL Server, Error: -2146893019)

The certificate chain was issued by an authority that is not trusted
```

---

## Understanding the Problem

### What's Happening?

1. **Connection Established** ✓ - Client connected to SQL Server successfully
2. **SSL/TLS Handshake** ❌ - Certificate validation FAILED during encryption setup
3. **Login Aborted** - Connection closed before authentication completed

### Why This Happens

SQL Server uses SSL/TLS certificates to encrypt client connections. This error occurs when:

**Scenario 1: Self-Signed Certificate (Most Common)**
- SQL Server is using a self-signed certificate
- Client doesn't trust self-signed certificates by default
- Common in development/test environments

**Scenario 2: Certificate Chain Issue**
- SQL Server certificate is signed by internal Certificate Authority (CA)
- Client machine doesn't have the CA certificate in trusted root store
- Common in enterprise environments with internal PKI

**Scenario 3: Expired Certificate**
- SQL Server certificate has expired
- Client rejects expired certificates

**Scenario 4: Hostname Mismatch**
- Certificate is issued to different hostname than connection string
- Example: Connect to "localhost" but certificate is for "SQLSERVER01"

**Scenario 5: Encryption Requirement**
- SQL Server or client enforces encryption
- Certificate validation fails
- Connection refused

---

## Quick Diagnosis Checklist

Use this checklist to identify your specific situation:

```
□ Is this a production server? (affects solution choice)
□ Is this SQL Server on localhost/local network?
□ Is encryption required by policy/compliance?
□ Do you control the SQL Server configuration?
□ Can you install certificates on client machine?
□ Is this Azure SQL Database? (different handling)
□ Are you using Windows Authentication or SQL Authentication?
```

---

## Solution Overview (Choose Based on Your Scenario)

| Solution | Security | Use Case | Effort |
|----------|----------|----------|--------|
| **Trust Server Certificate** | ⚠️ Low (MITM vulnerable) | Development/Testing | Easy |
| **Install Proper Certificate** | ✅ High | Production | Medium |
| **Add CA to Trusted Root** | ✅ High | Enterprise with internal CA | Easy |
| **Disable Encryption** | ❌ Very Low | Local dev only | Easy |
| **Use Azure-Specific Settings** | ✅ High | Azure SQL Database | Easy |

---

## Solution 1: Trust Server Certificate (Development/Testing)

### When to Use
- ✅ Local development environment
- ✅ Test/staging environments on internal network
- ✅ Self-signed certificates
- ❌ **NOT for production over internet**

### Security Warning
⚠️ **"Trust Server Certificate" disables certificate validation!**
- Vulnerable to man-in-the-middle (MITM) attacks
- Anyone can intercept and decrypt your connection
- Only use on trusted networks

### How to Fix in SQL Server MCP

**Method 1: Environment Variable Configuration**

Edit your Claude Desktop config or .env file:

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
        "SQL_TRUST_SERVER_CERTIFICATE": "true"    ← ADD THIS LINE
      }
    }
  }
}
```

**Or in .env file:**
```env
SQL_AUTH_TYPE=windows
SQL_SERVER=localhost
SQL_DATABASE=master
SQL_ENCRYPT=true
SQL_TRUST_SERVER_CERTIFICATE=true    ← ADD THIS LINE
```

**What this does:**
- Enables encryption (`SQL_ENCRYPT=true`)
- But trusts the server certificate without validation (`SQL_TRUST_SERVER_CERTIFICATE=true`)
- Connection will succeed even with self-signed certificates

**Restart Required:**
- Restart Claude Desktop to reload MCP server with new config
- Or restart your MCP server if running standalone

### How to Fix in SSMS (SQL Server Management Studio)

1. Open SSMS
2. Click **Connect** → **Database Engine**
3. Enter server name
4. Click **Options >>** tab
5. Go to **Connection Properties** tab
6. Check **"Trust server certificate"** ✓
7. Click **Connect**

### How to Fix in Connection Strings

**ADO.NET Connection String:**
```
Server=localhost;Database=master;Integrated Security=true;
Encrypt=true;TrustServerCertificate=true;
```

**Node.js mssql Package:**
```javascript
{
  server: 'localhost',
  database: 'master',
  options: {
    encrypt: true,
    trustServerCertificate: true  // ← ADD THIS
  }
}
```

**ODBC Connection String:**
```
Driver={ODBC Driver 17 for SQL Server};
Server=localhost;Database=master;
Trusted_Connection=yes;Encrypt=yes;TrustServerCertificate=yes;
```

---

## Solution 2: Install Proper SSL Certificate (Production)

### When to Use
- ✅ Production environments
- ✅ Connections over internet
- ✅ Compliance requirements (PCI, HIPAA, SOC2)
- ✅ Best security practices

### Step-by-Step Guide

#### Step 1: Obtain SSL Certificate

**Option A: Purchase from Public CA (Recommended for Production)**
- Buy certificate from: DigiCert, Sectigo, Let's Encrypt, etc.
- Certificate must include server FQDN (e.g., sqlserver.company.com)
- Requires domain validation

**Option B: Use Internal CA (Enterprise)**
- Request certificate from your organization's Certificate Authority
- Common in enterprises with Active Directory Certificate Services

**Option C: Generate Self-Signed Certificate (Dev Only)**
```powershell
# PowerShell - Create self-signed certificate
$cert = New-SelfSignedCertificate `
    -Subject "CN=SQLSERVER01" `
    -DnsName "SQLSERVER01", "SQLSERVER01.domain.local", "localhost" `
    -KeyLength 2048 `
    -KeyAlgorithm RSA `
    -HashAlgorithm SHA256 `
    -KeyUsage DigitalSignature, KeyEncipherment `
    -CertStoreLocation "Cert:\LocalMachine\My" `
    -NotAfter (Get-Date).AddYears(2)

Write-Host "Certificate Thumbprint: $($cert.Thumbprint)"
```

#### Step 2: Install Certificate on SQL Server

**GUI Method (SQL Server Configuration Manager):**

1. Open **SQL Server Configuration Manager**
2. Expand **SQL Server Network Configuration**
3. Right-click **Protocols for [INSTANCE NAME]** → **Properties**
4. Go to **Certificate** tab
5. Select certificate from dropdown (shows installed certificates)
6. Click **OK**
7. Restart SQL Server service

**PowerShell Method:**
```powershell
# Set certificate for SQL Server
$thumbprint = "YOUR_CERTIFICATE_THUMBPRINT"
$sqlInstance = "MSSQLSERVER"  # Or your instance name

# Grant SQL Server service account read permissions to certificate private key
$cert = Get-ChildItem -Path "Cert:\LocalMachine\My\$thumbprint"
$rsaCert = [System.Security.Cryptography.X509Certificates.RSACertificateExtensions]::GetRSAPrivateKey($cert)
$fileName = $rsaCert.Key.UniqueName

# Grant permissions
$path = "$env:ProgramData\Microsoft\Crypto\RSA\MachineKeys\$fileName"
$acl = Get-Acl -Path $path
$permission = "NT Service\MSSQL`$$sqlInstance", "Read", "Allow"
$accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule $permission
$acl.AddAccessRule($accessRule)
Set-Acl -Path $path -AclObject $acl

Write-Host "Certificate configured. Restart SQL Server service."
```

**Set Certificate via Registry (Alternative):**
```powershell
# IMPORTANT: Backup registry first!
$instanceName = "MSSQLSERVER"
$regPath = "HKLM:\SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL15.$instanceName\MSSQLServer\SuperSocketNetLib"

Set-ItemProperty -Path $regPath -Name "Certificate" -Value $thumbprint
Set-ItemProperty -Path $regPath -Name "ForceEncryption" -Value 1

Restart-Service -Name "MSSQL`$$instanceName"
```

#### Step 3: Configure SQL Server for Encryption

**Method A: Force Encryption (All Connections Encrypted)**

1. Open **SQL Server Configuration Manager**
2. Right-click **Protocols for [INSTANCE NAME]** → **Properties**
3. Go to **Flags** tab
4. Set **ForceEncryption** to **Yes**
5. Click **OK**
6. Restart SQL Server

**Method B: Optional Encryption (Client Decides)**
- Leave ForceEncryption = No
- Clients can choose to encrypt with `Encrypt=true` in connection string

#### Step 4: Export and Distribute Certificate (If Self-Signed or Internal CA)

**Export Certificate (Without Private Key):**
```powershell
# Export certificate to .cer file
$cert = Get-ChildItem -Path "Cert:\LocalMachine\My\$thumbprint"
Export-Certificate -Cert $cert -FilePath "C:\Temp\SQLServerCert.cer"
```

**Import on Client Machines:**
```powershell
# Run on each client machine
Import-Certificate -FilePath "C:\Temp\SQLServerCert.cer" `
    -CertStoreLocation "Cert:\LocalMachine\Root"
```

**Or double-click .cer file and:**
1. Click **Install Certificate**
2. Choose **Local Machine**
3. Select **Place all certificates in the following store**
4. Browse → Select **Trusted Root Certification Authorities**
5. Click **Finish**

#### Step 5: Test Connection

**Test with MCP Server:**
```json
{
  "env": {
    "SQL_ENCRYPT": "true",
    "SQL_TRUST_SERVER_CERTIFICATE": "false"  ← Certificate will be validated
  }
}
```

**Test with PowerShell:**
```powershell
$connectionString = "Server=SQLSERVER01;Database=master;Integrated Security=true;Encrypt=true;TrustServerCertificate=false"
$connection = New-Object System.Data.SqlClient.SqlConnection($connectionString)

try {
    $connection.Open()
    Write-Host "✓ Connection successful with encryption!"
    $connection.Close()
} catch {
    Write-Host "✗ Connection failed: $($_.Exception.Message)"
}
```

---

## Solution 3: Add Certificate Authority to Trusted Root Store

### When to Use
- ✅ Enterprise with internal Certificate Authority
- ✅ Certificate is valid but issued by untrusted CA
- ✅ Multiple SQL Servers using same CA

### Step-by-Step Guide

#### Step 1: Export CA Certificate from SQL Server

**On SQL Server machine:**
```powershell
# Find the issuer of SQL Server's certificate
$thumbprint = "YOUR_SQL_CERT_THUMBPRINT"
$sqlCert = Get-ChildItem -Path "Cert:\LocalMachine\My\$thumbprint"
$issuerThumbprint = $sqlCert.IssuerName.Name

Write-Host "SQL Server certificate issued by: $issuerThumbprint"

# Find CA certificate in Intermediate Certification Authorities
$caCert = Get-ChildItem -Path "Cert:\LocalMachine\CA" |
    Where-Object { $_.Subject -eq $issuerThumbprint } |
    Select-Object -First 1

# Export CA certificate
Export-Certificate -Cert $caCert -FilePath "C:\Temp\InternalCA.cer"
```

#### Step 2: Import CA Certificate on Client Machine

**PowerShell (Run as Administrator):**
```powershell
# Import CA certificate to Trusted Root
Import-Certificate -FilePath "C:\Temp\InternalCA.cer" `
    -CertStoreLocation "Cert:\LocalMachine\Root"

Write-Host "✓ CA certificate installed in Trusted Root Certification Authorities"
```

**GUI Method:**
1. Double-click InternalCA.cer file
2. Click **Install Certificate**
3. Choose **Local Machine** → Next
4. Select **Place all certificates in the following store**
5. Browse → **Trusted Root Certification Authorities**
6. Click **Finish**

#### Step 3: Verify Installation

```powershell
# Verify CA is in trusted root
Get-ChildItem -Path "Cert:\LocalMachine\Root" |
    Where-Object { $_.Subject -like "*YourCA*" }
```

#### Step 4: Test Connection

No changes needed to MCP server config - just connect normally:
```json
{
  "env": {
    "SQL_ENCRYPT": "true",
    "SQL_TRUST_SERVER_CERTIFICATE": "false"  ← Will now validate successfully
  }
}
```

---

## Solution 4: Disable Encryption (Local Development Only)

### When to Use
- ✅ Local development (SQL Server on same machine)
- ✅ Trusted internal network
- ❌ **NEVER for production**
- ❌ **NEVER over internet**

### Security Warning
⚠️ **Disabling encryption sends credentials and data in CLEAR TEXT!**
- Anyone on the network can see your password
- Anyone can read your queries and data
- Only acceptable for localhost connections

### How to Configure

**MCP Server Configuration:**
```json
{
  "env": {
    "SQL_ENCRYPT": "false",  ← Disable encryption completely
    "SQL_TRUST_SERVER_CERTIFICATE": "false"
  }
}
```

**Or in .env:**
```env
SQL_ENCRYPT=false
```

**Connection String:**
```
Server=localhost;Database=master;Integrated Security=true;Encrypt=false;
```

---

## Solution 5: Azure SQL Database (Special Case)

### Azure-Specific Configuration

Azure SQL Database **requires encryption** and uses certificates from public CAs.

**MCP Server Configuration for Azure:**
```json
{
  "env": {
    "SQL_AUTH_TYPE": "sql",
    "SQL_SERVER": "myserver.database.windows.net",
    "SQL_DATABASE": "mydatabase",
    "SQL_USERNAME": "myadmin",
    "SQL_PASSWORD": "password",
    "SQL_ENCRYPT": "true",
    "SQL_TRUST_SERVER_CERTIFICATE": "false"  ← Azure certs are trusted by default
  }
}
```

**Important Azure Notes:**
- Azure SQL always enforces encryption
- Azure uses certificates from public CAs (DigiCert)
- These certificates are trusted by Windows by default
- You should **NOT** need `TrustServerCertificate=true` for Azure
- If you get cert errors with Azure, your Windows certificate store may be corrupted

**Fix Azure Certificate Issues:**
```powershell
# Update Windows root certificates
certutil -generateSSTFromWU roots.sst
$sstStore = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2Collection
$sstStore.Import("roots.sst")
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
$store.Open("ReadWrite")
foreach ($cert in $sstStore) {
    $store.Add($cert)
}
$store.Close()
```

---

## How to Diagnose the Issue with MCP Server

If you're using the SQL Server MCP and hitting this error, use these tools to diagnose:

### Tool 1: Test Connection with Different Settings

**Try Connection 1: Trust Server Certificate (Should Work)**
```json
{
  "env": {
    "SQL_ENCRYPT": "true",
    "SQL_TRUST_SERVER_CERTIFICATE": "true"
  }
}
```

If this works → Certificate is the issue. Proceed to proper solution.

**Try Connection 2: No Encryption (Should Work for Localhost)**
```json
{
  "env": {
    "SQL_ENCRYPT": "false"
  }
}
```

If this works → Encryption is causing the issue. Install proper certificate.

**Try Connection 3: Validate Certificate (Should Fail)**
```json
{
  "env": {
    "SQL_ENCRYPT": "true",
    "SQL_TRUST_SERVER_CERTIFICATE": "false"
  }
}
```

If this fails → Certificate validation failing. Install CA or proper certificate.

### Tool 2: Use MCP Server to Check SQL Server Certificate

Once connected (with TrustServerCertificate=true), ask MCP:

```
"What SSL certificate is SQL Server using? Show me the certificate details."
```

**MCP will execute:**
```sql
-- Check SQL Server certificate configuration
EXEC xp_readerrorlog 0, 1, N'certificate';

-- Check encryption settings
SELECT
    SERVERPROPERTY('MachineName') AS ServerName,
    CONNECTIONPROPERTY('net_transport') AS Protocol,
    CONNECTIONPROPERTY('protocol_type') AS ProtocolType,
    CONNECTIONPROPERTY('encrypt_option') AS EncryptionUsed;
```

### Tool 3: Check Server Encryption Requirements

Ask MCP:
```
"Is encryption required on this SQL Server?"
```

**MCP will query:**
```sql
-- Check if ForceEncryption is enabled
EXEC xp_instance_regread
    N'HKEY_LOCAL_MACHINE',
    N'SOFTWARE\Microsoft\Microsoft SQL Server\MSSQL15.MSSQLSERVER\MSSQLServer\SuperSocketNetLib',
    N'ForceEncryption';
```

---

## Detailed Error Code Reference

### Error -2146893019 (0x8009030B)

**Hex:** 0x8009030B
**Win32 Error:** SEC_E_UNTRUSTED_ROOT
**Meaning:** Certificate chain was issued by an authority that is not trusted

**Common Causes:**
1. Self-signed certificate without "Trust Server Certificate"
2. Internal CA certificate not in client's Trusted Root store
3. Expired intermediate CA certificate
4. Corrupted certificate store on client

### Related Errors

**Error 18456 (After SSL Error)**
- Login failed after SSL/TLS handshake
- Usually authentication issue, not certificate issue

**Error 17806**
- SSL Provider: The certificate chain was issued by an authority that is not trusted
- Same as -2146893019

**Error 26 / Error 40**
- Cannot locate server or instance
- Network issue, not certificate issue

---

## Verification Checklist

After implementing a solution, verify with this checklist:

### 1. Connection Test
```powershell
$connectionString = "Server=YOURSERVER;Database=master;Integrated Security=true;Encrypt=true;TrustServerCertificate=false"
$connection = New-Object System.Data.SqlClient.SqlConnection($connectionString)
try {
    $connection.Open()
    Write-Host "✓ Connection successful!"
} catch {
    Write-Host "✗ Failed: $($_.Exception.Message)"
} finally {
    $connection.Close()
}
```

### 2. Certificate Validation Test
```powershell
# Check if SQL Server certificate is trusted
$serverName = "YOURSERVER"
$port = 1433

$tcpClient = New-Object System.Net.Sockets.TcpClient($serverName, $port)
$sslStream = New-Object System.Net.Security.SslStream($tcpClient.GetStream(), $false, {
    param($sender, $cert, $chain, $errors)
    Write-Host "Certificate Validation: $errors"
    return $true
})

try {
    $sslStream.AuthenticateAsClient($serverName)
    $cert = $sslStream.RemoteCertificate
    Write-Host "✓ Certificate: $($cert.Subject)"
    Write-Host "  Issuer: $($cert.Issuer)"
    Write-Host "  Valid Until: $($cert.GetExpirationDateString())"
} finally {
    $sslStream.Close()
    $tcpClient.Close()
}
```

### 3. MCP Server Test

Restart MCP server and ask:
```
"Test connection to SQL Server and confirm encryption is working"
```

If successful, you'll see:
```
✓ Connected to SQL Server
✓ Encryption: Enabled
✓ Certificate: Validated
✓ Protocol: TLS 1.2
```

---

## Troubleshooting Decision Tree

```
[SSL Certificate Error]
        |
        v
[Is this production?]
        |
    ┌───┴───┐
    │       │
   YES     NO (Dev/Test)
    │       │
    │       v
    │   [Use TrustServerCertificate=true]
    │   Quick Fix: Set SQL_TRUST_SERVER_CERTIFICATE=true
    │
    v
[Is server on internet?]
    |
┌───┴───┐
│       │
YES     NO (Internal network)
│       │
│       v
│   [Internal CA or Self-Signed?]
│       |
│   ┌───┴───┐
│   │       │
│   CA     Self
│   │       │
│   v       v
│   Add CA  Install
│   to      proper
│   Trust   cert on
│           server
v
[Install Certificate from Public CA]
- Purchase from DigiCert, Sectigo, etc.
- Install on SQL Server
- Force encryption
- Client will trust automatically
```

---

## Production Deployment Checklist

For production environments, follow this complete checklist:

### Phase 1: Certificate Acquisition
- [ ] Obtain certificate from public CA (DigiCert, Sectigo) OR
- [ ] Obtain certificate from internal CA
- [ ] Certificate includes correct FQDN/DNS names
- [ ] Certificate has at least 1 year validity
- [ ] Private key is exportable (for backup)

### Phase 2: SQL Server Configuration
- [ ] Import certificate to LocalMachine\My store
- [ ] Grant SQL Server service account read permission to private key
- [ ] Configure SQL Server to use certificate (SQL Configuration Manager)
- [ ] Enable ForceEncryption = Yes
- [ ] Restart SQL Server service
- [ ] Verify SQL Server error log shows certificate loaded

### Phase 3: Client Configuration
- [ ] If using internal CA: Export CA certificate
- [ ] If using internal CA: Import CA to Trusted Root on all clients
- [ ] Update connection strings: Encrypt=true, TrustServerCertificate=false
- [ ] Update MCP server configuration: SQL_ENCRYPT=true, SQL_TRUST_SERVER_CERTIFICATE=false
- [ ] Test connections from multiple clients

### Phase 4: Validation
- [ ] Test connection from external network
- [ ] Test connection from internal network
- [ ] Verify encryption with: `SELECT CONNECTIONPROPERTY('encrypt_option')`
- [ ] Check SQL Server error log for SSL/TLS messages
- [ ] Run vulnerability scan to confirm encryption
- [ ] Document certificate expiration date in runbook

### Phase 5: Monitoring
- [ ] Set calendar reminder for certificate renewal (30 days before expiry)
- [ ] Monitor SQL Server error log for certificate errors
- [ ] Test connections quarterly
- [ ] Document troubleshooting steps for team

---

## Common Mistakes to Avoid

### ❌ Mistake 1: Using TrustServerCertificate=true in Production
**Problem:** Disables certificate validation, vulnerable to MITM attacks
**Solution:** Install proper certificate and validate

### ❌ Mistake 2: Forgetting to Grant Permissions to Private Key
**Problem:** SQL Server can't read certificate, fails silently
**Solution:** Grant "NT Service\MSSQL$INSTANCENAME" read permission to private key

### ❌ Mistake 3: Certificate Hostname Mismatch
**Problem:** Connect to "localhost" but certificate is for "SQLSERVER01"
**Solution:** Use FQDN in connection string OR add localhost to certificate SAN

### ❌ Mistake 4: Expired Certificate
**Problem:** Certificate expired, SQL Server falls back to self-signed
**Solution:** Monitor expiration dates, renew before expiry

### ❌ Mistake 5: Not Restarting SQL Server After Certificate Installation
**Problem:** SQL Server still using old certificate
**Solution:** Always restart SQL Server service after certificate changes

### ❌ Mistake 6: Installing Certificate in Wrong Store
**Problem:** Install in CurrentUser\My instead of LocalMachine\My
**Solution:** Always use LocalMachine\My for SQL Server certificates

---

## Quick Reference: Configuration Comparison

| Scenario | SQL_ENCRYPT | SQL_TRUST_SERVER_CERTIFICATE | Security Level | Use Case |
|----------|-------------|------------------------------|----------------|----------|
| Production with Proper Cert | `true` | `false` | ✅ High | Production |
| Dev/Test with Self-Signed | `true` | `true` | ⚠️ Medium | Development |
| Localhost Only | `false` | `false` | ⚠️ Low | Local dev |
| Azure SQL Database | `true` | `false` | ✅ High | Cloud |
| Internal CA (CA Installed) | `true` | `false` | ✅ High | Enterprise |

---

## Resources and Further Reading

### Microsoft Documentation
- [Configure SQL Server Database Engine for encrypting connections](https://learn.microsoft.com/en-us/sql/database-engine/configure-windows/configure-sql-server-encryption)
- [Certificate Management (SQL Server)](https://learn.microsoft.com/en-us/sql/database-engine/configure-windows/manage-certificates)
- [Connection Properties (ODBC)](https://learn.microsoft.com/en-us/sql/connect/odbc/windows/features-of-the-microsoft-odbc-driver-for-sql-server-on-windows)

### Tools
- [OpenSSL](https://www.openssl.org/) - Certificate management
- [Let's Encrypt](https://letsencrypt.org/) - Free SSL certificates
- [SQL Server Configuration Manager](https://learn.microsoft.com/en-us/sql/relational-databases/sql-server-configuration-manager)

### SQL Server MCP Documentation
- [GitHub Repository](https://github.com/hisinha-rakesh/sql-server-mcp)
- [WINDOWS_AUTH_SETUP.md](./WINDOWS_AUTH_SETUP.md) - Authentication setup guide
- [TECHNICAL_WRITEUP.md](./TECHNICAL_WRITEUP.md) - Complete technical documentation

---

## Summary

### The Problem
SQL Server certificate validation fails during connection because:
- Certificate is self-signed (most common)
- Certificate issued by untrusted CA
- Certificate expired or hostname mismatch

### Quick Fixes (Choose One)

**Development/Testing:**
```json
"SQL_TRUST_SERVER_CERTIFICATE": "true"
```

**Production:**
1. Install proper SSL certificate on SQL Server
2. Configure ForceEncryption
3. Ensure clients trust the CA
4. Set `SQL_TRUST_SERVER_CERTIFICATE": "false"` for validation

**Enterprise with Internal CA:**
1. Export CA certificate from SQL Server
2. Import to client's Trusted Root store
3. Connect with encryption and validation enabled

### Key Takeaways

✅ **Always use encryption in production**
✅ **Always validate certificates in production** (TrustServerCertificate=false)
✅ **Use proper certificates from public CAs for internet-facing servers**
✅ **Document certificate expiration dates and renewal procedures**
⚠️ **Only use TrustServerCertificate=true for development/testing**
❌ **Never disable encryption over untrusted networks**

---

## Getting Help

If you're still experiencing issues after following this guide:

1. **Check SQL Server Error Log**
   ```sql
   EXEC xp_readerrorlog 0, 1, N'certificate'
   EXEC xp_readerrorlog 0, 1, N'encryption'
   ```

2. **Verify Certificate Details**
   ```powershell
   Get-ChildItem Cert:\LocalMachine\My |
       Where-Object {$_.Subject -like "*SQL*"} |
       Format-List Subject, Issuer, NotAfter, Thumbprint
   ```

3. **Test Network Connectivity**
   ```powershell
   Test-NetConnection -ComputerName SQLSERVER -Port 1433
   ```

4. **Check Windows Event Log**
   - Event Viewer → Windows Logs → Application
   - Filter for Source: MSSQLSERVER
   - Look for Event IDs: 17806, 26014, 26012

5. **Contact Support**
   - GitHub Issues: [SQL Server MCP Repository](https://github.com/hisinha-rakesh/sql-server-mcp/issues)
   - Stack Overflow: Tag with [sql-server] [ssl-certificate]
   - DBA Stack Exchange: [dba.stackexchange.com](https://dba.stackexchange.com)

---

**Last Updated:** 2026-01-03
**Tested With:** SQL Server 2016-2022, Azure SQL Database
**MCP Server Version:** 1.0.0
