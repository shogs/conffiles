I need you to create a new worktree and immediately start working on a specific task.

**Task:** $ARGUMENTS

**Execute this command:**
```bash
git wt task "$ARGUMENTS"
```

The `git wt task` command will:
- Create a new worktree with an appropriate branch name
- Switch to the new worktree directory
- Set up session tracking
- Start Claude Code with the specified task

This is a one-command way to spin up a new development task in its own isolated environment.
