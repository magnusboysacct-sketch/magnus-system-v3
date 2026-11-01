// api/push-config.ts — the public VAPID key for turning on phone alerts. Logic in _lib/push.ts.
import { pushConfigHandler } from "./_lib/push.js";
import { toNodeHandler } from "./_lib/nodeAdapter.js";

export default toNodeHandler(pushConfigHandler);
