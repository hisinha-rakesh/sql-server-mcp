import { z } from 'zod';
import sql from 'mssql';

/**
 * Authentication type for SQL Server connection
 */
export const AuthTypeSchema = z.enum(['sql', 'windows', 'entra']);
export type AuthType = z.infer<typeof AuthTypeSchema>;

/**
 * Connection mode for SQL Server
 */
export const ConnectionModeSchema = z.enum(['read', 'readwrite']).default('readwrite');
export type ConnectionMode = z.infer<typeof ConnectionModeSchema>;

/**
 * Entra ID authentication methods supported
 */
export const EntraAuthTypeSchema = z.enum([
  'azure-active-directory-default',
  'azure-active-directory-password',
  'azure-active-directory-access-token',
  'azure-active-directory-msi-vm',
  'azure-active-directory-msi-app-service',
  'azure-active-directory-service-principal-secret'
]);
export type EntraAuthType = z.infer<typeof EntraAuthTypeSchema>;

/**
 * Configuration schema for SQL Server MCP server
 */
export const ConfigSchema = z.object({
  authType: AuthTypeSchema,
  server: z.string().min(1, 'SQL Server address is required'),
  database: z.string().min(1, 'Database name is required'),
  port: z.number().int().positive().default(1433),

  // Connection Mode
  mode: ConnectionModeSchema,

  // Windows Authentication
  trustedConnection: z.boolean().optional(),
  domain: z.string().optional(),

  // Entra ID Authentication
  entraAuthType: EntraAuthTypeSchema.optional(),
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  tenantId: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),

  // Connection Pool Settings
  poolMin: z.number().int().min(0).default(2),
  poolMax: z.number().int().positive().default(10),
  connectionTimeout: z.number().int().positive().default(30000),
  requestTimeout: z.number().int().positive().default(30000),

  // Security Settings
  encrypt: z.boolean().default(true),
  trustServerCertificate: z.boolean().default(false),
}).refine(
  (data) => {
    if (data.authType === 'sql') {
      return data.username !== undefined && data.password !== undefined;
    }
    return true;
  },
  {
    message: 'SQL authentication requires username and password',
    path: ['username'],
  }
).refine(
  (data) => {
    if (data.authType === 'windows') {
      return data.trustedConnection === true;
    }
    return true;
  },
  {
    message: 'Windows authentication requires trustedConnection to be true',
    path: ['trustedConnection'],
  }
).refine(
  (data) => {
    if (data.authType === 'entra') {
      return data.entraAuthType !== undefined;
    }
    return true;
  },
  {
    message: 'Entra authentication requires entraAuthType to be specified',
    path: ['entraAuthType'],
  }
);

export type Config = z.infer<typeof ConfigSchema>;

/**
 * Load configuration from environment variables
 */
export function loadConfig(): Config {
  const config = {
    authType: process.env.SQL_AUTH_TYPE || 'windows',
    server: process.env.SQL_SERVER || 'localhost',
    database: process.env.SQL_DATABASE || 'master',
    port: process.env.SQL_PORT ? parseInt(process.env.SQL_PORT) : 1433,

    mode: process.env.SQL_MODE || 'readwrite',

    trustedConnection: process.env.SQL_TRUSTED_CONNECTION === 'true',
    domain: process.env.SQL_DOMAIN,

    entraAuthType: process.env.SQL_ENTRA_AUTH_TYPE,
    clientId: process.env.SQL_CLIENT_ID,
    clientSecret: process.env.SQL_CLIENT_SECRET,
    tenantId: process.env.SQL_TENANT_ID,
    username: process.env.SQL_USERNAME,
    password: process.env.SQL_PASSWORD,

    poolMin: process.env.SQL_POOL_MIN ? parseInt(process.env.SQL_POOL_MIN) : 2,
    poolMax: process.env.SQL_POOL_MAX ? parseInt(process.env.SQL_POOL_MAX) : 10,
    connectionTimeout: process.env.SQL_CONNECTION_TIMEOUT ? parseInt(process.env.SQL_CONNECTION_TIMEOUT) : 30000,
    requestTimeout: process.env.SQL_REQUEST_TIMEOUT ? parseInt(process.env.SQL_REQUEST_TIMEOUT) : 30000,

    encrypt: process.env.SQL_ENCRYPT !== 'false',
    trustServerCertificate: process.env.SQL_TRUST_SERVER_CERTIFICATE === 'true',
  };

  return ConfigSchema.parse(config);
}

/**
 * Convert configuration to mssql connection config
 */
export function toMssqlConfig(config: Config): sql.config {
  const baseConfig: sql.config = {
    server: config.server,
    database: config.database,
    port: config.port,
    pool: {
      min: config.poolMin,
      max: config.poolMax,
    },
    options: {
      encrypt: config.encrypt,
      trustServerCertificate: config.trustServerCertificate,
      enableArithAbort: true,
      connectTimeout: config.connectionTimeout,
      requestTimeout: config.requestTimeout,
    },
  };

  if (config.authType === 'sql') {
    // SQL Server Authentication with username/password
    return {
      ...baseConfig,
      user: config.username,
      password: config.password,
    };
  } else if (config.authType === 'windows') {
    // Windows Authentication using msnodesqlv8 driver
    return {
      ...baseConfig,
      driver: 'msnodesqlv8',
      options: {
        ...baseConfig.options,
        trustedConnection: true,
      },
    };
  } else {
    // Entra ID Authentication using tedious driver
    const authentication: any = {
      type: config.entraAuthType,
    };

    // Add credentials based on auth type
    if (config.entraAuthType === 'azure-active-directory-password') {
      authentication.options = {
        userName: config.username,
        password: config.password,
      };
    } else if (config.entraAuthType === 'azure-active-directory-service-principal-secret') {
      authentication.options = {
        clientId: config.clientId,
        clientSecret: config.clientSecret,
        tenantId: config.tenantId,
      };
    }

    return {
      ...baseConfig,
      authentication,
    };
  }
}
