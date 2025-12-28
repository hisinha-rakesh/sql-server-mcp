#!/usr/bin/env python3
import re

# Read the file
with open('src/index.ts', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add import statement after performance.js import
import_statement = """import {
  addDatabaseFileTool,
  removeDatabaseFileTool,
  modifyDatabaseFileTool,
  shrinkDatabaseFileTool,
  createFilegroupTool,
  removeFilegroupTool,
  modifyFilegroupTool,
  listFilegroupsTool,
  listDatabaseFilesTool,
} from './tools/file-management.js';
"""

# Find the performance.js import and add our import after it
content = content.replace(
    "} from './tools/performance.js';",
    "} from './tools/performance.js';\n" + import_statement
)

# 2. Add tools to the tools array after getWaitStatsTool
tools_addition = """
  // File and filegroup management tools
  addDatabaseFileTool,
  removeDatabaseFileTool,
  modifyDatabaseFileTool,
  shrinkDatabaseFileTool,
  createFilegroupTool,
  removeFilegroupTool,
  modifyFilegroupTool,
  listFilegroupsTool,
  listDatabaseFilesTool,"""

# Find getWaitStatsTool in the tools array and add our tools after it
content = re.sub(
    r"(  getWaitStatsTool,)\n(];)",
    r"\1" + tools_addition + "\n\2",
    content
)

# 3. Add write operations to writeOperations set
write_ops = """  'sqlserver_add_database_file',
  'sqlserver_remove_database_file',
  'sqlserver_modify_database_file',
  'sqlserver_shrink_database_file',
  'sqlserver_create_filegroup',
  'sqlserver_remove_filegroup',
  'sqlserver_modify_filegroup',
"""

# Find sqlserver_delete_job and add our operations after it
content = content.replace(
    "  'sqlserver_delete_job',\n]);",
    "  'sqlserver_delete_job',\n" + write_ops + "]);",
)

# Write the modified content back
with open('src/index.ts', 'w', encoding='utf-8') as f:
    f.write(content)

print("Successfully updated index.ts")
print("- Added file-management import")
print("- Added 9 new tools to tools array")
print("- Added 7 write operations to writeOperations set")
