import { supabase } from "./supabase";

export interface DailyLogEnhancement {
  originalText: string;
  enhancedText: string;
  suggestions: {
    workPerformed?: string;
    deliveries?: string;
    issues?: string;
    notes?: string;
  };
  confidence: number;
}

export interface ReceiptCategorization {
  vendor: string;
  amount: number;
  suggestedCategory: string | null;
  suggestedVendorType: string | null;
  suggestedDescription: string;
  confidence: number;
  reasoning: string;
}

const CONSTRUCTION_KEYWORDS = {
  materials: ["lumber", "concrete", "drywall", "paint", "steel", "rebar", "plywood", "insulation", "roofing"],
  tools: ["drill", "saw", "hammer", "equipment", "rental", "tool", "machinery"],
  labor: ["crew", "workers", "labor", "subcontractor", "carpenter", "electrician", "plumber"],
  permits: ["permit", "inspection", "fee", "license", "approval"],
  utilities: ["electric", "water", "gas", "power", "utility"],
  safety: ["ppe", "safety", "harness", "helmet", "gloves", "boots"],
  supplies: ["supplies", "hardware", "fasteners", "screws", "nails", "bolts"],
};

const VENDOR_PATTERNS = {
  "Home Depot": { type: "Materials Supplier", category: "Materials" },
  "Lowes": { type: "Materials Supplier", category: "Materials" },
  "Menards": { type: "Materials Supplier", category: "Materials" },
  "84 Lumber": { type: "Lumber Supplier", category: "Materials" },
  "Ace Hardware": { type: "Hardware Store", category: "Materials" },
  "Grainger": { type: "Industrial Supplier", category: "Equipment" },
  "United Rentals": { type: "Equipment Rental", category: "Equipment Rental" },
  "Sunbelt Rentals": { type: "Equipment Rental", category: "Equipment Rental" },
  "Sherwin Williams": { type: "Paint Supplier", category: "Materials" },
  "Ferguson": { type: "Plumbing Supplier", category: "Materials" },
  "Fastenal": { type: "Industrial Supplier", category: "Materials" },
};

const EXPENSE_CATEGORIES = [
  "Materials",
  "Labor",
  "Equipment Rental",
  "Subcontractor",
  "Permits & Fees",
  "Utilities",
  "Fuel",
  "Office Supplies",
  "Safety Equipment",
  "Miscellaneous",
];

export async function enhanceDailyLog(rawNotes: string): Promise<DailyLogEnhancement> {
  const lines = rawNotes.split("\n").filter((l) => l.trim());

  const suggestions: DailyLogEnhancement["suggestions"] = {};

  const workLines: string[] = [];
  const deliveryLines: string[] = [];
  const issueLines: string[] = [];
  const noteLines: string[] = [];

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (
      lower.includes("install") ||
      lower.includes("complete") ||
      lower.includes("finish") ||
      lower.includes("build") ||
      lower.includes("frame") ||
      lower.includes("pour") ||
      lower.includes("demo")
    ) {
      workLines.push(cleanupSentence(line));
    } else if (
      lower.includes("deliver") ||
      lower.includes("arrived") ||
      lower.includes("received") ||
      lower.includes("shipment")
    ) {
      deliveryLines.push(cleanupSentence(line));
    } else if (
      lower.includes("issue") ||
      lower.includes("problem") ||
      lower.includes("delay") ||
      lower.includes("rain") ||
      lower.includes("snow") ||
      lower.includes("wait")
    ) {
      issueLines.push(cleanupSentence(line));
    } else {
      noteLines.push(cleanupSentence(line));
    }
  }

  if (workLines.length > 0) {
    suggestions.workPerformed = workLines.join(". ") + ".";
  }

  if (deliveryLines.length > 0) {
    suggestions.deliveries = deliveryLines.join(". ") + ".";
  }

  if (issueLines.length > 0) {
    suggestions.issues = issueLines.join(". ") + ".";
  }

  if (noteLines.length > 0) {
    suggestions.notes = noteLines.join(". ") + ".";
  }

  const enhancedParts: string[] = [];
  if (suggestions.workPerformed) enhancedParts.push(`Work: ${suggestions.workPerformed}`);
  if (suggestions.deliveries) enhancedParts.push(`Deliveries: ${suggestions.deliveries}`);
  if (suggestions.issues) enhancedParts.push(`Issues: ${suggestions.issues}`);
  if (suggestions.notes) enhancedParts.push(`Notes: ${suggestions.notes}`);

  const enhancedText = enhancedParts.join("\n\n");
  const confidence = calculateConfidence(rawNotes, suggestions);

  return {
    originalText: rawNotes,
    enhancedText,
    suggestions,
    confidence,
  };
}

export async function categorizeReceipt(
  vendor: string,
  amount: number,
  ocrText?: string
): Promise<ReceiptCategorization> {
  let suggestedCategory: string | null = null;
  let suggestedVendorType: string | null = null;
  let reasoning = "";
  let confidence = 0;

  const vendorLower = vendor.toLowerCase();
  const fullText = (vendor + " " + (ocrText || "")).toLowerCase();

  for (const [knownVendor, info] of Object.entries(VENDOR_PATTERNS)) {
    if (vendorLower.includes(knownVendor.toLowerCase())) {
      suggestedCategory = info.category;
      suggestedVendorType = info.type;
      reasoning = `Recognized vendor: ${knownVendor}`;
      confidence = 0.9;
      break;
    }
  }

  if (!suggestedCategory) {
    for (const [category, keywords] of Object.entries(CONSTRUCTION_KEYWORDS)) {
      for (const keyword of keywords) {
        if (fullText.includes(keyword)) {
          suggestedCategory = capitalizeCategory(category);
          reasoning = `Detected keyword: "${keyword}"`;
          confidence = 0.7;
          break;
        }
      }
      if (suggestedCategory) break;
    }
  }

  if (!suggestedCategory) {
    if (amount < 50) {
      suggestedCategory = "Office Supplies";
      reasoning = "Small amount, likely supplies";
      confidence = 0.5;
    } else if (amount > 1000) {
      suggestedCategory = "Materials";
      reasoning = "Large amount, likely materials";
      confidence = 0.6;
    } else {
      suggestedCategory = "Miscellaneous";
      reasoning = "Unable to determine specific category";
      confidence = 0.3;
    }
  }

  const suggestedDescription = generateDescription(vendor, suggestedCategory, ocrText);

  return {
    vendor,
    amount,
    suggestedCategory,
    suggestedVendorType,
    suggestedDescription,
    confidence,
    reasoning,
  };
}

function cleanupSentence(text: string): string {
  let cleaned = text.trim();

  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);

  if (!cleaned.endsWith(".") && !cleaned.endsWith("!") && !cleaned.endsWith("?")) {
    cleaned += "";
  }

  cleaned = cleaned.replace(/\s+/g, " ");

  return cleaned;
}

function calculateConfidence(original: string, suggestions: DailyLogEnhancement["suggestions"]): number {
  const suggestionCount = Object.keys(suggestions).length;
  const originalLength = original.length;

  if (suggestionCount === 0) return 0.2;
  if (suggestionCount === 1) return 0.5;
  if (suggestionCount === 2) return 0.7;
  if (suggestionCount >= 3) return 0.9;

  if (originalLength < 20) return 0.3;

  return 0.6;
}

function capitalizeCategory(category: string): string {
  const map: Record<string, string> = {
    materials: "Materials",
    tools: "Equipment Rental",
    labor: "Labor",
    permits: "Permits & Fees",
    utilities: "Utilities",
    safety: "Safety Equipment",
    supplies: "Office Supplies",
  };
  return map[category] || "Miscellaneous";
}

function generateDescription(vendor: string, category: string | null, ocrText?: string): string {
  const parts: string[] = [];

  if (category) {
    parts.push(category);
  }

  parts.push(`from ${vendor}`);

  if (ocrText && ocrText.length > 10) {
    const firstLine = ocrText.split("\n")[0];
    if (firstLine && firstLine.length < 50) {
      parts.push(`- ${firstLine}`);
    }
  }

  return parts.join(" ");
}

export async function getExpenseCategories(): Promise<string[]> {
  try {
    const { data: user } = await supabase.auth.getUser();
    if (!user.user) return EXPENSE_CATEGORIES;

    const { data: profile } = await supabase
      .from("user_profiles")
      .select("company_id")
      .eq("id", user.user.id)
      .single();

    if (!profile?.company_id) return EXPENSE_CATEGORIES;

    const { data: categories } = await supabase
      .from("expense_categories")
      .select("name")
      .eq("company_id", profile.company_id)
      .eq("is_active", true)
      .order("name");

    if (categories && categories.length > 0) {
      return categories.map((c) => c.name);
    }

    return EXPENSE_CATEGORIES;
  } catch (error) {
    console.error("Error fetching categories:", error);
    return EXPENSE_CATEGORIES;
  }
}
