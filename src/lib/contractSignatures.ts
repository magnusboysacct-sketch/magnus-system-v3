// Contract signatures are stored as a storage PATH in private-files (never a URL), and turned into a short-lived signed URL
// every time a contract is actually viewed or printed. Nothing that expires is ever stored, so a signed contract's
// signature can't stop displaying. Older contracts still hold a permanent public URL in the same columns; those
// pass through unchanged (anything that starts with "http" is treated as a URL), so no data migration is needed.
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

export const CONTRACT_SIGNATURE_BUCKET = "private-files";
export const CONTRACT_SIGNATURE_TTL_SECONDS = 3600; // 1 hour; always re-resolved on view and right before printing

export type SignatureParty = "contractor" | "client";

export interface SignatureSrcs {
  contractor: string | null;
  client: string | null;
}

// A value that already is a (legacy) URL, as opposed to a storage path.
export function isLegacySignatureUrl(value: unknown): boolean {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

// <companyId>/contract-signatures/<contractId>_<party>_<ts>.png - the first folder must be the company id (the bucket's policies).
export function contractSignaturePath(companyId: string, contractId: string, party: SignatureParty): string {
  return `${companyId}/contract-signatures/${contractId}_${party}_${Date.now()}.png`;
}

// A legacy URL comes back unchanged. A storage path is signed with the CURRENT USER'S session (staff side; the
// private-files company policies decide whether they may). Returns null when there is nothing to show or signing fails.
export async function resolveSignatureSrc(stored: string | null | undefined): Promise<string | null> {
  if (!stored || !stored.trim()) return null;
  if (isLegacySignatureUrl(stored)) return stored;
  try {
    const { data, error } = await supabase.storage
      .from(CONTRACT_SIGNATURE_BUCKET)
      .createSignedUrl(stored, CONTRACT_SIGNATURE_TTL_SECONDS);
    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

// Staff-side resolver for both signatures of a contract row.
export async function resolveContractSignatureSrcs(contract: any): Promise<SignatureSrcs> {
  const [contractor, client] = await Promise.all([
    resolveSignatureSrc(contract?.contractor_signature_url),
    resolveSignatureSrc(contract?.client_signature_url),
  ]);
  return { contractor, client };
}

// What can be shown right away without any request: legacy URLs yes, storage paths not yet.
export function immediateSignatureSrcs(contract: any): SignatureSrcs {
  const pick = (v: any) => (isLegacySignatureUrl(v) ? String(v) : null);
  return { contractor: pick(contract?.contractor_signature_url), client: pick(contract?.client_signature_url) };
}

// Resolves a contract's signatures on view, and exposes refresh() to get FRESH URLs (used right before printing, so a
// document left open for a while never prints an expired signature). The resolver differs between staff (the user's own
// session) and the client portal (an edge function), so it is passed in.
export function useContractSignatureSrcs(
  contract: any,
  resolver: (contract: any, opts: { force: boolean }) => Promise<SignatureSrcs>,
) {
  const [srcs, setSrcs] = useState<SignatureSrcs>(() => immediateSignatureSrcs(contract));
  const resolverRef = useRef(resolver);
  resolverRef.current = resolver;
  const contractRef = useRef(contract);
  contractRef.current = contract;

  const contractor = contract?.contractor_signature_url ?? null;
  const client = contract?.client_signature_url ?? null;
  const id = contract?.id ?? null;

  const refresh = useCallback(async (): Promise<SignatureSrcs> => {
    let next: SignatureSrcs;
    try {
      next = await resolverRef.current(contractRef.current, { force: true });
    } catch {
      next = immediateSignatureSrcs(contractRef.current);
    }
    setSrcs(next);
    return next;
  }, []);

  useEffect(() => {
    let cancelled = false;
    setSrcs(immediateSignatureSrcs(contractRef.current)); // legacy URLs show immediately; paths fill in below
    (async () => {
      try {
        const next = await resolverRef.current(contractRef.current, { force: false });
        if (!cancelled) setSrcs(next);
      } catch {
        /* keep whatever was shown */
      }
    })();
    return () => { cancelled = true; };
  }, [id, contractor, client]);

  return { srcs, refresh };
}

// The staff-side resolver (always a fresh signature; `force` makes no difference because nothing is cached).
export const staffSignatureResolver = (contract: any, _opts: { force: boolean }) => resolveContractSignatureSrcs(contract);
