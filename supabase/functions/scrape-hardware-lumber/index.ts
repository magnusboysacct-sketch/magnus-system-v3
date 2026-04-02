const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type ScrapeBody = {
  url: string;
};

interface HardwareLumberProduct {
  ItemNumber: string;
  MaterialName: string;
  CostEach: number;
  Description: string;
  Category: string;
  SourceLink: string;
  Supplier: string;
  LastUpdated: string;
}

export default {
  async fetch(req: Request): Promise<Response> {
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

      // Validate URL format
      if (!url.startsWith("http")) {
        return jsonResponse(
          { error: "Please enter a valid URL starting with http:// or https://" },
          400
        );
      }

      // Extract ItemNumber from H&L URL - support both /product/ and /item/ formats
      let itemNumber: string;
      const productMatch = url.match(/\/product\/([^\/?#]+)/);
      const itemMatch = url.match(/\/item\/([^\/?#]+)/);
      
      if (productMatch) {
        itemNumber = productMatch[1];
      } else if (itemMatch) {
        itemNumber = itemMatch[1];
      } else {
        return jsonResponse(
          {
            error: "Invalid Hardware & Lumber URL format. Expected: https://www.hardwareandlumber.com/product/ITEM_NUMBER or https://www.hardwareandlumber.com/item/ITEM_NUMBER/..."
          },
          400
        );
      }

      console.log("SCRAPE START", url);

      // Fetch H&L page server-side
      const headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
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
        
        console.log("FETCH STATUS", response.status);
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        html = await response.text();
        
        console.log("HTML LENGTH", html.length);
        
        if (!html || html.trim().length === 0) {
          throw new Error("Empty response from website");
        }
      } catch (fetchError) {
        console.error("SCRAPE ERROR", fetchError);
        return jsonResponse(
          {
            error: "Failed to fetch product page",
            details: fetchError instanceof Error ? fetchError.message : "Unknown fetch error"
          },
          500
        );
      }

      // Parse the HTML
      let product: HardwareLumberProduct;
      try {
        product = parseHardwareLumberHTML(html, url);
        console.log("SCRAPE SUCCESS");
      } catch (parseError) {
        console.error("SCRAPE ERROR", parseError);
        return jsonResponse(
          {
            error: "Failed to parse product data",
            details: parseError instanceof Error ? parseError.message : "Unknown parse error"
          },
          500
        );
      }

      return jsonResponse({
        success: true,
        product
      });
    } catch (err) {
      console.error("SCRAPE ERROR", err);
      return jsonResponse(
        {
          error: "Unexpected server error",
          details: err instanceof Error ? err.message : String(err),
        },
        500
      );
    }
  }
};

function parseHardwareLumberHTML(html: string, url: string): HardwareLumberProduct {
  // Simple regex-based HTML parsing to avoid DOM dependencies
  const extractText = (pattern: RegExp): string => {
    const match = html.match(pattern);
    return match && match[1] ? match[1].trim() : "";
  };

  // Extract ItemNumber from page itself
  const extractItemNumber = (): string => {
    // Try to find item number in various places using regex
    const patterns = [
      /<[^>]*class="[^"]*product-sku[^"]*"[^>]*>([^<]+)/i,
      /<[^>]*class="[^"]*item-number[^"]*"[^>]*>([^<]+)/i,
      /<[^>]*class="[^"]*sku[^"]*"[^>]*>([^<]+)/i,
      /<[^>]*data-sku="([^"]*)"[^>]*>/i,
      /<[^>]*class="[^"]*product-code[^"]*"[^>]*>([^<]+)/i,
      /<[^>]*class="[^"]*model-number[^"]*"[^>]*>([^<]+)/i
    ];
    
    for (const pattern of patterns) {
      const text = extractText(pattern);
      if (text) return text;
    }
    
    // Fallback: extract from URL - support both /product/ and /item/ formats
    const productMatch = url.match(/\/product\/([^\/?#]+)/);
    const itemMatch = url.match(/\/item\/([^\/?#]+)/);
    
    if (productMatch) {
      return productMatch[1];
    } else if (itemMatch) {
      return itemMatch[1];
    } else {
      return "UNKNOWN";
    }
  };

  // Extract product information using regex patterns
  const itemName = extractText(/<h1[^>]*class="[^"]*product-title[^"]*"[^>]*>([^<]+)|<h1[^>]*>([^<]+)/i) || 
                   extractText(/<[^>]*class="[^"]*product-name[^"]*"[^>]*>([^<]+)/i) || 
                   "Unknown Product";

  const itemPrice = extractText(/<[^>]*class="[^"]*(?:price|product-price|price-current|sale-price)[^"]*"[^>]*>([^<]+)/i) || "0";

  const description = extractText(/<[^>]*class="[^"]*(?:product-description|description|product-details|product-short-description)[^"]*"[^>]*>([^<]+)/i) || 
                     "No description available";

  const category = extractText(/<[^>]*class="[^"]*(?:category|product-category)[^"]*"[^>]*>([^<]+)/i) || 
                  extractText(/<[^>]*class="[^"]*breadcrumb[^"]*"[^>]*>[^<]*<a[^>]*class="[^"]*[^"]*"[^>]*>([^<]+)<\/a>/i);

  // Clean and validate extracted data
  const itemNumber = extractItemNumber();
  const materialName = itemName || "Unknown Product";
  const costEach = cleanPrice(itemPrice);
  const descriptionText = description || "No description available";
  const categoryText = category || mapToStandardCategory(materialName);

  // Validate required fields
  if (itemNumber === "UNKNOWN") {
    throw new Error("Could not extract item number from product page");
  }

  if (!materialName || materialName === "Unknown Product") {
    throw new Error("Could not extract product name from page");
  }

  if (!costEach || costEach <= 0) {
    throw new Error("Could not extract valid price from page");
  }

  return {
    ItemNumber: itemNumber,
    MaterialName: materialName,
    CostEach: costEach,
    Description: descriptionText,
    Category: categoryText,
    SourceLink: url,
    Supplier: "Hardware & Lumber",
    LastUpdated: new Date().toISOString()
  };
}

/**
 * Clean price text and convert to number
 */
function cleanPrice(priceText: string): number {
  if (!priceText) return 0;
  
  // Remove currency symbols, commas, and whitespace
  const cleaned = priceText.replace(/[^\d.]/g, "");
  
  // Convert to number
  const price = parseFloat(cleaned);
  
  return isNaN(price) ? 0 : price;
}

/**
 * Map product name to standard category
 */
function mapToStandardCategory(materialName: string): string {
  const name = materialName.toLowerCase();
  
  // Lumber categories
  if (name.includes("lumber") || name.includes("wood") || name.includes("timber") || name.includes("plywood") || name.includes("board")) {
    return "Lumber";
  }
  
  // Hardware categories
  if (name.includes("nail") || name.includes("screw") || name.includes("bolt") || name.includes("fastener")) {
    return "Fasteners";
  }
  
  if (name.includes("hinge") || name.includes("lock") || name.includes("handle") || name.includes("door")) {
    return "Hardware";
  }
  
  // Tools
  if (name.includes("tool") || name.includes("drill") || name.includes("saw") || name.includes("hammer")) {
    return "Tools";
  }
  
  // Building materials
  if (name.includes("cement") || name.includes("concrete") || name.includes("sand") || name.includes("gravel")) {
    return "Building Materials";
  }
  
  // Electrical
  if (name.includes("wire") || name.includes("cable") || name.includes("switch") || name.includes("outlet")) {
    return "Electrical";
  }
  
  // Plumbing
  if (name.includes("pipe") || name.includes("fitting") || name.includes("valve") || name.includes("faucet")) {
    return "Plumbing";
  }
  
  // Paint
  if (name.includes("paint") || name.includes("primer") || name.includes("stain") || name.includes("sealant")) {
    return "Paint";
  }
  
  // Roofing
  if (name.includes("roof") || name.includes("shingle") || name.includes("gutter") || name.includes("flashing")) {
    return "Roofing";
  }
  
  // Default
  return "General";
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
