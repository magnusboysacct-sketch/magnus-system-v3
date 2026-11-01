// api/push-dispatch.ts — sends queued notifications to phones (web push). Logic in _lib/push.ts.
import { pushDispatchHandler } from "./_lib/push.js";
import { toNodeHandler } from "./_lib/nodeAdapter.js";

export default toNodeHandler(pushDispatchHandler);
