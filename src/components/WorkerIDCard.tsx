// src/components/WorkerIDCard.tsx — the worker (site) ID card. The drawing, printing and print-shop downloads are shared with the staff card: see IdCardModal.tsx,
// lib/idCardRender.ts (one renderer for screen, print, PDF and PNG) and lib/idCardData.ts (what is loaded).
import React from "react";
import IdCardModal from "./IdCardModal";

interface Props {
  workerId: string;
  companyName?: string;
  onClose: () => void;
}

export function WorkerIDCard({ workerId, companyName, onClose }: Props) {
  return <IdCardModal kind="worker" id={workerId} companyName={companyName} onClose={onClose} />;
}

export default WorkerIDCard;
