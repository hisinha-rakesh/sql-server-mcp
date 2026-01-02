const sql = require('mssql/msnodesqlv8');

const config = {
    server: 'localhost',
    database: 'master',
    options: {
        trustedConnection: true,
        encrypt: false,
        trustServerCertificate: true
    }
};

async function testConnection() {
    console.log('Testing SQL Server connection with Windows Authentication...\n');
    console.log('Config:', JSON.stringify(config, null, 2));
    
    try {
        console.log('\nConnecting...');
        const pool = await sql.connect(config);
        console.log('✓ Connected successfully!');

        console.log('\nExecuting test query...');
        const result = await pool.request().query('SELECT @@VERSION AS version, @@SERVERNAME AS servername, SYSTEM_USER AS current_user_login');
        
        console.log('✓ Query executed successfully!\n');
        console.log('Server Name:', result.recordset[0].servername);
        console.log('Current User:', result.recordset[0].current_user_login);
        console.log('Version:', result.recordset[0].version.substring(0, 100) + '...\n');

        await pool.close();
        console.log('✓ Connection closed successfully\n');
        console.log('=== CONNECTION TEST PASSED ===');
        return true;
    } catch (err) {
        console.error('\n✗ Connection failed:');
        console.error('Error:', err.message);
        console.error('Code:', err.code);
        console.error('\n=== CONNECTION TEST FAILED ===');
        return false;
    }
}

testConnection();
