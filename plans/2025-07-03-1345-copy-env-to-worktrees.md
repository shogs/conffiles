# Plan: Copy and Modify .env File for New Worktrees

**Created:** 2025-07-03 13:45  
**Status:** Ready for Implementation  
**Priority:** High  

## Requirements
When creating a new worktree:
1. Copy `.env` file from repository root to the new worktree
2. Modify the `DATABASE_URL` in the copied `.env` to add `-<worktree-name>` suffix
3. Ensure app can be started immediately in the new worktree with isolated database

## Implementation Plan

### 1. Add .env Copying Logic to cmd_new()
After worktree creation, add logic to:
- Check if `.env` exists in git root
- Copy it to the new worktree directory
- Modify DATABASE_URL with worktree suffix

### 2. DATABASE_URL Modification
Need to handle different DATABASE_URL formats:
```bash
# Examples of possible formats:
DATABASE_URL="postgresql://user:pass@localhost:5432/myapp"
DATABASE_URL="postgresql://user:pass@localhost:5432/myapp?schema=public"
DATABASE_URL="sqlite:./dev.db"
DATABASE_URL="mysql://user:pass@localhost:3306/myapp"
```

Transform to:
```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/myapp-featurebranch"
DATABASE_URL="postgresql://user:pass@localhost:5432/myapp-featurebranch?schema=public"
DATABASE_URL="sqlite:./dev-featurebranch.db"
DATABASE_URL="mysql://user:pass@localhost:3306/myapp-featurebranch"
```

### 3. Implementation Details

#### Helper Function for DATABASE_URL Modification
```bash
_modify_database_url() {
    local env_file="$1"
    local worktree_name="$2"
    
    if [ ! -f "$env_file" ]; then
        return 0
    fi
    
    # Use sed to modify DATABASE_URL
    if grep -q "^DATABASE_URL=" "$env_file"; then
        # Handle different database URL patterns
        sed -i.bak "s|^\(DATABASE_URL=.*://[^/]*/\)\([^?]*\)\(.*\)|\1\2-${worktree_name}\3|g" "$env_file"
        
        # Handle SQLite files specifically
        sed -i.bak "s|^\(DATABASE_URL=.*\)\(\.db\)\(.*\)|\1-${worktree_name}\2\3|g" "$env_file"
        
        # Clean up backup file
        rm -f "${env_file}.bak"
        
        echo -e "${GREEN}📝 Modified DATABASE_URL for worktree isolation${NC}"
    fi
}
```

#### Updated cmd_new() Function
```bash
cmd_new() {
    local branch_name="${1:-task-$(date +%Y%m%d-%H%M%S)}"
    local base_branch="${2:-main}"
    local git_root=$(git rev-parse --show-toplevel)
    local worktree_dir="$git_root/.worktrees/${branch_name}"
    
    ensure_git_repo
    setup_worktrees_dir
    
    echo -e "${BLUE}🚀 Creating new worktree...${NC}"
    echo "Branch: $branch_name"
    echo "Base: $base_branch"
    echo "Directory: $worktree_dir"
    
    # Create the worktree
    git worktree add -b "$branch_name" "$worktree_dir" "$base_branch"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ Worktree created successfully!${NC}"
        echo -e "${BLUE}📂 Directory: $(realpath $worktree_dir)${NC}"
        
        # Create session file
        echo "branch=$branch_name" > "$worktree_dir/.git-wt-session"
        echo "created=$(date -Iseconds)" >> "$worktree_dir/.git-wt-session"
        echo "base_branch=$base_branch" >> "$worktree_dir/.git-wt-session"
        
        # Copy and modify .env file
        local root_env="$git_root/.env"
        local worktree_env="$worktree_dir/.env"
        
        if [ -f "$root_env" ]; then
            echo -e "${BLUE}📋 Copying .env file to worktree...${NC}"
            cp "$root_env" "$worktree_env"
            
            # Modify DATABASE_URL
            _modify_database_url "$worktree_env" "$branch_name"
            
            echo -e "${GREEN}✅ Environment file configured for worktree${NC}"
        else
            echo -e "${YELLOW}⚠️  No .env file found in repository root${NC}"
        fi
        
        echo ""
        echo "Next steps:"
        echo "1. cd $worktree_dir"
        echo "2. Your app is ready to start with isolated database"
        echo "3. Use: git wt switch $branch_name"
        echo ""
        echo "Or use: git wt switch $branch_name"
    else
        echo -e "${RED}❌ Failed to create worktree${NC}"
        exit 1
    fi
}
```

### 4. Enhanced DATABASE_URL Pattern Matching

More robust sed pattern to handle various formats:

```bash
_modify_database_url() {
    local env_file="$1"
    local worktree_name="$2"
    
    if [ ! -f "$env_file" ]; then
        return 0
    fi
    
    if grep -q "^DATABASE_URL=" "$env_file"; then
        # Create temporary file for processing
        local temp_file=$(mktemp)
        
        while IFS= read -r line; do
            if [[ $line =~ ^DATABASE_URL= ]]; then
                # Extract the URL value
                local url_value="${line#DATABASE_URL=}"
                url_value="${url_value%\"}"  # Remove trailing quote
                url_value="${url_value#\"}"  # Remove leading quote
                
                # Modify based on database type
                case $url_value in
                    postgresql://*|postgres://*)
                        # postgresql://user:pass@host:port/dbname -> dbname-worktree
                        modified_url=$(echo "$url_value" | sed "s|\(/[^/?]*\)\([?].*\)\?$|\1-${worktree_name}\2|")
                        ;;
                    mysql://*)
                        # mysql://user:pass@host:port/dbname -> dbname-worktree
                        modified_url=$(echo "$url_value" | sed "s|\(/[^/?]*\)\([?].*\)\?$|\1-${worktree_name}\2|")
                        ;;
                    sqlite:*)
                        # sqlite:./file.db -> ./file-worktree.db
                        modified_url=$(echo "$url_value" | sed "s|\(.*\)\(\.db\)|\1-${worktree_name}\2|")
                        ;;
                    *)
                        # Default: try to add suffix before query params or at end
                        modified_url=$(echo "$url_value" | sed "s|\([^?]*\)\([?].*\)\?$|\1-${worktree_name}\2|")
                        ;;
                esac
                
                echo "DATABASE_URL=\"$modified_url\"" >> "$temp_file"
                echo -e "${GREEN}📝 Modified DATABASE_URL: ...${worktree_name}${NC}"
            else
                echo "$line" >> "$temp_file"
            fi
        done < "$env_file"
        
        # Replace original file
        mv "$temp_file" "$env_file"
    fi
}
```

### 5. Additional Considerations

#### Error Handling
- Check if .env file exists before attempting to copy
- Validate that DATABASE_URL modification was successful
- Provide clear feedback about what was done

#### Optional Features
- Could also copy other config files (.env.local, .env.development, etc.)
- Could modify other environment variables if needed
- Could create worktree-specific config directory

## Expected Behavior

### Example Usage
```bash
$ git wt new auth-feature

🚀 Creating new worktree...
Branch: auth-feature
Base: main
Directory: /repo/.worktrees/auth-feature

✅ Worktree created successfully!
📂 Directory: /repo/.worktrees/auth-feature
📋 Copying .env file to worktree...
📝 Modified DATABASE_URL: ...auth-feature
✅ Environment file configured for worktree

Next steps:
1. cd /repo/.worktrees/auth-feature
2. Your app is ready to start with isolated database
3. Use: git wt switch auth-feature
```

### Before/After .env
```bash
# Original .env
DATABASE_URL="postgresql://user:pass@localhost:5432/myapp"

# Worktree .env (auth-feature)
DATABASE_URL="postgresql://user:pass@localhost:5432/myapp-auth-feature"
```

## Files to Modify
1. `git-wt` - Add _modify_database_url() helper and update cmd_new()
2. `CLAUDE.md` - Document the .env copying and modification behavior
3. `claude/commands/wt/new.md` - Update to mention environment isolation

## Benefits
1. **Immediate app startup** - New worktrees have working .env files
2. **Database isolation** - Each worktree uses separate database
3. **No conflicts** - Worktrees can run simultaneously without interference
4. **Development efficiency** - No manual .env setup required
5. **Testing isolation** - Each feature branch has clean database state

This makes worktrees much more practical for development where each feature needs its own isolated environment.