// src/components/NetBanner.tsx — a red bar at the top while there is no internet, and a short green "Back online" after.
import { useEffect, useRef, useState } from "react";
import { getNetState, onNetChange } from "../lib/netStatus";

export default function NetBanner() {
  const [net, setNet] = useState(getNetState());
  const [back, setBack] = useState(false);
  const wasOffline = useRef(net.offline);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = onNetChange((s) => {
      if (wasOffline.current && !s.offline) { setBack(true); clearTimeout(t); t = setTimeout(() => setBack(false), 4000); }
      wasOffline.current = s.offline;
      setNet(s);
    });
    return () => { off(); clearTimeout(t); };
  }, []);
  if (net.offline) {
    return (
      <div role="alert" className="fixed inset-x-0 top-0 z-[100000] flex items-center justify-center gap-2 bg-red-600 px-4 py-2.5 text-center text-sm font-semibold text-white shadow-lg">
        📡 {net.reason === "device" ? "No internet connection." : "Can't reach the internet."} Please connect to Wi-Fi or mobile data. Nothing saves until you are back online.
      </div>
    );
  }
  if (back) {
    return (
      <div role="status" className="fixed inset-x-0 top-0 z-[100000] bg-green-600 px-4 py-2 text-center text-sm font-semibold text-white shadow-lg">
        ✅ Back online.
      </div>
    );
  }
  return null;
}
