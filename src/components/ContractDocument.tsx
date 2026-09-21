// src/components/ContractDocument.tsx
//
// THE contract document. One component, used by BOTH the staff Preview & Print (ContractsPage) and
// the client portal (read contract, read-before-signing and the client's printed copy), so a signed
// contract looks identical to everyone. It takes plain data only - no database access:
//   contract  the contract row, plus optional  client {name, contact_name}  and  project {name, site_address}
//   schedule  payment schedule rows (milestone_name, milestone_description, due_date, amount)
//   company   company_name, logo_url, address_line1, city, phone, email
//   signRecord  optional electronic signature record {signedAt, ip, device} (staff only)
// The contract's internal `notes` field is deliberately never read here.
import React from "react";
import { openPrintWindow } from "../lib/printUtils";
import { formatContractDate, formatJamaicaDateTimeFull } from "../lib/contractDocument";

// Date-only values (YYYY-MM-DD) are calendar dates and must not shift a day in Jamaica.
const fmtDate = (d: string | null | undefined) => formatContractDate(d) || "\u2014";
function fmtJMD(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "JMD", minimumFractionDigits: 2 }).format(n);
}

export const CONTRACT_DOCUMENT_ID = "contract-print-content";

// The two print stylesheets, exactly as the staff screen has always used them. They differ only by
// page-break-after on the cover (the "Save as PDF" variant breaks the page after the cover).
export const CONTRACT_PRINT_CSS = `
      .page{max-width:800px;margin:0 auto;padding:60px}
      h1{font-size:32px;font-weight:900}
      h2{font-size:18px;font-weight:700;margin-bottom:12px;border-bottom:2px solid #1a1a1a;padding-bottom:8px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      th{background:#1a1a1a;color:white;padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase}
      td{padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px}
      .cover{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;border-bottom:4px solid #1a1a1a;margin-bottom:60px;padding:80px 40px}
      .section{margin-bottom:48px;page-break-inside:avoid}
      .sig-block{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px}
      .sig-line{border-top:2px solid #1a1a1a;margin-top:48px;padding-top:8px;font-size:12px}
    `;
export const CONTRACT_PDF_CSS = `
      .page{max-width:800px;margin:0 auto;padding:60px}
      h1{font-size:32px;font-weight:900}
      h2{font-size:18px;font-weight:700;margin-bottom:12px;border-bottom:2px solid #1a1a1a;padding-bottom:8px}
      table{width:100%;border-collapse:collapse;margin-bottom:16px}
      th{background:#1a1a1a;color:white;padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase}
      td{padding:10px 12px;border-bottom:1px solid #e5e7eb;font-size:13px}
      .cover{min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;border-bottom:4px solid #1a1a1a;margin-bottom:60px;padding:80px 40px;page-break-after:always}
      .section{margin-bottom:48px;page-break-inside:avoid}
      .sig-block{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px}
      .sig-line{border-top:2px solid #1a1a1a;margin-top:48px;padding-top:8px;font-size:12px}
    `;

export interface ContractWatermark {
  url: string;
  opacity: number;
  size?: number;
}

// Same rule the staff screen applies to company_settings.
export function watermarkFromCompany(company: any): ContractWatermark | null {
  if (company?.watermark_enabled && company?.watermark_url) {
    return { url: company.watermark_url, opacity: company.watermark_opacity || 0.15, size: company.watermark_size || 25 };
  }
  return null;
}

// Prints the rendered document (staff and client use this same path).
export function printContractDocument(opts: {
  title: string;
  watermark?: ContractWatermark | null;
  tagline?: string | null;
  variant?: "print" | "pdf";
  waitForImages?: boolean;
}): boolean {
  const html = document.getElementById(CONTRACT_DOCUMENT_ID)?.innerHTML || "";
  const extraCss = opts.variant === "pdf" ? CONTRACT_PDF_CSS : CONTRACT_PRINT_CSS;
  return openPrintWindow(`<style>${extraCss}</style>${html}`, {
    title: opts.title,
    watermark: opts.watermark,
    tagline: opts.tagline ?? undefined,
    waitForImages: opts.waitForImages,
  });
}

export interface ContractDocumentProps {
  contract: any;
  schedule: any[];
  company: any;
  signRecord?: { signedAt: string; ip: string; device: string } | null;
}

export default function ContractDocument({ contract, schedule, company, signRecord }: ContractDocumentProps) {
  const totalScheduled = schedule.reduce((s, p) => s + Number(p.amount || 0), 0);
  return (
        <div id="contract-print-content" style={{position:"relative"}}>

          <div className="page bg-white shadow-2xl mx-auto max-w-[800px]" style={{fontFamily:"Georgia,serif",color:"#1a1a1a"}}>


            {/* Cover Page */}
            <div id="contract-cover-section" className="cover" style={{minHeight:"60vh",display:"flex",flexDirection:"column",justifyContent:"center",alignItems:"center",textAlign:"center",borderBottom:"4px solid #1a1a1a",marginBottom:60,padding:"80px 40px"}}>
              {company?.logo_url && (
                <img src={company.logo_url} alt="logo" style={{width:80,height:80,borderRadius:12,objectFit:"cover",marginBottom:20}}/>
              )}
              <div style={{fontSize:13,fontWeight:700,letterSpacing:4,textTransform:"uppercase",color:"#6b7280",marginBottom:8}}>
                {company?.company_name || company?.company_name||"Magnus Boys Construction"}
              </div>
              <div style={{fontSize:11,color:"#9ca3af",marginBottom:40}}>
                {company?.address_line1 || ""} {company?.city || ""} · {company?.phone || ""} · {company?.email || ""}
              </div>
              <div style={{fontSize:11,fontWeight:700,letterSpacing:6,textTransform:"uppercase",color:"#9ca3af",marginBottom:12}}>CONTRACT & PROPOSAL</div>
              <h1 style={{fontSize:36,fontWeight:900,marginBottom:16,lineHeight:1.2}}>{contract.contract_name}</h1>
              <div style={{fontSize:14,color:"#6b7280",marginBottom:32}}>
                Prepared for: <strong style={{color:"#1a1a1a"}}>{contract.client?.contact_name || contract.client?.name || "Client"}</strong>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:24,marginTop:16,width:"100%",maxWidth:500}}>
                {[
                  { label:"Contract No.", value:contract.contract_number },
                  { label:"Date", value:fmtDate(contract.contract_date) },
                  { label:"Contract Value", value:fmtJMD(contract.contract_amount) },
                ].map(i=>(
                  <div key={i.label} style={{textAlign:"center"}}>
                    <div style={{fontSize:10,fontWeight:700,letterSpacing:2,textTransform:"uppercase",color:"#9ca3af",marginBottom:4}}>{i.label}</div>
                    <div style={{fontSize:13,fontWeight:800}}>{i.value}</div>
                  </div>
                ))}
              </div>
            </div>


            <div id="contract-body-section" style={{padding:"0 60px 60px"}}>

              {/* Executive Summary */}
              <div className="section" style={{marginBottom:48}}>
                <h2 style={{fontSize:18,fontWeight:700,marginBottom:12,borderBottom:"2px solid #1a1a1a",paddingBottom:8}}>Executive Summary</h2>
                <table style={{width:"100%",borderCollapse:"collapse",marginBottom:16}}>
                  <tbody>
                    {[
                      ["Client", contract.client?.contact_name || contract.client?.name || "—"],
                      ["Company", contract.client?.name || "—"],
                      ["Project", contract.project?.name || "—"],
                      ["Site Address", contract.project?.site_address || "—"],
                      ["Start Date", fmtDate(contract.start_date)],
                      ["Completion Date", fmtDate(contract.completion_date)],
                      ["Contract Value", fmtJMD(contract.contract_amount)],
                      ["Retention", `${contract.retention_percent || 0}%`],
                      ["Warranty Period", `${contract.warranty_period_months || 12} months`],
                      ...(contract.contract_date ? [["Contract Date", fmtDate(contract.contract_date)]] : []),
                      ...(contract.billing_schedule ? [["Billing Schedule", String(contract.billing_schedule).replace(/_/g, " ")]] : []),
                      ["Governing Law", contract.governing_law || "Jamaica"],
                    ].map(([k,v])=>(
                      <tr key={k} style={{borderBottom:"1px solid #f3f4f6"}}>
                        <td style={{padding:"8px 12px",fontWeight:700,fontSize:12,width:180,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.5}}>{k}</td>
                        <td style={{padding:"8px 12px",fontSize:13}}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Scope of Work */}
              {contract.scope_of_work && (
                <div className="section" style={{marginBottom:48}}>
                  <h2 style={{fontSize:18,fontWeight:700,marginBottom:16,borderBottom:"2px solid #1a1a1a",paddingBottom:8}}>Scope of Work</h2>
                  <div style={{fontSize:13,lineHeight:1.9,whiteSpace:"pre-wrap",color:"#374151"}}>{contract.scope_of_work}</div>
                </div>
              )}

              {/* Payment Schedule */}
              {schedule.length > 0 && (
                <div className="section" style={{marginBottom:48}}>
                  <h2 style={{fontSize:18,fontWeight:700,marginBottom:16,borderBottom:"2px solid #1a1a1a",paddingBottom:8}}>Payment Schedule</h2>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <thead>
                      <tr style={{background:"#1a1a1a"}}>
                        {["#","Milestone","Description","Due Date","Amount","% of Total"].map(h=>(
                          <th key={h} style={{padding:"10px 12px",textAlign:"left",fontSize:11,textTransform:"uppercase",color:"white",fontWeight:700}}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {schedule.map((p, i) => (
                        <tr key={i} style={{borderBottom:"1px solid #e5e7eb",background:i%2===0?"white":"#f9fafb"}}>
                          <td style={{padding:"10px 12px",fontSize:13}}>{i+1}</td>
                          <td style={{padding:"10px 12px",fontSize:13,fontWeight:700}}>{p.milestone_name}</td>
                          <td style={{padding:"10px 12px",fontSize:12,color:"#6b7280"}}>{p.milestone_description}</td>
                          <td style={{padding:"10px 12px",fontSize:12}}>{fmtDate(p.due_date)}</td>
                          <td style={{padding:"10px 12px",fontSize:13,fontWeight:700}}>{fmtJMD(Number(p.amount))}</td>
                          <td style={{padding:"10px 12px",fontSize:12}}>{Math.round((Number(p.amount)/contract.contract_amount)*100)}%</td>
                        </tr>
                      ))}
                      <tr style={{background:"#1a1a1a",color:"white"}}>
                        <td colSpan={4} style={{padding:"10px 12px",fontSize:13,fontWeight:700}}>TOTAL</td>
                        <td style={{padding:"10px 12px",fontSize:13,fontWeight:700}}>{fmtJMD(totalScheduled)}</td>
                        <td style={{padding:"10px 12px",fontSize:13,fontWeight:700}}>100%</td>
                      </tr>
                    </tbody>
                  </table>
                  {contract.payment_terms && (
                    <p style={{marginTop:12,fontSize:12,color:"#6b7280",fontStyle:"italic"}}>{contract.payment_terms}</p>
                  )}
                </div>
              )}

              {schedule.length === 0 && contract.payment_terms && (
                <div className="section" style={{marginBottom:48}}>
                  <h2 style={{fontSize:18,fontWeight:700,marginBottom:16,borderBottom:"2px solid #1a1a1a",paddingBottom:8}}>Payment Terms</h2>
                  <div style={{fontSize:12,lineHeight:1.9,whiteSpace:"pre-wrap",color:"#374151"}}>{contract.payment_terms}</div>
                </div>
              )}

              {/* Terms & Conditions */}
              {contract.terms_and_conditions && (
                <div className="section" style={{marginBottom:48}}>
                  <h2 style={{fontSize:18,fontWeight:700,marginBottom:16,borderBottom:"2px solid #1a1a1a",paddingBottom:8}}>Terms & Conditions</h2>
                  <div style={{fontSize:12,lineHeight:1.9,whiteSpace:"pre-wrap",color:"#374151"}}>{contract.terms_and_conditions}</div>
                </div>
              )}

              {/* Penalty Clause */}
              {contract.penalty_clause && (
                <div className="section" style={{marginBottom:48}}>
                  <h2 style={{fontSize:18,fontWeight:700,marginBottom:12,borderBottom:"2px solid #1a1a1a",paddingBottom:8}}>Penalty Clause</h2>
                  <div style={{fontSize:12,lineHeight:1.9,color:"#374151"}}>{contract.penalty_clause}</div>
                </div>
              )}

              {contract.insurance_details && (
                <div className="section" style={{marginBottom:48}}>
                  <h2 style={{fontSize:18,fontWeight:700,marginBottom:12,borderBottom:"2px solid #1a1a1a",paddingBottom:8}}>Insurance</h2>
                  <div style={{fontSize:12,lineHeight:1.9,whiteSpace:"pre-wrap",color:"#374151"}}>{contract.insurance_details}</div>
                </div>
              )}

              {/* Signatures */}
              <div className="section" style={{marginBottom:48}}>
                <h2 style={{fontSize:18,fontWeight:700,marginBottom:24,borderBottom:"2px solid #1a1a1a",paddingBottom:8}}>Signatures</h2>
                <p style={{fontSize:12,color:"#6b7280",marginBottom:24}}>
                  By signing below, both parties agree to be bound by the terms and conditions of this contract.
                </p>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:60}}>
                  <div>
                    <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>CONTRACTOR</div>
                    <div style={{fontSize:12,color:"#6b7280",marginBottom:32}}>{company?.company_name || company?.company_name||"Magnus Boys Construction"}</div>
                    {contract.contractor_signed_at ? (
                      <>
                        {contract.contractor_signature_url && <img src={contract.contractor_signature_url} alt="Contractor signature" style={{maxHeight:60,maxWidth:200,marginBottom:6,objectFit:"contain"}}/>}
                      <div style={{fontSize:12,color:"#16a34a",fontWeight:700}}>? Signed {formatJamaicaDateTimeFull(contract.contractor_signed_at)}</div>
                      </>
                    ) : (
                      <div style={{borderTop:"2px solid #1a1a1a",paddingTop:8,fontSize:11,color:"#9ca3af"}}>Authorized Signature & Date</div>
                    )}
                    <div style={{marginTop:16,borderTop:"1px solid #e5e7eb",paddingTop:8,fontSize:11,color:"#9ca3af"}}>Print Name</div>
                    <div style={{marginTop:16,borderTop:"1px solid #e5e7eb",paddingTop:8,fontSize:11,color:"#9ca3af"}}>Title</div>
                  </div>
                  <div>
                    <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>CLIENT</div>
                    <div style={{fontSize:12,color:"#6b7280",marginBottom:32}}>{contract.client?.contact_name || contract.client?.name || "Client"}</div>
                    {contract.client_signed_at ? (
                      <>
                        {contract.client_signature_url && <img src={contract.client_signature_url} alt="Client signature" style={{maxHeight:60,maxWidth:200,marginBottom:6,objectFit:"contain"}}/>}
                      <div style={{fontSize:12,color:"#16a34a",fontWeight:700}}>? Signed {formatJamaicaDateTimeFull(contract.client_signed_at)}</div>
                      </>
                    ) : (
                      <div style={{borderTop:"2px solid #1a1a1a",paddingTop:8,fontSize:11,color:"#9ca3af"}}>Authorized Signature & Date</div>
                    )}
                    <div style={{marginTop:16,borderTop:"1px solid #e5e7eb",paddingTop:8,fontSize:11,color:"#9ca3af"}}>Print Name</div>
                    <div style={{marginTop:16,borderTop:"1px solid #e5e7eb",paddingTop:8,fontSize:11,color:"#9ca3af"}}>Witness</div>
                  </div>
                </div>
              </div>

              {contract.client_signed_at && signRecord && (
                <div className="section" style={{marginBottom:48}}>
                  <h2 style={{fontSize:18,fontWeight:700,marginBottom:12,borderBottom:"2px solid #1a1a1a",paddingBottom:8}}>Electronic Signature Record</h2>
                  <table style={{width:"100%",borderCollapse:"collapse"}}>
                    <tbody>
                      {[
                        ["Client signed", formatJamaicaDateTimeFull(signRecord.signedAt)],
                        ["IP address", signRecord.ip || "unknown"],
                        ["Device", signRecord.device],
                      ].map(([k,v])=>(
                        <tr key={k} style={{borderBottom:"1px solid #f3f4f6"}}>
                          <td style={{padding:"8px 12px",fontWeight:700,fontSize:12,width:180,color:"#6b7280",textTransform:"uppercase",letterSpacing:0.5}}>{k}</td>
                          <td style={{padding:"8px 12px",fontSize:13}}>{v}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Footer */}
              <div style={{borderTop:"2px solid #1a1a1a",paddingTop:16,textAlign:"center",fontSize:11,color:"#9ca3af"}}>
                {company?.company_name || company?.company_name||"Magnus Boys Construction"} · {company?.phone || ""} · {company?.email || ""} · Powered by Magnus ERP
              </div>
            </div>
          </div>
        </div>
  );
}
