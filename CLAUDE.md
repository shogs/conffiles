# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a personal dotfiles repository containing configuration files for various development tools and applications. The repository includes configurations for shell (zsh), terminal multiplexer (tmux), terminal emulator (WezTerm), text editor (Neovim), and various macOS utilities.

## Repository Structure

- **Shell Configuration**: `.zshrc`, `.zprofile` - Oh My Zsh with Powerlevel10k theme
- **Terminal Multiplexer**: `.tmux.conf` - Custom tmux configuration with Ctrl+a prefix
- **Terminal Emulator**: `.wezterm.lua` - WezTerm configuration with Catppuccin theme
- **Text Editor**: `nvim/` - LazyVim-based Neovim configuration (has its own CLAUDE.md)
- **Git Worktree Management**: `git-wt.sh`, `git-wt` - Shell functions and git subcommand for worktree operations
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
- **git-wt.sh**: Shell function library with aliases (gwtn, gwtl, gwts, etc.)
- **git-wt**: Git subcommand (symlinked to `~/bin/git-wt`) for `git wt` usage
- **Session tracking**: `.claude-session` files maintain work context
- **Organized structure**: All worktrees created in `.worktrees/` directory

### Available Commands
- `git wt new [branch-name] [base-branch]` - Create new worktree
- `git wt list` - List all worktrees with status
- `git wt switch <branch-name>` - Switch to existing worktree
- `git wt resume <branch-name>` - Resume work with context restoration
- `git wt status` - Show comprehensive worktree overview
- `git wt clean` - Cleanup completed worktrees
- `git wt task 'description' [branch]` - Create worktree and start Claude task

### Integration Benefits
- **Task isolation**: Each feature/task gets its own workspace
- **Context preservation**: Session files maintain work state
- **Automation**: One-command task creation and Claude startup
- **Organization**: Structured approach to concurrent development

## Claude Commands Integration

Custom Claude Code commands are available via symlink from `claude/commands/` to `~/.claude/commands/`.

### Available Claude Commands
- `/wt help` - Show git-wt command reference
- `/wt new <args>` - Create new worktree
- `/wt task <description>` - Create worktree and start Claude task
- `/wt list` - Show all worktrees
- `/wt switch <branch>` - Switch to worktree
- `/wt resume <branch>` - Resume work in worktree
- `/wt status` - Show comprehensive status
- `/wt clean` - Clean up worktrees

### Workflow Integration
- Commands automatically handle worktree creation and switching
- Session files preserve context across Claude sessions
- `git wt task` command automatically launches Claude with task context
- Seamless integration between shell and Claude Code environments

## Aider Integration
- Configured for dark mode terminal usage
- Auto-commits disabled for manual commit control
- Custom color scheme for better terminal visibility