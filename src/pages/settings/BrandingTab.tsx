// src/pages/settings/BrandingTab.tsx — "Branding & ID Cards": the ID card colours (presets, from-logo suggestions, custom, live preview; its own Save / Reset),
// with a pointer to the logo (Company tab) and the printing guide (Help & Training).
import React from "react";
import { Link } from "react-router-dom";
import { PageHeader, Card, CardHeader, Spinner } from "../../components/ui";
import { BookOpen, ImageIcon } from "lucide-react";
import IdCardColors from "../../components/IdCardColors";
import { GUIDE_ARTICLE_TITLE } from "../../lib/idCardGuide";
import { useCompanySettingsForm } from "./companySettingsState";

export default function BrandingTab() {
  const c = useCompanySettingsForm();
  if (c.loading) {
    return <div className="flex items-center justify-center py-16"><div className="flex items-center gap-2.5 text-xs text-slate-600"><Spinner size={16} /> Loading...</div></div>;
  }
  return (
    <div>
      <PageHeader title="Branding & ID Cards" subtitle="The colours of your staff and worker ID cards" />
      <div className="p-4 sm:p-6 max-w-2xl space-y-5">
        {/* the card preview uses the company name, tagline and logo from the Company tab */}
        <IdCardColors companyId={c.companyId} companyName={c.form.company_name} tagline={c.form.tagline} logoUrl={c.logoUrl} />

        <Card>
          <CardHeader title="Logo and printing" subtitle="Where the rest of your ID card branding lives" />
          <div className="space-y-3 text-xs text-slate-600 dark:text-slate-300">
            <div className="flex items-start gap-2.5">
              <ImageIcon size={14} className="mt-0.5 flex-shrink-0 text-slate-500" />
              <span>The logo on the cards is your company logo. Upload or change it on the <Link to="/settings/company" className="text-cyan-600 dark:text-cyan-400 underline">Company tab</Link>; the signature on the card backs is on the <Link to="/settings/documents" className="text-cyan-600 dark:text-cyan-400 underline">Documents tab</Link>.</span>
            </div>
            <div className="flex items-start gap-2.5">
              <BookOpen size={14} className="mt-0.5 flex-shrink-0 text-slate-500" />
              <span>Taking cards to a print shop? Read <Link to="/help?article=printing-id-cards" className="text-cyan-600 dark:text-cyan-400 underline">{GUIDE_ARTICLE_TITLE}</Link> in Help &amp; Training: which file to take, what to tell the shop and what to check before you pay. Download the print files from any person's ID card (Download for printing) or from Records &amp; IDs.</span>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
