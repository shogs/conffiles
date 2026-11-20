-- Start in tokyonight's light style when macOS is in light mode. tokyonight sets
-- 'background' itself while loading, so Neovim's own terminal detection never applies.
local light = vim.fn.has("mac") == 1
  and not vim.fn.system({ "defaults", "read", "-g", "AppleInterfaceStyle" }):find("Dark")

return {
  { "folke/tokyonight.nvim", opts = { style = light and "day" or "moon" } },
}
