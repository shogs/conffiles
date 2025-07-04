# Plan: Enable git-wt Commands from Within Worktrees

**Created:** 2025-07-03 13:40  
**Status:** Ready for Implementation  
**Priority:** High  

## Problem Analysis
Currently git-wt commands only work from the repository root because they:
- Look for `.worktrees/` in current working directory
- Don't handle switching between worktrees
- Can't exit current worktree shell when switching to another

## Current Issues
1. **Path Resolution**: Commands look for `.worktrees/` relative to `$PWD`, not git root
2. **Shell Management**: No logic to exit current worktree shell when switching
3. **Context Awareness**: Don't detect if already in a worktree

## Proposed Solution
Make git-wt commands work from anywhere in the repository by:
1. Always resolving paths relative to git repository root
2. Auto-exit current worktree shell when switching to another
3. Smart path resolution for `.worktrees/` directory

## Implementation Plan

### 1. Update Path Resolution
Replace hardcoded `.worktrees/` paths with git-root-relative paths:

```bash
# Before
local worktree_path=".worktrees/$branch_name"

# After  
local git_root=$(git rev-parse --show-toplevel)
local worktree_path="$git_root/.worktrees/$branch_name"
```

### 2. Add Worktree-to-Worktree Switching Logic
In `cmd_switch()` and `cmd_resume()`:

```bash
# Check if we're currently in a worktree shell
if _is_in_worktree_shell; then
    echo -e "${YELLOW}🔄 Currently in worktree shell for: $GIT_WT_BRANCH${NC}"
    echo -e "${BLUE}Exiting current worktree and switching to: $branch_name${NC}"
    
    # Exit current shell if switching with -s flag
    if [ "$create_shell" = true ]; then
        # Will start new shell, so exit current one
        echo -e "${GREEN}💡 Type 'exit' to complete the switch${NC}"
        return 0
    else
        # Just change directory, no shell exit needed
        echo "Switching to lightweight mode..."
    fi
fi
```

### 3. Update All Path References
Functions to update:
- `cmd_new()` - Fix `.worktrees/` and `.gitignore` paths
- `cmd_list()` - Fix `.worktrees/` enumeration  
- `cmd_switch()` - Fix worktree path resolution
- `cmd_resume()` - Fix worktree path resolution
- `cmd_status()` - Fix worktree counting and enumeration
- `cmd_clean()` - Fix worktree cleanup paths

### 4. Create Helper Function
```bash
_get_worktrees_dir() {
    local git_root=$(git rev-parse --show-toplevel 2>/dev/null)
    if [ -z "$git_root" ]; then
        echo -e "${RED}❌ Not in a git repository${NC}" >&2
        return 1
    fi
    echo "$git_root/.worktrees"
}

_get_git_root() {
    git rev-parse --show-toplevel 2>/dev/null
}
```

### 5. Enhanced Context Awareness
```bash
_get_current_worktree_context() {
    if _is_in_worktree_shell; then
        echo "shell:$GIT_WT_BRANCH"
    elif [[ "$(pwd)" == *".worktrees/"* ]]; then
        # Extract branch name from path
        local branch=$(basename "$(pwd)")
        echo "dir:$branch"  
    else
        echo "main"
    fi
}
```

## Expected Behavior Examples

### Scenario 1: Switch from worktree shell to another worktree
```bash
(wt:featureA) $ git wt switch -s featureB
🔄 Currently in worktree shell for: featureA
🔄 Exiting current worktree and switching to: featureB
💡 Type 'exit' to complete the switch

$ # After typing exit
🔄 Switching to worktree: featureB
Starting worktree shell. Type 'exit' or use 'git wt root' to return.
(wt:featureB) $ 
```

### Scenario 2: Switch from worktree directory (no shell) to another
```bash
# In featureA directory but no shell
~/repo/.worktrees/featureA $ git wt switch featureB
🔄 Switching to worktree: featureB
📍 Current directory: /repo/.worktrees/featureB
✅ Ready to work in worktree
```

### Scenario 3: Commands work from any location
```bash
# From deep in worktree
~/repo/.worktrees/featureA/src/components $ git wt list
📋 Git Worktrees
========================
🌿 Branch: featureA (current)
🌿 Branch: featureB
```

## Implementation Details

### Updated cmd_switch()
```bash
cmd_switch() {
    local create_shell=false
    local branch_name=""
    
    # Parse arguments (existing logic)
    
    ensure_git_repo
    local git_root=$(_get_git_root)
    local worktrees_dir="$git_root/.worktrees"
    local worktree_path="$worktrees_dir/$branch_name"
    
    # Handle current worktree context
    if _is_in_worktree_shell && [ "$GIT_WT_BRANCH" != "$branch_name" ]; then
        echo -e "${YELLOW}🔄 Currently in worktree shell: $GIT_WT_BRANCH${NC}"
        if [ "$create_shell" = true ]; then
            echo -e "${BLUE}Switching to: $branch_name${NC}"
            echo -e "${GREEN}💡 Type 'exit' then run this command again${NC}"
            return 0
        fi
    fi
    
    # Rest of switch logic with corrected paths...
}
```

### Updated Helper Functions
```bash
setup_worktrees_dir() {
    local git_root=$(_get_git_root)
    local worktrees_dir="$git_root/.worktrees"
    local gitignore_file="$git_root/.gitignore"
    
    mkdir -p "$worktrees_dir"
    
    if ! grep -q "^\.worktrees/" "$gitignore_file" 2>/dev/null; then
        echo ".worktrees/" >> "$gitignore_file"
        echo -e "${GREEN}📝 Added .worktrees/ to .gitignore${NC}"
    fi
}
```

## Files to Modify
1. `git-wt` - Update all path resolution and add worktree-to-worktree logic
2. `claude/commands/wt/*.md` - Update documentation for cross-worktree usage
3. `CLAUDE.md` - Update examples showing usage from within worktrees

## Benefits
1. **Work from anywhere** - Commands work from any location in repo
2. **Seamless switching** - Switch between worktrees easily
3. **Context awareness** - Commands understand current worktree state
4. **Better UX** - No need to always return to root first
5. **Shell management** - Handles nested shells intelligently

This makes git-wt much more practical for real-world usage where you're often working within worktrees rather than at the repository root.