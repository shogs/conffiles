# Plan: Add Remove Command to git-wt

**Created:** 2025-07-03 14:00  
**Status:** Implemented  
**Priority:** High  

## Requirements
Add a `remove` command to git-wt that:
1. Deletes a worktree and its associated branch
2. By default, only removes if there are no uncommitted changes
3. Supports `-f` flag to force removal despite uncommitted changes
4. Does NOT require a Claude Code command (git-wt only)

## Implementation Plan

### 1. Add cmd_remove() Function
Create function with:
- Flag parsing for `-f|--force` option
- Safety checks for uncommitted changes
- Protection against removing current worktree shell
- Worktree and branch deletion logic

### 2. Safety Features
- **Uncommitted changes check**: Use `git status --porcelain` to detect changes
- **Current worktree protection**: Check if `$GIT_WT_BRANCH` matches target
- **Force override**: `-f` flag bypasses safety checks
- **Branch merge safety**: Use `git branch -d` (safe) vs `-D` (force)

### 3. User Experience
- Clear error messages with helpful suggestions
- Progress feedback during removal
- Show remaining worktrees after removal
- List available worktrees if no branch specified

### 4. Integration
- Add to help text with examples
- Add to command dispatcher with `remove|rm` aliases
- Update CLAUDE.md documentation

## Implementation Details

### cmd_remove() Function Structure
```bash
cmd_remove() {
    local force_remove=false
    local branch_name=""
    
    # Parse arguments (-f flag and branch name)
    # Validate worktree exists
    # Safety checks (unless force)
    # Remove worktree and branch
    # Show results
}
```

### Safety Check Logic
```bash
# Check if currently in target worktree shell
if _is_in_worktree_shell && [ "$GIT_WT_BRANCH" = "$branch_name" ]; then
    # Block removal with helpful message
fi

# Check for uncommitted changes (unless force)
if [ "$force_remove" != true ]; then
    local git_status=$(git status --porcelain 2>/dev/null)
    if [ -n "$git_status" ]; then
        # Show changes and suggest force flag
    fi
fi
```

### Branch Deletion Logic
```bash
if [ "$force_remove" = true ]; then
    git branch -D "$branch_name"  # Force delete
else
    git branch -d "$branch_name"  # Safe delete (only if merged)
fi
```

## Expected Behavior Examples

### Safe Removal (Clean Worktree)
```bash
$ git wt remove feature-branch
🗑️  Removing worktree: feature-branch
✅ Worktree removed successfully
✅ Branch 'feature-branch' deleted
📊 Remaining worktrees:
🌿 main-work - Clean
```

### Blocked Removal (Uncommitted Changes)
```bash
$ git wt remove feature-branch
❌ Cannot remove worktree 'feature-branch' - has uncommitted changes:
M  src/app.js
?? new-file.txt
💡 Use 'git wt remove -f feature-branch' to force removal
```

### Force Removal
```bash
$ git wt remove -f feature-branch
🗑️  Removing worktree: feature-branch
✅ Worktree removed successfully
✅ Branch 'feature-branch' deleted (forced)
```

### Protection Against Current Worktree
```bash
(wt:feature-branch) $ git wt remove feature-branch
❌ Cannot remove worktree 'feature-branch' - you are currently in its shell
💡 Use 'git wt root' to exit the worktree shell first
```

## Files Modified
1. `git-wt` - Added cmd_remove() function and dispatcher case
2. `git-wt` - Updated help text with remove command and examples
3. `CLAUDE.md` - Updated command list and documentation

## Benefits
1. **Complete lifecycle management** - Create, work, remove worktrees
2. **Safety by default** - Prevents accidental data loss
3. **Force option available** - Override safety when needed
4. **Clear feedback** - Users understand what happened and why
5. **Consistent UX** - Follows same patterns as other git-wt commands

## Command Aliases
- `git wt remove <branch>` - Full command
- `git wt rm <branch>` - Short alias
- Supports `-f|--force` flag for both

This completes the core worktree management functionality with appropriate safety measures and clear user feedback.