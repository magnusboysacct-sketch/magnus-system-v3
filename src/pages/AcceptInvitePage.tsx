import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type InviteMeta = {
  company_id?: string;
  invited_role?: string;
  invited_by?: string;
  invitation_id?: string;
};

export default function AcceptInvitePage() {
  const nav = useNavigate();

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [msg, setMsg] = useState<string>("");
  const [err, setErr] = useState<string>("");

  const hashParams = useMemo(() => {
    const hash = window.location.hash.startsWith("#")
      ? window.location.hash.substring(1)
      : window.location.hash;
    return new URLSearchParams(hash);
  }, []);

  useEffect(() => {
    let mounted = true;

    async function boot() {
      setLoading(true);
      setErr("");
      setMsg("");

      try {
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const type = hashParams.get("type");

        if (type !== "invite") {
          setErr("This invite link is invalid or expired.");
          return;
        }

        if (!accessToken || !refreshToken) {
          setErr("Invite tokens are missing from the link.");
          return;
        }

        const { data, error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          setErr(error.message || "Failed to open invite session.");
          return;
        }

        const invitedEmail = data.session?.user?.email || "";
        if (mounted) {
          setEmail(invitedEmail);
          setSessionReady(true);
          setMsg("Invite verified. Set your password to continue.");
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    boot();

    return () => {
      mounted = false;
    };
  }, [hashParams]);

  async function finishInvite(e: React.FormEvent) {
    e.preventDefault();

    setErr("");
    setMsg("");

    if (!sessionReady) {
      setErr("Invite session is not ready.");
      return;
    }

    if (!password || password.length < 6) {
      setErr("Password must be at least 6 characters.");
      return;
    }

    if (password !== confirmPassword) {
      setErr("Passwords do not match.");
      return;
    }

    setBusy(true);

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        setErr("Could not load invited user.");
        return;
      }

      const meta = (user.user_metadata || {}) as InviteMeta;
      const companyId = meta.company_id || null;
      const invitedRole = (meta.invited_role || "estimator") as string;
      const invitationId = meta.invitation_id || null;

      const { error: pwError } = await supabase.auth.updateUser({
        password,
      });

      if (pwError) {
        setErr(pwError.message || "Failed to set password.");
        return;
      }

      if (!companyId) {
        setErr("Invite is missing company information.");
        return;
      }

      const profilePayload = {
        id: user.id,
        email: user.email || email,
        full_name:
          (user.user_metadata?.full_name as string | undefined) ||
          (user.email ? user.email.split("@")[0] : null),
        role: invitedRole,
        status: "active",
        company_id: companyId,
        updated_at: new Date().toISOString(),
      };

      const { error: profileError } = await supabase
        .from("user_profiles")
        .upsert(profilePayload, { onConflict: "id" });

      if (profileError) {
        setErr(profileError.message || "Failed to attach user to company.");
        return;
      }

      if (invitationId) {
        await supabase
          .from("company_invitations")
          .update({
            status: "accepted",
            accepted_at: new Date().toISOString(),
            accepted_by: user.id,
            updated_at: new Date().toISOString(),
          })
          .eq("id", invitationId);
      }

      setMsg("Invite accepted successfully. Redirecting...");

      window.history.replaceState({}, document.title, "/accept-invite");

      setTimeout(() => {
        nav("/", { replace: true });
      }, 1200);
    } catch (e: any) {
      console.error("Accept invite failed:", e);
      setErr(e?.message || "Failed to accept invite.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0b1220] text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <div className="text-lg font-semibold">Accept Invite</div>
          <div className="text-xs opacity-70 mt-1">
            Finish setting up your account to join the company.
          </div>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="text-sm opacity-70">Verifying invite...</div>
          ) : (
            <form className="space-y-4" onSubmit={finishInvite}>
              <div>
                <div className="text-xs opacity-70 mb-1">Email</div>
                <input
                  value={email}
                  disabled
                  className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm opacity-70"
                />
              </div>

              <div>
                <div className="text-xs opacity-70 mb-1">New Password</div>
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  type="password"
                  className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                  placeholder="Enter password"
                  autoComplete="new-password"
                />
              </div>

              <div>
                <div className="text-xs opacity-70 mb-1">Confirm Password</div>
                <input
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  type="password"
                  className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
                  placeholder="Confirm password"
                  autoComplete="new-password"
                />
              </div>

              {msg && (
                <div className="text-sm text-green-300 bg-green-900/20 border border-green-500/20 rounded-md px-3 py-2">
                  {msg}
                </div>
              )}

              {err && (
                <div className="text-sm text-red-300 bg-red-900/20 border border-red-500/20 rounded-md px-3 py-2">
                  {err}
                </div>
              )}

              <button
                type="submit"
                disabled={busy || loading || !sessionReady}
                className="w-full bg-white/10 hover:bg-white/15 border border-white/10 rounded-md px-4 py-2 text-sm transition disabled:opacity-50"
              >
                {busy ? "Finishing..." : "Accept Invite"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}