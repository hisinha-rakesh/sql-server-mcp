const sql = require('mssql');

const config = {
    server: 'localhost',
    database: 'master',
    user: 'testuser',
    password: 'Test123!',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    },
    pool: {
        min: 2,
        max: 10
    },
    connectionTimeout: 30000,
    requestTimeout: 30000
};

console.log('Testing Final SQL Server Connection...\n');

async function testConnection() {
    try {
        console.log('Connecting to SQL Server...');
        const pool = await sql.connect(config);
        console.log('✓ Connected successfully!\n');

        const result = await pool.request().query(`
            SELECT
                @@VERSION AS Version,
                @@SERVERNAME AS ServerName,
                USER_NAME() AS CurrentUser,
                DB_NAME() AS CurrentDatabase
        `);

        console.log('✓ Query executed successfully!\n');
        console.log('Connection Details:');
        console.log('  Server:', result.recordset[0].ServerName);
        console.log('  User:', result.recordset[0].CurrentUser);
        console.log('  Database:', result.recordset[0].CurrentDatabase);
        console.log('  Version:', result.recordset[0].Version.substring(0, 80) + '...\n');

        // List databases
        const dbResult = await pool.request().query('SELECT name FROM sys.databases ORDER BY name');
        console.log('Available Databases:');
        dbResult.recordset.forEach(db => console.log('  -', db.name));

        await pool.close();
        console.log('\n✓ Connection closed successfully');
        console.log('\n========================================');
        console.log('✓✓✓ SUCCESS! SQL Server is fully operational! ✓✓✓');
        console.log('========================================\n');
    } catch (err) {
        console.error('✗ Connection failed:');
        console.error('  Error:', err.message);
        console.error('  Code:', err.code);
    }
}

testConnection();
