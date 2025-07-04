# Plan: Optional node_modules Copying for Worktrees

**Created:** 2025-07-03 14:15  
**Status:** Ready for Implementation  
**Priority:** Medium  

## Requirements
When using `git wt switch -s <branch>` to enter a worktree with shell isolation:
1. Check if `node_modules` exists in the repository root
2. Prompt user: "Copy node_modules? [Y/n]" with Y as default
3. If yes, copy the entire `node_modules` directory to the worktree
4. Only prompt for shell switches (`-s` flag), not lightweight switches

## Implementation Plan

### 1. Add node_modules Detection
Check for `node_modules` directory in git repository root:
```bash
local git_root=$(git rev-parse --show-toplevel)
local root_node_modules="$git_root/node_modules"
local worktree_node_modules="$worktree_path/node_modules"
```

### 2. Add Interactive Prompt Function
Create helper function for user prompt:
```bash
_prompt_copy_node_modules() {
    local root_modules="$1"
    local target_modules="$2"
    
    if [ ! -d "$root_modules" ]; then
        return 1  # No node_modules to copy
    fi
    
    if [ -d "$target_modules" ]; then
        return 1  # Already exists in worktree
    fi
    
    echo -e "${YELLOW}📦 node_modules found in repository root${NC}"
    echo -n "Copy node_modules to worktree? [Y/n]: "
    read -r response
    
    case $response in
        [nN]|[nN][oO])
            echo -e "${BLUE}⏭️  Skipping node_modules copy${NC}"
            return 1
            ;;
        *)
            echo -e "${BLUE}📋 Copying node_modules to worktree...${NC}"
            return 0
            ;;
    esac
}
```

### 3. Add Copying Logic
Implement the actual copy operation:
```bash
_copy_node_modules() {
    local source="$1"
    local destination="$2"
    
    # Use rsync for efficient copying with progress
    if command -v rsync >/dev/null 2>&1; then
        rsync -a --info=progress2 "$source/" "$destination/"
    else
        # Fallback to cp
        cp -R "$source" "$destination"
    fi
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✅ node_modules copied successfully${NC}"
        
        # Show size information
        local size=$(du -sh "$destination" 2>/dev/null | cut -f1)
        echo -e "${BLUE}📊 Size: $size${NC}"
    else
        echo -e "${RED}❌ Failed to copy node_modules${NC}"
        return 1
    fi
}
```

### 4. Integration Points

#### Update cmd_switch() for Shell Mode Only
Only prompt when using `-s` flag:
```bash
if [ "$create_shell" = true ]; then
    # Existing shell creation logic...
    
    # Check for node_modules copying
    local git_root=$(git rev-parse --show-toplevel)
    local root_node_modules="$git_root/node_modules"
    local worktree_node_modules="$worktree_path/node_modules"
    
    if _prompt_copy_node_modules "$root_node_modules" "$worktree_node_modules"; then
        _copy_node_modules "$root_node_modules" "$worktree_node_modules"
    fi
    
    # Continue with shell startup...
fi
```

#### Update cmd_resume() for Shell Mode
Same logic applies to `git wt resume -s`:
```bash
if [ "$create_shell" = true ]; then
    # Check for node_modules if not already present
    if _prompt_copy_node_modules "$root_node_modules" "$worktree_node_modules"; then
        _copy_node_modules "$root_node_modules" "$worktree_node_modules"
    fi
}
```

### 5. Enhanced User Experience

#### Smart Detection
- Only prompt if `node_modules` exists in root
- Skip if `node_modules` already exists in worktree
- Only for shell mode switches (`-s` flag)

#### Progress Feedback
- Show copying progress with rsync
- Display final size of copied directory
- Clear success/failure messages

#### Timing
- Prompt appears after directory change but before shell startup
- Doesn't interfere with existing workflow

## Expected Behavior Examples

### Scenario 1: Shell Switch with node_modules Available
```bash
$ git wt switch -s feature-branch
🔄 Switching to worktree: feature-branch
📋 Session info: ...
Current directory: /repo/.worktrees/feature-branch
Git status: ...

📦 node_modules found in repository root
Copy node_modules to worktree? [Y/n]: y
📋 Copying node_modules to worktree...
          1.2G 100%  123.45MB/s    0:00:09 (xfr#12345, to-chk=0/54321)
✅ node_modules copied successfully
📊 Size: 1.2G

Starting worktree shell. Type 'exit' or use 'git wt root' to return.
(wt:feature-branch) $
```

### Scenario 2: User Declines Copy
```bash
$ git wt switch -s feature-branch
...
📦 node_modules found in repository root
Copy node_modules to worktree? [Y/n]: n
⏭️  Skipping node_modules copy

Starting worktree shell. Type 'exit' or use 'git wt root' to return.
(wt:feature-branch) $
```

### Scenario 3: No node_modules or Already Exists
```bash
$ git wt switch -s feature-branch
🔄 Switching to worktree: feature-branch
# No prompt - either no node_modules in root or already exists in worktree
Starting worktree shell. Type 'exit' or use 'git wt root' to return.
(wt:feature-branch) $
```

### Scenario 4: Lightweight Switch (No Prompt)
```bash
$ git wt switch feature-branch
🔄 Switching to worktree: feature-branch
# No prompt - only happens with -s flag
✅ Ready to work in worktree
```

## Implementation Details

### Performance Considerations
- Use `rsync` when available for efficient copying
- Show progress for large node_modules directories
- Fallback to `cp -R` if rsync not available

### Error Handling
- Check if source directory exists
- Check if destination already exists
- Handle copy failures gracefully
- Don't block shell creation if copy fails

### User Experience
- Clear prompts with sensible defaults
- Non-blocking - can decline and continue
- Only applies to shell mode switches
- Consistent with existing git-wt patterns

## Files to Modify
1. `git-wt` - Add helper functions and integrate into cmd_switch() and cmd_resume()
2. `CLAUDE.md` - Document the node_modules copying behavior
3. `claude/commands/wt/switch-shell.md` - Update to mention node_modules copying
4. `claude/commands/wt/resume-shell.md` - Update to mention node_modules copying

## Benefits
1. **Dependency isolation** - Each worktree can have its own node_modules
2. **Faster development** - No need to run `npm install` in each worktree
3. **Version consistency** - Copies exact versions from root
4. **User control** - Optional with sensible default
5. **Non-disruptive** - Only applies to shell mode, doesn't affect lightweight usage

## Alternative Approaches Considered
1. **Symlink node_modules** - Could cause conflicts with different package versions
2. **Always copy automatically** - Too aggressive, wastes disk space
3. **Copy during worktree creation** - Less flexible, happens before user knows they need it
4. **Separate command** - Adds complexity, this approach is more integrated

The prompt-based approach provides the best balance of convenience and user control.