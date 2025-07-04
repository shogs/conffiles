# list-details

Shows detailed information about all git worktrees.

## Usage

```bash
git wt list -d
```

## Description

This command displays comprehensive information about all git worktrees, including:

- Branch name
- Path
- Latest commit info
- Creation date
- Task description (if available)
- Status (clean or modified)

This is equivalent to running `git wt list -d` or `git wt list --details`.

## Example Output

```
📋 Git Worktrees
========================

🌿 Branch: feature-auth
📁 Path: .worktrees/feature-auth/
💾 Commit: a1b2c3d Add authentication middleware
⏰ Created: 2024-01-15T10:30:00Z
📝 Task: Implement user authentication system
✅ Status: Clean

🌿 Branch: bugfix-login
📁 Path: .worktrees/bugfix-login/
💾 Commit: e4f5g6h Fix login redirect issue
⏰ Created: 2024-01-15T14:45:00Z
🔄 Status: Has uncommitted changes
```

## Related Commands

- `/wt list` - Show simplified worktree list
- `/wt status` - Show overall worktree status
- `/wt switch <branch>` - Switch to a worktree

