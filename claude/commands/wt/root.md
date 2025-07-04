I need you to switch back to the repository root directory.

**Task:** Switch to repository root from current worktree

**Execute this command:**
```bash
git wt root
```

The `git wt root` command will:
- **If in a worktree shell**: Exit the shell and return to the original location
- **If in main shell**: Change directory to the git repository root
- Show the current branch and git status
- Display available worktrees for reference

This command provides smart navigation:
- Automatically detects if you're in a worktree shell environment
- Exits worktree shells cleanly, returning you to where you started
- Simple directory change when not in a worktree shell

This is useful when you need to return to the main repository from any worktree to work on shared files, configuration, or overall project management.

After switching to root, let me know what you'd like to work on in the main repository.