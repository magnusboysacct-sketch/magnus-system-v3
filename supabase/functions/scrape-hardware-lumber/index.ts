import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ScrapeBody = {
  url: string;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const body = (await req.json()) as ScrapeBody;
    const { url } = body;

    if (!url || typeof url !== "string") {
      return jsonResponse({ error: "URL is required" }, 400);
    }

    // Validate URL format - must be hardwareandlumber.com/item/...
    const urlPattern = /^https:\/\/(www\.)?hardwareandlumber\.com\/item\/([^\/?#]+)/;
    const urlMatch = url.match(urlPattern);
    
    if (!urlMatch) {
      return jsonResponse(
        { 
          error: "Invalid Hardware & Lumber URL format. Expected: https://www.hardwareandlumber.com/item/ITEM_NUMBER" 
        },
        400
      );
    }

    console.log("scrape-hardware-lumber:start", url);

    // Fetch H&L page server-side with browser-like headers
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
      "Accept-Encoding": "gzip, deflate, br",
      "Connection": "keep-alive",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Cache-Control": "max-age=0",
    };

    let html: string;
    try {
      const response = await fetch(url, { headers });
      
      console.log("scrape-hardware-lumber:fetch-status", response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      html = await response.text();
      
      console.log("scrape-hardware-lumber:html-length", html.length);
      
      if (!html || html.trim().length === 0) {
        throw new Error("Empty response from website");
      }
    } catch (fetchError) {
      console.error("scrape-hardware-lumber:fatal", fetchError);
      return jsonResponse(
        {
          error: "Failed to fetch product page",
          details: fetchError instanceof Error ? fetchError.message : "Unknown fetch error"
        },
        500
      );
    }

    // Parse the HTML using defensive regex extraction
    try {
      const result = parseHardwareLumberPage(html, url);
      console.log("scrape-hardware-lumber:result");

      return jsonResponse({
        success: true,
        supplier: "Hardware & Lumber",
        url: url,
        itemNumber: result.itemNumber || null,
        materialName: result.materialName || null,
        description: result.description || null,
        costEach: result.costEach || null,
        currency: result.currency || "JMD",
        unit: result.unit || null,
        category: result.category || null,
        imageUrl: result.imageUrl || null,
        sourceLink: url,
        availability: result.availability || null,
        rawText: html,
        error: null
      });
    } catch (parseError) {
      console.error("scrape-hardware-lumber:fatal", parseError);
      return jsonResponse(
        {
          error: "Failed to parse product data",
          details: parseError instanceof Error ? parseError.message : "Unknown parse error"
        },
        500
      );
    }
  } catch (err) {
    console.error("scrape-hardware-lumber:fatal", err);
    return jsonResponse(
      {
        error: "Unexpected server error",
        details: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
});

function parseHardwareLumberPage(html: string, url: string) {
  // Extract item number from URL first
  const itemNumber = extractItemNumber(url, html);
  
  // Extract all other fields
  const materialName = extractName(html);
  const description = extractDescription(html);
  const costEach = extractPriceValue(html);
  const currency = extractCurrency(html);
  const category = null; // REMOVED: Do not parse categoryTrail anymore
  const imageUrl = extractImage(html);
  const availability = extractAvailability(html);
  const unit = extractUnit(html);

  // Validate required fields - only itemNumber and materialName are required
  if (!itemNumber) {
    throw new Error("Could not extract item number from URL");
  }

  if (!materialName) {
    throw new Error("Could not extract product name from page");
  }

  // Price is optional - allow null values

  return {
    itemNumber,
    materialName,
    description,
    costEach,
    currency,
    unit,
    category,
    imageUrl,
    availability
  };
}

function isTrustworthyPriceCandidate(value: number, rawContext: string): boolean {
  // Reject values <= 5 unless explicitly currency-labeled
  if (value <= 5) {
    // Allow small values only if they have explicit currency symbols
    const hasCurrency = /[J\$|JA\$|JMD|\$]/.test(rawContext);
    if (!hasCurrency) return false;
  }
  
  // Reject if context suggests it's a dimension/size
  const lowerContext = rawContext.toLowerCase();
  const dimensionKeywords = [
    'in.', 'in', 'ft', 'ft.', 'mm', 'cm', 'm', 'meter', 'metre',
    'x', '×', '/', 'gauge', 'gal', 'lb', 'lbs', 'kg', 'oz',
    'pack', 'pc', 'pcs', 'piece', 'pieces', 'set', 'sets',
    'length', 'width', 'height', 'depth', 'thickness', 'diameter',
    'size', 'dimension', 'weight', 'capacity', 'volume'
  ];
  
  // Check if any dimension keywords appear near the value
  for (const keyword of dimensionKeywords) {
    if (lowerContext.includes(keyword)) {
      return false;
    }
  }
  
  // Reject fractions (e.g., "1/2", "3/4")
  if (rawContext.match(/\d+\/\d+/)) {
    return false;
  }
  
  // Reject values that look like counts with units (e.g., "2 pack", "10 pcs")
  if (lowerContext.match(/\d+\s*(pack|pc|pcs|piece|pieces|set|sets)/)) {
    return false;
  }
  
  return true;
}

// Helper functions

function cleanText(text: string): string {
  if (!text) return "";
  return text
    .replace(/\s+/g, " ")
    .replace(/[\r\n\t]/g, " ")
    .trim();
}

function decodeHtmlEntities(text: string): string {
  if (!text) return "";
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function firstMatch(patterns: RegExp[], text: string): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      return cleanText(decodeHtmlEntities(match[1]));
    }
  }
  return "";
}

function extractMeta(html: string, property: string): string {
  const patterns = [
    new RegExp(`<meta[^>]*property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*name=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]*itemprop=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i')
  ];
  
  return firstMatch(patterns, html);
}

function parsePrice(priceText: string | number): number | null {
  if (priceText === null || priceText === undefined) return null;
  
  // Convert to string if it's a number
  const text = String(priceText);
  if (!text.trim()) return null;
  
  // Remove currency symbols, commas, and whitespace
  const cleaned = text.replace(/[^\d.]/g, '');
  
  // Extract first valid decimal/integer
  const numberMatch = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!numberMatch) return null;
  
  // Convert to number
  const price = parseFloat(numberMatch[1]);
  
  return isNaN(price) ? null : price;
}

function extractElementTextById(html: string, id: string): string | null {
  const pattern = new RegExp(`<[^>]*id=["']${id}["'][^>]*>([^<]+)`, 'i');
  const match = html.match(pattern);
  
  if (match && match[1]) {
    return cleanText(decodeHtmlEntities(match[1]));
  }
  
  return null;
}

function extractElementBlockById(html: string, id: string): string | null {
  const pattern = new RegExp(`<[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)(?=<\\/[^>]*id=["'][^"]*["'][^>]*|<\\/div>|<\\/span>|<\\/p>|$)`, 'i');
  const match = html.match(pattern);
  
  if (match && match[1]) {
    return match[1];
  }
  
  // Try a simpler pattern for exact ID match
  const simplePattern = new RegExp(`<[^>]*id=["']${id}["'][^>]*>([\\s\\S]*?)<\\/[^>]*>`, 'i');
  const simpleMatch = html.match(simplePattern);
  
  if (simpleMatch && simpleMatch[1]) {
    return simpleMatch[1];
  }
  
  return null;
}

function extractItemNumber(url: string, html: string): string {
  // Priority a: hidden input curItem
  const curItemMatch = html.match(/<input[^>]*name=["']curItem["'][^>]*value=["']([^"']*)["']/i);
  if (curItemMatch && curItemMatch[1]) {
    return cleanText(decodeHtmlEntities(curItemMatch[1]));
  }
  
  // Priority b: URL /item/{ITEM}/
  const urlMatch = url.match(/\/item\/([^\/?#]+)/);
  if (urlMatch) {
    return urlMatch[1];
  }
  
  // Priority c: itemNumber block
  const itemNumberBlock = extractElementBlockById(html, 'itemNumber');
  if (itemNumberBlock) {
    const text = cleanText(decodeHtmlEntities(itemNumberBlock.replace(/<[^>]*>/g, '')));
    if (text && text !== 'Unknown Product') {
      return text;
    }
  }
  
  return "";
}

function extractName(html: string): string {
  // Prefer Product wrapper content near schema Product and right-side detail section
  const productSectionMatch = html.match(/<div[^>]*class="[^"]*product[^"]*"[^>]*>[\\s\\S]*?<h1[^>]*>([^<]+)/i);
  if (productSectionMatch && productSectionMatch[1]) {
    const candidate = cleanText(decodeHtmlEntities(productSectionMatch[1]));
    if (!isInvalidProductName(candidate)) {
      console.log("scrape-hardware-lumber:name-final", candidate);
      return candidate;
    }
  }
  
  // Prefer exact title-like uppercase product text near the item detail section
  const detailSectionMatch = html.match(/<div[^>]*class="[^"]*(?:detail|product-detail|item-detail)[^"]*"[^>]*>[\\s\\S]*?<h[1-6][^>]*>([^<]+)/i);
  if (detailSectionMatch && detailSectionMatch[1]) {
    const candidate = cleanText(decodeHtmlEntities(detailSectionMatch[1]));
    if (!isInvalidProductName(candidate)) {
      console.log("scrape-hardware-lumber:name-final", candidate);
      return candidate;
    }
  }
  
  // Fallback: <span itemprop="name">...</span>
  const nameMatch = html.match(/<span[^>]*itemprop="[^"]*name[^"]*"[^>]*>([^<]+)/i);
  if (nameMatch && nameMatch[1]) {
    const candidate = cleanText(decodeHtmlEntities(nameMatch[1]));
    if (!isInvalidProductName(candidate)) {
      console.log("scrape-hardware-lumber:name-final", candidate);
      return candidate;
    }
  }
  
  // Fallback: <h1 ...>...</h1>
  const h1Match = html.match(/<h1[^>]*>([^<]+)/i);
  if (h1Match && h1Match[1]) {
    const candidate = cleanText(decodeHtmlEntities(h1Match[1]));
    if (!isInvalidProductName(candidate)) {
      console.log("scrape-hardware-lumber:name-final", candidate);
      return candidate;
    }
  }
  
  // Last resort: Use description as fallback
  const description = extractDescription(html);
  if (description && description !== "No description available") {
    // Use first 100 characters of description as name
    const candidate = cleanText(decodeHtmlEntities(description.substring(0, 100)));
    if (!isInvalidProductName(candidate)) {
      console.log("scrape-hardware-lumber:name-final", candidate);
      return candidate;
    }
  }
  
  console.log("scrape-hardware-lumber:name-final", "Unknown Product");
  return "Unknown Product";
}

function extractDescription(html: string): string {
  // Read directly from id="itemDescription"
  const descriptionBlock = extractElementBlockById(html, 'itemDescription');
  if (descriptionBlock) {
    return cleanText(decodeHtmlEntities(descriptionBlock.replace(/<[^>]*>/g, '')));
  }
  
  // Fallback to other description methods
  const descMatch = html.match(/<div[^>]*id="itemDescription"[^>]*>([\s\S]*?)(?=<\/div>)/i);
  if (descMatch) {
    return cleanText(decodeHtmlEntities(descMatch[1].replace(/<[^>]*>/g, '')));
  }
  
  const classPatterns = [
    /<div[^>]*class="[^"]*item-description[^"]*"[^>]*>([\s\S]*?)(?=<\/div>)/i,
    /<div[^>]*class="[^"]*itemDescription[^"]*"[^>]*>([\s\S]*?)(?=<\/div>)/i,
    /<p[^>]*class="[^"]*description[^"]*"[^>]*>([\s\S]*?)(?=<\/p>)/i
  ];
  
  for (const pattern of classPatterns) {
    const match = html.match(pattern);
    if (match) {
      return cleanText(decodeHtmlEntities(match[1].replace(/<[^>]*>/g, '')));
    }
  }
  
  return extractMeta(html, 'description') || "No description available";
}

function extractCategory(html: string): string {
  // Read text from id="categoryTrail"
  const categoryBlock = extractElementBlockById(html, 'categoryTrail');
  if (categoryBlock) {
    const text = cleanText(decodeHtmlEntities(categoryBlock.replace(/<[^>]*>/g, '')));
    if (text && text.trim()) {
      console.log("scrape-hardware-lumber:category-trail-text", text);
      return text;
    }
  }
  
  // Fallback to other category methods
  const metaCategory = extractMeta(html, 'category');
  if (metaCategory) return metaCategory;
  
  const patterns = [
    /<nav[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>[^<]*<a[^>]*>([^<]+)<\/a>/i,
    /<div[^>]*class="[^"]*category[^"]*"[^>]*>([^<]+)/i,
    /<span[^>]*class="[^"]*category[^"]*"[^>]*>([^<]+)/i
  ];
  
  return firstMatch(patterns, html) || "General";
}

function extractUnit(html: string): string | null {
  // Parse script pattern: var itemsAndUOMs = {"H24115283":{"EA":1}}
  const uomScriptMatch = html.match(/var itemsAndUOMs = ({[^;]+});/i);
  if (uomScriptMatch) {
    try {
      const uomData = JSON.parse(uomScriptMatch[1]);
      // Find the first item's UOM
      for (const itemKey in uomData) {
        const itemUoms = uomData[itemKey];
        for (const uom in itemUoms) {
          const mappedUom = mapUomCode(uom);
          if (mappedUom) {
            console.log("scrape-hardware-lumber:uom-match", `${uom} => ${mappedUom}`);
            return mappedUom;
          }
        }
      }
    } catch (e) {
      // Continue to fallback
    }
  }
  
  // Fallback to existing unit inference
  const materialName = extractName(html);
  const description = extractDescription(html);
  return inferUnit(materialName, description);
}

function mapUomCode(code: string): string | null {
  const uomMap: { [key: string]: string } = {
    'EA': 'Each',
    'LG': 'Length',
    'FT': 'Length',
    'IN': 'Length',
    'M': 'Length',
    'CM': 'Length',
    'MM': 'Length',
    'KG': 'Weight',
    'LB': 'Weight',
    'GAL': 'Volume',
    'L': 'Volume',
    'ML': 'Volume',
    'M2': 'Area',
    'SQFT': 'Area',
    'SQM': 'Area',
    'PACK': 'Pack',
    'BOX': 'Box',
    'BAG': 'Bag',
    'ROLL': 'Roll',
    'SHEET': 'Sheet',
    'BUNDLE': 'Bundle'
  };
  
  return uomMap[code.toUpperCase()] || null;
}

function isInvalidProductName(value: string | null): boolean {
  if (!value || value.trim().length === 0) return true;
  
  const cleaned = value.trim().toLowerCase();
  
  // Check for template/script placeholders
  if (cleaned.includes('data.description')) return true;
  if (cleaned.includes('+data.')) return true;
  if (cleaned.includes('{{')) return true;
  if (cleaned.includes('}}')) return true;
  if (cleaned.includes('${')) return true;
  if (cleaned.includes('<%')) return true;
  if (cleaned.includes('%>')) return true;
  
  // Check for obvious template syntax patterns
  if (cleaned.includes('data.') && cleaned.includes('+')) return true;
  if (cleaned.match(/\+\s*data\./)) return true;
  if (cleaned.match(/data\.\w+\s*\+/)) return true;
  
  // Check for placeholder text
  if (cleaned === 'unknown product') return true;
  if (cleaned === 'product name') return true;
  if (cleaned === 'item name') return true;
  
  // Check for generic/placeholder text
  if (cleaned === 'product') return true;
  if (cleaned === 'item') return true;
  if (cleaned === 'n/a') return true;
  if (cleaned === 'tbd') return true;
  
  return false;
}

function extractPriceValue(html: string): number | null {
  // Priority a: Extract from id="UMprice" first (current active selling price)
  const umprice = extractElementTextById(html, 'UMprice');
  if (umprice) {
    console.log("scrape-hardware-lumber:umprice-text", umprice);
    const parsed = parsePrice(umprice);
    if (parsed !== null) {
      console.log("scrape-hardware-lumber:price-final", `UMprice: ${parsed}`);
      return parsed;
    }
  }
  
  // Log UMprice2 for debugging (suggested/old price)
  const umprice2 = extractElementTextById(html, 'UMprice2');
  if (umprice2) {
    console.log("scrape-hardware-lumber:umprice2-text", umprice2);
  }
  
  // Priority b: If UMprice not found, fall back to currency values inside id="priceContainer"
  const priceContainer = extractElementBlockById(html, 'priceContainer');
  if (priceContainer) {
    console.log("scrape-hardware-lumber:price-container-text", priceContainer.substring(0, 200));
    
    // Support these formats: $2,839.39, J$2,839.39, JA$2,839.39, JMD 2,839.39
    const currencyPatterns = [
      /J\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
      /JA\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
      /JMD\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi,
      /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/gi
    ];
    
    const prices: number[] = [];
    
    for (const pattern of currencyPatterns) {
      const matches = priceContainer.matchAll(pattern);
      for (const match of matches) {
        if (match && match[1]) {
          const parsed = parsePrice(match[1]);
          if (parsed !== null && parsed > 0) {
            prices.push(parsed);
          }
        }
      }
    }
    
    if (prices.length > 0) {
      // If multiple currency values are found in priceContainer, use the LOWER one as current selling price
      const finalPrice = prices.length === 1 ? prices[0] : Math.min(...prices);
      console.log("scrape-hardware-lumber:price-final", `priceContainer: ${finalPrice}`);
      return finalPrice;
    }
  }
  
  // Never return null if UMprice clearly exists - check again
  if (umprice) {
    const umpriceParsed = parsePrice(umprice);
    if (umpriceParsed !== null) {
      console.log("scrape-hardware-lumber:price-final", `UMprice-fallback: ${umpriceParsed}`);
      return umpriceParsed;
    }
  }
  
  console.log("scrape-hardware-lumber:price-final", "null - no trustworthy price found");
  return null;
}

function extractCurrency(html: string): string {
  const metaCurrency = extractMeta(html, 'price:currency');
  if (metaCurrency) return metaCurrency;
  
  // Look for JMD or $ in price text
  if (html.includes('JMD')) return 'JMD';
  if (html.includes('$')) return 'JMD';
  
  return 'JMD';
}

function extractImage(html: string): string | null {
  // Try meta tags
  const metaImage = extractMeta(html, 'image');
  if (metaImage) return metaImage;
  
  // Try og:image specifically
  const ogImage = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i);
  if (ogImage && ogImage[1]) return ogImage[1];
  
  // Try itemprop="image"
  const itempropImage = html.match(/<[^>]*itemprop="[^"]*image[^"]*"[^>]*content=["']([^"']*)["']/i);
  if (itempropImage && itempropImage[1]) return itempropImage[1];
  
  // Try img tags
  const imgPatterns = [
    /<img[^>]*src=["']([^"']*)["']/i,
    /<img[^>]*data-src=["']([^"']*)["']/i
  ];
  
  const imageSrc = firstMatch(imgPatterns, html);
  return imageSrc || null;
}

function extractAvailability(html: string): string | null {
  const patterns = [
    /<[^>]*class="[^"]*(?:stock|availability|in-stock)[^"]*"[^>]*>([^<]+)/i,
    /<span[^>]*class="[^"]*stock-status[^"]*"[^>]*>([^<]+)/i,
    /<div[^>]*class="[^"]*availability[^"]*"[^>]*>([^<]+)/i
  ];
  
  const availability = firstMatch(patterns, html);
  if (!availability) return null;
  
  // Normalize availability text
  const normalized = availability.toLowerCase();
  if (normalized.includes('in stock') || normalized.includes('available')) {
    return 'In Stock';
  } else if (normalized.includes('out of stock') || normalized.includes('unavailable')) {
    return 'Out of Stock';
  }
  
  return availability;
}

function inferUnit(materialName: string, description: string): string | null {
  const text = `${materialName} ${description}`.toLowerCase();
  
  // Specific unit patterns
  if (text.includes('roll') || text.includes('wire') || text.includes('cable')) {
    return 'Roll';
  }
  if (text.includes('bag')) return 'Bag';
  if (text.includes('box')) return 'Box';
  if (text.includes('pack')) return 'Pack';
  if (text.includes('bundle')) return 'Bundle';
  if (text.includes('sheet') || text.includes('plywood')) return 'Sheet';
  if (text.includes('length') || text.includes('ft') || text.includes('feet')) return 'Length';
  if (text.includes('each') || text.includes('piece') || text.includes('unit')) return 'Each';
  
  return null;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}
