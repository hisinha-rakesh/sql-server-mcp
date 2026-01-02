const sql = require('mssql');

// Test WITHOUT encrypt option for msnodesqlv8
const config1 = {
  server: 'RAKESH-PC',
  database: 'master',
  port: 1433,
  driver: 'msnodesqlv8',
  options: {
    trustedConnection: true,
    trustServerCertificate: true,
    enableArithAbort: true,
  },
};

console.log('=== Test 1: Without encrypt option ===');
sql.connect(config1)
  .then(pool => {
    console.log('✓ SUCCESS!');
    return pool.request().query('SELECT SYSTEM_USER as CurrentUser');
  })
  .then(result => {
    console.log('Current User:', result.recordset[0].CurrentUser);
    return sql.close();
  })
  .catch(err => {
    console.error('✗ FAILED:', err.message);
    sql.close();
  });
