// api/hq-system.ts — GET /api/hq-system: Magnus HQ System tab (admins with 2-step login only). Logic in _lib/hqSystem.ts.
import { hqSystemHandler } from "./_lib/hqSystem.js";
import { toNodeHandler } from "./_lib/nodeAdapter.js";

export default toNodeHandler(hqSystemHandler);
