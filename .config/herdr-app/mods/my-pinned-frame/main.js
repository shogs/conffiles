// A piece of a pinned pane's frame (see my-pinned-panes/pins.js, card): props {terminal, edge},
// "side" (a 1px strip) or "bottom" (the rounded foot). Accent while that terminal has the
// keyboard. Kept apart from my-pinned-panes, which is focusable: pane.go mustn't land on a strip.
import { View, div } from "gpui-kit";
import { props, theme, focused } from "herdr";

export default class PinnedFrame extends View {
  render() {
    const t = theme(), p = props() ?? {}, f = focused();
    const frame = f?.terminal === p.terminal && !f?.pane ? t.accent : t.border;
    if (p.edge === "side") return div().size_full().bg(frame);
    return div().size_full().rounded_b(10).border_b(1).border_x(1).border_color(frame);
  }
}
