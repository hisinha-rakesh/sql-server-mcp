const sql = require('mssql');

const config = {
  server: 'RAKESH-PC',
  database: 'master',
  port: 1433,
  driver: 'msnodesqlv8',
  options: {
    encrypt: true,
    trustServerCertificate: true,
    trustedConnection: true,
    enableArithAbort: true,
  },
};

console.log('Testing Windows Authentication with msnodesqlv8...');
console.log('Config:', JSON.stringify(config, null, 2));

sql.connect(config)
  .then(pool => {
    console.log('Connection successful!');
    return pool.request().query('SELECT SYSTEM_USER as CurrentUser, @@VERSION as Version');
  })
  .then(result => {
    console.log('Query result:', result.recordset[0]);
    sql.close();
  })
  .catch(err => {
    console.error('Connection failed:', err.message);
    console.error('Error code:', err.code);
    sql.close();
  });
