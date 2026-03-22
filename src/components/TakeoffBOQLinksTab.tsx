import React from "react";
import { Link2 } from "lucide-react";

export function TakeoffBOQLinksTab() {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <Link2 className="mb-4 h-12 w-12 text-slate-300" />
      <div className="text-lg font-semibold text-slate-900">BOQ Links</div>
      <div className="mt-2 max-w-md text-sm text-slate-500">
        Link takeoff measurements to Bill of Quantities items for seamless quantity tracking and cost estimation.
      </div>
      <div className="mt-4 text-xs text-slate-400">Coming soon</div>
    </div>
  );
}
