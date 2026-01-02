const sql = require('mssql');

// Test 1: Connection string approach (recommended for msnodesqlv8)
const connectionString = 'Server=RAKESH-PC;Database=master;Trusted_Connection=Yes;Driver={SQL Server Native Client 11.0};';

console.log('=== Test 1: Connection String (Recommended) ===');
console.log('Connection String:', connectionString);

sql.connect(connectionString)
  .then(pool => {
    console.log('✓ SUCCESS with connection string!');
    return pool.request().query('SELECT SYSTEM_USER as CurrentUser, USER_NAME() as DBUser, @@VERSION as Version');
  })
  .then(result => {
    console.log('Current User:', result.recordset[0].CurrentUser);
    console.log('Database User:', result.recordset[0].DBUser);
    console.log('Version:', result.recordset[0].Version.substring(0, 80));
    return sql.close();
  })
  .catch(async err => {
    console.error('✗ FAILED:', err.message);
    await sql.close();

    // Test 2: Try with different driver
    console.log('\n=== Test 2: Try with SQL Server driver ===');
    const connectionString2 = 'Server=RAKESH-PC;Database=master;Trusted_Connection=Yes;Driver={SQL Server};';

    return sql.connect(connectionString2)
      .then(pool => {
        console.log('✓ SUCCESS with SQL Server driver!');
        return pool.request().query('SELECT SYSTEM_USER as CurrentUser');
      })
      .then(result => {
        console.log('Current User:', result.recordset[0].CurrentUser);
        return sql.close();
      })
      .catch(err2 => {
        console.error('✗ Also failed:', err2.message);
        sql.close();
      });
  });
