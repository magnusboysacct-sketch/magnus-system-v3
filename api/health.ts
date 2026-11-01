// api/health.ts — GET /api/health: public ok / warn / problem for UptimeRobot and the /status page. Logic in _lib/health.ts.
import { healthHandler } from "./_lib/health.js";
import { toNodeHandler } from "./_lib/nodeAdapter.js";

export default toNodeHandler(healthHandler);
