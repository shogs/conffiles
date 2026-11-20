// The right-click menu on a panel-rail button: which side that panel opens on (left of the tabs or
// right). Choosing one saves it (shared "panels.side") and opens the panel there.
// props: { panel: "files", label: "Files", overlay }.
import { View, div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { props, theme, shared, setShared, run, closeOverlay } from "herdr";

const SIDES = [["left", "Open on the left"], ["right", "Open on the right"]];

export default class PanelSideMenu extends View {
  choose(side) {
    const { panel, overlay } = props() ?? {};
    setShared("panels.side", { ...shared("panels.side"), [panel]: side });
    run(`panel-rail.open-${panel}`);
    closeOverlay(overlay);
  }

  render() {
    const t = theme(), { panel, label } = props() ?? {};
    const current = shared("panels.side")?.[panel] === "left" ? "left" : "right";
    return v_flex().id("panel-side-menu").w_full().p(5).bg(t.popover).text_size(12.8)
      .child(div().px(8).pt(4).pb(5).text_size(11).text_color(t.dim).child(label ?? panel ?? ""))
      .children(SIDES.map(([side, text]) =>
        h_flex().id(`side-${side}`).h(31).px(8).gap(9).rounded(7).items_center().text_color(t.foreground)
          .hover((s) => s.bg(t.hover))
          .on_click(() => this.choose(side))
          .child(div().w(12).flex_none().text_color(t.accent).child(side === current ? "✓" : ""))
          .child(div().flex_1().child(text))));
  }
}
