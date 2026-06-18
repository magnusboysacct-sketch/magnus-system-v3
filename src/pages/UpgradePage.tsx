// src/pages/UpgradePage.tsx
// Paywall screen shown when trial expires and no active subscription
// Manual activation for now — Stripe integration ready for future

import React from "react";
import { supabase } from "../lib/supabase";
import { Shield, CheckCircle2, Zap, Phone, Mail, ArrowRight, Clock } from "lucide-react";

const FEATURES = [
  "Unlimited projects & milestones",
  "AI Estimating Intelligence Engine",
  "Client portal with digital contract signing",
  "Field payments & worker management",
  "Full financial reporting & journal entries",
  "BOQ, takeoff & assemblies",
  "Procurement & purchase orders",
  "Payroll management",
  "Document watermarking",
  "Priority support",
];

const PLANS = [
  {
    name: "Starter",
    price: "JMD 15,000",
    period: "/month",
    description: "Perfect for small contractors",
    features: ["Up to 5 active projects", "2 user accounts", "All core features"],
    color: "border-cyan-500/30 bg-cyan-500/5",
    btnColor: "bg-cyan-600 hover:bg-cyan-500",
    badge: null,
  },
  {
    name: "Professional",
    price: "JMD 35,000",
    period: "/month",
    description: "For growing construction companies",
    features: ["Unlimited projects", "10 user accounts", "All features + AI tools", "Priority support"],
    color: "border-emerald-500/40 bg-emerald-500/5",
    btnColor: "bg-emerald-600 hover:bg-emerald-500",
    badge: "Most Popular",
  },
  {
    name: "Enterprise",
    price: "Custom",
    period: "",
    description: "For large operations",
    features: ["Unlimited everything", "Unlimited users", "Custom integrations", "Dedicated support"],
    color: "border-purple-500/30 bg-purple-500/5",
    btnColor: "bg-purple-600 hover:bg-purple-500",
    badge: null,
  },
];

export default function UpgradePage() {
  async function handleSignOut() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <div className="min-h-screen bg-[#080b10] text-white">
      {/* Header */}
      <div className="border-b border-white/[0.06] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center">
            <Shield size={15} className="text-cyan-400"/>
          </div>
          <span className="text-sm font-bold text-slate-200">Magnus Boys Construction ERP</span>
        </div>
        <button onClick={handleSignOut}
          className="text-xs text-slate-600 hover:text-slate-400 transition">
          Sign Out
        </button>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold mb-6">
            <Clock size={12}/> Your free trial has ended
          </div>
          <h1 className="text-4xl font-black text-slate-100 mb-4">
            Upgrade to Continue Building
          </h1>
          <p className="text-slate-500 text-lg max-w-xl mx-auto leading-relaxed">
            Your 14-day free trial has expired. Choose a plan to keep access to all your projects, data, and team.
          </p>
        </div>

        {/* Plans */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          {PLANS.map(plan => (
            <div key={plan.name} className={`rounded-2xl border p-6 relative ${plan.color}`}>
              {plan.badge && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-emerald-600 text-white text-[10px] font-bold">
                  {plan.badge}
                </div>
              )}
              <div className="mb-4">
                <div className="text-sm font-bold text-slate-300 mb-1">{plan.name}</div>
                <div className="text-3xl font-black text-slate-100">{plan.price}<span className="text-sm font-normal text-slate-500">{plan.period}</span></div>
                <div className="text-xs text-slate-600 mt-1">{plan.description}</div>
              </div>
              <div className="space-y-2 mb-6">
                {plan.features.map(f => (
                  <div key={f} className="flex items-center gap-2">
                    <CheckCircle2 size={12} className="text-emerald-400 flex-shrink-0"/>
                    <span className="text-xs text-slate-400">{f}</span>
                  </div>
                ))}
              </div>
              <button className={`w-full py-2.5 rounded-xl text-white text-sm font-bold transition ${plan.btnColor}`}>
                {plan.name === "Enterprise" ? "Contact Us" : "Choose Plan"}
              </button>
            </div>
          ))}
        </div>

        {/* Contact to activate */}
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-8 text-center mb-12">
          <Zap size={24} className="text-cyan-400 mx-auto mb-3"/>
          <div className="text-lg font-bold text-slate-200 mb-2">Ready to subscribe?</div>
          <div className="text-sm text-slate-500 mb-6">Contact Magnus Boys Construction to activate your subscription and restore full access immediately.</div>
          <div className="flex items-center justify-center gap-6 flex-wrap">
            <a href="tel:8765653056" className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition text-sm font-semibold">
              <Phone size={14}/> 876-565-3056
            </a>
            <a href="mailto:magnusboys88@gmail.com" className="flex items-center gap-2 text-cyan-400 hover:text-cyan-300 transition text-sm font-semibold">
              <Mail size={14}/> magnusboys88@gmail.com
            </a>
          </div>
        </div>

        {/* Features list */}
        <div className="text-center">
          <div className="text-xs font-bold uppercase tracking-widest text-slate-600 mb-6">Everything included in all plans</div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {FEATURES.map(f => (
              <div key={f} className="flex items-center gap-2 text-left">
                <CheckCircle2 size={11} className="text-emerald-400 flex-shrink-0"/>
                <span className="text-[11px] text-slate-500">{f}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}