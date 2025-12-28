const sql = require('mssql');

async function test() {
    try {
        const pool = await sql.connect({
            server: 'localhost',
            user: 'testuser',
            password: 'Password123',
            options: { encrypt: false, trustServerCertificate: true }
        });
        console.log('✓ Connected!');
        const result = await pool.request().query('SELECT @@VERSION AS v');
        console.log('Version:', result.recordset[0].v.substring(0, 50));
        await pool.close();
    } catch (err) {
        console.error('✗ Failed:', err.message);
    }
}
test();
