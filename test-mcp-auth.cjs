const sql = require('mssql');

// Simulate the exact config from Claude Desktop
process.env.SQL_AUTH_TYPE = 'windows';
process.env.SQL_SERVER = 'RAKESH-PC';
process.env.SQL_DATABASE = 'master';
process.env.SQL_PORT = '1433';
process.env.SQL_TRUSTED_CONNECTION = 'true';
process.env.SQL_ENCRYPT = 'true';
process.env.SQL_TRUST_SERVER_CERTIFICATE = 'true';
process.env.SQL_POOL_MIN = '2';
process.env.SQL_POOL_MAX = '10';
process.env.SQL_CONNECTION_TIMEOUT = '30000';
process.env.SQL_REQUEST_TIMEOUT = '30000';

const authType = 'windows';
const config = {
  server: process.env.SQL_SERVER,
  database: process.env.SQL_DATABASE,
  port: parseInt(process.env.SQL_PORT),
  pool: {
    min: parseInt(process.env.SQL_POOL_MIN),
    max: parseInt(process.env.SQL_POOL_MAX),
  },
  options: {
    encrypt: process.env.SQL_ENCRYPT !== 'false',
    trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true',
    enableArithAbort: true,
    connectTimeout: parseInt(process.env.SQL_CONNECTION_TIMEOUT),
    requestTimeout: parseInt(process.env.SQL_REQUEST_TIMEOUT),
  },
};

// Add Windows auth config
const finalConfig = {
  ...config,
  driver: 'msnodesqlv8',
  options: {
    ...config.options,
    trustedConnection: true,
  },
};

console.log('=== Testing Windows Authentication ===');
console.log('Configuration:', JSON.stringify(finalConfig, null, 2));
console.log('\n=== Attempting Connection ===');

sql.connect(finalConfig)
  .then(pool => {
    console.log('✓ Connection successful!');
    return pool.request().query('SELECT SYSTEM_USER as CurrentUser, USER_NAME() as DatabaseUser, @@VERSION as Version');
  })
  .then(result => {
    console.log('\n=== Query Result ===');
    console.log('Current User:', result.recordset[0].CurrentUser);
    console.log('Database User:', result.recordset[0].DatabaseUser);
    console.log('Version:', result.recordset[0].Version.split('\n')[0]);
    return sql.close();
  })
  .catch(err => {
    console.error('\n✗ Connection failed!');
    console.error('Error message:', err.message);
    console.error('Error code:', err.code);
    console.error('Error name:', err.name);
    if (err.originalError) {
      console.error('Original error:', err.originalError.message);
    }
    sql.close();
    process.exit(1);
  });
