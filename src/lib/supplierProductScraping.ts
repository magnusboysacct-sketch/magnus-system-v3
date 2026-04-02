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
    unit: input.unit ?? "each", // Safe default to "each" instead of null
    category: input.category ?? null,
    image_url: input.imageUrl ?? null,
    source_link: input.sourceLink ?? input.url ?? null,
    availability: input.availability ?? null,
    raw_text: input.rawText ?? null,
    url: input.url ?? input.sourceLink ?? null,
    updated_at: new Date().toISOString(),
  };

  console.log("saveScrapedProduct: Inserting payload:", payload);

  const { data, error } = await supabase
    .from("supplier_products")
    .insert(payload)
    .select()
    .single();

  if (error) {
    console.error("saveScrapedProduct: Supabase error:", error);
    throw error;
  }

  console.log("DB_SAVE_RESULT", data);

  // Verify the saved row immediately after insert
  if (data && input.itemNumber) {
    const { data: checkData, error: checkError } = await supabase
      .from("supplier_products")
      .select("*")
      .eq("item_number", input.itemNumber);

    console.log("DB_VERIFY_RESULT", checkData, checkError);
  }

  // PROMOTION: Add to cost_items for Rate Library
  const warnings: string[] = [];
  let costItem: any = null;
  let rateRow: any = null;

  try {
    // Check for existing cost item by cost_code (item_number)
    let existingCostItem = null;
    if (input.itemNumber) {
      const { data: existing } = await supabase
        .from("cost_items")
        .select("id")
        .eq("cost_code", input.itemNumber)
        .single();
      
      existingCostItem = existing;
    }

    // Insert or reuse cost item
    const costItemPayload = {
      item_name: input.materialName || input.itemNumber || "Unknown Item",
      description: input.description || null,
      variant: null,
      cost_code: input.itemNumber || null,
      category: "Uncategorized",
      item_type: "Material",
      unit: input.unit || "each",
      updated_at: new Date().toISOString(),
    };

    console.log("PROMOTE_COST_ITEM payload:", costItemPayload);

    if (existingCostItem) {
      costItem = existingCostItem;
      console.log("PROMOTE_COST_ITEM: Reusing existing cost item:", costItem);
    } else {
      const { data: newCostItem, error: costItemError } = await supabase
        .from("cost_items")
        .insert(costItemPayload)
        .select("id")
        .single();

      if (costItemError) {
        console.error("PROMOTE_COST_ITEM error:", costItemError);
        warnings.push(`Failed to promote to Rate Library: ${costItemError.message}`);
      } else {
        costItem = newCostItem;
        console.log("PROMOTE_COST_ITEM result:", costItem);
      }
    }

    // Insert rate if we have a cost item and valid price
    if (costItem && typeof input.costEach === 'number' && input.costEach > 0) {
      const ratePayload = {
        cost_item_id: costItem.id,
        rate: input.costEach,
        currency: "JMD",
        effective_date: new Date().toISOString().slice(0, 10),
        source: "supplier_import",
      };

      console.log("PROMOTE_RATE payload:", ratePayload);

      const { data: newRate, error: rateError } = await supabase
        .from("cost_item_rates")
        .insert(ratePayload)
        .select()
        .single();

      if (rateError) {
        console.error("PROMOTE_RATE error:", rateError);
        warnings.push(`Failed to save rate to Rate Library: ${rateError.message}`);
      } else {
        rateRow = newRate;
        console.log("PROMOTE_RATE result:", rateRow);
      }
    }
  } catch (promoteError) {
    console.error("PROMOTION error:", promoteError);
    warnings.push(`Rate Library promotion failed: ${promoteError instanceof Error ? promoteError.message : 'Unknown error'}`);
  }

  console.log("saveScrapedProduct: Inserted data:", data);
  
  // Return enhanced result with promotion info
  const result = {
    success: true,
    warnings: warnings.length > 0 ? warnings : undefined,
    supplierProduct: data,
    costItem: costItem,
    rate: rateRow,
  };
  
  return result;
}