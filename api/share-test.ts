// api/share-test.ts — TEMPORARY: bot-only A/B test of the link-preview image (see _lib/shareTest.ts). Remove together with the rest of the test.
import { shareTestHandler } from "./_lib/shareTest.js";
import { toNodeHandler } from "./_lib/nodeAdapter.js";

export default toNodeHandler((request) => shareTestHandler(request));
