// api/share-card.ts — GET /api/share-card?k=<portal|contact|photos>&t=<token>&v=<fingerprint>  ->  1200x630 PNG for link previews.
// Draws only what the database returns for that kind + token (never a name or logo from the URL). The logic is in _lib/cardHandler.ts (shareCardHandler).
import { shareCardHandler } from "./_lib/cardHandler.js";
import { toNodeHandler } from "./_lib/nodeAdapter.js";

export default toNodeHandler(shareCardHandler);
