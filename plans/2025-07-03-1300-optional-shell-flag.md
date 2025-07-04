# Plan: Optional Shell Flag for git-wt Commands

**Created:** 2025-07-03 13:00  
**Status:** Ready for Implementation  
**Priority:** High  

## Current Analysis
The smart shell management works well but always creates shells for `switch` and `resume`. Users may want:
- Lightweight directory changes (current default)
- Full shell isolation when needed (with flag)

## Proposed Solution
Add optional `-s` (shell) flag to `git wt switch` and `git wt resume` commands.

## Implementation Plan

### 1. Update Command Parsing
Add flag parsing to handle `-s` option:
```bash
# Parse flags before branch name
local create_shell=false
local branch_name=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -s|--shell)
            create_shell=true
            shift
            ;;
        -*)
            echo "Unknown option: $1"
            return 1
            ;;
        *)
            branch_name="$1"
            break
            ;;
    esac
done
```

### 2. Update cmd_switch() Behavior
**Default:** `git wt switch <branch>` → change directory only  
**With flag:** `git wt switch -s <branch>` → change directory + start shell

### 3. Update cmd_resume() Behavior  
**Default:** `git wt resume <branch>` → change directory only  
**With flag:** `git wt resume -s <branch>` → change directory + start shell

### 4. Claude Commands Integration
Create variants for Claude Code:
- `/wt switch <branch>` → lightweight switch (no shell)
- `/wt switch-shell <branch>` → full shell switch
- `/wt resume <branch>` → lightweight resume (no shell)  
- `/wt resume-shell <branch>` → full shell resume

Alternative approach for Claude - add parameter:
- `/wt switch <branch> --shell` → parse --shell flag

### 5. Help Text Updates
Update help to show flag options:
```
git wt switch [-s|--shell] <branch-name>   - Switch to worktree (optionally start shell)
git wt resume [-s|--shell] <branch-name>   - Resume work (optionally start shell)
```

## Expected Behavior Examples

### Lightweight Usage (Default)
```bash
$ git wt switch feature-branch
🔄 Switching to worktree: feature-branch
📍 Current directory: /repo/.worktrees/feature-branch
✅ Ready to work in worktree
$ # Still in same shell, just changed directory
```

### Full Shell Usage (With Flag)
```bash
$ git wt switch -s feature-branch
🔄 Switching to worktree: feature-branch
📋 Session info: ...
Starting worktree shell. Type 'exit' or use 'git wt root' to return.
(wt:feature-branch) $ # New shell with environment tracking
```

### Claude Commands
```bash
# Lightweight
/wt switch feature-branch

# Full shell (option 1 - separate commands)
/wt switch-shell feature-branch

# Full shell (option 2 - flag parameter)  
/wt switch feature-branch --shell
```

## Implementation Details

### Updated cmd_switch()
```bash
cmd_switch() {
    local create_shell=false
    local branch_name=""
    
    # Parse arguments
    while [[ $# -gt 0 ]]; do
        case $1 in
            -s|--shell)
                create_shell=true
                shift
                ;;
            -*)
                echo -e "${RED}Unknown option: $1${NC}"
                echo "Usage: git wt switch [-s|--shell] <branch-name>"
                return 1
                ;;
            *)
                branch_name="$1"
                break
                ;;
        esac
    done
    
    # ... existing validation and switch logic ...
    
    if [ "$create_shell" = true ]; then
        # Start worktree shell
        echo -e "${GREEN}Starting worktree shell. Type 'exit' or use 'git wt root' to return.${NC}"
        export GIT_WT_SHELL=1
        export GIT_WT_ORIGINAL_DIR="$OLDPWD"
        export GIT_WT_BRANCH="$branch_name"
        PS1="(wt:$branch_name) $PS1" $SHELL
    else
        # Just change directory
        echo -e "${GREEN}✅ Ready to work in worktree${NC}"
    fi
}
```

### Claude Commands Strategy
**Recommended Approach:** Separate commands for clarity
- `switch.md` → lightweight switch
- `switch-shell.md` → full shell switch  
- `resume.md` → lightweight resume
- `resume-shell.md` → full shell resume

This is clearer than trying to parse flags in Claude commands.

## Benefits
1. **Flexibility** - Users choose lightweight vs full isolation
2. **Backward compatibility** - Existing workflows continue to work
3. **Claude integration** - Clear command variants
4. **Performance** - Lightweight by default, shell when needed
5. **Intuitive** - Standard Unix flag patterns

## Files to Modify
1. `git-wt` - Update cmd_switch() and cmd_resume() with flag parsing
2. `claude/commands/wt/switch.md` - Update for lightweight behavior
3. `claude/commands/wt/resume.md` - Update for lightweight behavior
4. `claude/commands/wt/switch-shell.md` - New file for shell switching
5. `claude/commands/wt/resume-shell.md` - New file for shell resuming
6. `CLAUDE.md` - Update documentation with new commands and flags

This provides the perfect balance of lightweight usage by default with optional full shell isolation when needed.