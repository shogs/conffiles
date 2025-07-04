# Plan: Fix Directory Change Issue in git-wt

**Created:** 2025-07-03 13:30  
**Status:** Critical Fix Needed  
**Priority:** High  

## Problem Analysis
The `git wt switch` command shows it's changing directories but doesn't actually change the user's current shell directory. This is because:
- `cd` in a script only affects the script's subshell
- The parent shell remains in the original directory
- This is a fundamental shell limitation

## Root Cause
```bash
# In git-wt script:
cd "$worktree_path"  # Only changes script's directory, not user's shell
```

## Solution Options

### Option 1: Shell Function Wrapper (Recommended)
Create a shell function that sources the git-wt logic:

```bash
# In .zshrc or shell config
git-wt() {
    local git_wt_script="/Users/sash/bin/git-wt"
    
    case "${1:-help}" in
        "switch"|"resume"|"root")
            # For directory-changing commands, source the logic
            source <($git_wt_script --source-mode "$@")
            ;;
        *)
            # For other commands, run normally
            $git_wt_script "$@"
            ;;
    esac
}
```

### Option 2: Output Directory for Eval (Simpler)
Modify git-wt to output directory change commands:

```bash
# git wt switch outputs: cd /path/to/worktree
# User runs: eval "$(git wt switch branch)"
```

### Option 3: Create Shell Function Library
Go back to having shell functions but keep the git subcommand for non-directory operations.

## Recommended Implementation: Option 1

### 1. Update git-wt script
Add `--source-mode` flag that outputs shell commands instead of executing them:

```bash
if [ "$1" = "--source-mode" ]; then
    shift
    case "${1:-help}" in
        "switch"|"sw")
            # Output commands for sourcing
            echo "cd '$worktree_path'"
            echo "echo '✅ Ready to work in worktree'"
            ;;
        "root")
            if _is_in_worktree_shell; then
                echo "_exit_worktree_shell"
            else
                echo "cd '$git_root'"
                echo "echo '✅ Now in repository root directory'"
            fi
            ;;
    esac
    return 0
fi
```

### 2. Create shell function
Add to .zshrc:
```bash
git-wt() {
    local git_wt_script="$HOME/bin/git-wt"
    
    case "${1:-help}" in
        "switch"|"resume"|"root")
            # Commands that need to change directory
            local cmd_output
            cmd_output=$($git_wt_script --source-mode "$@")
            if [ $? -eq 0 ] && [ -n "$cmd_output" ]; then
                eval "$cmd_output"
            fi
            ;;
        *)
            # Other commands run normally
            $git_wt_script "$@"
            ;;
    esac
}

# Also create 'git wt' alias
alias git="git-wt-wrapper"
git-wt-wrapper() {
    if [ "$1" = "wt" ]; then
        shift
        git-wt "$@"
    else
        command git "$@"
    fi
}
```

### 3. Alternative: Simple eval approach
Simpler but requires user to remember syntax:

```bash
# User runs:
eval "$(git wt switch testing)"
eval "$(git wt root)"
```

## Files to Modify
1. `git-wt` - Add --source-mode flag
2. `.zshrc` - Add shell function wrapper  
3. `CLAUDE.md` - Update usage instructions
4. Claude commands - Update to use proper syntax

## Benefits of Solution
- Maintains git subcommand interface
- Actually changes user's directory
- Works with existing Claude commands
- Preserves all current functionality

This is a critical fix needed for the git-wt system to work as intended.