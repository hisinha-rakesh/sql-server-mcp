const sql = require('mssql');

const config = {
    server: 'localhost',
    database: 'master',
    user: 'mcp_user',
    password: 'McpPass123!',
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

console.log('Testing SQL Server Authentication...\n');

async function testConnection() {
    try {
        console.log('Attempting to connect...');
        const pool = await sql.connect(config);
        console.log('✓ Connected successfully!');

        const result = await pool.request().query('SELECT @@VERSION AS version, @@SERVERNAME AS servername, DB_NAME() AS database_name');
        console.log('✓ Query executed successfully!');
        console.log('\nConnection Details:');
        console.log('Server:', result.recordset[0].servername);
        console.log('Database:', result.recordset[0].database_name);
        console.log('Version:', result.recordset[0].version.substring(0, 100) + '...');

        // Test listing databases
        const dbResult = await pool.request().query('SELECT name FROM sys.databases ORDER BY name');
        console.log('\nDatabases:');
        dbResult.recordset.forEach(db => console.log('  -', db.name));

        await pool.close();
        console.log('\n✓ Connection closed successfully');
        console.log('\n✓✓✓ SQL Server Authentication is working! ✓✓✓');
    } catch (err) {
        console.error('✗ Connection failed:');
        console.error('Error message:', err.message);
        console.error('Error code:', err.code);
    }
}

testConnection();
