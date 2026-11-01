// api/og-page.ts — link previews (WhatsApp, Facebook, Google) for the public pages. Logic in _lib/ogPage.ts.
import { ogPageHandler } from "./_lib/ogPage.js";
import { toNodeHandler } from "./_lib/nodeAdapter.js";

export default toNodeHandler(ogPageHandler);
