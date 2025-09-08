return {
  -- Minimap plugin
  {
    "gorbit99/codewindow.nvim",
    config = function()
      local codewindow = require("codewindow")
      codewindow.setup({
        auto_enable = false,
        width_multiplier = 4, -- Width of the minimap
        show_cursor = true,
        screen_bounds = "background", -- Show the visible area
        window_border = "single", -- Border style
      })
      codewindow.apply_default_keybinds()
    end,
  },
}
