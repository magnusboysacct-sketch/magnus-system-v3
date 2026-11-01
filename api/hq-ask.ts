// api/hq-ask.ts — POST /api/hq-ask: "Ask HQ" chat for platform admins with 2-step login. Logic in _lib/hqAsk.ts.
import { hqAskHandler } from "./_lib/hqAsk.js";
import { toNodeHandler } from "./_lib/nodeAdapter.js";

export const config = { maxDuration: 60 };

export default toNodeHandler(hqAskHandler);
