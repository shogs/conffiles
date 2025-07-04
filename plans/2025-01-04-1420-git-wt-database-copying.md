# Git-wt Database Copying Feature Implementation Plan

## Overview
Add database copying functionality to the git-wt script that allows users to create a copy of their existing database when creating a new worktree using the `-db` flag.

## Problem Statement
When working with multiple worktrees, developers often need isolated database environments to avoid conflicts between different features or experiments. Currently, git-wt only modifies the DATABASE_URL in the .env file but doesn't create an actual database copy.

## Proposed Solution
Implement a `-db` flag for the `git wt new` command that:
1. Creates a new database with a name based on the worktree name
2. Copies all data from the original database using PostgreSQL tools
3. Prompts the user for confirmation before copying
4. Handles errors gracefully

## Implementation Details

### 1. Flag Parsing
- Add `-db` flag parsing to the `cmd_new()` function
- Modify argument parsing to handle the new flag
- Maintain backward compatibility with existing usage

### 2. Database Copying Function
Create `_copy_database()` function that:
- Extracts DATABASE_URL from .env file
- Validates it's a PostgreSQL database
- Extracts original database name
- Creates new database name with worktree suffix
- Uses `psql` to create new database
- Uses `pg_dump | psql` to copy data
- Includes error handling and cleanup

### 3. User Interface
- Add confirmation prompt before copying database
- Display clear information about source and target databases
- Show progress and success/failure messages
- Update help text and examples

### 4. Error Handling
- Check for required PostgreSQL tools (psql, pg_dump)
- Validate database URL format
- Handle database creation failures
- Clean up failed database copies
- Provide helpful error messages

## Files to be Modified
- `git-wt` script (main implementation)

## Expected Behavior
```bash
# Create worktree with database copy
git wt new -db auth-feature

# Output:
# 🚀 Creating new worktree...
# Branch: auth-feature
# Base: main
# Directory: /path/to/.worktrees/auth-feature
# ✅ Worktree created successfully!
# 📋 Copying .env file to worktree...
# 📝 Modified DATABASE_URL for worktree: auth-feature
# 🗄️ Database copying requested...
# 🗄️ Database copying details:
#    Original database: myapp_development
#    New database: myapp_development-auth-feature
# 
# Copy database 'myapp_development' to 'myapp_development-auth-feature'? [y/N]: y
# 📋 Creating database copy...
# Creating new database: myapp_development-auth-feature
# ✅ Database created successfully
# Copying database contents...
# ✅ Database copied successfully
# ✅ Environment file configured for worktree
```

## Dependencies
- PostgreSQL client tools (psql, pg_dump) must be available in PATH
- Only supports PostgreSQL databases initially
- Requires .env file with DATABASE_URL

## Testing Plan
1. Test flag parsing with various argument combinations
2. Test database copying with existing PostgreSQL database
3. Test error handling for missing tools
4. Test error handling for non-PostgreSQL databases
5. Test help text updates
6. Verify backward compatibility

## Future Enhancements
- Support for MySQL databases
- Support for SQLite databases
- Option to copy specific tables only
- Integration with database migration tools
- Automatic database cleanup on worktree removal