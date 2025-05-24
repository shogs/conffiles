-- Custom Telescope configuration to search across the entire project
return {
  -- Configure telescope to always search from project root
  {
    "nvim-telescope/telescope.nvim",
    opts = function(_, opts)
      -- Define a function to always get the project root
      local function get_project_root()
        -- Attempt to find git root first (most common for project root)
        local git_root = vim.fn.systemlist("git rev-parse --show-toplevel")[1]
        if git_root and git_root ~= "" then
          return git_root
        end
        
        -- Fallback to current working directory
        return vim.fn.getcwd()
      end
      
      -- Always use project root for file operations
      local function live_grep_from_project_root()
        require("telescope.builtin").live_grep({ 
          cwd = get_project_root(),
          hidden = true,  -- Include hidden files
        })
      end
      
      local function find_files_from_project_root()
        require("telescope.builtin").find_files({ 
          cwd = get_project_root(),
          hidden = true,  -- Include hidden files
        })
      end
      
      -- Override existing keymaps to always use project root
      local telescope_builtin = require("telescope.builtin")
      vim.keymap.set("n", "<leader>sg", live_grep_from_project_root, { desc = "Grep (Project Root)" })
      vim.keymap.set("n", "<leader>/", live_grep_from_project_root, { desc = "Grep (Project Root)" })
      vim.keymap.set("n", "<leader>ff", find_files_from_project_root, { desc = "Find Files (Project Root)" })
      vim.keymap.set("n", "<leader><space>", find_files_from_project_root, { desc = "Find Files (Project Root)" })
      
      -- Modify default settings
      opts.defaults = vim.tbl_deep_extend("force", opts.defaults or {}, {
        -- Use git root or cwd as default path
        cwd = get_project_root(),
        path_display = { "truncate" },
      })
      
      -- Override any find_files and live_grep options
      opts.pickers = vim.tbl_deep_extend("force", opts.pickers or {}, {
        find_files = {
          hidden = true,
          cwd = get_project_root(),
          no_ignore = false,  -- Set to true to include .gitignore files
        },
        live_grep = {
          hidden = true,
          cwd = get_project_root(),
        },
      })
      
      return opts
    end,
  },
}