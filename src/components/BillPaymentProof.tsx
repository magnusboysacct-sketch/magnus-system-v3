// src/components/BillPaymentProof.tsx — Banking Step 4b-2: proof that a contractor / supplier got the money.
// ProofFields: name + signature on the phone + an optional photo (signed paper receipt, the person / their ID, or a
// transfer screenshot). AddProofModal: add the proof later to a payment saved as "Not signed yet".

import { useEffect, useState } from "react";
import { Camera } from "lucide-react";
import { Modal, Field, Input, Btn } from "./ui";
import { SignBox } from "./SignBox";
import { addBillPaymentProof, emptyProof, uploadBillProof, type ProofValue } from "../lib/bills";


export function ProofFields({ value, onChange, cash, showSign = true, showPhoto = true }: {
  value: ProofValue;
  onChange: (v: ProofValue) => void;
  cash: boolean;
  showSign?: boolean;
  showPhoto?: boolean;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 dark:border-white/[0.07] px-3 py-2.5">
      <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
        Proof of payment {cash ? "(cash: get it signed)" : "(optional)"}
      </div>
      {showSign && (
        <>
          <Field label="Name of the person who received it">
            <Input value={value.receivedBy} placeholder="Full name" onChange={(e) => onChange({ ...value, receivedBy: e.target.value })} />
          </Field>
          <SignBox onSign={(d) => onChange({ ...value, signature: d })} onClear={() => onChange({ ...value, signature: null })} />
        </>
      )}
      {showPhoto && (
        <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer">
          <Camera size={14} className="flex-shrink-0" />
          <span className="flex-1 min-w-0 truncate">
            {value.photo ? value.photo.name : cash ? "Photo of a signed paper receipt or of the person (optional)" : "Photo or screenshot of the transfer (optional)"}
          </span>
          <input type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => onChange({ ...value, photo: e.target.files?.[0] ?? null })} />
          <span className="text-cyan-600 dark:text-cyan-400 font-semibold">{value.photo ? "Change" : "Add photo"}</span>
        </label>
      )}
    </div>
  );
}

export function AddProofModal({ open, onClose, payment, companyId, defaultName, onDone }: {
  open: boolean;
  onClose: () => void;
  payment: { id: string; amount: number; signed: boolean; hasPhoto: boolean } | null;
  companyId: string | null;
  defaultName: string;
  onDone: (message: string) => void;
}) {
  const [proof, setProof] = useState<ProofValue>(emptyProof());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setProof(emptyProof(defaultName)); setError(null); } }, [open, defaultName]);

  async function save() {
    if (saving || !payment || !companyId) return;
    setError(null);
    if (!proof.signature && !proof.photo) { setError("Get a signature or add a photo."); return; }
    if (proof.signature && !proof.receivedBy.trim()) { setError("Type the name of the person who signed."); return; }
    setSaving(true);
    try {
      const path = proof.photo ? await uploadBillProof(companyId, proof.photo) : null;
      await addBillPaymentProof(payment.id, proof.receivedBy, proof.signature, path);
      onDone(proof.signature ? `Signed by ${proof.receivedBy.trim()}.` : "Proof photo added.");
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "The proof was not saved.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={() => { if (!saving) onClose(); }} title="Add proof of payment"
      subtitle="The person who got the money signs here, or add a photo of a signed receipt.">
      <div className="space-y-3">
        {error && <div className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{error}</div>}
        <ProofFields value={proof} onChange={setProof} cash showSign={!payment?.signed} showPhoto={!payment?.hasPhoto} />
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" size="sm" onClick={onClose} disabled={saving}>Cancel</Btn>
          <Btn variant="primary" size="sm" onClick={() => { void save(); }} disabled={saving}>{saving ? "Saving..." : "Save proof"}</Btn>
        </div>
      </div>
    </Modal>
  );
}
