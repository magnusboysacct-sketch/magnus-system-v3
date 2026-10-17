// src/components/StaffIDCard.tsx — the staff ID card (user_profiles). Separate from WorkerIDCard (the workers table) because the two cover different id spaces,
// but they share one design and one renderer: see IdCardModal.tsx, lib/idCardRender.ts and lib/idCardData.ts. The TRN is not on the card; the employee number is.
import React from "react";
import IdCardModal from "./IdCardModal";

interface Props {
  userId: string;
  onClose: () => void;
}

export function StaffIDCard({ userId, onClose }: Props) {
  return <IdCardModal kind="staff" id={userId} onClose={onClose} />;
}

export default StaffIDCard;
