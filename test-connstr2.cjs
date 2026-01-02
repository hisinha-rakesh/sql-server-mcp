const sql = require('mssql');

// Test with TrustServerCertificate
const connectionString = 'Server=RAKESH-PC;Database=master;Trusted_Connection=Yes;TrustServerCertificate=Yes;Driver={SQL Server Native Client 11.0};';

console.log('=== Testing with TrustServerCertificate ===');
console.log('Connection String:', connectionString);

sql.connect(connectionString)
  .then(pool => {
    console.log('✓ SUCCESS!');
    return pool.request().query('SELECT SYSTEM_USER as CurrentUser, USER_NAME() as DBUser, @@VERSION as Version');
  })
  .then(result => {
    console.log('\nCurrent Windows User:', result.recordset[0].CurrentUser);
    console.log('Database User:', result.recordset[0].DBUser);
    console.log('SQL Server Version:', result.recordset[0].Version.substring(0, 80));
    console.log('\n✓✓✓ Windows Authentication is WORKING! ✓✓✓');
    return sql.close();
  })
  .catch(async err => {
    console.error('\n✗ Failed:', err.message);
    await sql.close();
    process.exit(1);
  });
