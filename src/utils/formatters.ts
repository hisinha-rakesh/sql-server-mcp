/**
 * Format query results as a markdown table
 */
export function formatResultsAsTable(records: any[]): string {
  if (!records || records.length === 0) {
    return 'No results found.';
  }

  const columns = Object.keys(records[0]);

  // Create header
  const header = '| ' + columns.join(' | ') + ' |';
  const separator = '| ' + columns.map(() => '---').join(' | ') + ' |';

  // Create rows
  const rows = records.map((record) => {
    const values = columns.map((col) => {
      const value = record[col];
      if (value === null || value === undefined) return 'NULL';
      if (value instanceof Date) return value.toISOString();
      return String(value);
    });
    return '| ' + values.join(' | ') + ' |';
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Format query results as JSON
 */
export function formatResultsAsJson(records: any[]): string {
  return JSON.stringify(records, null, 2);
}

/**
 * Format column information as a table
 */
export function formatColumnsInfo(columns: any[]): string {
  if (!columns || columns.length === 0) {
    return 'No columns found.';
  }

  const header = '| Column Name | Data Type | Max Length | Nullable | Default |';
  const separator = '| --- | --- | --- | --- | --- |';

  const rows = columns.map((col) => {
    return `| ${col.column_name} | ${col.data_type} | ${col.max_length || 'N/A'} | ${col.is_nullable} | ${col.column_default || 'N/A'} |`;
  });

  return [header, separator, ...rows].join('\n');
}

/**
 * Truncate long text for display
 */
export function truncateText(text: string, maxLength: number = 100): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength - 3) + '...';
}

/**
 * Format a summary of query execution
 */
export function formatQuerySummary(
  rowsAffected: number | number[],
  executionTime?: number
): string {
  const rows = Array.isArray(rowsAffected) ? rowsAffected[0] : rowsAffected;

  let summary = `Rows affected: ${rows}`;

  if (executionTime) {
    summary += `\nExecution time: ${executionTime}ms`;
  }

  return summary;
}
