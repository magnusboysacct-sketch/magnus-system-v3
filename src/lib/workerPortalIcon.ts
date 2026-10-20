// The company logo as a square home-screen icon (PNG data URL): the logo fitted inside a white square with a margin, so any logo shape works. null if it cannot be drawn.
type Img = CanvasImageSource & { width: number; height: number; naturalWidth?: number; naturalHeight?: number };

export function logoIconDataUrl(img: Img, size: number): string | null {
  try {
    const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
    if (!w || !h) return null;
    const canvas = document.createElement("canvas");
    canvas.width = size; canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, size, size);
    const box = size * 0.76;                       // 12% margin on every side (also keeps it inside a round / squircle mask)
    const k = Math.min(box / w, box / h);
    ctx.drawImage(img, (size - w * k) / 2, (size - h * k) / 2, w * k, h * k);
    return canvas.toDataURL("image/png");          // throws if the logo's server did not allow reading it: caught below
  } catch { return null; }
}
