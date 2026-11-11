import { View, div } from "gpui-kit";
import { props, panes, focused, run, closeOverlay } from "herdr";

// Opened by a key (mod.open), focuses the next pane of the shown tab (wrapping), then closes.
export default class PaneStep extends View {
  init() {
    const { overlay } = props() ?? {};
    if (overlay) closeOverlay(overlay);
    const f = focused();
    if (!f) return;
    const list = panes().filter((p) => p.tab === f.tab);
    if (list.length < 2) return;
    const i = list.findIndex((p) => p.focused);
    const next = list[(Math.max(i, 0) + (1) + list.length) % list.length];
    run("pane.focus", { pane: next.pane });
  }

  render() {
    return div();
  }
}
