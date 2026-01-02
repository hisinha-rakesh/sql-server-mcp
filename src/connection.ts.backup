import sql from 'mssql';
import { Config, toMssqlConfig } from './config.js';

/**
 * Manages SQL Server connection pool
 */
export class ConnectionManager {
  private pool: sql.ConnectionPool | null = null;
  private config: Config;

  constructor(config: Config) {
    this.config = config;
  }

  /**
   * Get or create connection pool
   */
  async getPool(): Promise<sql.ConnectionPool> {
    if (this.pool && this.pool.connected) {
      return this.pool;
    }

    const mssqlConfig = toMssqlConfig(this.config);
    this.pool = new sql.ConnectionPool(mssqlConfig);

    this.pool.on('error', (err) => {
      console.error('SQL Server connection pool error:', err);
    });

    await this.pool.connect();
    return this.pool;
  }

  /**
   * Test connection to SQL Server
   */
  async testConnection(): Promise<{ success: boolean; message: string; version?: string }> {
    try {
      const pool = await this.getPool();
      const result = await pool.request().query('SELECT @@VERSION AS version');

      return {
        success: true,
        message: 'Connection successful',
        version: result.recordset[0].version,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        success: false,
        message: `Connection failed: ${errorMessage}`,
      };
    }
  }

  /**
   * Execute a query with parameters
   */
  async executeQuery(
    query: string,
    params?: Record<string, any>
  ): Promise<sql.IResult<any>> {
    const pool = await this.getPool();
    const request = pool.request();

    // Add parameters if provided
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        request.input(key, value);
      }
    }

    return await request.query(query);
  }

  /**
   * Execute a stored procedure with parameters
   */
  async executeStoredProcedure(
    procedureName: string,
    params?: Record<string, { value?: any; type?: any; output?: boolean }>
  ): Promise<sql.IProcedureResult<any>> {
    const pool = await this.getPool();
    const request = pool.request();

    // Add parameters if provided
    if (params) {
      for (const [key, param] of Object.entries(params)) {
        if (param.output) {
          request.output(key, param.type, param.value);
        } else {
          request.input(key, param.type, param.value);
        }
      }
    }

    return await request.execute(procedureName);
  }

  /**
   * Close the connection pool
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.close();
      this.pool = null;
    }
  }
}
