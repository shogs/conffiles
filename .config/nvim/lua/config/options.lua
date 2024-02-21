-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

local opt = vim.opt

opt.conceallevel = 0

-- vim.api.nvim_set_keymap(
--   "n",
--   "<LeftMouse>",
--   '<LeftMouse><cmd>lua vim.lsp.buf.hover({border = "single"})<CR>',
--   { noremap = true, silent = true }
-- )
--
-- vim.api.nvim_set_keymap(
--   "n",
--   "<RightMouse>",
--   "<LeftMouse><cmd>lua vim.lsp.buf.definition()<CR>",
--   { noremap = true, silent = true }
-- )

vim.api.nvim_set_keymap(
  "n",
  "<Nop>",
  '<M-LeftMouse><cmd>lua vim.lsp.buf.hover({border = "single"})<CR>',
  { noremap = true, silent = true }
)

vim.api.nvim_set_keymap("n", "<M-n>", "<C-n><cmd>bnext<CR>", { noremap = true, silent = true })
vim.api.nvim_set_keymap("n", "<M-p>", "<C-p><cmd>bprev<CR>", { noremap = true, silent = true })
vim.api.nvim_set_keymap("n", "<M-w>", "<M-w><cmd><leader>bd<CR>", { noremap = true, silent = true })
vim.api.nvim_set_keymap("n", "<C-n>", "<C-n><cmd>bnext<CR>", { noremap = true, silent = true })
vim.api.nvim_set_keymap("n", "<C-p>", "<C-p><cmd>bprev<CR>", { noremap = true, silent = true })
--vim.api.nvim_set_keymap("n", "<C-w>", "<M-w><cmd><leader>bd<CR>", { noremap = true, silent = true })

--vim.api.nvim_set_keymap()

--vim.api.nvim_set_keymap("n", "<C-ScrollWheelUp>", "<C-i>", { noremap = true, silent = true })
--vim.api.nvim_set_keymap("n", "<C-ScrollWheelDown>", "<C-o>", { noremap = true, silent = true })

-- To control the tab in vim
--vim.o.tabstop = 4 -- A TAB character looks like 4 spaces
--vim.o.expandtab = true -- Pressing the TAB key will insert spaces instead of a TAB character
--vim.o.softtabstop = 4 -- Number of spaces inserted instead of a TAB character
--vim.o.shiftwidth = 4 -- Number of spaces inserted when indenting
