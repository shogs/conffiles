// A lazy file browser for the focused pane's folder, with bounded read-only previews.
// With the keyboard (pane.go onto it, or my-files.focus): j/k or arrows move, l expands a folder,
// h collapses it (or its parent), Enter opens a file in nvim or toggles a folder, Shift-Enter opens
// the file in nvim in a new tab, Esc goes back.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, ScrollHandle } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, window, run, nextCommand } from "herdr";

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, space: space?.id };
}
const key = () => JSON.stringify(location());
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;
// The tree's keys while it has the keyboard, and what each does (see act).
const KEYS = {
  j: "down", down: "down", k: "up", up: "up", g: "top", G: "bottom", "shift-g": "bottom",
  l: "right", right: "right", h: "left", left: "left", enter: "enter", return: "enter", "shift-enter": "tab", "shift-return": "tab", escape: "back", q: "back",
};

async function directory(path, on) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Other reparse points (OneDrive's folders) have no LinkType and are folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replace(/['‘’‚‛]/g, "$&$&") + "'"], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  if (!on && window()?.platform === "windows") return windowsDirectory();
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  let r;
  try { r = await exec("sh", ["-c", script, "files", path], { on }); }
  catch (e) {
    if (on && String(e).includes("cannot start sh: program not found")) return windowsDirectory();
    throw e;
  }
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

export default class Files extends View {
  init(_props, cx) {
    this.saved = new Map();
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {};
    // Keyboard: the drawn rows ({ path, dir, parent }) and the one the cursor is on.
    this.handle = cx.focus_handle();
    this.scroll = ScrollHandle.new();
    this.nav = [];
    this.cursor = null;
    cx.spawn(async cx => {
      for (;;) {
        const command = String(await nextCommand()).replace(/^my-files\./, "");
        if (command === "focus") this.arrive(cx);
        else if (this.handle.is_focused() && Object.values(KEYS).includes(command)) { this.act(command, cx); cx.notify(); }
      }
    });
    // Losing the keyboard changes no live data when it goes back to the same pane: redraw the cursor away then.
    cx.timer.every(250, cx => {
      const has = this.handle.is_focused();
      if (has !== this.hadFocus) { this.hadFocus = has; cx.notify(); }
    });
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
  }

  // While the tree has the keyboard it stays on the folder it showed.
  here() {
    if (this.context && this.handle?.is_focused()) return { cwd: this.context.cwd, on: this.context.on, key: this.context.key };
    return { ...location(), key: key() };
  }

  arrive(cx) {
    if (this.file) this.show(null);
    if (!this.nav.some(r => r.path === this.cursor)) this.cursor = this.nav[0]?.path ?? null;
    this.handle.focus();
    this.hadFocus = true;
    this.reveal();
    cx.notify();
  }

  reveal() {
    const i = this.nav.findIndex(r => r.path === this.cursor);
    if (i >= 0) this.scroll.scroll_to_item(i);
  }

  key(e, cx) {
    const action = KEYS[e.keystroke] ?? KEYS[e.key];
    if (!action) return;
    this.act(action, cx);
    cx.stop_propagation();
    cx.notify();
  }

  act(action, cx) {
    if (this.file) { if (action === "back" || action === "left") this.show(null); return; }
    const list = this.nav, i = list.findIndex(r => r.path === this.cursor), row = list[i];
    const to = n => { this.cursor = list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + n))]?.path ?? null; };
    const open = row?.dir && this.folders.has(row.path);
    switch (action) {
      case "down": to(1); break;
      case "up": to(-1); break;
      case "top": this.cursor = list[0]?.path ?? null; break;
      case "bottom": this.cursor = list.at(-1)?.path ?? null; break;
      case "right": if (row?.dir && !open) this.toggle(row.path, cx); else if (row && !row.dir) this.edit(row.path); break;
      case "left":
        if (open) this.toggle(row.path, cx);
        else if (row?.parent) { this.cursor = row.parent; this.toggle(row.parent, cx); }
        break;
      case "enter": if (row?.dir) this.toggle(row.path, cx); else if (row) this.edit(row.path); break;
      case "tab": if (row && !row.dir) this.editInTab(row.path); break;
      case "back": {
        const pane = focused()?.pane;
        pane ? run("pane.focus", { pane }) : run("pane.go", { direction: "left" });
        break;
      }
    }
    this.reveal();
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try { while (this.context === context) { await watchFolder(root); if (this.current(context)) this.refresh(cx); } }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  current(context) {
    return this.context === context && this.here().key === context.key;
  }

  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    const { cwd, on, key: next } = this.here();
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null); this.watched = null; this.error = null; this.limited = false;
      this.loading = false;
      if (saved?.file) this.show(saved.file, cx);
    }
    if (!cwd || this.loading) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            marks[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
          }
        }
        if (!this.current(context)) return;
        this.marks = marks; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }

  // A click opens the file in nvim, in a new pane right of the focused one; right-click previews it here.
  edit(path) {
    if (!this.root) return;
    run("terminal.open", { argv: ["nvim", path], folder: this.root, place: "right" });
  }

  // The same, in a new tab of the shown space named after the file.
  editInTab(path) {
    if (!this.root) return;
    run("tab.new", { name: path.split("/").pop(), folder: this.root, argv: ["nvim", path] });
  }

  show(path, cx) {
    this.code?.release(); this.code = null; this.file = path; this.fileError = null;
    if (!path || !cx) return;
    const context = this.context, root = this.root, on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${root}/${path}`, { on });
        if (this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.file === path && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  rows(prefix, depth, out, t) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), mark = this.marks[`${this.root}/${path}`];
      const here = this.cursor === path && this.handle.is_focused();
      this.nav.push({ path, dir: entry.dir, parent: prefix });
      out.push(h_flex().id(`file-${path}`).h(28).flex_none().pl(8 + depth * 18).pr(8).gap(7).items_center().rounded(7).cursor_pointer().hover(s => s.bg(t.hover))
        .border_1().border_color(here ? t.accent : "#00000000").when(here, el => el.bg(t.selected))
        .on_click((_e, cx) => entry.dir ? this.toggle(path, cx) : this.edit(path))
        .on_mouse_down("right", (_e, cx) => { if (!entry.dir) this.show(path, cx); })
        .child(entry.dir ? svg(`mods/my-files/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(svg(`mods/my-files/${entry.dir ? "folder" : "file"}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().child(entry.name))
        .when(Boolean(mark), el => el.child(div().text_size(11).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked).child(mark))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  }

  render(cx) {
    if (this.here().key !== this.context?.key) this.refresh(cx);
    const t = theme();
    this.nav = [];
    return v_flex().id("files").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(this.handle.is_focused() ? t.accent : t.border).text_color(t.foreground).text_size(13)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .when(Boolean(this.file), el => el.child(div().id("files-back").w(20).cursor_pointer().text_color(t.muted).on_click((_e, cx) => { this.show(null); cx.notify(); }).child("←")))
        .child(div().font_semibold().child("Files"))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim).child(this.file ?? this.root?.split(/[\\/]/).pop() ?? "")))
      .when(!this.file, el => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).p(6).children(this.rows("", 0, [], t))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))))
        .when(this.limited, el => el.child(div().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(Boolean(this.file), el => el.child(this.code ? Editor.new(this.code).flex_1().min_h(0) : div().p(12).text_color(t.dim).child(this.fileError || "Loading file…")));
  }
}
