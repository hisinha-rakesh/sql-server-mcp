const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'src', 'config.ts');
let content = fs.readFileSync(configPath, 'utf8');

const oldCode = `    return {
      server: config.server,
      driver: 'msnodesqlv8',
      connectionString,
      pool: baseConfig.pool,
      options: {
        enableArithAbort: true,
        connectTimeout: config.connectionTimeout,
        requestTimeout: config.requestTimeout,
      },
    };`;

const newCode = `    return {
      server: config.server,
      driver: 'msnodesqlv8',
      connectionString,
      pool: baseConfig.pool,
      options: {
        enableArithAbort: true,
        connectTimeout: config.connectionTimeout,
        requestTimeout: config.requestTimeout,
      },
    } as any;`;

content = content.replace(oldCode, newCode);
fs.writeFileSync(configPath, content, 'utf8');
console.log('Configuration file updated with type cast!');
