const sql = require('mssql');

const config = {
    server: 'localhost',
    user: 'testuser',
    password: 'Test123!',
    options: {
        encrypt: false,
        trustServerCertificate: true,
        enableArithAbort: true
    },
    connectionTimeout: 30000
};

console.log('Testing connection without database...\n');

async function testConnection() {
    try {
        console.log('Connecting...');
        const pool = await sql.connect(config);
        console.log('✓ Connected!\n');

        const result = await pool.request().query('SELECT @@VERSION AS v, DB_NAME() AS db');
        console.log('Database:', result.recordset[0].db);
        console.log('Version:', result.recordset[0].v.substring(0, 60));

        await pool.close();
        console.log('\n✓ Success!');
    } catch (err) {
        console.error('✗ Failed:', err.message, '(Code:', err.code + ')');
    }
}

testConnection();
