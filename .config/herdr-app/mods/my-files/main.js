// A lazy file browser for the focused terminal's folder (see location), with bounded read-only previews.
// The header's pin (or p) ties it to the shown space instead (its worktree or first terminal's folder).
// With the keyboard (pane.go onto it, or my-files.focus): j/k or arrows move, l expands a folder or previews a file
// (j/k scroll a line, ctrl-d/ctrl-u half a page, g/G to an end, h/Esc go back),
// h collapses it (or its parent), Enter opens a file in nvim or toggles a folder, Shift-Enter opens
// the file in nvim in a new tab, Esc goes back. Mouse: click selects, double-click previews,
// right-click offers nvim or the preview.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, ScrollHandle } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, window, run, nextCommand, props, shared, setShared, openOverlay } from "herdr";

const PER_FOLDER = 500, TOTAL = 5000;
// A file preview's line height (px) and longest file it shows.
const LINE = 18, MAX_CHARS = 400000;
// The tree's keys while it has the keyboard, and what each does (see act).
const KEYS = {
  j: "down", down: "down", k: "up", up: "up", g: "top", G: "bottom", "shift-g": "bottom",
  l: "right", right: "right", h: "left", left: "left", enter: "enter", return: "enter", "shift-enter": "tab", "shift-return": "tab", escape: "back", q: "back",
  "ctrl-d": "page-down", "ctrl-u": "page-up", p: "pin",
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
    this.linked = {}; this.asking = new Set();
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {};
    // Keyboard: the drawn rows ({ path, dir, parent }) and the one the cursor is on.
    this.handle = cx.focus_handle();
    this.scroll = ScrollHandle.new();
    this.nav = [];
    this.cursor = null;
    cx.spawn(async cx => {
      for (;;) {
        const command = String(await nextCommand()).replace(/^my-files\./, "");
        // nvim:<path> / preview:<path> (the right-click menu, mods/my-files-menu).
        const menu = /^(nvim|preview):(.*)$/s.exec(command);
        if (menu) { this.cursor = menu[2]; if (menu[1] === "nvim") this.edit(menu[2]); else this.show(menu[2], cx); cx.notify(); }
        else if (command === "focus") this.arrive(cx);
        else if (command === "close") this.closePanel();
        else if (command === "pin") { this.togglePin(); cx.notify(); }
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

  // What it shows. Pinned for this space (see pin): the folder it showed when pinned, kept through
  // space switches. Unpinned: the live folder of the space's last focused terminal (a pane or a
  // layout terminal block); before one there has had focus, the space's own folder when that's a
  // linked git worktree, else its first terminal's. `check`: not known yet.
  location() {
    const space = spaces().find((s) => s.active);
    if (!space) return { cwd: null, on: null };
    const pin = this.pin(space);
    if (pin) return { cwd: pin.cwd, on: pin.on ?? null, space: space.id };
    const on = space.machine ?? null, folder = space.folder || null, f = focused();
    this.followed ??= {};
    if (f?.cwd && f.space === space.id) this.followed[space.id] = f.cwd;
    if (this.followed[space.id]) return { cwd: this.followed[space.id], on, space: space.id };
    const linked = folder ? this.linked[JSON.stringify([on, folder])] : false;
    if (linked === undefined) return { cwd: null, on, space: space.id, check: folder };
    if (linked) return { cwd: folder, on, space: space.id };
    const tabs = new Set(space.tabs.map(t => t.id));
    return { cwd: panes().find(p => tabs.has(p.tab) && p.cwd)?.cwd || folder, on, space: space.id };
  }

  // A linked worktree's git dir differs from its repo's common one. Asked once per folder.
  checkWorktree(on, folder, cx) {
    const k = JSON.stringify([on, folder]);
    if (k in this.linked || this.asking.has(k)) return;
    this.asking.add(k);
    cx.spawn(async cx => {
      try {
        const r = await exec("git", ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"], { cwd: folder, on });
        const [dir, common] = r.stdout.trim().split("\n");
        this.linked[k] = r.code === 0 && dir !== common;
      } catch { this.linked[k] = false; }
      finally { this.asking.delete(k); cx.notify(); }
    });
  }

  // While the tree has the keyboard it stays on the folder it showed.
  here() {
    if (this.context && this.handle?.is_focused()) return { cwd: this.context.cwd, on: this.context.on, key: this.context.key };
    // Keyed by folder alone: pinning or unpinning where it already is keeps the open folders.
    const where = this.location();
    return { ...where, key: JSON.stringify([where.cwd, where.on, where.check ?? null]) };
  }

  // Its open key or ctrl-a x while it has the keyboard (keys.json mod:my-files): close this panel
  // (panel-rail decides what shows), keyboard back to the focused pane.
  // Not close(): Herdr calls that when the block goes (quit, layout switch).
  closePanel() {
    const pane = focused()?.pane;
    run("panel-rail.close-files");
    if (pane) run("pane.focus", { pane });
  }

  // The header's ⇄: open on the other side of the tabs from now on (panel-rail moves it).
  flip() {
    const side = props()?.side === "left" ? "right" : "left";
    setShared("panels.side", { ...shared("panels.side"), files: side });
  }

  // This space's pin, { cwd, on } (shared "panels.pin".files, keyed by space id): each space has its own.
  pin(space = spaces().find((s) => s.active)) {
    const pin = space && shared("panels.pin")?.files?.[space.id];
    return pin?.cwd ? pin : null;
  }

  // The header's pin (or p): keep the shown space on the folder shown now, or follow the focused
  // terminal again. Other spaces keep their own setting.
  togglePin() {
    const space = spaces().find((s) => s.active), shown = { cwd: this.root, on: this.on ?? null };
    if (!space) return;
    const pins = shared("panels.pin") ?? {}, mine = { ...(typeof pins.files === "object" ? pins.files : {}) };
    if (this.pin(space)) delete mine[space.id];
    else if (shown.cwd) mine[space.id] = shown;
    else return;
    setShared("panels.pin", { ...pins, files: mine });
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
    if (action === "pin") { this.togglePin(); return; }
    if (this.file) { this.actFile(action); return; }
    const list = this.nav, i = list.findIndex(r => r.path === this.cursor), row = list[i];
    const to = n => { this.cursor = list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + n))]?.path ?? null; };
    const open = row?.dir && this.folders.has(row.path);
    switch (action) {
      case "down": to(1); break;
      case "up": to(-1); break;
      case "top": this.cursor = list[0]?.path ?? null; break;
      case "bottom": this.cursor = list.at(-1)?.path ?? null; break;
      case "right": if (row?.dir && !open) this.toggle(row.path, cx); else if (row && !row.dir) this.show(row.path, cx); break;
      case "left":
        if (open) this.toggle(row.path, cx);
        else if (row?.parent) { this.cursor = row.parent; this.toggle(row.parent, cx); }
        break;
      case "enter": if (row?.dir) this.toggle(row.path, cx); else if (row) this.edit(row.path); break;
      case "tab": if (row && !row.dir) this.editInTab(row.path); break;
      case "back": {
        // Back to the pane or pinned terminal used before the panel.
        const { pane, terminal } = this.from ?? focused() ?? {};
        if (pane) run("pane.focus", { pane });
        else if (terminal) run("pane.focus", { terminal });
        else run("pane.go", { direction: "left" });
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
    const { cwd, on, check, key: next } = this.here();
    if (check) this.checkWorktree(on, check, cx);
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

  // Enter (or Neovim in the right-click menu) opens the file in nvim, in a new pane right of the focused
  // one; while a pinned terminal (a layout terminal block, no pane) has the keyboard, where that
  // fails, right of the shown tab's first pane.
  edit(path) {
    if (!this.root) return;
    const f = focused(), first = !f?.pane && panes().find(p => p.tab === f?.tab);
    if (first) run("pane.focus", { pane: first.pane });
    run("terminal.open", { argv: ["nvim", path], folder: this.root, place: "right" });
  }

  // The same, in a new tab of the shown space named after the file.
  editInTab(path) {
    if (!this.root) return;
    run("tab.new", { name: path.split("/").pop(), folder: this.root, argv: ["nvim", path] });
  }

  // In a file preview the keys scroll it: a line, half a page, or to an end; h/Esc go back.
  actFile(action) {
    const half = Math.max(1, Math.floor(this.shown() / 2));
    const by = { down: 1, up: -1, "page-down": half, "page-up": -half, top: -Infinity, bottom: Infinity }[action];
    if (by !== undefined) this.scrollTo(this.top + by);
    else if (action === "back" || action === "left") this.show(null);
  }

  // How many lines fit in the preview, and moving its first shown line (kept so the last line can reach the bottom).
  shown() { return Math.max(1, Math.floor((this.previewHeight ?? 400) / LINE)); }
  scrollTo(top) {
    this.top = Math.max(0, Math.min((this.lines?.length ?? 0) - this.shown(), top));
  }

  preview(t) {
    const lines = this.lines, end = Math.min(lines.length, this.top + this.shown() + 1);
    const digits = String(lines.length).length;
    return v_flex().id("files-preview").flex_1().min_h(0).overflow_hidden().py(6).text_size(12).font_family(settings().font_family)
      .on_size_change((size, cx) => { this.previewHeight = size.height - 12; this.scrollTo(this.top); cx.notify(); })
      .on_mouse_down("left", () => this.handle.focus())
      .on_scroll_wheel((e, cx) => {
        this.wheel = (this.wheel ?? 0) - (e.delta_lines ? e.delta_lines.y : e.delta.y / LINE);
        const n = Math.trunc(this.wheel);
        if (!n) return;
        this.wheel -= n; this.scrollTo(this.top + n); cx.notify();
      })
      .children(lines.slice(this.top, end).map((line, k) => h_flex().h(LINE).flex_none().gap(12).px(10)
        .child(div().w(digits * 8).flex_none().text_right().text_color(t.dim).child(String(this.top + k + 1)))
        .child(div().flex_1().min_w(0).whitespace_nowrap().overflow_hidden().child(line))));
  }

  show(path, cx) {
    this.lines = null; this.top = 0; this.wheel = 0; this.file = path; this.fileError = null;
    if (!path || !cx) return;
    const context = this.context, root = this.root, on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${root}/${path}`, { on });
        if (this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const shown = text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) + "\n… (file truncated)" : text;
        this.lines = shown.replace(/\r\n?/g, "\n").replace(/\t/g, "    ").split("\n");
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
        // A click selects (a folder also opens or closes, once per double-click); a double-click
        // previews a file here; right-click offers nvim or the preview (mods/my-files-menu).
        .on_click((e, cx) => {
          this.cursor = path; this.handle.focus(); this.hadFocus = true;
          if (entry.dir) { if (e.click_count === 1) this.toggle(path, cx); }
          else if (e.click_count >= 2) this.show(path, cx);
          cx.notify();
        })
        .on_mouse_down("right", (_e, cx) => {
          if (entry.dir) return;
          this.cursor = path; this.handle.focus(); this.hadFocus = true; cx.notify();
          openOverlay({ mod: "my-files-menu", props: { path }, kind: "popup", width: 200, height: 104 });
        })
        .child(entry.dir ? svg(`mods/my-files/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(svg(`mods/my-files/${entry.dir ? "folder" : "file"}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().child(entry.name))
        .when(Boolean(mark), el => el.child(div().text_size(11).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked).child(mark))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  }

  pinButton(t) {
    const pinned = Boolean(this.pin());
    return div().id("files-pin").flex_none().p(3).rounded(4).cursor_pointer().when(pinned, el => el.bg(t.selected))
      .text_color(pinned ? t.accent : t.muted).hover(s => s.bg(t.hover).text_color(pinned ? t.accent : t.foreground))
      .tooltip(pinned ? "Pinned to this folder in this space · click to follow the focused terminal" : "Following the focused terminal · click to pin this folder for this space")
      .on_click(() => this.togglePin()).child(svg("mods/my-files/pin.svg").size(13));
  }

  render(cx) {
    if (this.here().key !== this.context?.key) this.refresh(cx);
    // Where the keyboard was before the panel (a tab pane, or a pinned terminal with no pane), for Esc.
    const f = focused();
    if (!this.handle.is_focused() && (f?.pane || f?.terminal)) this.from = { pane: f.pane, terminal: f.terminal };
    const t = theme();
    this.nav = [];
    return v_flex().id("files").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(this.handle.is_focused() ? t.accent : t.border).text_color(t.foreground).text_size(13)
      .track_focus(this.handle).on_key_down((e, cx) => this.key(e, cx))
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .when(Boolean(this.file), el => el.child(div().id("files-back").w(20).cursor_pointer().text_color(t.muted).on_click((_e, cx) => { this.show(null); cx.notify(); }).child("←")))
        .child(div().font_semibold().child("Files"))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim).child(this.file ?? this.root?.split(/[\\/]/).pop() ?? ""))
        .child(this.pinButton(t))
        .child(div().id("files-side").flex_none().px(4).rounded(4).cursor_pointer().text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => this.flip()).child("⇄")))
      .when(!this.file, el => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().track_scroll(this.scroll).p(6).children(this.rows("", 0, [], t))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))))
        .when(this.limited, el => el.child(div().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(Boolean(this.file), el => el.child(this.lines ? this.preview(t) : div().p(12).text_color(t.dim).child(this.fileError || "Loading file…")));
  }
}
