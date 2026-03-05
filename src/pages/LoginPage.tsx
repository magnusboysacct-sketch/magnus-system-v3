import React, { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";

type CompanySettings = {
  company_name: string | null;
  logo_url: string | null;
};

export default function LoginPage() {
  const nav = useNavigate();
  const loc = useLocation();

  const [company, setCompany] = useState<CompanySettings>({
    company_name: "Magnus Boys Construction",
    logo_url: null,
  });

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    async function loadBranding() {
      try {
        const { data } = await supabase
          .from("company_settings")
          .select("company_name,logo_url")
          .single();

        if (!alive) return;

        if (data) {
          setCompany({
            company_name: data.company_name || "Magnus Boys Construction",
            logo_url: data.logo_url || null,
          });
        }
      } catch {
        // ignore - branding optional
      }
    }

    loadBranding();
    return () => {
      alive = false;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setBusy(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      console.log("signInWithPassword result:", {
        ok: !!data?.session,
        error: error ? { message: error.message, status: (error as any).status } : null
      });

      if (error) {
        setErr(error.message);
        return;
      }

      const next = new URLSearchParams(loc.search).get("next") || "/";
      nav(next, { replace: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0b1220] text-white">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-white/5 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-3">
            {company.logo_url ? (
              <img
                src={company.logo_url}
                alt="Company logo"
                className="w-12 h-12 rounded-lg object-cover border border-white/10 bg-white/10"
              />
            ) : (
              <div className="w-12 h-12 rounded-lg border border-white/10 bg-white/10 flex items-center justify-center text-xs opacity-70">
                LOGO
              </div>
            )}

            <div>
              <div className="text-lg font-semibold">
                {company.company_name || "Magnus Boys Construction"}
              </div>
              <div className="text-xs opacity-70">Sign in to continue</div>
            </div>
          </div>
        </div>

        <form className="p-6 space-y-4" onSubmit={onSubmit}>
          <div>
            <div className="text-xs opacity-70 mb-1">Email</div>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>

          <div>
            <div className="text-xs opacity-70 mb-1">Password</div>
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              className="w-full bg-white/5 border border-white/10 rounded-md px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-white/20"
              placeholder="••••••••"
              autoComplete="current-password"
            />
          </div>

          {err && (
            <div className="text-sm text-red-300 bg-red-900/20 border border-red-500/20 rounded-md px-3 py-2">
              {err}
            </div>
          )}

          <button
            type="submit"
            disabled={busy || !email.trim() || !password}
            className="w-full bg-white/10 hover:bg-white/15 border border-white/10 rounded-md px-4 py-2 text-sm transition disabled:opacity-50"
          >
            {busy ? "Signing in..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
