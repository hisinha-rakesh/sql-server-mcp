const sql = require('mssql');

const config = {
    server: 'RAKESH-PC',
    database: 'master',
    port: 1433,
    options: {
        encrypt: false,
        trustServerCertificate: true,
        trustedConnection: true,
        enableArithAbort: true,
        instanceName: ''
    },
    authentication: {
        type: 'ntlm',
        options: {
            domain: '',
            userName: '',
            password: ''
        }
    },
    pool: {
        min: 2,
        max: 10
    },
    connectionTimeout: 30000,
    requestTimeout: 30000
};

console.log('Testing SQL Server connection with config:', JSON.stringify(config, null, 2));

async function testConnection() {
    try {
        console.log('Attempting to connect...');
        const pool = await sql.connect(config);
        console.log('✓ Connected successfully!');

        const result = await pool.request().query('SELECT @@VERSION AS version');
        console.log('✓ Query executed successfully!');
        console.log('SQL Server Version:', result.recordset[0].version);

        await pool.close();
        console.log('✓ Connection closed');
    } catch (err) {
        console.error('✗ Connection failed:');
        console.error('Error message:', err.message);
        console.error('Error code:', err.code);
        console.error('Error name:', err.name);
        console.error('Full error:', JSON.stringify(err, Object.getOwnPropertyNames(err), 2));
    }
}

testConnection();
