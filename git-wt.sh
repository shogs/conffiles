#!/bin/bash
# git-wt.sh - Git Worktree Management Script
# Source this file in your shell config: source ~/scripts/git-wt.sh

# =============================================================================
# GIT WORKTREE ALIASES (ORGANIZED .worktrees/ STRUCTURE)
# =============================================================================

# Create a new worktree in .worktrees/
alias git-wt-new='_git_wt_new_branch'
alias gwtn='_git_wt_new_branch'

# List all worktrees
alias git-wt-list='_git_wt_list'
alias gwtl='_git_wt_list'

# Switch to a worktree
alias git-wt-switch='_git_wt_switch'
alias gwts='_git_wt_switch'

# Clean up finished worktrees
alias git-wt-clean='_git_wt_cleanup'
alias gwtc='_git_wt_cleanup'

# Resume work in a worktree
alias git-wt-resume='_git_wt_resume'
alias gwtr='_git_wt_resume'

# Status of all worktrees
alias git-wt-status='_git_wt_status'
alias gwtst='_git_wt_status'

# Create worktree and start task
alias git-wt-task='_git_wt_task'
alias gwtt='_git_wt_task'

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

_git_wt_new_branch() {
  local branch_name="${1:-task-$(date +%Y%m%d-%H%M%S)}"
  local base_branch="${2:-main}"
  local worktree_dir=".worktrees/${branch_name}"

  # Ensure we're in a git repo
  if ! git rev-parse --git-dir >/dev/null 2>&1; then
    echo "❌ Not in a git repository"
    return 1
  fi

  # Create .worktrees directory if it doesn't exist
  mkdir -p .worktrees

  # Add .worktrees to .gitignore if not already there
  if ! grep -q "^\.worktrees/" .gitignore 2>/dev/null; then
    echo ".worktrees/" >>.gitignore
    echo "📝 Added .worktrees/ to .gitignore"
  fi

  echo "🚀 Creating new worktree..."
  echo "Branch: $branch_name"
  echo "Base: $base_branch"
  echo "Directory: $worktree_dir"

  # Create the worktree in organized structure
  git worktree add -b "$branch_name" "$worktree_dir" "$base_branch"

  if [ $? -eq 0 ]; then
    echo "✅ Worktree created successfully!"
    echo "📂 Directory: $(realpath $worktree_dir)"

    # Create a .claude-session file for session management
    echo "branch=$branch_name" >"$worktree_dir/.claude-session"
    echo "created=$(date -Iseconds)" >>"$worktree_dir/.claude-session"
    echo "base_branch=$base_branch" >>"$worktree_dir/.claude-session"

    echo ""
    echo "Next steps:"
    echo "1. cd $worktree_dir"
    echo "2. claude code 'your task description'"
    echo ""
    echo "Or use: git-wt-switch $branch_name"
  else
    echo "❌ Failed to create worktree"
    return 1
  fi
}

_git_wt_list() {
  echo "📋 Git Worktrees"
  echo "========================"

  if [ ! -d ".worktrees" ]; then
    echo "No .worktrees directory found"
    return 0
  fi

  local found_any=false
  for worktree_dir in .worktrees/*/; do
    if [ -d "$worktree_dir" ]; then
      found_any=true
      local branch_name=$(basename "$worktree_dir")
      local relative_path="$worktree_dir"

      echo ""
      echo "🌿 Branch: $branch_name"
      echo "📁 Path: $relative_path"

      # Get commit info
      if [ -d "$worktree_dir/.git" ] || [ -f "$worktree_dir/.git" ]; then
        cd "$worktree_dir"
        local commit_info=$(git log -1 --format='%h %s' 2>/dev/null || echo 'No commits')
        echo "💾 Commit: $commit_info"

        # Check session info if available
        if [ -f ".claude-session" ]; then
          local created=$(grep "created=" .claude-session | cut -d'=' -f2)
          local task=$(grep "^task=" .claude-session | cut -d'=' -f2-)
          echo "⏰ Created: $created"
          if [ -n "$task" ]; then
            echo "📝 Task: $task"
          fi
        fi

        # Check for uncommitted changes
        if ! git diff-index --quiet HEAD 2>/dev/null; then
          echo "🔄 Status: Has uncommitted changes"
        else
          echo "✅ Status: Clean"
        fi
        cd - >/dev/null
      fi
    fi
  done

  if [ "$found_any" != true ]; then
    echo "No worktrees found in .worktrees/"
  fi
}

_git_wt_switch() {
  local branch_name="$1"

  if [ -z "$branch_name" ]; then
    echo "Available worktrees:"
    _git_wt_list
    echo ""
    echo "Usage: git-wt-switch <branch-name>"
    return 1
  fi

  local worktree_path=".worktrees/$branch_name"

  if [ -d "$worktree_path" ]; then
    echo "🔄 Switching to worktree: $branch_name"
    cd "$worktree_path"

    # Show current session info
    if [ -f ".claude-session" ]; then
      echo "📋 Session info:"
      cat .claude-session
    fi

    echo ""
    echo "Current directory: $(pwd)"
    echo "Git status:"
    git status --short
  else
    echo "❌ Worktree '$branch_name' not found in .worktrees/"
    echo "Available worktrees:"
    ls -1 .worktrees/ 2>/dev/null || echo "No worktrees found"
    return 1
  fi
}

_git_wt_resume() {
  local branch_name="$1"

  if [ -z "$branch_name" ]; then
    echo "Available worktrees to resume:"
    ls -1 .worktrees/ 2>/dev/null || echo "No worktrees found"
    echo ""
    echo "Usage: git-wt-resume <branch-name>"
    return 1
  fi

  if [ ! -d ".worktrees/$branch_name" ]; then
    echo "❌ Worktree '$branch_name' not found"
    return 1
  fi

  cd ".worktrees/$branch_name"

  echo "🔄 Resuming work in: $branch_name"

  # Show session info if available
  if [ -f ".claude-session" ]; then
    echo "📋 Previous session:"
    cat .claude-session | while IFS='=' read key value; do
      case $key in
      task) echo "  Task: $value" ;;
      created) echo "  Created: $value" ;;
      branch) echo "  Branch: $value" ;;
      base_branch) echo "  Base: $value" ;;
      esac
    done
    echo ""
  fi

  echo "Current status:"
  git status --short
  echo ""
  echo "Ready to continue work in $(pwd)"
}

_git_wt_status() {
  echo "📊 Git Worktrees Status"
  echo "================================"

  # Show current location
  echo "📍 Current location: $(pwd)"
  if [[ "$(pwd)" == *".worktrees/"* ]]; then
    echo "   You are currently in a worktree"
  else
    echo "   You are in the main repository"
  fi
  echo ""

  # Show all worktrees with detailed status
  _git_wt_list

  echo ""
  echo "📈 Summary:"
  local total_worktrees=$(ls -1d .worktrees/*/ 2>/dev/null | wc -l)
  echo "   Total worktrees: $total_worktrees"

  # Count worktrees with changes
  local dirty_count=0
  for worktree_dir in .worktrees/*/; do
    if [ -d "$worktree_dir" ]; then
      cd "$worktree_dir"
      if ! git diff-index --quiet HEAD 2>/dev/null; then
        ((dirty_count++))
      fi
      cd - >/dev/null
    fi
  done
  echo "   With changes: $dirty_count"
  echo "   Clean: $((total_worktrees - dirty_count))"
}

_git_wt_cleanup() {
  echo "🧹 Git worktree cleanup"
  echo ""

  if [ ! -d ".worktrees" ]; then
    echo "No .worktrees directory found"
    return 0
  fi

  echo "Current worktrees in .worktrees/:"
  _git_wt_list
  echo ""

  # Show merged branches that can be cleaned up
  echo "Branches that have been merged to main:"
  git branch --merged main 2>/dev/null | grep -E "(task-|feature-|fix-)" | sed 's/^[ *]*//' | while read branch; do
    if [ -d ".worktrees/$branch" ]; then
      echo "  📁 $branch (in .worktrees/)"
    fi
  done
  echo ""

  read -p "Enter branch name to remove (or 'auto' for all merged): " branch_name

  if [ "$branch_name" = "auto" ]; then
    # Auto-cleanup merged branches
    git branch --merged main 2>/dev/null | grep -E "(task-|feature-|fix-)" | sed 's/^[ *]*//' | while read branch; do
      if [ "$branch" != "main" ] && [ "$branch" != "master" ] && [ -d ".worktrees/$branch" ]; then
        echo "🗑️  Removing worktree for branch: $branch"
        git worktree remove ".worktrees/$branch" 2>/dev/null || true
        git branch -d "$branch" 2>/dev/null || true
      fi
    done
  elif [ -n "$branch_name" ]; then
    # Remove specific branch
    if [ -d ".worktrees/$branch_name" ]; then
      git worktree remove ".worktrees/$branch_name"
      git branch -d "$branch_name"
      echo "✅ Removed worktree: $branch_name"
    else
      echo "❌ Branch $branch_name not found in .worktrees/"
    fi
  fi
}

# Task creation with immediate Claude Code execution
_git_wt_task() {
  local task_description="$1"
  local branch_name="${2:-task-$(date +%Y%m%d-%H%M%S)}"

  if [ -z "$task_description" ]; then
    echo "Usage: git-wt-task 'task description' [branch-name]"
    echo "Example: git-wt-task 'Add user authentication system' auth-feature"
    return 1
  fi

  # Create the worktree
  _git_wt_new_branch "$branch_name"

  if [ $? -eq 0 ]; then
    # Switch to the new worktree
    cd ".worktrees/$branch_name"

    # Save task description to session file
    echo "task=$task_description" >>.claude-session
    echo "task_started=$(date -Iseconds)" >>.claude-session

    echo "🤖 Starting Claude Code task in worktree..."
    echo "Task: $task_description"
    echo ""

    # Start Claude Code with the task
    claude code "$task_description"
  fi
}

# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

# Helper to check if git-wt commands are available
git-wt-help() {
  echo "Git Worktree Management Commands:"
  echo ""
  echo "📋 Main Commands:"
  echo "  git-wt-new [branch-name] [base-branch]  - Create new worktree"
  echo "  git-wt-list                             - List all worktrees"
  echo "  git-wt-switch <branch-name>             - Switch to worktree"
  echo "  git-wt-resume <branch-name>             - Resume work in worktree"
  echo "  git-wt-status                           - Show overall status"
  echo "  git-wt-clean                            - Clean up worktrees"
  echo "  git-wt-task 'description' [branch]      - Create worktree + start Claude task"
  echo ""
  echo "⚡ Short Aliases:"
  echo "  gwtn = git-wt-new"
  echo "  gwtl = git-wt-list"
  echo "  gwts = git-wt-switch"
  echo "  gwtr = git-wt-resume"
  echo "  gwtst = git-wt-status"
  echo "  gwtc = git-wt-clean"
  echo "  gwtt = git-wt-task"
  echo ""
  echo "📁 Structure: All worktrees are created in .worktrees/ (auto-gitignored)"
  echo "🔗 Integration: Works seamlessly with Claude Code slash commands"
}

# Print load confirmation
echo "✅ Git Worktree commands loaded! Use 'git-wt-help' for usage info."
