// The office drawn at a zoom: div() and svg() as gpui-kit's, except that every px they're
// given (positions, sizes, text, corners, padding, and top/left/width/height loops) is
// multiplied by the zoom. The scene lays itself out at full size; the box shows it shrunk.
import { div as plainDiv, svg as plainSvg } from "gpui-kit";

let K = 1;
export const setZoom = (k) => { K = k; };

const PX = new Set(["left", "top", "right", "bottom", "w", "h", "size", "text_size", "rounded",
  "p", "px", "py", "pt", "pb", "pl", "pr", "gap", "max_w", "max_h", "min_w", "min_h"]);
const MOVES = new Set(["left", "top", "width", "height"]);

function zoomed(el) {
  const self = new Proxy(el, {
    get(target, name) {
      const value = target[name];
      if (typeof value !== "function") return value;
      return (...args) => {
        if (PX.has(name)) args = args.map((a) => (typeof a === "number" ? a * K : a));
        else if (name === "loop" && MOVES.has(args[0])) args = [args[0], { ...args[1], from: args[1].from * K, to: args[1].to * K }];
        // .when(cond, el => …) and the like hand back the element: hand back the zoomed one.
        else args = args.map((a) => (typeof a === "function" ? (x, ...rest) => a(x === target ? self : x, ...rest) : a));
        const result = value.apply(target, args);
        return result === target ? self : result;
      };
    },
  });
  return self;
}

export const div = () => zoomed(plainDiv());
export const svg = (path) => zoomed(plainSvg(path));
