I need you to switch to an existing git worktree.

**Task:** Switch to worktree: $ARGUMENTS

**Execute this command:**
```bash
git wt switch $ARGUMENTS
```

The `git wt switch` command will:
- Change to the correct worktree directory
- Show session information and current status
- Display any uncommitted changes
- Keep you in the same shell (lightweight mode)

This is the lightweight version that just changes directories. If you need a full shell environment with isolation, I can use the shell version instead.

Use `git wt root` to return to the main repository when needed.

After switching, let me know what you'd like to work on in this worktree.
