/**
 * Format error messages with actionable guidance
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;

    // SQL Server specific error guidance
    if (message.includes('Login failed')) {
      return `Authentication failed. Check your credentials and ensure:\n` +
        `- For Windows Auth: The service account has SQL Server access\n` +
        `- For Entra ID: The managed identity or service principal is configured\n` +
        `- The user has appropriate database permissions\n\n` +
        `Original error: ${message}`;
    }

    if (message.includes('Cannot open database')) {
      return `Database access denied. Ensure:\n` +
        `- The database name is correct\n` +
        `- Your account has access to this database\n` +
        `- The database exists and is online\n\n` +
        `Original error: ${message}`;
    }

    if (message.includes('Invalid object name')) {
      return `Table or view not found. Please:\n` +
        `- Verify the object name spelling\n` +
        `- Check if the object exists in the current database\n` +
        `- Ensure you have SELECT permission on the object\n` +
        `- Use schema-qualified names (e.g., dbo.TableName)\n\n` +
        `Original error: ${message}`;
    }

    if (message.includes('timeout')) {
      return `Query timeout. Try:\n` +
        `- Simplifying the query or adding appropriate indexes\n` +
        `- Increasing the request timeout setting\n` +
        `- Checking for blocking queries or locks\n\n` +
        `Original error: ${message}`;
    }

    if (message.includes('Syntax error')) {
      return `SQL syntax error. Review:\n` +
        `- SQL statement syntax for SQL Server T-SQL\n` +
        `- Proper use of parameters (use @paramName syntax)\n` +
        `- Quotes around string values\n\n` +
        `Original error: ${message}`;
    }

    return `SQL Server error: ${message}`;
  }

  return `Unknown error: ${String(error)}`;
}

/**
 * Check if error is a connection error
 */
export function isConnectionError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('connection') ||
      message.includes('econnrefused') ||
      message.includes('etimedout') ||
      message.includes('enotfound')
    );
  }
  return false;
}

/**
 * Check if error is an authentication error
 */
export function isAuthenticationError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    return (
      message.includes('login failed') ||
      message.includes('authentication') ||
      message.includes('access denied')
    );
  }
  return false;
}
