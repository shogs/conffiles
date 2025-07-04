# Plan: Add "Root" Switch Command to git-wt

**Created:** 2025-07-03 12:00  
**Status:** Approved, Ready for Implementation  
**Priority:** High  

## Current Analysis
The current git-wt system has commands to switch between worktrees but lacks a command to switch back to the main repository directory. Users can currently:
- Switch to specific worktrees with `git wt switch <branch>`
- Resume work in worktrees with `git wt resume <branch>`
- But have no dedicated command to return to the main repository

## Proposed Solution
Add a new `root` command that switches back to the main repository directory from any worktree.

## Implementation Plan

### 1. Add `cmd_root()` function to git-wt script
- Create function that navigates to the git repository root
- Show current main branch status and any uncommitted changes
- Provide helpful context about available worktrees
- Start a new shell in the root directory (consistent with other commands)

### 2. Add command dispatcher case for "root"
- Add case in the main switch statement to handle `root|main` commands
- Include aliases for flexibility (`root`, `main`)

### 3. Update help text
- Add the new `root` command to `show_help()` function
- Document the command's purpose and usage

### 4. Update shell function aliases in git-wt.sh
- Add `_git_wt_root()` function
- Create alias `git-wt-root` and `gwtroot` for root command
- **Change existing `gwtr` alias from resume to `gwtresume`** for resume command
- This resolves the alias conflict cleanly

### 5. Create Claude command integration
- Add new `/wt root` command file in `claude/commands/wt/root.md`
- Enable Claude Code users to easily switch back to root

### 6. Update CLAUDE.md documentation
- Add the new `root` command to the available commands list
- Update alias documentation to reflect `gwtresume` and `gwtroot`
- Update examples to show the complete workflow

## Expected Behavior
- `git wt root` - Switch to root repository directory
- `gwtroot` - Shell alias for quick access to root
- `gwtresume` - Updated shell alias for resume (was `gwtr`)
- `/wt root` - Claude Code command
- Shows main branch status and worktree summary
- Consistent UX with existing switch/resume commands

## Files to Modify
1. `git-wt` - Add cmd_root() function and dispatcher case
2. `git-wt.sh` - Add root function, update aliases (gwtr → gwtresume, add gwtroot)
3. `claude/commands/wt/root.md` - New Claude command file
4. `CLAUDE.md` - Update documentation with new command and updated aliases

## Alias Changes Summary
- **Before**: `gwtr` = resume
- **After**: `gwtresume` = resume, `gwtroot` = root

## Implementation Details

### cmd_root() Function Specifications
```bash
cmd_root() {
    ensure_git_repo
    
    # Get the git root directory
    local git_root=$(git rev-parse --show-toplevel)
    
    echo -e "${BLUE}🏠 Switching to repository root...${NC}"
    cd "$git_root"
    
    echo "📍 Current directory: $(pwd)"
    echo "🌿 Current branch: $(git branch --show-current)"
    echo ""
    
    # Show git status
    echo "Git status:"
    git status --short
    echo ""
    
    # Show available worktrees
    if [ -d ".worktrees" ]; then
        echo -e "${BLUE}📋 Available worktrees:${NC}"
        ls -1 .worktrees/ 2>/dev/null || echo "No worktrees found"
        echo ""
    fi
    
    echo -e "${GREEN}Starting new shell in repository root. Type 'exit' to return.${NC}"
    $SHELL
}
```

### Shell Function Specifications
```bash
_git_wt_root() {
    # Ensure we're in a git repo
    if ! git rev-parse --git-dir >/dev/null 2>&1; then
        echo "❌ Not in a git repository"
        return 1
    fi
    
    # Get the git root directory
    local git_root=$(git rev-parse --show-toplevel)
    
    echo "🏠 Switching to repository root..."
    cd "$git_root"
    
    echo "📍 Current directory: $(pwd)"
    echo "🌿 Current branch: $(git branch --show-current)"
    echo ""
    
    # Show git status
    echo "Git status:"
    git status --short
    echo ""
    
    # Show available worktrees
    if [ -d ".worktrees" ]; then
        echo "📋 Available worktrees:"
        ls -1 .worktrees/ 2>/dev/null || echo "No worktrees found"
        echo ""
    fi
    
    echo "Ready to work in repository root"
}
```

This plan provides a clean, intuitive naming scheme and completes the workflow by allowing easy return to the root repository from any worktree.