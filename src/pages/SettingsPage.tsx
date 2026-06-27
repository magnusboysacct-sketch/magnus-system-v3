// src/pages/SettingsPage.tsx
import React from "react";
import { useNavigate } from "react-router-dom";
import { PageHeader, Card, Btn, cn } from "../components/ui";
import { Settings, BookOpen, Tag, Hash, Users, Building2, CreditCard, ArrowRight, FileText } from "lucide-react";

const SETTINGS_SECTIONS = [
  { title: "Company", desc: "Company name, logo, address", icon: <Building2 size={18}/>, to: "/settings/company", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  { title: "Records & IDs", desc: "Print worker files and ID cards", icon: <FileText size={18}/>, to: "/settings/records", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { title: "Users & Permissions", desc: "Team members, roles, invites", icon: <Users size={18}/>, to: "/settings/users", color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  { title: "Master Lists", desc: "Materials, labour, equipment items", icon: <BookOpen size={18}/>, to: "/settings/master-lists", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
  { title: "Categories", desc: "Cost categories and subcategories", icon: <Tag size={18}/>, to: "/settings/master-categories", color: "text-amber-400 bg-amber-500/10 border-amber-500/20" },
  { title: "Cost Codes", desc: "Project cost codes and WBS", icon: <Hash size={18}/>, to: "/settings/cost-codes", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
  { title: "Billing & Plan", desc: "Subscription, invoices, limits", icon: <CreditCard size={18}/>, to: "/billing", color: "text-pink-400 bg-pink-500/10 border-pink-500/20" },
];

export default function SettingsPage() {
  const nav = useNavigate();
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#080b10]">
      <PageHeader title="Settings" subtitle="System configuration"/>
      <div className="p-6 max-w-3xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {SETTINGS_SECTIONS.map(s => (
            <Card key={s.to} onClick={() => nav(s.to)} className="cursor-pointer hover:border-slate-300 dark:hover:border-white/[0.13] transition-colors">
              <div className="flex items-start gap-4">
                <div className={cn("w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0", s.color)}>{s.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-0.5">{s.title}</div>
                  <div className="text-xs text-slate-600">{s.desc}</div>
                </div>
                <ArrowRight size={14} className="text-slate-700 flex-shrink-0 mt-1"/>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}