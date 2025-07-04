# Plan: Smart Shell Management for git-wt Commands

**Created:** 2025-07-03 12:30  
**Status:** Ready for Implementation  
**Priority:** High  

## Current Analysis
The current git-wt system has inconsistent shell behavior:
- `git wt switch` always starts a new shell
- `git wt root` just changes directory
- No way to detect if you're in a worktree shell
- No way to exit worktree shells intelligently

## Proposed Solution
Implement smart shell management that:
1. Only creates shells when a branch argument is provided to switch commands
2. Tracks when you're in a worktree shell using environment variables
3. Makes `git wt root` exit worktree shells when appropriate
4. Provides consistent enter/exit behavior

## Implementation Plan

### 1. Environment Variable Tracking
- Set `GIT_WT_SHELL=1` when starting worktree shells
- Set `GIT_WT_ORIGINAL_DIR="$PWD"` to remember where we came from
- Use these variables to detect shell context

### 2. Update cmd_switch() Behavior
**Current:** Always starts new shell  
**New:** Only start shell if branch argument is provided
```bash
# With argument: git wt switch feature-branch → start shell
# Without argument: git wt switch → just show available worktrees
```

### 3. Update cmd_resume() Behavior  
**Current:** Always starts new shell  
**New:** Only start shell if branch argument is provided
```bash
# With argument: git wt resume feature-branch → start shell  
# Without argument: git wt resume → just show available worktrees
```

### 4. Smart cmd_root() Behavior
**New logic:**
- If `GIT_WT_SHELL=1` exists → exit the shell (returns to original location)
- If not in worktree shell → change directory to repository root
- Provide feedback about what action was taken

### 5. Shell Session Management
When starting worktree shells:
```bash
# Set environment variables
export GIT_WT_SHELL=1
export GIT_WT_ORIGINAL_DIR="$PWD"
export GIT_WT_BRANCH="$branch_name"

# Start shell with custom prompt indicator
PS1="(wt:$branch_name) $PS1" $SHELL
```

### 6. Update Shell Functions in git-wt.sh
Apply same logic to shell functions:
- `_git_wt_switch()` - only shell if argument provided
- `_git_wt_resume()` - only shell if argument provided  
- `_git_wt_root()` - smart exit/change behavior

## Expected Behavior Examples

### Scenario 1: Switch with argument (current behavior preserved)
```bash
$ git wt switch feature-branch
🔄 Switching to worktree: feature-branch
📋 Session info: ...
Starting new shell in worktree. Type 'exit' to return.
(wt:feature-branch) $ 
```

### Scenario 2: Switch without argument (new behavior)
```bash
$ git wt switch
Available worktrees:
🌿 Branch: feature-branch
🌿 Branch: bug-fix
📁 Path: .worktrees/feature-branch

Usage: git wt switch <branch-name>
```

### Scenario 3: Root from worktree shell (new behavior)
```bash
(wt:feature-branch) $ git wt root
🏠 Exiting worktree shell and returning to repository root...
📍 Back to: /path/to/main/repo
$ 
```

### Scenario 4: Root from main shell (current behavior)
```bash
$ git wt root
🏠 Switching to repository root...
📍 Current directory: /path/to/repo
✅ Now in repository root directory
```

## Implementation Details

### Shell Detection Function
```bash
_is_in_worktree_shell() {
    [ "$GIT_WT_SHELL" = "1" ]
}

_exit_worktree_shell() {
    if _is_in_worktree_shell; then
        echo "🏠 Exiting worktree shell..."
        if [ -n "$GIT_WT_ORIGINAL_DIR" ] && [ -d "$GIT_WT_ORIGINAL_DIR" ]; then
            cd "$GIT_WT_ORIGINAL_DIR"
        fi
        exit 0
    fi
    return 1
}
```

### Updated cmd_switch()
```bash
cmd_switch() {
    local branch_name="$1"
    
    if [ -z "$branch_name" ]; then
        echo "Available worktrees:"
        cmd_list
        echo ""
        echo "Usage: git wt switch <branch-name>"
        return 1
    fi
    
    # ... existing switch logic ...
    
    # Only start shell if argument provided
    echo -e "${GREEN}Starting worktree shell. Type 'exit' or use 'git wt root' to return.${NC}"
    export GIT_WT_SHELL=1
    export GIT_WT_ORIGINAL_DIR="$OLDPWD"
    export GIT_WT_BRANCH="$branch_name"
    PS1="(wt:$branch_name) $PS1" $SHELL
}
```

### Updated cmd_root()
```bash
cmd_root() {
    ensure_git_repo
    
    # Check if we're in a worktree shell
    if _exit_worktree_shell; then
        return 0
    fi
    
    # Regular root switching logic
    local git_root=$(git rev-parse --show-toplevel)
    echo -e "${BLUE}🏠 Switching to repository root...${NC}"
    cd "$git_root"
    # ... rest of current logic ...
}
```

## Files to Modify
1. `git-wt` - Update cmd_switch(), cmd_resume(), cmd_root(), add helper functions
2. `git-wt.sh` - Update corresponding shell functions
3. `claude/commands/wt/switch.md` - Update documentation for new behavior
4. `claude/commands/wt/resume.md` - Update documentation for new behavior
5. `claude/commands/wt/root.md` - Update documentation for smart exit behavior
6. `CLAUDE.md` - Update command documentation and examples

## Benefits
1. **Intuitive navigation** - `git wt root` naturally exits worktree sessions
2. **Lightweight usage** - Can use commands without shell overhead when not needed
3. **Backward compatibility** - Existing workflows with arguments continue to work
4. **Clear session boundaries** - Environment variables make shell context obvious
5. **Flexible workflow** - Users can choose lightweight or full-session modes

This creates a much more intuitive and flexible worktree management system that adapts to different usage patterns.