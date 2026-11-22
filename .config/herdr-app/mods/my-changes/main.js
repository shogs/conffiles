// The uncommitted changes of the shown space's repo, a diff per file, and a commit box.
// It follows the focused terminal's folder; the header's pin (or p) ties it to the shown space
// instead (its worktree or first terminal's folder).
// With the keyboard (pane.go onto it, or my-changes.focus): j/k or arrows move and show each
// file's diff, Enter opens a side-by-side diff (nvimdiff: HEAD | working copy) beside the pane
// (Shift-Enter: in a new tab), ctrl-t opens git difftool (as lazygit), l opens the file to edit,
// h hides the diff, Esc goes back.
// Mouse: click shows a file's diff; double-click it (or its diff) opens git difftool (diff.tool);
// right-click offers either.
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, v_virtual_list, ScrollHandle } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, run, nextCommand, props, shared, setShared, openOverlay } from "herdr";

// The list's keys while it has the keyboard, and what each does (see act).
const KEYS = {
  j: "down", down: "down", k: "up", up: "up", g: "top", G: "bottom", "shift-g": "bottom",
  l: "edit", right: "edit", enter: "diff", return: "diff", "shift-enter": "tab", "shift-return": "tab",
  h: "hide", left: "hide", escape: "back", q: "back", "ctrl-t": "difftool", p: "pin",
};
// Reads write nothing under .git (no index refresh or lock, no fsmonitor cookie):
// the folder watch would see it, and every refresh would start the next one.
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const countLines = (text) => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;

// Text draws a tab as nothing: pad each to the next 4-column stop.
const untab = (text) => text.replace(/[^\t]*\t/g, (s) => s.slice(0, -1).padEnd((s.length - 1) - (s.length - 1) % 4 + 4));

// Numbers each diff line once, so a frame only draws the rows on screen.
function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, number: old++, text: untab(line.slice(1)) || " " };
    if (kind === "+") return { kind, number: next++, text: untab(line.slice(1)) || " " };
    if (kind === " ") { old++; return { kind, number: next++, text: untab(line.slice(1)) || " " }; }
    return { kind: "", text: line };
  });
}

export default class Changes extends View {
  init(_props, cx) {
    this.files = []; this.rows = []; this.diffWidth = 0; this.message = ""; this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Commit message" });
    this.input.on("change", (_e, cx) => {
      const hadMessage = Boolean(this.message.trim());
      this.message = this.input.value();
      if (hadMessage !== Boolean(this.message.trim())) cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.commit(cx));
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.scroll = ScrollHandle.new();
    cx.spawn(async (cx) => {
      for (;;) {
        const command = String(await nextCommand()).replace(/^my-changes\./, "");
        // diff:<path> / difftool:<path> (the right-click menu, mods/my-changes-menu).
        const menu = /^(diff|difftool):(.*)$/s.exec(command), file = menu && this.files.find((f) => f.path === menu[2]);
        if (menu) { if (file) menu[1] === "diff" ? this.diff(file) : this.difftool(file); }
        else if (command === "focus") this.arrive(cx);
        else if (command === "close") this.closePanel();
        else if (this.handle.is_focused() && Object.values(KEYS).includes(command)) { this.act(command, cx); cx.notify(); }
      }
    });
    // Losing the keyboard changes no live data when it goes back to the same pane: redraw the cursor away then.
    cx.timer.every(250, (cx) => {
      const has = this.handle.is_focused();
      if (has !== this.hadFocus) { this.hadFocus = has; cx.notify(); }
    });
    this.linked = {}; this.asking = new Set();
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
  }

  // What it shows. Pinned for this space (see pin): the folder it showed when pinned, kept through
  // space switches. Unpinned: the live folder of the space's last focused terminal (a pane or a
  // layout terminal block); before one there has had focus, the space's own folder when that's a
  // linked git worktree, else its first terminal's. `check`: not known yet.
  location() {
    const space = spaces().find((s) => s.active);
    if (!space) return { cwd: null, on: null };
    const pin = this.pin(space);
    if (pin) return { cwd: pin.cwd, on: pin.on ?? null };
    const on = space.machine ?? null, folder = space.folder || null, f = focused();
    this.followed ??= {};
    if (f?.cwd && f.space === space.id) this.followed[space.id] = f.cwd;
    if (this.followed[space.id]) return { cwd: this.followed[space.id], on };
    const linked = folder ? this.linked[JSON.stringify([on, folder])] : false;
    if (linked === undefined) return { cwd: null, on, check: folder };
    if (linked) return { cwd: folder, on };
    const tabs = new Set(space.tabs.map((t) => t.id));
    return { cwd: panes().find((p) => tabs.has(p.tab) && p.cwd)?.cwd || folder, on };
  }

  // A linked worktree's git dir differs from its repo's common one. Asked once per folder.
  checkWorktree(on, folder, cx) {
    const k = JSON.stringify([on, folder]);
    if (k in this.linked || this.asking.has(k)) return;
    this.asking.add(k);
    cx.spawn(async (cx) => {
      try {
        const r = await exec("git", ["rev-parse", "--path-format=absolute", "--git-dir", "--git-common-dir"], { cwd: folder, on });
        const [dir, common] = r.stdout.trim().split("\n");
        this.linked[k] = r.code === 0 && dir !== common;
      } catch { this.linked[k] = false; }
      finally { this.asking.delete(k); cx.notify(); }
    });
  }

  // While the list has the keyboard it stays on the repo it showed.
  here() {
    if (this.context && this.handle.is_focused()) return { ...this.where, key: this.context };
    const where = this.location();
    return { ...where, key: JSON.stringify(where) };
  }

  // Its open key or ctrl-a x while it has the keyboard (keys.json mod:my-changes): close this panel
  // (panel-rail decides what shows), keyboard back to the focused pane.
  // Not close(): Herdr calls that when the block goes (quit, layout switch).
  closePanel() {
    const pane = focused()?.pane;
    run("panel-rail.close-changes");
    if (pane) run("pane.focus", { pane });
  }

  // The header's ⇄: open on the other side of the tabs from now on (panel-rail moves it).
  flip() {
    const side = props()?.side === "left" ? "right" : "left";
    setShared("panels.side", { ...shared("panels.side"), changes: side });
  }

  // This space's pin, { cwd, on } (shared "panels.pin".changes, keyed by space id): each space has its own.
  pin(space = spaces().find((s) => s.active)) {
    const pin = space && shared("panels.pin")?.changes?.[space.id];
    return pin?.cwd ? pin : null;
  }

  // The header's pin (or p): keep the shown space on the folder shown now, or follow the focused
  // terminal again. Other spaces keep their own setting.
  togglePin() {
    const space = spaces().find((s) => s.active), shown = { cwd: this.where?.cwd, on: this.where?.on ?? null };
    if (!space) return;
    const pins = shared("panels.pin") ?? {}, mine = { ...(typeof pins.changes === "object" ? pins.changes : {}) };
    if (this.pin(space)) delete mine[space.id];
    else if (shown.cwd) mine[space.id] = shown;
    else return;
    setShared("panels.pin", { ...pins, changes: mine });
  }

  arrive(cx) {
    this.typing = false;
    if (!this.files.some((f) => f.path === this.open) && this.files.length) this.pick(this.files[0].path, cx);
    this.handle.focus();
    this.hadFocus = true;
    this.reveal();
    cx.notify();
  }

  reveal() {
    const i = this.files.findIndex((f) => f.path === this.open);
    if (i >= 0) this.scroll.scroll_to_item(i);
  }

  key(e, cx) {
    if (this.typing) return;
    const action = KEYS[e.keystroke] ?? KEYS[e.key];
    if (!action) return;
    this.act(action, cx);
    cx.stop_propagation();
    cx.notify();
  }

  act(action, cx) {
    const list = this.files, i = list.findIndex((f) => f.path === this.open), file = list[i];
    const to = (n) => { const f = list[Math.max(0, Math.min(list.length - 1, i < 0 ? 0 : i + n))]; if (f && f.path !== this.open) this.pick(f.path, cx); };
    switch (action) {
      case "down": to(1); break;
      case "up": to(-1); break;
      case "top": if (list.length) to(-list.length); break;
      case "bottom": if (list.length) to(list.length); break;
      case "edit": this.edit(file); break;
      case "diff": this.diff(file); break;
      case "tab": this.diff(file, true); break;
      case "difftool": this.difftool(file); break;
      case "hide": if (this.open) this.pick(this.open, cx); break;
      case "pin": this.togglePin(); break;
      case "back": {
        const pane = focused()?.pane;
        pane ? run("pane.focus", { pane }) : run("pane.go", { direction: "left" });
        break;
      }
    }
    this.reveal();
  }

  // A changed file in nvim: beside the focused pane, or in a new tab named after it. A deleted one has nothing to open.
  edit(file, tab) {
    if (!file || file.status === "D" || !this.root || this.on) return;
    if (tab) run("tab.new", { name: file.path.split("/").pop(), folder: this.root, argv: ["nvim", file.path] });
    else this.openBeside(["nvim", file.path]);
  }

  // A new pane right of the focused one. That fails while a pinned terminal (a layout terminal
  // block, no pane) has the keyboard: then right of the shown tab's first pane.
  openBeside(argv) {
    const f = focused(), first = !f?.pane && panes().find((p) => p.tab === f?.tab);
    if (first) run("pane.focus", { pane: first.pane });
    run("terminal.open", { argv, folder: this.root, place: "right" });
  }

  // HEAD and the working copy side by side in nvim (git's own nvimdiff, whatever diff.tool says).
  // A new file has nothing to compare: it just opens. Quitting nvim (:qa) closes the pane.
  diff(file, tab) {
    if (!file || !this.root || this.on) return;
    if (file.fresh || !this.hasHead) { if (file.status !== "D") this.edit(file, tab); return; }
    const argv = ["git", "difftool", "-y", "--tool=nvimdiff", "HEAD", "--", file.path];
    if (tab) run("tab.new", { name: `diff ${file.path.split("/").pop()}`, folder: this.root, argv });
    else this.openBeside(argv);
  }

  // A double-click: git's own diff tool (diff.tool, as lazygit's ctrl+t), HEAD against the working
  // copy as the panel shows it (no HEAD yet: what's staged). A file git doesn't track has no diff.
  // git removes its temporary copies when the tool exits, so it's left running in the background.
  difftool(file) {
    if (!file || file.fresh || !this.root) return;
    const script = 'nohup git difftool --no-prompt "$1" -- "$2" >/dev/null 2>&1 &';
    exec("sh", ["-c", script, "difftool", this.hasHead ? "HEAD" : "--cached", file.path], { cwd: this.root, on: this.on }).catch(() => null);
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refresh(cx);
        }
      } catch { this.watched = null; }
    });
  }

  refresh(cx) {
    if (this.loading || this.busy) return;
    const { cwd, on, check, key: context } = this.here();
    this.where = { cwd, on };
    if (context !== this.context) {
      this.context = context; this.root = null; this.files = []; this.open = null;
      this.setLines([]); this.message = ""; this.input.set_value(""); this.error = null; this.note = null; this.watched = null; this.closed = false; this.limited = false;
    }
    if (check) this.checkWorktree(on, check, cx);
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (this.here().key !== context) return;
        if (top.code !== 0) { this.root = null; this.files = []; this.setLines([]); this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        const status = await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
        if (status.code !== 0) throw new Error(status.stderr);
        const head = await git(["rev-parse", "--verify", "HEAD"]);
        const stats = {};
        const results = head.code === 0 ? [await git(["diff", "HEAD", "--numstat", "-z", "--no-renames"])] : [await git(["diff", "--cached", "--numstat", "-z", "--no-renames"]), await git(["diff", "--numstat", "-z", "--no-renames"])];
        for (const result of results) {
          if (result.code !== 0) throw new Error(result.stderr);
          for (const entry of result.stdout.split("\0")) {
            const [a, d, ...parts] = entry.split("\t");
            if (!parts.length) continue;
            const path = parts.join("\t"), old = stats[path] ?? { add: 0, del: 0 };
            stats[path] = { add: old.add + (Number(a) || 0), del: old.del + (Number(d) || 0), binary: a === "-" };
          }
        }
        const files = [];
        const entries = status.stdout.split("\0").filter(Boolean);
        for (const entry of entries.slice(0, 1000)) {
          const xy = entry.slice(0, 2), path = entry.slice(3), fresh = xy === "??";
          const conflict = xy.includes("U") || xy === "AA" || xy === "DD";
          const s = conflict ? "U" : xy.includes("D") ? "D" : fresh || xy.includes("A") ? "A" : "M";
          const stat = stats[path] ?? { add: 0, del: 0 };
          files.push({ path, status: s, fresh, ...stat });
        }
        if (this.here().key !== context) return;
        this.root = root; this.on = on; this.hasHead = head.code === 0; this.files = files; this.limited = entries.length > 1000; this.error = null;
        this.watch(root, cx);
        if (this.open && !files.some((f) => f.path === this.open)) { this.open = null; this.setLines([]); }
        // The first file's diff shows until you pick another.
        if (!this.open && !this.closed && files.length) this.open = files[0].path;
        if (this.open) {
          try { await this.load(this.open, context); }
          catch { if (this.here().key === context) this.setLines(["Cannot preview this diff (too large or unreadable)"]); }
        }
      } catch (e) { if (this.here().key === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  async load(path, context) {
    const file = this.files.find((f) => f.path === path), root = this.root, on = this.on;
    if (!file) return;
    let lines;
    if (file.fresh || (!this.hasHead && file.status === "A")) {
      const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
      if (text === null) lines = ["Cannot preview this file (binary, too large, or unreadable)"];
      else if (text.includes("\0")) lines = ["Binary file · no text diff"];
      else {
        file.add = countLines(text);
        lines = [`@@ -0,0 +1,${file.add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, 1500).map(l => `+${l}`)];
      }
    } else {
      const r = await exec("git", [...READ, "diff", ...(this.hasHead ? ["HEAD"] : []), "--no-ext-diff", "--no-textconv", "--no-color", "--", path], { cwd: root, on });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? "Binary file changed" : "No text diff available"] : all.slice(first);
    }
    if (this.here().key === context && this.open === path) this.setLines(lines.slice(0, 1500).map(line => line.length > 4000 ? line.slice(0, 4000) + "… (line truncated)" : line));
  }

  setLines(lines) {
    this.rows = diffRows(lines);
    this.diffWidth = Math.max(300, ...this.rows.map(row => (row.text.length + 1) * 7 + 50));
  }

  // A click shows a file's diff, a double-click opens git difftool. Clicking the shown file hides
  // its diff, but only once no second click came (a double-click's first click leaves it shown).
  click(file, count, cx) {
    this.hiding = null;
    if (count >= 2) return this.difftool(file);
    if (this.open !== file.path) return this.pick(file.path, cx);
    const hiding = this.hiding = {};
    cx.timer.after(450, (cx) => {
      if (this.hiding !== hiding || this.open !== file.path) return;
      this.hiding = null; this.pick(file.path, cx); cx.notify();
    });
  }

  pick(path, cx) {
    this.open = this.open === path ? null : path; this.setLines([]); this.note = null;
    this.closed = !this.open;
    const context = this.context;
    if (this.open) cx.spawn(async (cx) => {
      try { await this.load(path, context); }
      catch (e) { if (this.here().key === context && this.open === path) this.note = `Cannot preview this diff (too large or unreadable): ${e}`; }
      cx.notify();
    });
    cx.notify();
  }

  commit(cx) {
    if (!this.message.trim() || !this.root || this.busy || this.loading || this.context !== this.here().key) return;
    const root = this.root, on = this.on, context = this.context, message = this.message.trim();
    this.busy = true; this.note = null;
    cx.spawn(async (cx) => {
      try {
        for (const args of [["add", "-A"], ["commit", "-m", message]]) {
          const r = await exec("git", args, { cwd: root, on });
          if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
        }
        if (this.here().key === context) { this.message = ""; this.input.set_value(""); }
      } catch (e) { if (this.here().key === context) this.note = `Commit failed: ${e}`; }
      finally { this.busy = false; this.refresh(cx); cx.notify(); }
    });
    cx.notify();
  }

  diffRow({ kind, number, text }, t) {
    if (kind === "@") return div().w_full().px(12).h(20).flex_none().truncate().bg(t.raised).text_color(t.dim).child(text);
    return h_flex().w_full().h(20).flex_none().gap(10).when(kind === "+", (e) => e.bg(t.ansi2 + "18")).when(kind === "-", (e) => e.bg(t.ansi1 + "18"))
      .child(div().w(30).flex_none().text_right().text_color(t.dim).child(number === undefined ? "" : String(number)))
      .child(div().flex_1().min_w(0).truncate().child(text));
  }

  pinButton(t) {
    const pinned = Boolean(this.pin());
    return div().id("changes-pin").flex_none().p(3).rounded(4).cursor_pointer().when(pinned, (e) => e.bg(t.selected))
      .text_color(pinned ? t.accent : t.muted).hover((s) => s.bg(t.hover).text_color(pinned ? t.accent : t.foreground))
      .tooltip(pinned ? "Pinned to this folder in this space · click to follow the focused terminal" : "Following the focused terminal · click to pin this folder for this space")
      .on_click(() => this.togglePin()).child(svg("mods/my-changes/pin.svg").size(13));
  }

  render(cx) {
    if (this.here().key !== this.context) this.refresh(cx);
    const t = theme(), add = this.files.reduce((n, f) => n + f.add, 0), del = this.files.reduce((n, f) => n + f.del, 0);
    const enabled = Boolean(this.message.trim() && this.root && !this.busy && !this.loading);
    return v_flex().id("changes").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(this.handle.is_focused() && !this.typing ? t.accent : t.border).text_color(t.foreground).text_size(13).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && this.typing) { this.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); return; }
        this.key(e, cx);
      })
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Changes"))
        .child(div().px(5).py(1).rounded(4).border_1().border_color(t.border).text_size(10).text_color(t.muted).child(`${this.files.length} files`))
        .child(div().flex_1()).child(div().text_size(11).text_color(t.ansi2).child(`+${add}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${del}`))
        .child(this.pinButton(t))
        .child(div().id("changes-side").flex_none().px(4).rounded(4).cursor_pointer().text_color(t.muted).hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => this.flip()).child("⇄")))
      // overflow_y_scrollbar() wraps the list, so its flex sizing never reached the panel's layout.
      .child(div().flex_1().min_h(44).max_h(this.files.length * 28 + 12).relative().border_b(1).border_color(t.border)
        .child(v_flex().id("changes-list").absolute().inset_0().overflow_y_scroll().track_scroll(this.scroll).p(6).children(this.files.map((f) => {
        const parts = f.path.split("/"), name = parts.pop();
        return h_flex().id(`change-${f.path}`).h(28).flex_none().px(8).gap(8).items_center().rounded(7).cursor_pointer().when(this.open === f.path, (e) => e.bg(t.selected))
          .border_1().border_color(this.open === f.path && this.handle.is_focused() && !this.typing ? t.accent : "#00000000").hover((s) => s.bg(t.hover)).on_click((e, cx) => this.click(f, e.click_count, cx))
          .on_mouse_down("right", (_e, cx) => {
            if (this.open !== f.path) this.pick(f.path, cx);
            openOverlay({ mod: "my-changes-menu", props: { path: f.path, nvim: !this.on, difftool: !f.fresh }, kind: "popup", width: 220, height: 104 });
          })
          .child(div().w(14).text_size(11).text_color(f.status === "A" ? t.ansi2 : f.status === "D" ? t.ansi1 : f.status === "U" ? t.ansi1 : t.blocked).child(f.status))
          .child(h_flex().flex_1().min_w(0).child(div().text_color(t.dim).truncate().child(parts.length ? parts.join("/") + "/" : "")).child(div().max_w(260).min_w(0).truncate().child(name)))
          .when(f.add > 0, (e) => e.child(div().text_size(11).text_color(t.ansi2).child(`+${f.add}`))).when(f.del > 0, (e) => e.child(div().text_size(11).text_color(t.ansi1).child(`−${f.del}`)));
      })).when(!this.files.length, (e) => e.child(div().p(8).text_color(t.dim).child(this.error || (this.loading ? "Loading changes…" : this.root ? "No uncommitted changes" : "No folder")))))
        .child(Scrollbar.vertical("changes-list").absolute().inset_0()))
      .when(this.limited, el => el.child(div().px(12).py(4).text_size(11).text_color(t.dim).child("Showing the first 1,000 changed files")))
      .child(div().flex_1().min_h(0).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(11)
        .child(div().id("changes-diff-x").size_full().overflow_x_scrollbar()
          .on_click((e) => { if (e.click_count >= 2) this.difftool(this.files.find((f) => f.path === this.open)); })
          .child(div().w_full().min_w(this.diffWidth).h_full().child(v_virtual_list("changes-diff", this.rows.length, 20, (i) => String(i),
            (range) => this.rows.slice(range.start, range.end).map((row) => this.diffRow(row, t))).size_full())))
        .child(Scrollbar.vertical("changes-diff").viewport_from_layout().absolute().inset_0())
        .when(!this.open && this.files.length > 0, (e) => e.child(div().absolute().top(6).px(12).text_color(t.dim).child("Select a file to view its changes"))))
      .when(Boolean(this.note), (e) => e.child(div().px(10).pb(8).text_size(11).text_color(t.ansi1).child(this.note)))
      .child(h_flex().flex_none().p(10).gap(8).border_t(1).border_color(t.border)
        .child(div().id("commit-message").flex_1().min_w(0).h(32).px(10).flex().items_center().rounded(8).border_1().border_color(this.typing ? t.accent : t.border).cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(this.input).h_full().text_size(12).text_color(t.foreground)))
        .child(div().id("commit").h(32).px(14).flex().items_center().rounded(8).bg(enabled ? t.solid : t.raised).text_color(enabled ? t.solid_foreground : t.dim).text_size(12).when(enabled, (e) => e.cursor_pointer()).on_click((_e, cx) => this.commit(cx)).child(this.busy ? "Committing…" : "Commit")));
  }
}
