// Move a terminal pane to another tab of its space. Opened from the pane
// header's move button with props { pane, terminal }, or with mod.open for
// the focused pane. Type to filter, ↑/↓ and Enter to move, Esc to leave. The
// pane is parked (its terminal keeps running) and kept again beside a pane of
// the chosen tab; a tab left with no panes closes by itself. The dialog stays
// until the pane has arrived; if it hasn't, the terminal gets a tab of its own.

import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, ScrollHandle } from "gpui-base";
import { panes, spaces, run, theme, props, closeOverlay, focused } from "herdr";

export default class MovePane extends View {
  init(_props, cx) {
    this.filter = "";
    this.at = 0;
    this.scroll = ScrollHandle.new();
    this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Move to a tab…" });
    this.input.on("change", (_e, cx) => {
      this.filter = this.input.value();
      this.at = 0;
      cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.move(this.rows()[this.at], cx));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
  }

  close() {
    closeOverlay(props().overlay);
  }

  source() {
    // Opened without a pane (mod.open from a key): the focused one, fixed at first look.
    this.pane ??= props()?.pane ?? focused()?.pane;
    const p = panes().find((x) => x.pane === this.pane);
    const space = p && spaces().find((s) => s.tabs.some((t) => t.id === p.tab));
    return { p, space };
  }

  rows() {
    const { p, space } = this.source();
    if (!p || !space) return [];
    const f = this.filter.toLowerCase();
    const out = space.tabs
      .filter((t) => t.id !== p.tab)
      .filter((t) => !f || t.name.toLowerCase().includes(f) || String(t.index).includes(f))
      .map((tab) => ({ kind: "tab", tab }));
    if (!f || "new tab".includes(f)) out.push({ kind: "new" });
    return out;
  }

  move(r, cx) {
    if (!r || this.moving) return;
    const { p } = this.source();
    if (!p?.terminal) return this.close();
    const terminal = p.terminal;
    this.moving = terminal;
    cx.notify();
    const tab = r.kind === "tab" ? r.tab.id : null;
    const hasPane = () => panes().some((x) => x.terminal === terminal);
    // Parking the source tab's last pane closes that tab.
    run("terminal.park", { terminal });
    cx.spawn(async (cx) => {
      // The park lands a moment later, and keep refuses a terminal that
      // still has its pane: wait for it to go first.
      for (let i = 0; i < 40 && hasPane(); i++) await cx.sleep(50);
      if (!tab) run("terminal.keep", { terminal, place: "tab" });
      else {
        run("tab.select", { id: tab });
        // keep places beside the focused pane, and refuses while a layout
        // terminal block (a pinned pane) has focus: focus one of the tab's own.
        const beside = panes().find((x) => x.tab === tab);
        if (beside) run("pane.focus", { pane: beside.pane });
        run("terminal.keep", { terminal, place: "right" });
      }
      const arrived = () => panes().some((x) => x.terminal === terminal && (!tab || x.tab === tab));
      for (let i = 0; i < 20 && !arrived(); i++) await cx.sleep(100);
      // Never leave the terminal running without a pane.
      if (!panes().some((x) => x.terminal === terminal)) run("terminal.keep", { terminal, place: "tab" });
      this.close();
    });
  }

  glyph(t, st) {
    if (st === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900);
    return div().w(12).flex_none().text_color(t[st] ?? t.dim).child(st === "idle" ? "○" : st ? "●" : "·");
  }

  render() {
    const t = theme();
    const { p, space } = this.source();
    // The source pane is gone once parked: say so until the move settles.
    if (this.moving) {
      return div().id("move-pane").w_full().p(18).bg(t.popover).text_size(13).text_color(t.dim).child("Moving pane…");
    }
    const rows = this.rows();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    const sel = rows[this.at];
    const name = p ? ((p.program?.agent || p.program?.shell) && p.program.name) || p.title || p.program?.name || "shell" : "";

    const row = (r, i) => {
      const on = r === sel;
      const base = h_flex()
        .id(r.kind === "new" ? "mp-new" : `mp-${r.tab.id}`)
        .mx(4)
        .px(10)
        .h(32)
        .flex_none()
        .rounded(7)
        .gap(10)
        .items_center()
        .cursor_pointer()
        .when(on, (el) => el.bg(t.hover))
        .hover((s) => s.bg(t.hover))
        .on_click((_e, cx) => this.move(r, cx));
      if (r.kind === "new") {
        return base.text_color(t.muted).child(div().w(12).child("+")).child("new tab");
      }
      const n = r.tab.panes;
      return base
        .child(this.glyph(t, r.tab.status))
        // An unnamed tab's name already is its number.
        .child(div().w(18).flex_none().text_size(11).text_color(t.dim).child(r.tab.named ? String(r.tab.index) : ""))
        .child(div().flex_1().truncate().text_color(t.foreground).when(r.tab.active, (d) => d.font_semibold()).child(r.tab.name))
        .when(r.tab.settled, (el) => el.child(div().text_size(11).text_color(t.dim).child("settled")))
        .child(div().text_size(11).text_color(t.dim).child(`${n} pane${n === 1 ? "" : "s"}`));
    };

    return v_flex()
      .id("move-pane")
      .track_focus(this.handle)
      .w_full()
      .min_h(0)
      .p(18)
      .gap(10)
      .bg(t.popover)
      .text_size(13)
      .on_key_down((e, cx) => {
        const k = e.key;
        if (k === "escape") return this.close();
        if (!rows.length) return;
        if (k === "down") this.at = (this.at + 1) % rows.length;
        else if (k === "up") this.at = (this.at + rows.length - 1) % rows.length;
        else return;
        this.scroll.scroll_to_item(this.at);
        cx.stop_propagation();
        cx.notify();
      })
      .child(
        h_flex()
          .items_center()
          .gap(8)
          .child(div().flex_none().text_size(15).font_semibold().text_color(t.foreground).child("Move pane…"))
          .child(div().flex_1().truncate().text_color(t.dim).child(space ? `${name} · ${space.name}` : ""))
          .child(div().id("mp-esc").px(6).py(2).rounded(5).text_size(11).text_color(t.dim).cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(() => this.close()).child("Esc")),
      )
      .child(
        h_flex().h(36).flex_none().px(10).gap(8).items_center().rounded(9).border_1().border_color(t.accent).bg(t.background)
          .child(svg("mods/workspace-chrome/search.svg").size(15).text_color(t.dim))
          .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground)),
      )
      .child(
        rows.length
          ? // A scroll area in a content-sized popup collapses: give it its rows' height.
            v_flex().id("mp-list").h(Math.min(320, rows.length * 32)).flex_none().mb(6).overflow_y_scrollbar().track_scroll(this.scroll).children(rows.map(row))
          : div().px(14).py(8).mb(6).text_color(t.dim).child(p ? "No other tabs in this space." : "This pane is gone."),
      );
  }
}
