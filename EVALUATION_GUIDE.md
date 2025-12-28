# SQL Server MCP Server - Evaluation Guide

## Overview

This guide explains how to create effective evaluations for the SQL Server MCP server. Due to the nature of SQL Server databases (varying schemas, configurations, and data), evaluations should be created against a **specific, standardized test database**.

## Recommended Test Database

For consistent, reproducible evaluations, use:
- **AdventureWorks2019** or **AdventureWorks2022** sample database
- Download from: https://learn.microsoft.com/en-us/sql/samples/adventureworks-install-configure

## Evaluation Principles

Following the MCP Builder skill guidelines, each evaluation question must be:

1. **Independent** - Not dependent on other questions
2. **Read-only** - Only uses non-destructive operations
3. **Complex** - Requires multiple tool calls and deep exploration
4. **Realistic** - Based on real use cases
5. **Verifiable** - Single, clear answer verifiable by string comparison
6. **Stable** - Answer won't change over time

## Creating Evaluations - Step by Step

### Step 1: Tool Inspection

List all available tools and understand their capabilities:
- `sqlserver_test_connection`
- `sqlserver_execute_query`
- `sqlserver_list_databases`
- `sqlserver_list_tables`
- `sqlserver_list_columns`
- `sqlserver_list_stored_procedures`
- `sqlserver_get_table_info`
- `sqlserver_get_server_info`
- `sqlserver_get_database_size`
- `sqlserver_get_current_connections`

### Step 2: Content Exploration

Use READ-ONLY tools to explore the test database:

```
1. Test connection and get SQL Server version
2. List all databases to understand structure
3. List tables in specific schemas
4. Get detailed table information for key tables
5. Explore column structures and data types
6. Query sample data to understand content
```

### Step 3: Question Generation

Create 10 questions that:
- Test multiple tools in combination
- Require understanding of SQL Server metadata
- Navigate through schema structures
- Aggregate information from multiple sources

### Step 4: Answer Verification

Manually solve each question to verify the answer is:
- Deterministic (same answer every time)
- Specific (not vague or ambiguous)
- Verifiable (can be checked programmatically)

## Example Evaluation Questions (for AdventureWorks)

Once you have AdventureWorks installed, create questions like:

### Example 1: Schema Discovery + Query
**Question**: "In the AdventureWorks database, find the 'Person.Person' table. How many columns does this table have that allow NULL values?"

**Approach**:
1. Use `sqlserver_list_columns` for Person.Person
2. Filter results where is_nullable = 'YES'
3. Count the columns

**Answer**: (Specific number based on actual schema)

### Example 2: Cross-Reference Exploration
**Question**: "Find the table in the Sales schema that has a foreign key reference to the 'Customer' table. What is the exact name of the foreign key constraint?"

**Approach**:
1. Use `sqlserver_list_tables` to find tables in Sales schema
2. Use `sqlserver_get_table_info` on each table
3. Look for foreign keys referencing Customer table
4. Extract constraint name

**Answer**: (Specific constraint name)

### Example 3: Data Analysis
**Question**: "Query the 'Person.AddressType' table and find the address type name for AddressTypeID = 2. What is the exact Name value?"

**Approach**:
1. Use `sqlserver_execute_query` to query the table
2. Filter WHERE AddressTypeID = 2
3. Extract the Name column value

**Answer**: (Specific name from the table)

## Evaluation File Format

```xml
<?xml version="1.0" encoding="UTF-8"?>
<evaluation>
  <qa_pair>
    <question>Your complex question here</question>
    <answer>Exact answer</answer>
  </qa_pair>
  <!-- 9 more qa_pairs -->
</evaluation>
```

## Running Evaluations

1. Set up the test database (AdventureWorks)
2. Configure connection in `.env`:
   ```env
   SQL_AUTH_TYPE=windows
   SQL_SERVER=localhost
   SQL_DATABASE=AdventureWorks2019
   SQL_TRUSTED_CONNECTION=true
   ```
3. Create evaluation XML with 10 verified questions
4. Use MCP evaluation framework to run tests
5. Verify all answers match expected results

## Tips for Good Evaluation Questions

### ✅ DO:
- Ask about specific schema elements that won't change
- Require navigation through multiple metadata views
- Test understanding of table relationships
- Verify proper use of pagination and filtering
- Test error handling with edge cases

### ❌ DON'T:
- Ask about data that might change (row counts, current sessions)
- Depend on specific SQL Server versions or editions
- Require write operations
- Make questions dependent on previous answers
- Use ambiguous or subjective answers

## Common Evaluation Patterns

### Pattern 1: Schema Navigation
"Find table X, get its columns, identify the primary key, return key column name"

### Pattern 2: Relationship Discovery
"Find all foreign key relationships for table X, identify referenced table, return relationship count"

### Pattern 3: Metadata Aggregation
"List all tables with specific characteristics, count them, return the count"

### Pattern 4: Type Discovery
"Find column with specific name across all tables, identify its data type, return the type"

### Pattern 5: Constraint Analysis
"Analyze table constraints, identify specific constraint type, return constraint details"

## Next Steps

To complete the evaluations for this MCP server:

1. Install AdventureWorks sample database
2. Manually explore the database using the MCP tools
3. Document 10 complex questions with verified answers
4. Create final evaluation XML file
5. Test evaluation suite to ensure 100% pass rate

## Resources

- [AdventureWorks Sample Database](https://learn.microsoft.com/en-us/sql/samples/adventureworks-install-configure)
- [SQL Server System Catalog Views](https://learn.microsoft.com/en-us/sql/relational-databases/system-catalog-views/catalog-views-transact-sql)
- [MCP Evaluation Guide](https://github.com/anthropics/skills/blob/main/skills/mcp-builder/reference/evaluation.md)
