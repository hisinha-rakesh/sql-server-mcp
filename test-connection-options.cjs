const sql = require('mssql');

const testConfigs = [
    {
        name: 'localhost with Windows Auth',
        config: {
            server: 'localhost',
            database: 'master',
            options: {
                encrypt: false,
                trustServerCertificate: true,
                trustedConnection: true,
                enableArithAbort: true
            },
            connectionTimeout: 30000
        }
    },
    {
        name: 'localhost with port',
        config: {
            server: 'localhost',
            database: 'master',
            port: 1433,
            options: {
                encrypt: false,
                trustServerCertificate: true,
                trustedConnection: true,
                enableArithAbort: true
            },
            connectionTimeout: 30000
        }
    },
    {
        name: '127.0.0.1 with Windows Auth',
        config: {
            server: '127.0.0.1',
            database: 'master',
            options: {
                encrypt: false,
                trustServerCertificate: true,
                trustedConnection: true,
                enableArithAbort: true
            },
            connectionTimeout: 30000
        }
    },
    {
        name: 'localhost\\MSSQLSERVER (Named Instance)',
        config: {
            server: 'localhost\\MSSQLSERVER',
            database: 'master',
            options: {
                encrypt: false,
                trustServerCertificate: true,
                trustedConnection: true,
                enableArithAbort: true,
                instanceName: 'MSSQLSERVER'
            },
            connectionTimeout: 30000
        }
    }
];

async function testConnection(testCase) {
    console.log(`\n========================================`);
    console.log(`Testing: ${testCase.name}`);
    console.log(`========================================`);

    try {
        const pool = await sql.connect(testCase.config);
        console.log('✓ Connected successfully!');

        const result = await pool.request().query('SELECT @@VERSION AS version, @@SERVERNAME AS servername');
        console.log('✓ Query executed successfully!');
        console.log('Server:', result.recordset[0].servername);
        console.log('Version:', result.recordset[0].version.substring(0, 100) + '...');

        await pool.close();
        console.log('✓ Connection closed');
        return true;
    } catch (err) {
        console.error('✗ Connection failed:');
        console.error('  Error:', err.message);
        console.error('  Code:', err.code);
        return false;
    }
}

async function runTests() {
    console.log('SQL Server Connection Tests\n');

    for (const testCase of testConfigs) {
        const success = await testConnection(testCase);
        if (success) {
            console.log(`\n✓✓✓ SUCCESS! Use this configuration ✓✓✓`);
            console.log('Config:', JSON.stringify(testCase.config, null, 2));
            break;
        }
    }
}

runTests();
