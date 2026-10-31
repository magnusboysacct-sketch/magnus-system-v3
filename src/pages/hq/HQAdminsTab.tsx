// src/pages/hq/HQAdminsTab.tsx — who can open Magnus HQ.
// Every admin can see the list; only the owner-admin can add or remove admins.
// The owner can't be removed (and can't remove themselves). Every change is written to the HQ audit log.

import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";
import {
  Alert, Badge, Btn, Card, CardHeader, Field, Input, Modal, Spinner, Table, Td, Textarea, Th, Tr,
} from "../../components/ui";
import { addAdmin, listAdmins, removeAdmin, type PlatformAdmin } from "../../lib/hq/platformAdmin";

function fmt(ts: string | null) {
  if (!ts) return "Never";
  return new Date(ts).toLocaleString("en-JM", { dateStyle: "medium", timeStyle: "short" });
}

export default function HQAdminsTab({ isOwner }: { isOwner: boolean }) {
  const [admins, setAdmins] = useState<PlatformAdmin[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [adding, setAdding] = useState(false);

  const [removing, setRemoving] = useState<PlatformAdmin | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [removeBusy, setRemoveBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAdmins(await listAdmins());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      setAdmins([]);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd() {
    setError(null); setNotice(null);
    if (!email.trim()) { setError("Type the email they signed in with."); return; }
    setAdding(true);
    try {
      await addAdmin(email.trim(), reason.trim());
      setNotice(`${email.trim()} is now an HQ admin. They'll set up 2-step login the first time they open HQ.`);
      setEmail(""); setReason("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove() {
    if (!removing) return;
    if (!removeReason.trim()) { setError("Write a reason for removing this admin."); return; }
    setRemoveBusy(true); setError(null); setNotice(null);
    try {
      await removeAdmin(removing.user_id, removeReason.trim());
      setNotice(`${removing.email} can no longer open HQ.`);
      setRemoving(null); setRemoveReason("");
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRemoveBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {error && <Alert type="error" onClose={() => setError(null)}>{error}</Alert>}
      {notice && <Alert type="success" onClose={() => setNotice(null)}>{notice}</Alert>}

      <Card padding={false}>
        <div className="p-4"><CardHeader title="HQ admins" subtitle="People who can open Magnus HQ. Separate from company roles." /></div>
        {admins === null ? (
          <div className="flex justify-center py-8"><Spinner /></div>
        ) : (
          <Table minWidth={560}>
            <thead>
              <tr><Th>Email</Th><Th>Role</Th><Th>Added</Th><Th>Last sign-in</Th><Th right> </Th></tr>
            </thead>
            <tbody>
              {admins.map((a) => (
                <Tr key={a.user_id}>
                  <Td>{a.email}</Td>
                  <Td>{a.is_owner ? <Badge color="violet">Owner</Badge> : <Badge color="slate">Admin</Badge>}</Td>
                  <Td muted>{fmt(a.added_at)}{a.added_by_email && !a.is_owner ? ` by ${a.added_by_email}` : ""}</Td>
                  <Td muted>{fmt(a.last_sign_in_at)}</Td>
                  <Td right>
                    {isOwner && !a.is_owner && (
                      <Btn variant="danger" size="xs" onClick={() => { setRemoving(a); setRemoveReason(""); }}>Remove</Btn>
                    )}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {isOwner ? (
        <Card>
          <CardHeader title="Add an admin" subtitle="They must sign in to Magnus once first. Use the exact email they signed in with." />
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Email">
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" autoComplete="off" />
            </Field>
            <Field label="Reason (optional)">
              <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. helps with support" />
            </Field>
          </div>
          <div className="mt-3">
            <Btn variant="primary" icon={<UserPlus size={13} />} onClick={handleAdd} disabled={adding}>
              {adding ? "Adding..." : "Add admin"}
            </Btn>
          </div>
        </Card>
      ) : (
        <Alert type="info">Only the owner-admin can add or remove HQ admins.</Alert>
      )}

      <Modal open={!!removing} onClose={() => setRemoving(null)} title="Remove HQ admin" subtitle={removing?.email}>
        <div className="space-y-3">
          <p className="text-xs text-slate-600 dark:text-slate-400">
            They will lose access to Magnus HQ straight away. Their normal company login is not affected.
          </p>
          <Field label="Reason">
            <Textarea rows={3} value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} placeholder="Why are you removing this admin?" />
          </Field>
          <div className="flex justify-end gap-2">
            <Btn onClick={() => setRemoving(null)}>Cancel</Btn>
            <Btn variant="danger" onClick={handleRemove} disabled={removeBusy || !removeReason.trim()}>
              {removeBusy ? "Removing..." : "Remove admin"}
            </Btn>
          </div>
        </div>
      </Modal>
    </div>
  );
}
