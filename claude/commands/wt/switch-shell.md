I need you to switch to an existing git worktree with full shell isolation.

**Task:** Switch to worktree with shell: $ARGUMENTS

**Execute this command:**
```bash
git wt switch -s $ARGUMENTS
```

The `git wt switch -s` command will:
- Change to the correct worktree directory
- Show session information and current status
- Display any uncommitted changes
- Start a new worktree shell with environment tracking
- Set prompt indicator showing current worktree branch

The shell will have environment variables set for smart navigation:
- Use `git wt root` to exit the worktree shell and return to main repo
- Or type `exit` to return to previous location

This provides full shell isolation for focused work sessions. The shell environment is tracked so you can easily return to where you started.

After switching, let me know what you'd like to work on in this worktree.