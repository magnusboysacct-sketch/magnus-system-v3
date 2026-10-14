// src/lib/printHtml.ts
//
// Print a complete HTML document through a hidden iframe: no pop-up window at all, so a pop-up blocker can never swallow it (a window.open()
// made after an `await` has lost the click's user activation, and browsers silently block it).
//   - waits for the document's images (the company logo) to finish loading or fail before printing; if that takes longer than ~3 seconds it
//     prints anyway, so a broken or slow logo URL never blocks printing
//   - print() is called once
//   - the iframe is removed after printing (afterprint), with a timeout as a fallback for browsers that do not fire it
// Resolves once the print dialog has been requested; rejects (so the caller can tell the user) if the document could not be prepared.

export interface PrintHtmlOptions {
  // How long to wait for images before printing anyway. Default 3000 ms.
  imageWaitMs?: number;
  // Remove the iframe after this long even if no afterprint event arrived. Default 60000 ms.
  cleanupMs?: number;
  // The print call itself (a seam for tests); default is window.print() on the iframe's window.
  print?: (w: Window) => void;
}

export function printHtmlDocument(html: string, options: PrintHtmlOptions = {}): Promise<void> {
  const { imageWaitMs = 3000, cleanupMs = 60000, print = (w: Window) => w.print() } = options;

  return new Promise<void>((resolve, reject) => {
    if (typeof document === "undefined") { reject(new Error("Printing is not available here.")); return; }

    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.tabIndex = -1;
    // Off-screen but with a real page size: some browsers print a zero-sized or display:none frame as a blank page.
    iframe.style.cssText = "position:fixed;left:-10000px;top:0;width:794px;height:1123px;border:0;opacity:0;pointer-events:none;";

    let started = false;
    let removed = false;
    const cleanup = () => {
      if (removed) return;
      removed = true;
      clearTimeout(waitTimer);
      iframe.remove();
    };

    const start = () => {
      if (started) return;
      started = true;
      clearTimeout(waitTimer);
      const w = iframe.contentWindow;
      if (!w) { cleanup(); reject(new Error("Could not open the print preview.")); return; }
      const afterPrint = () => {
        w.removeEventListener("afterprint", afterPrint);
        window.removeEventListener("afterprint", afterPrint);
        setTimeout(cleanup, 300);
      };
      w.addEventListener("afterprint", afterPrint);
      window.addEventListener("afterprint", afterPrint);
      setTimeout(cleanup, cleanupMs);
      try {
        w.focus();
        print(w);
        resolve();
      } catch (e) {
        cleanup();
        reject(e instanceof Error ? e : new Error("Could not print."));
      }
    };

    // The iframe's load event fires once the document and all its images have loaded or failed.
    iframe.addEventListener("load", () => setTimeout(start, 50));
    const waitTimer = setTimeout(start, imageWaitMs);

    try {
      iframe.srcdoc = html;
      document.body.appendChild(iframe);
    } catch (e) {
      cleanup();
      reject(e instanceof Error ? e : new Error("Could not prepare the document to print."));
    }
  });
}
