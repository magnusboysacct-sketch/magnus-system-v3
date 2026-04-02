// src/lib/supplierProductScraping.ts
import { supabase } from "./supabase";

export type SupplierScrapeResult = {
  success: boolean;
  supplier: string;
  url: string;
  itemNumber?: string | null;
  materialName?: string | null;
  description?: string | null;
  costEach?: number | null;
  currency?: string | null;
  unit?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  sourceLink?: string | null;
  availability?: string | null;
  rawText?: string | null;
  error?: string | null;
};

export type SaveScrapedProductInput = {
  supplierId?: string | null;
  supplierName?: string | null;
  itemNumber?: string | null;
  materialName?: string | null;
  description?: string | null;
  costEach?: number | null;
  currency?: string | null;
  unit?: string | null;
  category?: string | null;
  imageUrl?: string | null;
  sourceLink?: string | null;
  availability?: string | null;
  rawText?: string | null;
  url?: string | null;
};

function normalizeUrl(input: string): string {
  return input.trim();
}

function isHardwareAndLumberUrl(url: string): boolean {
  return /hardwareandlumber\.com/i.test(url);
}

export function getHardwareLumberSupplier() {
  return {
    name: "Hardware & Lumber",
    key: "hardware-lumber",
    domain: "hardwareandlumber.com",
    patterns: [/hardwareandlumber\.com/i],
  };
}

function normalizeScrapeResult(
  payload: any,
  fallbackUrl: string,
): SupplierScrapeResult {
  return {
    success: Boolean(payload?.success),
    supplier: payload?.supplier || "Hardware & Lumber",
    url: payload?.url || fallbackUrl,
    itemNumber: payload?.itemNumber ?? payload?.item_number ?? null,
    materialName: payload?.materialName ?? payload?.material_name ?? null,
    description: payload?.description ?? null,
    costEach:
      typeof payload?.costEach === "number"
        ? payload.costEach
        : typeof payload?.cost_each === "number"
        ? payload.cost_each
        : payload?.costEach != null
        ? Number(payload.costEach)
        : payload?.cost_each != null
        ? Number(payload.cost_each)
        : null,
    currency: payload?.currency ?? "JMD",
    unit: payload?.unit ?? null,
    category: payload?.category ?? null,
    imageUrl: payload?.imageUrl ?? payload?.image_url ?? null,
    sourceLink: payload?.sourceLink ?? payload?.source_link ?? fallbackUrl,
    availability: payload?.availability ?? null,
    rawText: payload?.rawText ?? payload?.raw_text ?? null,
    error: payload?.error ?? null,
  };
}

export async function fetchHardwareLumberProduct(
  url: string,
): Promise<SupplierScrapeResult> {
  const cleanedUrl = normalizeUrl(url);

  if (!cleanedUrl) {
    return {
      success: false,
      supplier: "Hardware & Lumber",
      url: cleanedUrl,
      error: "Please enter a product URL.",
    };
  }

  const response = await supabase.functions.invoke("scrape-hardware-lumber", {
    body: { url: cleanedUrl },
  });

  const { data, error } = response;

  if (error) {
    return {
      success: false,
      supplier: "Hardware & Lumber",
      url: cleanedUrl,
      error: error.message || "Failed to call scrape-hardware-lumber.",
    };
  }

  const result = normalizeScrapeResult(data, cleanedUrl);

  if (!result.success && !result.error) {
    result.error = "Function returned no product data.";
  }

  return result;
}

export async function scrapeSupplierProduct(
  url: string,
): Promise<SupplierScrapeResult> {
  const cleanedUrl = normalizeUrl(url);

  if (!cleanedUrl) {
    return {
      success: false,
      supplier: "Unknown",
      url: cleanedUrl,
      error: "Please enter a product URL.",
    };
  }

  if (isHardwareAndLumberUrl(cleanedUrl)) {
    return fetchHardwareLumberProduct(cleanedUrl);
  }

  return {
    success: false,
    supplier: "Unknown",
    url: cleanedUrl,
    error: "Unsupported supplier URL.",
  };
}

export async function previewSupplierProduct(
  url: string,
): Promise<SupplierScrapeResult> {
  return scrapeSupplierProduct(url);
}

export async function saveScrapedProduct(input: SaveScrapedProductInput) {
  const payload = {
    supplier_id: input.supplierId ?? null,
    supplier_name: input.supplierName ?? null,
    item_number: input.itemNumber ?? null,
    material_name: input.materialName ?? null,
    description: input.description ?? null,
    cost_each: input.costEach ?? null,
    currency: input.currency ?? "JMD",
    unit: input.unit ?? null,
    category: input.category ?? null,
    image_url: input.imageUrl ?? null,
    source_link: input.sourceLink ?? input.url ?? null,
    availability: input.availability ?? null,
    raw_text: input.rawText ?? null,
    url: input.url ?? input.sourceLink ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("supplier_products")
    .insert(payload)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}