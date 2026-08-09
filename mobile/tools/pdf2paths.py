"""Convert the vendored pixel-icon PDFs into SVG path data.

The icons were exported by ReportLab from hackernoon/pixel-icon-library (MIT):
an 18x18pt page holding a single flate/ascii85 content stream of straight-line
subpaths on a 24x24 grid. Everything here is a plain polygon fill, so the whole
vocabulary is m / l / h / re / c and the transform stack.

The sources live in tools/pixel-icons; the output is src/ui/pixelGlyphs.ts.

    python3 tools/pdf2paths.py tools/pixel-icons > /tmp/icons.json
"""

import base64
import glob
import json
import os
import re
import sys
import zlib


def content_stream(path):
    data = open(path, "rb").read()
    out = []
    for m in re.finditer(rb"stream\r?\n(.*?)endstream", data, re.S):
        raw = m.group(1).strip()
        if raw.endswith(b"~>"):
            raw = raw[:-2]
        for decode in (
            lambda b: zlib.decompress(base64.a85decode(b)),
            zlib.decompress,
            lambda b: b,
        ):
            try:
                out.append(decode(raw).decode("latin1"))
                break
            except Exception:
                continue
    if not out:
        raise SystemExit(f"no decodable content stream in {path}")
    return "\n".join(out)


def mat_mul(a, b):
    """PDF matrices: [a b c d e f] meaning [[a b 0],[c d 0],[e f 1]]. a then b."""
    a0, a1, a2, a3, a4, a5 = a
    b0, b1, b2, b3, b4, b5 = b
    return (
        a0 * b0 + a1 * b2,
        a0 * b1 + a1 * b3,
        a2 * b0 + a3 * b2,
        a2 * b1 + a3 * b3,
        a4 * b0 + a5 * b2 + b4,
        a4 * b1 + a5 * b3 + b5,
    )


def apply(m, x, y):
    a, b, c, d, e, f = m
    return (a * x + c * y + e, b * x + d * y + f)


IDENTITY = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
SCALE = 24.0 / 18.0  # media box is 18pt; the icon grid is 24 units


def to_svg(px, py):
    """PDF device space (y up, 18pt box) -> SVG user space (y down, 24 units)."""
    return (px * SCALE, (18.0 - py) * SCALE)


def fmt(v):
    r = round(v, 3)
    if abs(r - round(r)) < 1e-9:
        return str(int(round(r)))
    return f"{r:g}"


def convert(path):
    stream = content_stream(path)
    tokens = re.findall(r"\[[^\]]*\]|\S+", stream)

    ctm = IDENTITY
    stack = []
    operands = []
    subpaths = []       # list of list of (x, y) in SVG space
    current = []
    start = None
    out = []            # finished subpath strings

    def flush_subpath():
        nonlocal current
        if len(current) > 1:
            subpaths.append(current)
        current = []

    def emit_fill():
        nonlocal subpaths, out
        flush_subpath()
        for pts in subpaths:
            parts = [f"M{fmt(pts[0][0])} {fmt(pts[0][1])}"]
            for x, y in pts[1:]:
                parts.append(f"L{fmt(x)} {fmt(y)}")
            parts.append("Z")
            out.append("".join(parts))
        subpaths = []

    def num(i):
        return float(operands[i])

    for token in tokens:
        try:
            float(token)
            operands.append(token)
            continue
        except ValueError:
            pass
        if token.startswith("[") or token.startswith("/"):
            operands = []
            continue

        op = token
        if op == "q":
            stack.append(ctm)
        elif op == "Q":
            ctm = stack.pop() if stack else IDENTITY
        elif op == "cm" and len(operands) >= 6:
            ctm = mat_mul(tuple(float(v) for v in operands[-6:]), ctm)
        elif op == "m" and len(operands) >= 2:
            flush_subpath()
            pt = to_svg(*apply(ctm, num(-2), num(-1)))
            current = [pt]
            start = pt
        elif op == "l" and len(operands) >= 2:
            current.append(to_svg(*apply(ctm, num(-2), num(-1))))
        elif op in ("c", "v", "y"):
            # No icon in this set uses curves; fall back to the endpoint so a
            # future one degrades to a polygon rather than vanishing.
            if len(operands) >= 2:
                current.append(to_svg(*apply(ctm, num(-2), num(-1))))
        elif op == "h":
            if start and current:
                current.append(start)
        elif op == "re" and len(operands) >= 4:
            flush_subpath()
            x, y, w, hgt = num(-4), num(-3), num(-2), num(-1)
            corners = [(x, y), (x + w, y), (x + w, y + hgt), (x, y + hgt), (x, y)]
            subpaths.append([to_svg(*apply(ctm, cx, cy)) for cx, cy in corners])
        elif op in ("f", "F", "f*", "b", "b*", "B", "B*"):
            emit_fill()
        elif op in ("n", "s", "S"):
            flush_subpath()
            subpaths = []
        operands = []

    emit_fill()
    return "".join(out)


def main():
    root = sys.argv[1]
    icons = {}
    for pdf in sorted(glob.glob(os.path.join(root, "**", "*.pdf"), recursive=True)):
        name = os.path.splitext(os.path.basename(pdf))[0]
        d = convert(pdf)
        if not d:
            print(f"WARNING: {name} produced no path", file=sys.stderr)
        icons[name] = d
    json.dump(icons, sys.stdout, indent=2, sort_keys=True)


if __name__ == "__main__":
    main()
