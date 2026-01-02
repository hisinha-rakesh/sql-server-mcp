const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'src', 'config.ts');
let content = fs.readFileSync(configPath, 'utf8');

const oldCode = `  } else if (config.authType === 'windows') {
    // Windows Authentication using msnodesqlv8 driver
    return {
      ...baseConfig,
      driver: 'msnodesqlv8',
      options: {
        ...baseConfig.options,
        trustedConnection: true,
      },
    };
  } else {`;

const newCode = `  } else if (config.authType === 'windows') {
    // Windows Authentication using msnodesqlv8 driver
    // For msnodesqlv8, use connection string to properly set TrustServerCertificate
    const connectionString = \`Server=\${config.server}\${config.port !== 1433 ? ',' + config.port : ''};Database=\${config.database};Trusted_Connection=yes;Driver={SQL Server Native Client 11.0};\${config.trustServerCertificate ? 'TrustServerCertificate=yes;' : ''}\`;

    return {
      server: config.server,
      driver: 'msnodesqlv8',
      connectionString,
      pool: baseConfig.pool,
      options: {
        enableArithAbort: true,
        connectTimeout: config.connectionTimeout,
        requestTimeout: config.requestTimeout,
      },
    };
  } else {`;

content = content.replace(oldCode, newCode);
fs.writeFileSync(configPath, content, 'utf8');
console.log('Configuration file updated successfully!');
