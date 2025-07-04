I need you to resume work in a specific git worktree with full context.

**Task:** Resume work in worktree: $ARGUMENTS

**Execute this command:**
```bash
git wt resume $ARGUMENTS
```

The `git wt resume` command will:
- Switch to the specified worktree
- Show previous session information and task context
- Display current status and any changes
- Keep you in the same shell (lightweight mode)

This is the lightweight version that just changes directories and shows context. If you need a full shell environment with isolation, I can use the shell version instead.

Use `git wt root` to return to the main repository when needed.

After resuming, I'll help you continue with the previous task or start something new in this worktree context.
