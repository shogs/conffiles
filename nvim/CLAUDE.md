# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Neovim configuration based on LazyVim, a pre-configured Neovim distribution. The configuration follows LazyVim's conventions and extends it with custom plugins and settings.

## Commands

### Formatting
- **Lua files**: Use stylua (configured with 2 spaces, max width 120)
  ```bash
  stylua lua/
  ```

### Plugin Management
- **Update plugins**: Open Neovim and run `:Lazy update`
- **Sync plugins**: Open Neovim and run `:Lazy sync`
- **Check plugin health**: Open Neovim and run `:checkhealth lazy`

## Architecture

### Plugin System
- Uses **lazy.nvim** as the plugin manager, bootstrapped through LazyVim
- LazyVim provides sensible defaults and a modular extras system
- Custom plugins are defined in `lua/plugins/` directory
- Each plugin file returns a table of plugin specifications following lazy.nvim format

### Configuration Structure
- `init.lua` - Entry point that loads the LazyVim configuration
- `lua/config/lazy.lua` - Bootstraps lazy.nvim and loads LazyVim with custom plugin directories
- `lua/config/` - Core configuration overrides (options, keymaps, autocmds)
- `lua/plugins/` - Custom plugin configurations that extend or override LazyVim defaults

### LazyVim Integration
- `lazyvim.json` - Defines which LazyVim extras to enable (AI, language support, etc.)
- `lazy-lock.json` - Lockfile for plugin versions
- The configuration inherits all LazyVim defaults unless explicitly overridden

### Key Customizations
1. **Mason LSP Configuration** (`lua/plugins/mason.lua`) - Manages language servers
2. **Telescope Configuration** (`lua/plugins/telescope-config.lua`) - Modified to always search from project root instead of current directory
3. Most functionality comes from LazyVim extras enabled in `lazyvim.json`