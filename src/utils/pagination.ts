/**
 * Pagination options for query results
 */
export interface PaginationOptions {
  limit?: number;
  offset?: number;
}

/**
 * Default pagination limits
 */
export const DEFAULT_LIMIT = 100;
export const MAX_LIMIT = 1000;

/**
 * Validate and normalize pagination parameters
 */
export function normalizePagination(options?: PaginationOptions): Required<PaginationOptions> {
  const limit = Math.min(
    Math.max(options?.limit ?? DEFAULT_LIMIT, 1),
    MAX_LIMIT
  );

  const offset = Math.max(options?.offset ?? 0, 0);

  return { limit, offset };
}

/**
 * Add pagination to a SQL query
 * Uses OFFSET/FETCH which requires an ORDER BY clause
 */
export function addPagination(
  query: string,
  pagination: Required<PaginationOptions>,
  orderByColumn: string = '(SELECT NULL)'
): string {
  // Check if query already has ORDER BY
  const hasOrderBy = /ORDER\s+BY/i.test(query);

  let paginatedQuery = query.trim();

  // Remove trailing semicolon if present
  if (paginatedQuery.endsWith(';')) {
    paginatedQuery = paginatedQuery.slice(0, -1);
  }

  // Add ORDER BY if not present (required for OFFSET/FETCH)
  if (!hasOrderBy) {
    paginatedQuery += `\nORDER BY ${orderByColumn}`;
  }

  // Add OFFSET/FETCH
  paginatedQuery += `\nOFFSET ${pagination.offset} ROWS`;
  paginatedQuery += `\nFETCH NEXT ${pagination.limit} ROWS ONLY`;

  return paginatedQuery;
}

/**
 * Get count query for pagination metadata
 */
export function getCountQuery(baseQuery: string): string {
  // Remove ORDER BY clause for count query (improves performance)
  const queryWithoutOrderBy = baseQuery.replace(/ORDER\s+BY[^;]*/gi, '').trim();

  return `SELECT COUNT(*) as total FROM (${queryWithoutOrderBy}) AS CountQuery`;
}
