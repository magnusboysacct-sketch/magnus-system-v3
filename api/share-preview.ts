// api/share-preview.ts — what link-preview bots (WhatsApp, Facebook, ...) get for /portal/<token>, /portal/contact/<token> and /shared/<token>.
// vercel.json routes those URLs here only for those bots' user agents. The logic is in _lib/previewHandler.ts (sharePreviewHandler).
import { sharePreviewHandler } from "./_lib/previewHandler.js";
import { toNodeHandler } from "./_lib/nodeAdapter.js";

export default toNodeHandler(sharePreviewHandler);
