I need you to resume work in a specific git worktree with full shell isolation.

**Task:** Resume work in worktree with shell: $ARGUMENTS

**Execute this command:**
```bash
git wt resume -s $ARGUMENTS
```

The `git wt resume -s` command will:
- Switch to the specified worktree
- Show previous session information and task context
- Display current status and any changes
- Optionally copy node_modules from repository root (if available)
- Start a new worktree shell with environment tracking
- Set prompt indicator showing current worktree branch

The shell will have environment variables set for smart navigation:
- Use `git wt root` to exit the worktree shell and return to main repo
- Or type `exit` to return to previous location

**node_modules Copying:**
If node_modules exists in the repository root and doesn't exist in the worktree, you'll be prompted:
```
📦 node_modules found in repository root
Copy node_modules to worktree? [Y/n]:
```
This allows each worktree to have its own isolated dependencies without running `npm install`.

This provides full shell isolation for focused work sessions, perfect for continuing complex tasks where you left off. The shell environment is tracked so you can easily return to where you started.

After resuming, I'll help you continue with the previous task or start something new in this worktree context.