# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a personal dotfiles repository containing configuration files for various development tools and applications. The repository includes configurations for shell (zsh), terminal multiplexer (tmux), terminal emulator (WezTerm), text editor (Neovim), and various macOS utilities.

## Repository Structure

- **Shell Configuration**: `.zshrc`, `.zprofile` - Oh My Zsh with Powerlevel10k theme
- **Terminal Multiplexer**: `.tmux.conf` - Custom tmux configuration with Ctrl+a prefix
- **Terminal Emulator**: `.wezterm.lua` - WezTerm configuration with Catppuccin theme
- **Text Editor**: `nvim/` - LazyVim-based Neovim configuration (has its own CLAUDE.md)
- **Git Worktree Management**: `git-wt` - Git subcommand for worktree operations
- **Claude Commands**: `claude/commands/` - Custom Claude Code commands (symlinked to `~/.claude/commands`)
- **macOS Window Management**: `.config/yabai/`, `.config/skhd/` - Tiling window manager and hotkeys
- **Terminal Alternatives**: `.config/alacritty/`, `.config/kitty/` - Terminal emulator configs
- **Keyboard Customization**: `.config/karabiner/` - Key remapping configuration
- **Status Bar**: `.config/sketchybar/` - Custom status bar for macOS
- **AI Assistant**: `.aider.conf.yml` - Aider configuration with dark mode enabled and auto-commits disabled

## Key Configuration Details

### Shell Environment
- Uses Oh My Zsh framework with Powerlevel10k theme
- Custom prompt configuration in `.p10k.zsh`
- Zsh profile loads additional environment settings

### Terminal Multiplexer (tmux)
- Primary prefix: `Ctrl+a`, secondary: `Ctrl+s`
- Mouse support enabled
- Custom pane navigation with vim-like keys (j/k)
- Split commands: `\` (horizontal), `|` (vertical)

### Terminal Emulator (WezTerm)
- Catppuccin Frappe color scheme
- MesloLGL Nerd Font with DemiBold weight
- Semi-transparent background (0.8 opacity)
- Font size: 12pt

### Neovim Configuration
- Based on LazyVim distribution
- Has dedicated CLAUDE.md file in `nvim/` directory
- Uses lazy.nvim plugin manager
- Custom plugins for enhanced functionality

## Common Workflows

### Managing Dotfiles
- Files are typically symlinked to home directory locations
- Changes made directly to files in this repository
- Git is used for version control of configuration changes

### Terminal and Shell Usage
- Launch terminal sessions with tmux for multiplexing
- Use Powerlevel10k prompt for enhanced shell experience
- WezTerm provides primary terminal interface

### Text Editing
- Neovim serves as primary text editor
- LazyVim provides pre-configured environment
- See `nvim/CLAUDE.md` for Neovim-specific guidance

## macOS-Specific Tools
- **yabai**: Tiling window manager for automatic window layout
- **skhd**: Simple hotkey daemon for keyboard shortcuts
- **sketchybar**: Custom status bar replacement
- **Karabiner-Elements**: Keyboard customization and key remapping

## Git Worktree Management (git-wt)

This repository includes a sophisticated git worktree management system that integrates with Claude Code for isolated development workflows.

### Components
- **git-wt**: Git subcommand (symlinked to `~/bin/git-wt`) for `git wt` usage
- **Session tracking**: `.claude-session` files maintain work context
- **Organized structure**: All worktrees created in `.worktrees/` directory
- **Smart shell management**: Automatic shell creation and exit handling

### Available Commands
- `git wt new [branch-name] [base-branch]` - Create new worktree with .env file
- `git wt list [-d]` - List all worktrees with status (use -d for details)
- `git wt switch [-s|--shell] <branch-name>` - Switch to existing worktree (optionally start shell)
- `git wt resume [-s|--shell] <branch-name>` - Resume work with context restoration (optionally start shell)
- `git wt remove [-f|--force] <branch-name>` - Remove worktree and branch (safely)
- `git wt root` - Switch back to repository root directory
- `git wt status` - Show comprehensive worktree overview
- `git wt clean` - Cleanup completed worktrees
- `git wt task 'description' [branch]` - Create worktree and start Claude task

### Integration Benefits
- **Task isolation**: Each feature/task gets its own workspace
- **Context preservation**: Session files maintain work state
- **Automation**: One-command task creation and Claude startup
- **Organization**: Structured approach to concurrent development
- **Flexible modes**: Lightweight directory changes or full shell isolation
- **Smart navigation**: Automatic shell detection and exit handling
- **Environment isolation**: Automatic .env copying with database URL modification
- **Dependency isolation**: Optional node_modules copying for shell sessions

## Claude Commands Integration

Custom Claude Code commands are available via symlink from `claude/commands/` to `~/.claude/commands/`.

### Available Claude Commands
- `/wt help` - Show git-wt command reference
- `/wt new <args>` - Create new worktree
- `/wt task <description>` - Create worktree and start Claude task
- `/wt list` - Show all worktrees
- `/wt switch <branch>` - Switch to worktree (lightweight)
- `/wt switch-shell <branch>` - Switch to worktree with shell isolation
- `/wt resume <branch>` - Resume work in worktree (lightweight)
- `/wt resume-shell <branch>` - Resume work with shell isolation
- `/wt root` - Switch back to repository root
- `/wt status` - Show comprehensive status
- `/wt clean` - Clean up worktrees

### Workflow Integration
- Commands automatically handle worktree creation and switching
- Session files preserve context across Claude sessions
- `git wt task` command automatically launches Claude with task context
- Seamless integration between shell and Claude Code environments

## Planning Workflow

When working on complex tasks or features that require multiple steps, Claude should follow this standardized planning process:

### Plan Creation and Documentation
1. **Create detailed plans** for multi-step tasks, new features, or significant changes
2. **Save plans immediately** to the `plans/` directory using timestamp prefix format: `YYYY-MM-DD-HHMM-description.md`
3. **Include comprehensive details** in plans:
   - Current analysis and problem statement
   - Proposed solution approach
   - Step-by-step implementation plan
   - Expected behavior and outcomes
   - Files to be modified
   - Any special considerations or dependencies

### Plan Review Process
1. **Save plan first** - Always create and save the plan file before proceeding
2. **Open in MacDown** - Automatically open the plan file in MacDown for easy review using `open -a MacDown <plan-file>`
3. **User review** - Allow user to review the saved plan file in MacDown
4. **User confirmation** - Wait for explicit user approval before implementation
5. **Execution** - Proceed with implementation only after approval

### Plan File Structure
- **Location**: `plans/` directory in repository root
- **Naming**: `YYYY-MM-DD-HHMM-descriptive-name.md`
- **Content**: Markdown format with clear sections and actionable items
- **Purpose**: Provides documentation trail and enables thorough review

This workflow ensures transparency, allows for plan refinement, and maintains a clear record of development decisions and implementation approaches.

## Aider Integration
- Configured for dark mode terminal usage
- Auto-commits disabled for manual commit control
- Custom color scheme for better terminal visibility