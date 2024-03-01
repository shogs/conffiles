-- bootstrap lazy.nvim, LazyVim and your plugins
require("config.lazy")

vim.opt.conceallevel = 0

vim.cmd([[ set background=dark ]])
vim.cmd([[ colorscheme catppuccin ]])

require("lspconfig").sourcekit.setup({
  cmd = { "/Applications/Xcode.app/Contents/Developer/Toolchains/XcodeDefault.xctoolchain/usr/bin/sourcekit-lsp" },
  settings = {},
})
