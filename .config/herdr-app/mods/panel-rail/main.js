// The side panel's buttons as a strip down the window's right edge: an icon and a
// sideways label per panel (Files, Changes). Click to show that panel, again to hide it; right-click
// to choose the side it opens on (left of the tabs or right). Open panels on one side stack.
// Like the tab bar it replaces, it remembers each space's open panels and restores them on switching.
// panel-rail.files and panel-rail.changes (keys) open that panel and give it the keyboard;
// panel-rail.spaces shows the Spaces sidebar and gives it the keyboard.
// It also shows each space's pinned view (mods/my-pinned-panes, pins.js) on switching, and
// panel-rail.pinned (keys) opens or closes it for the shown space; panel-rail.pin pins
// or unpins the focused pane, panel-rail.pin-global pins the focused pinned pane across spaces
// (or back), panel-rail.pinned-max maximises the view (pinned-max-here: only from a pinned pane); zoom, split-right,
// split-down and close are the pane keys (see paneKey); go-left/right/up/down are pane.go (see go);
// swap-left/right/up/down are pane.swap, or on a pinned pane move it up or down (see swapKey);
// last-pane goes back to the pane (tab or pinned) used before. close, close-tab (cmd-w) and eof
// (ctrl-d) refuse to close a space's last pane while it has pins (blocksClose).
import { View, div, svg } from "gpui-kit";
import { v_flex } from "gpui-base";
import { spaces, run, theme, shared, setShared, layout, nextCommand, focused, panes, exec, notify, openOverlay } from "herdr";
import { applyView, toggle as togglePinned, toggleMax, toggleZoom, split, close, pin, unpin, visible, pollAgents, reveal, toggleGlobal, zoomOf, regroup, groupOf, blocksClose, orphans, orphansHeight, sync as syncPinned, show as showPinned, move as movePin } from "./pins.js";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

// The labels are outlined text turned sideways (no rotated text in mods), tinted like the icons.
// Each panel has a block "<id>-left" and "<id>-right" in glass.json's panel-left/panel-right
// columns, in this order: open panels on the same side stack in it.
const PANELS = [
  { id: "files", mod: "my-files", icon: "mods/files/file.svg", label: "files", w: 12.33, h: 26.79 },
  { id: "changes", mod: "my-changes", icon: "mods/changes/changes.svg", label: "changes", w: 12.33, h: 50.86 },
];

// The side a panel opens on: shared "panels.side" (kept across restarts, set from the rail's
// right-click menu and the panels' own ⇄), right unless set.
const sideOf = (id) => shared("panels.side")?.[id] === "left" ? "left" : "right";

export default class PanelRail extends View {
  init(_props, cx) {
    // The pinned panes' agent status, for my-agents and my-office (see pins.js).
    cx.timer.every(2000, (cx) => pollAgents(cx));
    // Per space, the panels open there (an older build kept one id or null).
    const saved = JSON.parse(localStorage.getItem("panels") ?? "{}");
    this.panels = Object.fromEntries(Object.entries(saved).map(([k, v]) => [k, Array.isArray(v) ? v : v ? [v] : []]));
    cx.spawn(async (cx) => {
      for (;;) {
        const command = String(await nextCommand()).replace(/^panel-rail\./, "");
        // A reloaded build's loop ends here (at its next cx use) instead of acting too.
        cx.notify();
        const panel = PANELS.find(p => command.replace(/^(open|close|side)-/, "") === p.id);
        if (panel && command === panel.id) this.focusPanel(panel, cx);
        // side-<id> (keys): open it on the other side from now on.
        else if (panel && command.startsWith("side-")) setShared("panels.side", { ...shared("panels.side"), [panel.id]: sideOf(panel.id) === "left" ? "right" : "left" });
        // open-<id> / close-<id>: from the side menu and the panels' own close.
        else if (panel) { this.setOpen(panel.id, command.startsWith("open-")); cx.notify(); }
        else if (command === "spaces") this.focusSpaces(cx);
        else if (command === "pinned") this.pinnedKey(cx);
        else if (command === "pin") this.pinFocused(cx);
        else if (command === "pin-files") this.pinFiles();
        else if (command === "pinned-max") toggleMax();
        else if (command === "pinned-max-here") { const f = focused(); if (!f?.pane && f?.terminal && visible().some(x => x.terminal === f.terminal)) toggleMax(); }
        else if (/^go-(left|right|up|down)$/.test(command)) this.go(command.slice(3), cx);
        else if (command === "last-pane") this.lastPlace();
        else if (/^swap-(left|right|up|down)$/.test(command)) this.swapKey(command.slice(5));
        else if (command === "office-max") this.toggleOfficeMax();
        else if (command === "pin-global") { const f = focused(); if (!f?.pane && f?.terminal) toggleGlobal(f.terminal); }
        else if (command === "zoom") this.paneKey("pane.zoom", {}, cx);
        else if (command === "split-right") this.paneKey("pane.split", { direction: "right" }, cx);
        else if (command === "split-down") this.paneKey("pane.split", { direction: "down" }, cx);
        else if (command === "close") this.paneKey("pane.close", {}, cx);
        else if (command === "close-tab") this.closeTab();
        else if (command === "eof") this.eof();
      }
    });
  }

  // panel-rail.pinned: from a pinned pane, close the view; anywhere else, open it (if closed)
  // and go to the pinned pane used last (else the first). The blocks show once the layout
  // applies, so focusing is tried again a moment later.
  pinnedKey(cx) {
    const f = focused();
    if (!f?.pane && f?.terminal && visible().some(x => x.terminal === f.terminal)) return togglePinned();
    showPinned();
    const enter = () => {
      const z = zoomOf(), shown = visible().filter(x => !z || x.terminal === z);
      const to = shown.find(x => x.terminal === shared("pinned.last")) ?? shown[0];
      if (to && focused()?.terminal !== to.terminal) run("pane.focus", { terminal: to.terminal });
    };
    for (const ms of [0, 120]) cx.timer.after(ms, enter);
  }

  // Pin the focused tab pane to this space's pinned view, or unpin the focused pinned pane.
  // panel-rail.pin-files (ctrl-a p): pin the Files panel, for the shown space, to the focused
  // terminal's folder (shown or not; shared "panels.pin".files, as mods/my-files reads it).
  // Pressed again in the folder it's pinned to, unpins it. From the panel itself it's my-files.pin.
  pinFiles() {
    const space = spaces().find(s => s.active), f = focused();
    if (!space) return;
    const pins = shared("panels.pin") ?? {}, mine = { ...(pins.files && typeof pins.files === "object" ? pins.files : {}) };
    const cwd = f?.space === space.id ? f.cwd : null, on = space.machine ?? null, name = (p) => p.split(/[\\/]/).pop() || p;
    if (cwd && mine[space.id]?.cwd !== cwd) {
      mine[space.id] = { cwd, on };
      notify({ title: `Files pinned to ${name(cwd)}`, body: cwd, level: "info", timeout: 2500 });
    } else if (mine[space.id]?.cwd) {
      delete mine[space.id];
      notify({ title: "Files unpinned", body: "Following the focused terminal", level: "info", timeout: 2500 });
    } else return;
    setShared("panels.pin", { ...pins, files: mine });
  }

  pinFocused(cx) {
    const f = focused(), pane = f?.pane;
    // A pinned pane (a terminal block) has no pane: unpin it, back to its tab.
    if (!pane && f?.terminal && visible().some(x => x.terminal === f.terminal)) return unpin(f.terminal);
    const terminal = panes().find(p => p.pane === pane)?.terminal;
    if (!terminal) return;
    if (visible().some(x => x.terminal === terminal)) unpin(terminal);
    else pin(pane, cx);
  }

  // The pane keys (layout:glass): on a pinned pane (a terminal block, which pane commands
  // refuse) they zoom, split (always down) or close it within the pinned view; otherwise
  // they're the tab's pane command.
  paneKey(command, args, cx) {
    const f = focused(), terminal = !f?.pane && f?.terminal;
    const pinned = terminal && visible().find(x => x.terminal === terminal);
    if (!pinned) {
      if (command === "pane.close" && f?.pane && blocksClose({ pane: f.pane })) return;
      return run(command, args);
    }
    if (command === "pane.zoom") toggleZoom(terminal);
    else if (command === "pane.split") split(terminal, f.cwd ?? pinned.cwd, cx);
    else if (command === "pane.close") close(terminal);
  }

  // close-tab (cmd-w in glass): tab.close, unless it's the last tab of a space with pins.
  closeTab() {
    const tab = focused()?.tab;
    if (tab && blocksClose({ tab })) return;
    run("tab.close", {});
  }

  // eof (ctrl-d in glass, which takes the key from every terminal): a shell's ctrl-d would end it,
  // so in the last pane of a space with pins it's refused; anything else gets ctrl-d typed.
  eof() {
    const f = focused();
    if (!f?.terminal) return;
    const p = f.pane && panes().find(x => x.pane === f.pane);
    if (p?.program?.shell && blocksClose({ pane: f.pane })) return;
    exec("hc", ["keys", f.terminal, "ctrl+d"]).catch(() => null);
  }

  // Where the keyboard has been, most recent first: a tab pane ("p:<pane>") or a pinned pane
  // ("t:<terminal>"), for last-pane. Runs on every render, which focus changes cause.
  remember(f) {
    const place = f?.pane ? `p:${f.pane}` : f?.terminal && visible().some(x => x.terminal === f.terminal) ? `t:${f.terminal}` : null;
    if (!place || this.history?.[0] === place) return;
    this.history = [place, ...(this.history ?? []).filter(x => x !== place)].slice(0, 20);
  }

  // last-pane (ctrl-a ;, as tmux's): back to where the keyboard was before, so pressing it again
  // comes back. Tab panes of the shown tab and the shown pinned panes count, pinned or not.
  lastPlace() {
    const f = focused(), z = zoomOf();
    const here = new Set([
      ...panes().filter(p => p.tab === f?.tab).map(p => `p:${p.pane}`),
      ...visible().filter(x => !z || x.terminal === z).map(x => `t:${x.terminal}`),
    ]);
    const to = (this.history ?? []).slice(1).find(x => here.has(x));
    if (!to) return;
    run("pane.focus", to.startsWith("p:") ? { pane: to.slice(2) } : { terminal: to.slice(2) });
  }

  // pane.go (layout:glass keys). Anywhere but a pinned pane, plain pane.go, which reaches the
  // pinned view too (my-pinned-panes is focusable and hands the keyboard to the pane). From a
  // pinned pane (a terminal block, where pane.go fails): up/down to the pinned pane above or
  // below, right to the tab's pane used last (else its first), left to the Spaces sidebar.
  go(direction, cx) {
    const f = focused(), z = zoomOf();
    const shown = visible().filter(x => !z || x.terminal === z), i = shown.findIndex(x => x.terminal === f?.terminal);
    if (f?.pane || i < 0) return run("pane.go", { direction });
    if (direction === "up" || direction === "down") {
      const to = shown[i + (direction === "down" ? 1 : -1)];
      if (to) run("pane.focus", { terminal: to.terminal });
    } else if (direction === "right") {
      const tab = panes().filter(p => p.tab === f.tab && !p.mod), last = tab.find(p => p.pane === this.lastPane) ?? tab[0];
      if (last) run("pane.focus", { pane: last.pane });
    } else {
      const sidebar = find(layout(), "sidebar");
      if (sidebar && !sidebar.hidden) for (const ms of [0, 120]) cx.timer.after(ms, () => run("my-spaces.focus"));
    }
  }

  // pane.swap (layout:glass keys). On a pinned pane (where pane.swap fails), up/down move it
  // above or below its neighbour in the pinned view; left/right do nothing there.
  swapKey(direction) {
    const f = focused();
    if (f?.pane || !f?.terminal || !visible().some(x => x.terminal === f.terminal)) return run("pane.swap", { direction });
    if (direction === "up" || direction === "down") movePin(f.terminal, direction === "down" ? 1 : -1);
  }

  // The big office strip above the panes; the sidebar office stays (my-office's buttons too).
  toggleOfficeMax() {
    const max = find(layout(), "office-max");
    if (!max) return;
    run(max.hidden ? "layout.show" : "layout.hide", { id: "office-max" });
  }

  // The sidebar may be hidden (cmd-b) or folded to its rail (its own key, the brand row's button):
  // show it at its full width, then hand it the keyboard.
  focusSpaces(cx) {
    const sidebar = find(layout(), "sidebar");
    if (sidebar?.hidden) run("layout.show", { id: "sidebar" });
    if ((sidebar?.size?.px ?? Infinity) < 160) {
      setShared("sidebar.collapsed", false);
      run("layout.resize", { id: "sidebar", px: shared("sidebar.width") ?? 268 });
    }
    for (const ms of [0, 120, 300]) cx.timer.after(ms, () => run("my-spaces.focus"));
  }

  // A hidden panel's mod takes no commands: show it, then ask it for the keyboard until it has started.
  focusPanel(panel, cx) {
    this.setOpen(panel.id, true);
    cx.notify();
    for (const ms of [0, 120, 300]) cx.timer.after(ms, () => run(`${panel.mod}.focus`));
  }

  // The panels open in the shown space, remembered per space (none until it has had one).
  opened() {
    return this.panels[this.space] ?? [];
  }

  setOpen(id, open) {
    if (!this.space) return;
    const now = this.opened();
    this.panels[this.space] = PANELS.map(p => p.id).filter(x => x === id ? open : now.includes(x));
    localStorage.setItem("panels", JSON.stringify(this.panels));
  }

  // Each open panel's block shows on its side, the others hide; a side with none open hides.
  // Runs on every render (layout and shared changes cause one), so it only sends what differs.
  applyPanels(root, enabled) {
    const open = this.opened().filter(id => enabled.includes(id));
    for (const side of ["left", "right"]) {
      const column = find(root, `panel-${side}`);
      if (!column) continue;
      let any = false;
      for (const p of PANELS) {
        const want = open.includes(p.id) && sideOf(p.id) === side, node = find(column, `${p.id}-${side}`);
        any ||= want;
        if (node && Boolean(node.hidden) === want) run(want ? "layout.show" : "layout.hide", { id: node.id });
      }
      if (Boolean(column.hidden) === any) run(any ? "layout.show" : "layout.hide", { id: column.id });
    }
  }

  // Pins whose space closed (pins.js orphans): the pinned view's "pinned-orphans" block follows
  // their count (a rewrite when it's off), and new ones get a notice and the pinned view shown.
  // Those already there when this copy starts are only listed.
  watchOrphans(root) {
    if (!find(root, "pinned")) return;
    const lost = orphans().map(x => x.terminal), node = find(root, "pinned-orphans");
    const off = !node || Boolean(node.hidden) !== !lost.length || node.size?.px !== orphansHeight(lost.length);
    // Once per count: the rewrite lands after this render.
    if (off && this.synced !== lost.length) { this.synced = lost.length; syncPinned(); }
    else if (!off) this.synced = lost.length;
    const fresh = this.lost ? lost.filter(x => !this.lost.includes(x)) : [];
    this.lost = lost;
    if (!fresh.length) return;
    notify({ title: `${fresh.length} pinned terminal${fresh.length > 1 ? "s" : ""} lost ${fresh.length > 1 ? "their" : "its"} space`, body: "They're listed in the pinned view.", level: "warning" });
    showPinned();
  }

  render() {
    const t = theme();
    const root = layout();
    const enabled = shared("workspace.panels") ?? ["files", "changes"];
    const space = spaces().find(s => s.active);
    // The tab pane last used, for going right from the pinned view, and the pinned pane last used
    // (shared "pinned.last"), for coming into it (my-pinned-panes).
    const f = focused();
    this.remember(f);
    if (f?.pane) this.lastPane = f.pane;
    else if (f?.terminal && f.terminal !== shared("pinned.last") && visible().some(x => x.terminal === f.terminal)) setShared("pinned.last", f.terminal);
    this.space = space?.id;
    this.applyPanels(root, enabled);
    reveal();
    regroup();
    this.watchOrphans(root);
    // A worktree space shares its main checkout's pinned view: the view changes with the group.
    if (space && groupOf(space.id) !== this.pinnedSpace) { this.pinnedSpace = groupOf(space.id); applyView(space.id); }
    const button = (p) => {
      const on = this.opened().includes(p.id);
      return v_flex().id(`rail-${p.id}`).w(30).py(10).gap(8).flex_none().items_center().rounded(7)
        .bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover(s => s.bg(t.hover).text_color(t.foreground))
        .on_click((_e, cx) => { this.setOpen(p.id, !on); cx.notify(); })
        // Right-click: which side it opens on (mods/panel-side-menu).
        .on_mouse_down("right", (_e, cx) => {
          cx.stop_propagation();
          openOverlay({ mod: "panel-side-menu", props: { panel: p.id, label: p.label[0].toUpperCase() + p.label.slice(1) }, kind: "popup", width: 190, height: 112 });
        })
        .child(svg(p.icon).size(14))
        .child(svg(`mods/panel-rail/label-${p.label}.svg`).w(p.w).h(p.h));
    };
    return v_flex().size_full().pt(10).gap(6).items_center().bg(t.chrome)
      .children(PANELS.filter(p => enabled.includes(p.id)).map(button));
  }
}
