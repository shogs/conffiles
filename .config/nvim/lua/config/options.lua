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

vim.api.nvim_create_autocmd("LspAttach", {
  group = vim.api.nvim_create_augroup("UserLspConfig", {}),
  callback = function(ev)
    --enable omnifunc completion
    vim.bo[ev.buf].omnifunc = "v:lua.vim.lsp.omnifunc"

    -- buffer local mappings
    local opts = { buffer = ev.buf }
    -- go to definition
    vim.keymap.set("n", "gd", vim.lsp.buf.definition, opts)
    --puts doc header info into a float page
    vim.keymap.set("n", "K", vim.lsp.buf.hover, opts)

    -- workspace management. Necessary for multi-module projects
    vim.keymap.set("n", "<space>wa", vim.lsp.buf.add_workspace_folder, opts)
    vim.keymap.set("n", "<space>wr", vim.lsp.buf.remove_workspace_folder, opts)
    vim.keymap.set("n", "<space>wl", function()
      print(vim.inspect(vim.lsp.buf.list_workspace_folders()))
    end, opts)

    -- add LSP code actions
    vim.keymap.set({ "n", "v" }, "<space>ca", vim.lsp.buf.code_action, opts)

    -- find references of a type
    vim.keymap.set("n", "gr", vim.lsp.buf.references, opts)
  end,
})

vim.api.nvim_create_autocmd("BufWritePre", {
  pattern = "*.swift",
  callback = function()
    local current_file = vim.fn.expand("%")
    vim.cmd("silent !swiftformat " .. current_file)
    vim.cmd("edit!")
  end,
})

-- vim.api.nvim_create_autocmd("FileType", {
--   pattern = "swift",
--   callback = function()
--     -- This sets the comment string for the current buffer only when the file type is Swift
--     vim.api.nvim_buf_set_var(0, "minicomment_commentstring", "// %s")
--   end,
-- })
