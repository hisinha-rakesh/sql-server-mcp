// Import msnodesqlv8 driver specifically
const sql = require('mssql/msnodesqlv8');

const config = {
  server: 'RAKESH-PC',
  database: 'master',
  options: {
    trustedConnection: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
  pool: {
    min: 2,
    max: 10,
  },
  connectionTimeout: 30000,
  requestTimeout: 30000,
};

console.log('=== Testing with mssql/msnodesqlv8 import ===');
console.log('Config:', JSON.stringify(config, null, 2));

sql.connect(config)
  .then(pool => {
    console.log('\n✓ Connection successful!');
    return pool.request().query('SELECT SYSTEM_USER as CurrentUser, USER_NAME() as DBUser, @@VERSION as Version');
  })
  .then(result => {
    console.log('\nCurrent Windows User:', result.recordset[0].CurrentUser);
    console.log('Database User:', result.recordset[0].DBUser);
    console.log('SQL Server Version:', result.recordset[0].Version.substring(0, 80));
    console.log('\n✓✓✓ Windows Authentication WORKS! ✓✓✓');
    return sql.close();
  })
  .catch(err => {
    console.error('\n✗ Connection failed!');
    console.error('Error:', err.message);
    console.error('Code:', err.code);
    sql.close();
    process.exit(1);
  });
