# Git-WT YAML Configuration System - Implementation Plan

**Date**: 2025-10-19  
**Author**: Claude  
**Status**: Ready for Implementation

## Executive Summary

Refactor `git-wt` to use YAML configuration files instead of hardcoded bash logic. The YAML files will contain simple bash scripts that define setup and teardown actions for worktrees. This makes git-wt technology-agnostic and fully customizable per-project.

## Problem Statement

Currently `git-wt` has hardcoded behavior for:
- **Node modules handling** - Prompts user to copy/symlink node_modules directories
- **Database operations** - Copies PostgreSQL databases and modifies DATABASE_URL in .env files  
- **Environment file handling** - Copies and modifies .env files with database URL transformations
- **Symlink management** - Creates and tracks worktree symlinks

These behaviors are:
- Technology-specific (Node.js, PostgreSQL only)
- Not configurable per-project
- Difficult to extend for new use cases
- Mixed with core worktree logic

## Solution

**Transform git-wt into a pure execution engine that runs bash scripts defined in `.git-wt.yaml`.**

### Core Principle

YAML files contain only three things per action:
1. **name** - Action identifier
2. **description** - Human-readable description
3. **script** - Bash code to execute

All logic (conditions, prompts, error handling) is plain bash in the script section.

## YAML Schema

### File Location
- **Required**: `.git-wt.yaml` in repository root
- **No fallbacks**: Users must run `git wt init` to create configuration

### Schema Structure

```yaml
version: 1

setup:
  - name: action_identifier
    description: "What this action does"
    script: |
      # Bash code here
      # Use exit 0 to skip silently
      # Use exit 1 to abort worktree creation

teardown:
  - name: action_identifier  
    description: "What this action does"
    script: |
      # Bash code here
```

### Environment Variables Available to Scripts

All scripts have access to:
- `$WORKTREE_NAME` - Branch/worktree name
- `$WORKTREE_PATH` - Absolute path to worktree directory
- `$GIT_ROOT` - Repository root path
- `$BASE_BRANCH` - Base branch for this worktree

## Example Configurations

### Full Node.js Configuration (matches current git-wt behavior)

```yaml
version: 1

setup:
  - name: copy_env
    description: "Copy and modify .env file"
    script: |
      if [ ! -f .env ]; then
        exit 0
      fi
      
      cp .env "$WORKTREE_PATH/.env"
      
      # Modify DATABASE_URL and DIRECT_URL to append worktree name
      for var in DATABASE_URL DIRECT_URL; do
        if grep -q "^${var}=" "$WORKTREE_PATH/.env"; then
          sed -i.bak "s|\(^${var}=.*\)/\([^/?]*\)\(.*\)|\1/\2-$WORKTREE_NAME\3|" "$WORKTREE_PATH/.env"
        fi
      done
      rm -f "$WORKTREE_PATH/.env.bak"

  - name: node_modules
    description: "Handle node_modules directories"
    script: |
      if [ ! -d node_modules ]; then
        exit 0
      fi
      
      echo "📦 Found node_modules. What would you like to do?"
      echo "  c) Copy all"
      echo "  s) Symlink"
      echo "  i) npm install"
      echo "  n) Skip"
      echo -n "Choice [c/s/i/n]: "
      read -n 1 -r choice
      echo
      
      case $choice in
        c|C)
          echo "📋 Copying node_modules..."
          rsync -a --info=progress2 "$GIT_ROOT/node_modules/" "$WORKTREE_PATH/node_modules/"
          echo "✅ Copied successfully"
          ;;
        s|S)
          echo "🔗 Creating symlink..."
          ln -sf "$GIT_ROOT/node_modules" "$WORKTREE_PATH/node_modules"
          echo "✅ Symlink created"
          ;;
        i|I)
          echo "📥 Running npm install..."
          cd "$WORKTREE_PATH" && npm install
          ;;
        *)
          echo "⏭️  Skipped"
          ;;
      esac

  - name: database
    description: "Copy PostgreSQL database"
    script: |
      if [ ! -f "$WORKTREE_PATH/.env" ]; then
        exit 0
      fi
      
      if ! grep -q "^DATABASE_URL=.*postgres" "$WORKTREE_PATH/.env"; then
        exit 0
      fi
      
      ORIG_URL=$(grep "^DATABASE_URL=" .env | cut -d'=' -f2- | tr -d '"')
      NEW_URL=$(grep "^DATABASE_URL=" "$WORKTREE_PATH/.env" | cut -d'=' -f2- | tr -d '"')
      NEW_DB=$(echo "$NEW_URL" | sed 's|.*/\([^?]*\).*|\1|')
      ORIG_DB=$(echo "$ORIG_URL" | sed 's|.*/\([^?]*\).*|\1|')
      
      echo "🗄️  Database copying details:"
      echo "   Original database: $ORIG_DB"
      echo "   New database: $NEW_DB"
      echo ""
      echo "   Your .env file has been updated to use the new database name."
      echo "   If you skip copying, you'll need to manually create the database."
      echo ""
      echo -n "Copy database for isolated development? [Y/n]: "
      read -n 1 -r response
      echo
      
      case $response in
        [nN])
          echo "⏭️  Skipped database copy"
          ;;
        *)
          echo "📋 Creating database: $NEW_DB"
          if ! psql "$ORIG_URL" -c "CREATE DATABASE \"$NEW_DB\""; then
            echo "❌ Failed to create database"
            exit 1
          fi
          
          echo "📋 Copying database contents..."
          if pg_dump "$ORIG_URL" | psql "$NEW_URL"; then
            echo "✅ Database copied successfully"
          else
            echo "❌ Failed to copy database"
            exit 1
          fi
          ;;
      esac

teardown:
  - name: drop_database
    description: "Drop worktree database"
    script: |
      if [ ! -f "$WORKTREE_PATH/.env" ]; then
        exit 0
      fi
      
      if ! grep -q "^DATABASE_URL=.*postgres" "$WORKTREE_PATH/.env"; then
        exit 0
      fi
      
      DB_URL=$(grep "^DATABASE_URL=" "$WORKTREE_PATH/.env" | cut -d'=' -f2- | tr -d '"')
      DB_NAME=$(echo "$DB_URL" | sed 's|.*/\([^?]*\).*|\1|')
      ADMIN_URL=$(echo "$DB_URL" | sed "s|/$DB_NAME|/postgres|")
      
      echo "🗄️  Database removal details:"
      echo "   Database to drop: $DB_NAME"
      echo ""
      echo "⚠️  WARNING: This will permanently delete the database and all its data!"
      echo "   This action cannot be undone."
      echo ""
      echo -n "Type 'yes' to confirm: "
      read -r confirmation
      
      if [ "$confirmation" = "yes" ]; then
        if psql "$ADMIN_URL" -c "DROP DATABASE \"$DB_NAME\" WITH (FORCE)"; then
          echo "✅ Database dropped successfully"
        else
          echo "❌ Failed to drop database"
        fi
      else
        echo "⏭️  Cancelled"
      fi
```

### Minimal Configuration

```yaml
version: 1
setup: []
teardown: []
```

### Simple Node.js Configuration

```yaml
version: 1

setup:
  - name: copy_env
    description: "Copy .env file"
    script: |
      if [ -f .env ]; then
        cp .env "$WORKTREE_PATH/.env"
      fi

  - name: npm_install
    description: "Run npm install"
    script: |
      if [ -f "$WORKTREE_PATH/package.json" ]; then
        cd "$WORKTREE_PATH" && npm install
      fi

teardown: []
```

### Python/Django Configuration

```yaml
version: 1

setup:
  - name: copy_env
    description: "Copy .env file"
    script: |
      if [ -f .env ]; then
        cp .env "$WORKTREE_PATH/.env"
      fi

  - name: venv
    description: "Create Python virtual environment"
    script: |
      if [ ! -f requirements.txt ]; then
        exit 0
      fi
      
      echo "🐍 How to handle Python virtual environment?"
      echo "  c) Create new venv"
      echo "  s) Symlink to main venv"
      echo "  n) Skip"
      echo -n "Choice [c/s/n]: "
      read -n 1 -r choice
      echo
      
      case $choice in
        c|C)
          cd "$WORKTREE_PATH"
          python -m venv venv
          ./venv/bin/pip install -r requirements.txt
          ;;
        s|S)
          ln -sf "$GIT_ROOT/venv" "$WORKTREE_PATH/venv"
          ;;
        *)
          echo "Skipped"
          ;;
      esac

  - name: database
    description: "Copy database and run migrations"
    script: |
      if [ ! -f "$WORKTREE_PATH/.env" ]; then
        exit 0
      fi
      
      if ! grep -q "^DATABASE_URL=" "$WORKTREE_PATH/.env"; then
        exit 0
      fi
      
      echo -n "Copy database and run migrations? [Y/n]: "
      read -n 1 -r response
      echo
      
      case $response in
        [nN])
          echo "Skipped"
          ;;
        *)
          ORIG_URL=$(grep "^DATABASE_URL=" .env | cut -d'=' -f2- | tr -d '"')
          DB_NAME=$(echo "$ORIG_URL" | sed 's|.*/\([^?]*\).*|\1|')
          NEW_DB="${DB_NAME}-${WORKTREE_NAME}"
          
          psql "$ORIG_URL" -c "CREATE DATABASE \"$NEW_DB\""
          pg_dump "$ORIG_URL" | psql "${ORIG_URL/$DB_NAME/$NEW_DB}"
          
          sed -i.bak "s|$DB_NAME|$NEW_DB|" "$WORKTREE_PATH/.env"
          rm -f "$WORKTREE_PATH/.env.bak"
          
          cd "$WORKTREE_PATH"
          ./venv/bin/python manage.py migrate
          ;;
      esac

teardown: []
```

## Implementation Details

### Phase 1: YAML Parsing and Execution Engine

**New functions to add to git-wt:**

```bash
# Check if .git-wt.yaml exists, error if not
require_config() {
    if [ ! -f .git-wt.yaml ]; then
        echo -e "${RED}❌ No .git-wt.yaml configuration found!${NC}"
        echo -e "${YELLOW}💡 Run 'git wt init' to create a configuration${NC}"
        echo -e "${YELLOW}💡 Or create .git-wt.yaml manually${NC}"
        echo -e "${YELLOW}💡 See templates/ directory for examples${NC}"
        exit 1
    fi
}

# Execute setup actions from YAML
execute_setup_actions() {
    local git_root="$1"
    local worktree_path="$2"
    local worktree_name="$3"
    local base_branch="$4"
    
    # Export variables for scripts
    export GIT_ROOT="$git_root"
    export WORKTREE_PATH="$worktree_path"
    export WORKTREE_NAME="$worktree_name"
    export BASE_BRANCH="$base_branch"
    
    # Check if yq is available
    if ! command -v yq >/dev/null 2>&1; then
        echo -e "${RED}❌ yq command not found${NC}"
        echo -e "${YELLOW}💡 Install yq: brew install yq${NC}"
        echo -e "${YELLOW}💡 Or use python fallback (requires PyYAML)${NC}"
        
        # Try Python fallback
        if ! command -v python3 >/dev/null 2>&1; then
            echo -e "${RED}❌ Neither yq nor python3 available${NC}"
            exit 1
        fi
        
        execute_setup_actions_python "$git_root" "$worktree_path" "$worktree_name" "$base_branch"
        return $?
    fi
    
    local setup_count=$(yq eval '.setup | length' .git-wt.yaml)
    
    if [ "$setup_count" = "0" ] || [ "$setup_count" = "null" ]; then
        echo -e "${BLUE}ℹ️  No setup actions configured${NC}"
        return 0
    fi
    
    echo -e "${BLUE}🔧 Running setup actions...${NC}"
    echo ""
    
    for i in $(seq 0 $((setup_count - 1))); do
        local name=$(yq eval ".setup[$i].name" .git-wt.yaml)
        local desc=$(yq eval ".setup[$i].description" .git-wt.yaml)
        local script=$(yq eval ".setup[$i].script" .git-wt.yaml)
        
        echo -e "${GREEN}▶ $desc${NC}"
        
        # Execute script
        eval "$script"
        local exit_code=$?
        
        if [ $exit_code -eq 1 ]; then
            echo -e "${RED}❌ Setup action '$name' failed${NC}"
            return 1
        fi
        
        echo ""
    done
    
    echo -e "${GREEN}✅ Setup actions completed${NC}"
    return 0
}

# Execute teardown actions from YAML
execute_teardown_actions() {
    local git_root="$1"
    local worktree_path="$2"
    local worktree_name="$3"
    
    export GIT_ROOT="$git_root"
    export WORKTREE_PATH="$worktree_path"
    export WORKTREE_NAME="$worktree_name"
    
    if ! command -v yq >/dev/null 2>&1; then
        execute_teardown_actions_python "$git_root" "$worktree_path" "$worktree_name"
        return $?
    fi
    
    local teardown_count=$(yq eval '.teardown | length' .git-wt.yaml)
    
    if [ "$teardown_count" = "0" ] || [ "$teardown_count" = "null" ]; then
        return 0
    fi
    
    echo -e "${BLUE}🔧 Running teardown actions...${NC}"
    echo ""
    
    for i in $(seq 0 $((teardown_count - 1))); do
        local name=$(yq eval ".teardown[$i].name" .git-wt.yaml)
        local desc=$(yq eval ".teardown[$i].description" .git-wt.yaml)
        local script=$(yq eval ".teardown[$i].script" .git-wt.yaml)
        
        echo -e "${YELLOW}▶ $desc${NC}"
        
        eval "$script"
        
        echo ""
    done
    
    return 0
}

# Python fallback for YAML parsing
execute_setup_actions_python() {
    python3 <<EOF
import yaml
import os
import sys
import subprocess

with open('.git-wt.yaml', 'r') as f:
    config = yaml.safe_load(f)

setup = config.get('setup', [])

if not setup:
    print('\033[0;34mℹ️  No setup actions configured\033[0m')
    sys.exit(0)

print('\033[0;34m🔧 Running setup actions...\033[0m')
print()

for action in setup:
    name = action.get('name', 'unnamed')
    desc = action.get('description', 'No description')
    script = action.get('script', '')
    
    print(f'\033[0;32m▶ {desc}\033[0m')
    
    result = subprocess.run(script, shell=True, executable='/bin/bash')
    
    if result.returncode == 1:
        print(f'\033[0;31m❌ Setup action "{name}" failed\033[0m')
        sys.exit(1)
    
    print()

print('\033[0;32m✅ Setup actions completed\033[0m')
EOF
}

execute_teardown_actions_python() {
    python3 <<EOF
import yaml
import subprocess

with open('.git-wt.yaml', 'r') as f:
    config = yaml.safe_load(f)

teardown = config.get('teardown', [])

if not teardown:
    exit(0)

print('\033[0;34m🔧 Running teardown actions...\033[0m')
print()

for action in teardown:
    name = action.get('name', 'unnamed')
    desc = action.get('description', 'No description')
    script = action.get('script', '')
    
    print(f'\033[1;33m▶ {desc}\033[0m')
    
    subprocess.run(script, shell=True, executable='/bin/bash')
    
    print()
EOF
}
```

### Phase 2: Refactor Existing Commands

**Changes to `cmd_new()`:**

```bash
cmd_new() {
    local branch_name=""
    local base_branch=$(get_default_branch)
    
    # Parse arguments (remove -db and -s flags)
    while [[ $# -gt 0 ]]; do
        case $1 in
            -*)
                echo -e "${RED}Unknown option: $1${NC}"
                echo "Usage: git wt new [branch-name] [base-branch]"
                return 1
                ;;
            *)
                if [ -z "$branch_name" ]; then
                    branch_name="$1"
                else
                    base_branch="$1"
                fi
                shift
                ;;
        esac
    done
    
    # Set default branch name if not provided
    if [ -z "$branch_name" ]; then
        branch_name="task-$(date +%Y%m%d-%H%M%S)"
    fi
    
    local git_root=$(git rev-parse --show-toplevel)
    local worktree_dir="$git_root/.worktrees/${branch_name}"
    
    ensure_git_repo
    require_config  # NEW: Require .git-wt.yaml
    setup_worktrees_dir
    
    echo -e "${BLUE}🚀 Creating new worktree...${NC}"
    echo "Branch: $branch_name"
    echo "Base: $base_branch"
    echo "Directory: $worktree_dir"
    
    # Create the worktree
    git worktree add -b "$branch_name" "$worktree_dir" "$base_branch"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Worktree created successfully!${NC}"
        echo ""
        
        # Create session file
        echo "branch=$branch_name" > "$worktree_dir/.git-wt-session"
        echo "created=$(date -Iseconds)" >> "$worktree_dir/.git-wt-session"
        echo "base_branch=$base_branch" >> "$worktree_dir/.git-wt-session"
        
        # Execute setup actions from YAML
        execute_setup_actions "$git_root" "$worktree_dir" "$branch_name" "$base_branch"
        
        echo ""
        echo -e "${GREEN}✅ Worktree setup complete!${NC}"
    else
        echo -e "${RED}❌ Failed to create worktree${NC}"
        exit 1
    fi
}
```

**Changes to `cmd_remove()`:**

```bash
cmd_remove() {
    local force_remove=false
    local branch_name=""
    
    ensure_git_repo
    
    # Parse arguments (remove -db flag)
    while [[ $# -gt 0 ]]; do
        case $1 in
            -f|--force)
                force_remove=true
                shift
                ;;
            -*)
                echo -e "${RED}Unknown option: $1${NC}"
                echo "Usage: git wt remove [-f|--force] <branch-name>"
                return 1
                ;;
            *)
                branch_name="$1"
                break
                ;;
        esac
    done
    
    if [ -z "$branch_name" ]; then
        echo "Available worktrees to remove:"
        cmd_list
        echo ""
        echo "Usage: git wt remove [-f|--force] <branch-name>"
        return 1
    fi
    
    local git_root=$(git rev-parse --show-toplevel)
    local worktree_path="$git_root/.worktrees/$branch_name"
    
    if [ ! -d "$worktree_path" ]; then
        echo -e "${RED}❌ Worktree '$branch_name' not found${NC}"
        return 1
    fi
    
    # Check for uncommitted changes unless force
    if [ "$force_remove" != true ]; then
        cd "$worktree_path"
        local git_status=$(git status --porcelain 2>/dev/null)
        if [ -n "$git_status" ]; then
            echo -e "${RED}❌ Cannot remove worktree '$branch_name' - has uncommitted changes${NC}"
            echo ""
            git status --short
            echo ""
            echo -e "${YELLOW}💡 Use 'git wt remove -f $branch_name' to force removal${NC}"
            cd - > /dev/null
            return 1
        fi
        cd - > /dev/null
    fi
    
    # Execute teardown actions from YAML
    if [ -f "$git_root/.git-wt.yaml" ]; then
        execute_teardown_actions "$git_root" "$worktree_path" "$branch_name"
    fi
    
    echo -e "${YELLOW}🗑️  Removing worktree: $branch_name${NC}"
    
    # Remove the worktree
    git worktree remove "$worktree_path" --force 2>/dev/null
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Worktree removed successfully${NC}"
        
        # Delete the branch
        if git show-ref --verify --quiet "refs/heads/$branch_name"; then
            if [ "$force_remove" = true ]; then
                git branch -D "$branch_name" 2>/dev/null
            else
                git branch -d "$branch_name" 2>/dev/null
            fi
        fi
    else
        echo -e "${RED}❌ Failed to remove worktree${NC}"
        return 1
    fi
}
```

**Functions to DELETE entirely:**
- `_prompt_copy_node_modules()`
- `_copy_node_modules()`
- `_copy_database()`
- `_modify_database_url()`
- `_drop_database()`
- `cmd_db_copy()` (remove entire command)

### Phase 3: Implement `git wt init` Command

```bash
cmd_init() {
    local template=""
    local auto_detect=true
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            --template=*)
                template="${1#*=}"
                auto_detect=false
                shift
                ;;
            --minimal)
                template="minimal"
                auto_detect=false
                shift
                ;;
            -h|--help)
                echo "Usage: git wt init [--template=<name>|--minimal]"
                echo ""
                echo "Available templates:"
                echo "  nodejs-full     - Node.js with full setup (current git-wt behavior)"
                echo "  nodejs-simple   - Node.js with simple npm install"
                echo "  python-django   - Python Django projects"
                echo "  minimal         - No setup actions"
                echo ""
                echo "Without --template, auto-detects project type"
                return 0
                ;;
            *)
                echo -e "${RED}Unknown option: $1${NC}"
                return 1
                ;;
        esac
    done
    
    ensure_git_repo
    
    # Check if .git-wt.yaml already exists
    if [ -f .git-wt.yaml ]; then
        echo -e "${YELLOW}⚠️  .git-wt.yaml already exists${NC}"
        echo -n "Overwrite? [y/N]: "
        read -n 1 -r response
        echo
        
        case $response in
            [yY])
                echo "Proceeding with overwrite..."
                ;;
            *)
                echo "Cancelled"
                return 0
                ;;
        esac
    fi
    
    # Auto-detect project type if no template specified
    if [ "$auto_detect" = true ]; then
        if [ -f package.json ]; then
            template="nodejs-full"
            echo -e "${BLUE}🔍 Detected Node.js project${NC}"
        elif [ -f requirements.txt ] || [ -f setup.py ]; then
            template="python-django"
            echo -e "${BLUE}🔍 Detected Python project${NC}"
        else
            template="minimal"
            echo -e "${BLUE}🔍 No specific project type detected, using minimal template${NC}"
        fi
    fi
    
    # Get script directory (where git-wt is located)
    local script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
    local template_file="$script_dir/templates/${template}.yaml"
    
    if [ ! -f "$template_file" ]; then
        echo -e "${RED}❌ Template '$template' not found${NC}"
        echo -e "${YELLOW}💡 Available templates:${NC}"
        ls -1 "$script_dir/templates/" 2>/dev/null | sed 's/\.yaml$//' | sed 's/^/  /'
        return 1
    fi
    
    # Copy template to .git-wt.yaml
    cp "$template_file" .git-wt.yaml
    
    echo -e "${GREEN}✅ Created .git-wt.yaml from '$template' template${NC}"
    echo ""
    echo -e "${BLUE}📝 Next steps:${NC}"
    echo "  1. Review and customize .git-wt.yaml as needed"
    echo "  2. Consider adding .git-wt.yaml to git to share with team"
    echo "  3. Run 'git wt new <branch-name>' to create your first worktree"
    echo ""
    echo -n "Add .git-wt.yaml to git? [Y/n]: "
    read -n 1 -r response
    echo
    
    case $response in
        [nN])
            echo "Skipped git add"
            ;;
        *)
            git add .git-wt.yaml
            echo -e "${GREEN}✅ Added .git-wt.yaml to git${NC}"
            echo -e "${YELLOW}💡 Don't forget to commit: git commit -m 'Add git-wt configuration'${NC}"
            ;;
    esac
}
```

**Update command dispatcher:**

```bash
case "${1:-help}" in
    "init")
        shift
        cmd_init "$@"
        ;;
    "new"|"add")
        shift
        cmd_new "$@"
        ;;
    # ... rest of commands ...
    "db_copy"|"dbcopy"|"copydb")
        # REMOVE THIS CASE - no longer supported
        echo -e "${RED}❌ db_copy command removed${NC}"
        echo -e "${YELLOW}💡 Database operations are now configured in .git-wt.yaml${NC}"
        exit 1
        ;;
esac
```

### Phase 4: Create Template Files

Directory structure:
```
.dotfiles/
├── git-wt
└── templates/
    ├── nodejs-full.yaml
    ├── nodejs-simple.yaml
    ├── python-django.yaml
    └── minimal.yaml
```

Templates are shown in the "Example Configurations" section above.

### Phase 5: Update Documentation

**Update help text:**

```bash
show_help() {
    echo -e "${BLUE}Git Worktree Management - Usage: git wt <command>${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  First time setup: Run 'git wt init' to create .git-wt.yaml${NC}"
    echo ""
    echo -e "${GREEN}📋 Available Commands:${NC}"
    echo -e "  ${BLUE}init${NC} [--template=<name>]          - Create .git-wt.yaml configuration"
    echo -e "  ${BLUE}new|add${NC} [branch-name] [base]      - Create new worktree"
    echo -e "  ${BLUE}list${NC} [-d]                         - List all worktrees"
    echo -e "  ${BLUE}switch${NC} [-s] <branch>              - Switch to worktree"
    echo -e "  ${BLUE}resume${NC} [-s] <branch>              - Resume work in worktree"
    echo -e "  ${BLUE}remove${NC} [-f] <branch>              - Remove worktree"
    echo -e "  ${BLUE}root${NC}                              - Switch to repository root"
    echo -e "  ${BLUE}status${NC}                            - Show overall status"
    echo -e "  ${BLUE}clean${NC}                             - Clean up worktrees"
    echo -e "  ${BLUE}task${NC} 'description' [branch]       - Create worktree + start Claude task"
    echo -e "  ${BLUE}help${NC}                              - Show this help"
    echo ""
    echo -e "${GREEN}📝 Available Templates:${NC}"
    echo -e "  ${BLUE}nodejs-full${NC}      - Node.js with full setup (database, node_modules)"
    echo -e "  ${BLUE}nodejs-simple${NC}    - Node.js with simple npm install"
    echo -e "  ${BLUE}python-django${NC}    - Python Django projects"
    echo -e "  ${BLUE}minimal${NC}          - No setup actions"
    echo ""
    echo -e "${GREEN}Examples:${NC}"
    echo "  git wt init                       # Auto-detect and create config"
    echo "  git wt init --template=nodejs-full"
    echo "  git wt new feature-auth           # Create worktree with config"
    echo "  git wt remove feature-auth"
}
```

## Migration Guide for Existing Users

### Breaking Changes

1. **Must run `git wt init`** before creating worktrees
2. **Removed flags**: `-db`, `-s` (configure in YAML instead)
3. **Removed command**: `git wt db_copy` (configure in YAML instead)

### Migration Steps

1. Run `git wt init` in existing repositories
2. Choose template that matches current workflow (likely `nodejs-full`)
3. Customize `.git-wt.yaml` as needed
4. Commit `.git-wt.yaml` to share with team

### For Users Who Want Old Behavior

The `nodejs-full` template matches the exact behavior of the old git-wt, including:
- .env copying with DATABASE_URL modification
- Interactive node_modules prompts
- Database copying with PostgreSQL
- Database cleanup on removal

## Testing Plan

### Manual Testing Checklist

1. **Init command**
   - [ ] `git wt init` auto-detects Node.js project
   - [ ] `git wt init --template=nodejs-full` uses specific template
   - [ ] `git wt init --minimal` creates minimal config
   - [ ] Prompts to add .git-wt.yaml to git
   - [ ] Warns if .git-wt.yaml already exists

2. **New command**
   - [ ] Errors if no .git-wt.yaml exists
   - [ ] Executes setup actions in order
   - [ ] Handles script exit 0 (skip)
   - [ ] Handles script exit 1 (abort)
   - [ ] Sets environment variables correctly

3. **Remove command**
   - [ ] Executes teardown actions
   - [ ] Removes worktree successfully
   - [ ] No longer has -db flag

4. **Templates**
   - [ ] nodejs-full works end-to-end
   - [ ] nodejs-simple works end-to-end
   - [ ] python-django works end-to-end
   - [ ] minimal works (no actions)

5. **Error handling**
   - [ ] Missing yq shows helpful error
   - [ ] Python fallback works
   - [ ] Invalid YAML shows error
   - [ ] Failed scripts abort properly

## File Changes Summary

### Modified Files
- **git-wt** - Major refactor
  - Add: `require_config()`, `execute_setup_actions()`, `execute_teardown_actions()`
  - Add: `execute_setup_actions_python()`, `execute_teardown_actions_python()`
  - Add: `cmd_init()`
  - Modify: `cmd_new()`, `cmd_remove()`, `show_help()`
  - Delete: `_prompt_copy_node_modules()`, `_copy_node_modules()`, `_copy_database()`, `_modify_database_url()`, `_drop_database()`, `cmd_db_copy()`

### Created Files
- **templates/nodejs-full.yaml** - Full Node.js setup (current behavior)
- **templates/nodejs-simple.yaml** - Simple npm install
- **templates/python-django.yaml** - Django with venv and migrations
- **templates/minimal.yaml** - Empty configuration

### Documentation Updates
- **CLAUDE.md** - Update git-wt section with new workflow
- **plans/2025-10-19-1430-git-wt-yaml-config.md** - This plan document

## Timeline

- **Phase 1** (YAML Parsing): 1-2 hours
- **Phase 2** (Refactor): 1-2 hours  
- **Phase 3** (Init Command): 2-3 hours
- **Phase 4** (Templates): 2-3 hours
- **Phase 5** (Documentation): 1 hour
- **Testing**: 2 hours

**Total Estimated Time**: 9-13 hours

## Benefits

1. **Technology Agnostic**: Works with any language/framework
2. **Fully Customizable**: Each project defines its own setup
3. **Transparent**: Users see exactly what bash runs
4. **Simple**: No complex DSL, just bash scripts
5. **Shareable**: Teams can commit .git-wt.yaml
6. **Maintainable**: Less code in git-wt, more in configs
7. **Extensible**: Users can add any custom logic

## Dependencies

- **Required**: `yq` OR `python3` with `PyYAML`
- **Recommended**: Install yq with `brew install yq`

## Success Criteria

- [ ] Can run `git wt init` to create configuration
- [ ] Can create worktrees with custom setup actions
- [ ] All template files work correctly
- [ ] Existing git-wt users can migrate smoothly
- [ ] Documentation is clear and complete
- [ ] No hardcoded behavior remains in git-wt
