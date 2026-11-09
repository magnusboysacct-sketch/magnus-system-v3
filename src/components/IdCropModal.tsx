// src/components/IdCropModal.tsx — frame an ID card picture "right down to the line" before it is kept: drag the box (or its
// corners and sides) tightly around the card, and only that part is saved, made small (longest side 1200 px, JPEG). Used for
// "Replace picture" / "Add the back" on workers and staff (the scanner itself has the same framing step).
import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from "react";

const ID_MAX_SIDE = 1200;
const ID_QUALITY = 0.82;

type Box = { x: number; y: number; w: number; h: number };     // percent of the shown picture

// The framed part of the picture, small: longest side ID_MAX_SIDE, JPEG.
async function cropToFile(img: HTMLImageElement, box: Box, name = "id.jpg"): Promise<File> {
  const sx = (box.x / 100) * img.naturalWidth, sy = (box.y / 100) * img.naturalHeight;
  const sw = (box.w / 100) * img.naturalWidth, sh = (box.h / 100) * img.naturalHeight;
  const scale = Math.min(1, ID_MAX_SIDE / Math.max(sw, sh));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw * scale)); c.height = Math.max(1, Math.round(sh * scale));
  c.getContext("2d")!.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Could not make the picture"))), "image/jpeg", ID_QUALITY));
  return new File([blob], name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
}

export default function IdCropModal({ file, title = "Frame the ID", onCancel, onDone }: { file: File; title?: string; onCancel: () => void; onDone: (f: File) => void }) {
  const [src] = useState(() => URL.createObjectURL(file));
  const imgRef = useRef<HTMLImageElement>(null);
  const [box, setBox] = useState<Box>({ x: 6, y: 12, w: 88, h: 76 });
  const drag = useRef<{ kind: string; px: number; py: number; start: Box } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => () => URL.revokeObjectURL(src), [src]);

  const pct = (e: RPointerEvent) => {
    const r = imgRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * 100, y: ((e.clientY - r.top) / r.height) * 100 };
  };
  function down(e: RPointerEvent, kind: string) {
    e.preventDefault(); e.stopPropagation();
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const p = pct(e); drag.current = { kind, px: p.x, py: p.y, start: box };
  }
  function move(e: RPointerEvent) {
    const d = drag.current; if (!d || !imgRef.current) return;
    const p = pct(e), dx = p.x - d.px, dy = p.y - d.py, s = d.start, MIN = 10;
    let { x, y, w, h } = s;
    if (d.kind === "move") { x = Math.max(0, Math.min(100 - w, s.x + dx)); y = Math.max(0, Math.min(100 - h, s.y + dy)); }
    if (d.kind.includes("w")) { x = Math.max(0, Math.min(s.x + s.w - MIN, s.x + dx)); w = s.w + (s.x - x); }
    if (d.kind.includes("e")) { w = Math.max(MIN, Math.min(100 - s.x, s.w + dx)); }
    if (d.kind.includes("n")) { y = Math.max(0, Math.min(s.y + s.h - MIN, s.y + dy)); h = s.h + (s.y - y); }
    if (d.kind.includes("s")) { h = Math.max(MIN, Math.min(100 - s.y, s.h + dy)); }
    setBox({ x, y, w, h });
  }
  async function done() {
    if (!imgRef.current) return;
    setBusy(true);
    try { onDone(await cropToFile(imgRef.current, box, file.name)); } finally { setBusy(false); }
  }

  const H = "absolute h-6 w-6 rounded-full border-2 border-white bg-cyan-500 touch-none";
  const handles: [string, string][] = [["nw", "-left-3 -top-3"], ["ne", "-right-3 -top-3"], ["sw", "-left-3 -bottom-3"], ["se", "-right-3 -bottom-3"],
    ["n", "left-1/2 -top-3 -translate-x-1/2"], ["s", "left-1/2 -bottom-3 -translate-x-1/2"], ["w", "-left-3 top-1/2 -translate-y-1/2"], ["e", "-right-3 top-1/2 -translate-y-1/2"]];

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black/90 p-3" onPointerMove={move} onPointerUp={() => { drag.current = null; }}>
      <div className="mb-2 text-center text-sm font-semibold text-white">{title}: drag the box tight to the edges of the card</div>
      <div className="flex flex-1 items-center justify-center overflow-hidden">
        <div className="relative inline-block select-none" style={{ touchAction: "none" }}>
          <img ref={imgRef} src={src} alt="ID" draggable={false} className="block max-h-[70vh] max-w-full" />
          <div className="pointer-events-none absolute inset-0 bg-black/55" style={{
            clipPath: `polygon(0% 0%,100% 0%,100% 100%,0% 100%,0% ${box.y}%,${box.x}% ${box.y}%,${box.x}% ${box.y + box.h}%,${box.x + box.w}% ${box.y + box.h}%,${box.x + box.w}% ${box.y}%,0% ${box.y}%)` }} />
          <div className="absolute border-2 border-cyan-400" style={{ left: `${box.x}%`, top: `${box.y}%`, width: `${box.w}%`, height: `${box.h}%`, cursor: "move", touchAction: "none" }}
            onPointerDown={(e) => down(e, "move")}>
            {handles.map(([k, c]) => <div key={k} className={`${H} ${c}`} onPointerDown={(e) => down(e, k)} />)}
          </div>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={onCancel} className="flex-1 rounded-lg border border-white/30 py-2.5 text-sm font-semibold text-white">Cancel</button>
        <button onClick={() => void done()} disabled={busy} className="flex-1 rounded-lg bg-cyan-600 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{busy ? "…" : "✓ Use this"}</button>
      </div>
    </div>
  );
}
