// src/lib/magnusAI.ts
// Magnus AI Provider — pluggable AI module
// All calls go through Supabase Edge Function (API key never exposed)
// If AI fails, app continues working — graceful fallback always

import { supabase } from "./supabase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IDScanResult {
  firstName:    string;
  middleName:   string;
  lastName:     string;
  fullName:     string;
  idNumber:     string;
  dateOfBirth:  string;
  expiryDate:   string;
  address:      string;
  documentType: "national_id" | "drivers_licence" | "unknown";
  confidence:   number;
  aiPowered:    boolean;
}

export interface ReceiptScanResult {
  vendor:        string;
  amount:        number;
  date:          string;
  receiptNumber: string;
  tax:           number;
  lineItems:     { description: string; quantity: number; unitPrice: number; amount: number }[];
  paymentMethod: string;
  confidence:    number;
  aiPowered:     boolean;
}

export interface PaymentSuggestion {
  suggestions:    { type: string; message: string }[];
  suggestedRate:  number;
  suggestedTotal: number;
  riskLevel:      "low" | "medium" | "high";
  riskReason:     string;
}

export interface AIStatus {
  available:  boolean;
  lastCheck:  Date | null;
  error:      string | null;
}

// ─── AI Provider ─────────────────────────────────────────────────────────────

class MagnusAIProvider {
  private status: AIStatus = {
    available: true,
    lastCheck: null,
    error: null,
  };

  private edgeFunctionUrl: string;

  constructor() {
    // Build edge function URL from Supabase config
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
    this.edgeFunctionUrl = `${supabaseUrl}/functions/v1/magnus-ai`;
  }

  // ── Core call ───────────────────────────────────────────────────────────────

  private async call(action: string, payload: any): Promise<any> {
    const { data: { session } } = await supabase.auth.getSession();

    console.log("Magnus AI calling:", this.edgeFunctionUrl);
    const response = await fetch(this.edgeFunctionUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session?.access_token || ""}`,
        "apikey": import.meta.env.VITE_SUPABASE_ANON_KEY || "",
      },
      body: JSON.stringify({ action, ...payload }),
    });

    if (!response.ok) {
      throw new Error(`Edge function error: ${response.status}`);
    }

    const result = await response.json();
    if (!result.success) throw new Error(result.error || "AI call failed");

    this.status = { available: true, lastCheck: new Date(), error: null };
    return result.data;
  }

  // ── Convert image file to base64 ────────────────────────────────────────────

  async fileToBase64(file: File): Promise<string> {
    // Compress first if large
    const MAX = 1600;
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(MAX / img.width, MAX / img.height, 1);
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d")!.drawImage(img, 0, 0, w, h);
        canvas.toBlob(blob => {
          if (!blob) return reject(new Error("Failed to compress image"));
          const reader = new FileReader();
          reader.onload = e => resolve((e.target!.result as string).split(",")[1]);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        }, "image/jpeg", 0.88);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
      img.src = url;
    });
  }

  // ── Scan ID ─────────────────────────────────────────────────────────────────

  async scanID(file: File): Promise<IDScanResult> {
    const imageBase64 = await this.fileToBase64(file);
    const data = await this.call("scan_id", { imageBase64 });

    return {
      firstName:    data.firstName    || "",
      middleName:   data.middleName   || "",
      lastName:     data.lastName     || "",
      fullName:     data.fullName     || [data.firstName, data.middleName, data.lastName].filter(Boolean).join(" "),
      idNumber:     data.idNumber     || "",
      dateOfBirth:  data.dateOfBirth  || "",
      expiryDate:   data.expiryDate   || "",
      address:      data.address      || "",
      documentType: data.documentType || "unknown",
      confidence:   data.confidence   || 0.9,
      aiPowered:    true,
    };
  }

  // ── Scan Receipt ────────────────────────────────────────────────────────────

  async scanReceipt(file: File): Promise<ReceiptScanResult> {
    const imageBase64 = await this.fileToBase64(file);
    const data = await this.call("scan_receipt", { imageBase64 });

    return {
      vendor:        data.vendor        || "",
      amount:        parseFloat(data.amount) || 0,
      date:          data.date          || "",
      receiptNumber: data.receiptNumber || "",
      tax:           parseFloat(data.tax) || 0,
      lineItems:     data.lineItems     || [],
      paymentMethod: data.paymentMethod || "",
      confidence:    data.confidence    || 0.9,
      aiPowered:     true,
    };
  }

  // ── Scan Invoice ────────────────────────────────────────────────────────────

  async scanInvoice(file: File): Promise<ReceiptScanResult> {
    const imageBase64 = await this.fileToBase64(file);
    const data = await this.call("scan_invoice", { imageBase64 });

    return {
      vendor:        data.vendor        || "",
      amount:        parseFloat(data.amount) || 0,
      date:          data.date          || "",
      receiptNumber: data.invoiceNumber || "",
      tax:           parseFloat(data.tax) || 0,
      lineItems:     data.lineItems     || [],
      paymentMethod: "",
      confidence:    data.confidence    || 0.9,
      aiPowered:     true,
    };
  }

  // ── Payment suggestions ─────────────────────────────────────────────────────

  async suggestPayment(paymentData: {
    workerName:  string;
    workType:    string;
    daysWorked:  number;
    hoursWorked: number;
    ratePerDay:  number;
    ratePerHour: number;
    totalAmount: number;
    pastPayments?: any[];
  }): Promise<PaymentSuggestion> {
    const data = await this.call("suggest_payment", { data: paymentData });

    return {
      suggestions:    data.suggestions    || [],
      suggestedRate:  parseFloat(data.suggestedRate)  || 0,
      suggestedTotal: parseFloat(data.suggestedTotal) || 0,
      riskLevel:      data.riskLevel      || "low",
      riskReason:     data.riskReason     || "",
    };
  }

  // ── AI Secretary chat ───────────────────────────────────────────────────────

  async chat(message: string, context?: any): Promise<string> {
    const data = await this.call("chat", { data: { message, context } });
    return data.message || "";
  }

  // ── Status check ────────────────────────────────────────────────────────────

  getStatus(): AIStatus { return this.status; }

  isAvailable(): boolean { return this.status.available; }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const magnusAI = new MagnusAIProvider();

// ─── Safe wrappers (never throw — always return fallback) ─────────────────────

export async function aiScanID(file: File): Promise<IDScanResult | null> {
  try {
    return await magnusAI.scanID(file);
  } catch (e: any) {
    console.warn("AI ID scan failed, falling back to manual:", e.message);
    return null; // Caller shows manual entry fields
  }
}

export async function aiScanReceipt(file: File): Promise<ReceiptScanResult | null> {
  try {
    return await magnusAI.scanReceipt(file);
  } catch (e: any) {
    console.warn("AI receipt scan failed:", e.message);
    return null;
  }
}

export async function aiScanInvoice(file: File): Promise<ReceiptScanResult | null> {
  try {
    return await magnusAI.scanInvoice(file);
  } catch (e: any) {
    console.warn("AI invoice scan failed:", e.message);
    return null;
  }
}

export async function aiSuggestPayment(data: any): Promise<PaymentSuggestion | null> {
  try {
    return await magnusAI.suggestPayment(data);
  } catch (e: any) {
    console.warn("AI payment suggestion failed:", e.message);
    return null;
  }
}

export async function aiChat(message: string, context?: any): Promise<string> {
  try {
    return await magnusAI.chat(message, context);
  } catch (e: any) {
    console.warn("AI chat failed:", e.message);
    return "";
  }
}