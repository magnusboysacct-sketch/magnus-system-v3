/**
 * Universal Document Classifier for Magnus System v3
 * 
 * Classifies documents based on OCR text using keyword scoring systems
 * Optimized for Jamaican business use cases including fuel, hardware, invoices,
 * tax documents, and worker payment forms.
 * 
 * Enhanced with invoice routing for specialized invoice scanner.
 */

export type DocumentType = 
  | 'receipt'
  | 'fuel_receipt' 
  | 'hardware_receipt'
  | 'invoice'
  | 'tax_invoice'
  | 'payment_voucher'
  | 'purchase_order'
  | 'estimate'
  | 'worker_payment_form'
  | 'id_card'
  | 'unknown';

export interface ClassificationResult {
  documentType: DocumentType;
  confidence: number;
  scores: Record<DocumentType, number>;
  topKeywords: Array<{
    type: DocumentType;
    keyword: string;
    weight: number;
    found: boolean;
  }>;
  reasoning: string;
}

/**
 * Keyword definitions for each document type with weights
 */
interface KeywordDefinition {
  keyword: string;
  weight: number; // 1-10, higher weight = more important
  variants?: string[]; // OCR variants of the keyword
}

const DOCUMENT_KEYWORDS: Record<DocumentType, KeywordDefinition[]> = {
  // Fuel receipts - gas stations, fuel purchases
  fuel_receipt: [
    { keyword: 'FUEL', weight: 10, variants: ['FUEL', 'FUEI', 'FUL', 'FURL'] },
    { keyword: 'GAS', weight: 9, variants: ['GAS', 'GASOLINE', 'GASOLINI'] },
    { keyword: 'PETROL', weight: 9, variants: ['PETROL', 'PETROLIUM'] },
    { keyword: 'LITRE', weight: 8, variants: ['LITRE', 'LITER', 'L', 'LTRS'] },
    { keyword: 'GALLON', weight: 8, variants: ['GALLON', 'GAL', 'GALLONS'] },
    { keyword: 'FESCO', weight: 10, variants: ['FESCO', 'FESO'] },
    { keyword: 'TEXACO', weight: 9, variants: ['TEXACO', 'TEXCO'] },
    { keyword: 'SHELL', weight: 9, variants: ['SHELL', 'SHEL'] },
    { keyword: 'TOTAL', weight: 8, variants: ['TOTAL', 'TOTA'] },
    { keyword: 'RUBIS', weight: 8, variants: ['RUBIS', 'RUBI'] },
    { keyword: 'PUMP', weight: 7, variants: ['PUMP', 'PUM'] },
    { keyword: 'DIESEL', weight: 8, variants: ['DIESEL', 'DISEL'] },
    { keyword: 'OCTANE', weight: 7, variants: ['OCTANE', 'OCTAN'] },
    { keyword: 'KM', weight: 5, variants: ['KM', 'KILOMETER', 'KILOMETRE'] },
    { keyword: 'ODOMETER', weight: 6, variants: ['ODOMETER', 'ODO'] }
  ],

  // Hardware receipts - building materials, tools
  hardware_receipt: [
    { keyword: 'HARDWARE', weight: 10, variants: ['HARDWARE', 'HARDWARI'] },
    { keyword: 'LUMBER', weight: 9, variants: ['LUMBER', 'LUMBR'] },
    { keyword: 'H&L', weight: 9, variants: ['H&L', 'HL', 'H AND L'] },
    { keyword: 'RAPID', weight: 8, variants: ['RAPID', 'RAPD'] },
    { keyword: 'TRUE VALUE', weight: 8, variants: ['TRUE VALUE', 'TRU VALU'] },
    { keyword: 'NAILS', weight: 6, variants: ['NAILS', 'NAIL'] },
    { keyword: 'CEMENT', weight: 7, variants: ['CEMENT', 'CEMNT'] },
    { keyword: 'STEEL', weight: 7, variants: ['STEEL', 'STEL'] },
    { keyword: 'PAINT', weight: 6, variants: ['PAINT', 'PANT'] },
    { keyword: 'TOOLS', weight: 6, variants: ['TOOLS', 'TOOL'] },
    { keyword: 'PLYWOOD', weight: 6, variants: ['PLYWOOD', 'PLYWD'] },
    { keyword: 'BUILDING', weight: 5, variants: ['BUILDING', 'BILDING'] },
    { keyword: 'CONSTRUCTION', weight: 5, variants: ['CONSTRUCTION', 'CONSTRCTN'] }
  ],

  // General receipts
  receipt: [
    { keyword: 'RECEIPT', weight: 10, variants: ['RECEIPT', 'RECEIPT', 'RECPT'] },
    { keyword: 'CASH', weight: 8, variants: ['CASH', 'CAS'] },
    { keyword: 'SALE', weight: 7, variants: ['SALE', 'SAL'] },
    { keyword: 'REGISTER', weight: 6, variants: ['REGISTER', 'REGSTR'] },
    { keyword: 'TERMINAL', weight: 6, variants: ['TERMINAL', 'TRMINL'] },
    { keyword: 'CHANGE', weight: 5, variants: ['CHANGE', 'CHNG'] },
    { keyword: 'THANK YOU', weight: 4, variants: ['THANK YOU', 'THANK', 'THX'] },
    { keyword: 'CUSTOMER', weight: 4, variants: ['CUSTOMER', 'CUSTMR'] }
  ],

  // Invoices
  invoice: [
    { keyword: 'INVOICE', weight: 10, variants: ['INVOICE', 'INVOIC', 'INVOCE'] },
    { keyword: 'BILL TO', weight: 9, variants: ['BILL TO', 'BILL TO', 'BILL'] },
    { keyword: 'TOTAL DUE', weight: 8, variants: ['TOTAL DUE', 'TOTAL DUE', 'TOTAL'] },
    { keyword: 'BALANCE DUE', weight: 8, variants: ['BALANCE DUE', 'BALANCE DUE', 'BALANCE'] },
    { keyword: 'GRAND TOTAL', weight: 7, variants: ['GRAND TOTAL', 'GRAND TOT', 'GRAND'] },
    { keyword: 'SUBTOTAL', weight: 6, variants: ['SUBTOTAL', 'SUB TOT', 'SUB'] },
    { keyword: 'DUE DATE', weight: 6, variants: ['DUE DATE', 'DUE DAT', 'DUE'] },
    { keyword: 'TERMS', weight: 5, variants: ['TERMS', 'TRMS'] },
    { keyword: 'PO', weight: 5, variants: ['PO', 'P.O.', 'PURCHASE ORDER'] }
  ],

  // Tax invoices (Jamaican specific)
  tax_invoice: [
    { keyword: 'TAX INVOICE', weight: 10, variants: ['TAX INVOICE', 'TAX INVOIC', 'TAX INV'] },
    { keyword: 'VAT', weight: 9, variants: ['VAT', 'V.A.T.', 'VALUE ADDED TAX'] },
    { keyword: 'GCT', weight: 9, variants: ['GCT', 'G.C.T.', 'GENERAL CONSUMPTION TAX'] },
    { keyword: 'TAX ID', weight: 8, variants: ['TAX ID', 'TAX ID', 'TAXIDENTIFICATION'] },
    { keyword: 'TRN', weight: 8, variants: ['TRN', 'T.R.N.', 'TAX RELIEF NUMBER'] },
    { keyword: 'TAXABLE', weight: 6, variants: ['TAXABLE', 'TAXABL'] },
    { keyword: 'EXEMPT', weight: 5, variants: ['EXEMPT', 'EXMPT'] }
  ],

  // Payment vouchers
  payment_voucher: [
    { keyword: 'VOUCHER', weight: 10, variants: ['VOUCHER', 'VOUCHR', 'VOUCH'] },
    { keyword: 'PAYMENT VOUCHER', weight: 10, variants: ['PAYMENT VOUCHER', 'PAYMENT VOUCHR'] },
    { keyword: 'PAYMENT', weight: 8, variants: ['PAYMENT', 'PAYMENT', 'PAY'] },
    { keyword: 'APPROVED', weight: 7, variants: ['APPROVED', 'APPROVD'] },
    { keyword: 'AUTHORIZED', weight: 7, variants: ['AUTHORIZED', 'AUTHRIZED'] },
    { keyword: 'SIGNATURE', weight: 6, variants: ['SIGNATURE', 'SIGNATUR'] },
    { keyword: 'CHEQUE', weight: 6, variants: ['CHEQUE', 'CHEQ', 'CHECK'] },
    { keyword: 'BANK', weight: 5, variants: ['BANK', 'BANK'] }
  ],

  // Purchase orders
  purchase_order: [
    { keyword: 'PURCHASE ORDER', weight: 10, variants: ['PURCHASE ORDER', 'PURCHASE ORD', 'P.O.'] },
    { keyword: 'PURCHASE', weight: 8, variants: ['PURCHASE', 'PURCHAS'] },
    { keyword: 'ORDER', weight: 7, variants: ['ORDER', 'ORDR'] },
    { keyword: 'SUPPLIER', weight: 6, variants: ['SUPPLIER', 'SUPPLR'] },
    { keyword: 'DELIVERY', weight: 6, variants: ['DELIVERY', 'DELIVRY'] },
    { keyword: 'QUANTITY', weight: 5, variants: ['QUANTITY', 'QTY', 'QUANT'] },
    { keyword: 'UNIT PRICE', weight: 5, variants: ['UNIT PRICE', 'UNIT PRC'] },
    { keyword: 'SHIP TO', weight: 5, variants: ['SHIP TO', 'SHIP TO'] }
  ],

  // Estimates/quotes
  estimate: [
    { keyword: 'ESTIMATE', weight: 10, variants: ['ESTIMATE', 'ESTIMAT', 'EST'] },
    { keyword: 'QUOTE', weight: 10, variants: ['QUOTE', 'QUOT', 'QOT'] },
    { keyword: 'QUOTATION', weight: 9, variants: ['QUOTATION', 'QUOTATN'] },
    { keyword: 'PROPOSAL', weight: 8, variants: ['PROPOSAL', 'PROPOS'] },
    { keyword: 'VALID UNTIL', weight: 6, variants: ['VALID UNTIL', 'VALID UNT'] },
    { keyword: 'EXPIRY', weight: 6, variants: ['EXPIRY', 'EXPIRY'] },
    { keyword: 'LABOR', weight: 5, variants: ['LABOR', 'LABOUR'] },
    { keyword: 'MATERIALS', weight: 5, variants: ['MATERIALS', 'MATRLS'] }
  ],

  // Worker payment forms (Jamaican specific)
  worker_payment_form: [
    { keyword: 'WORKER', weight: 10, variants: ['WORKER', 'WORKR', 'WKR'] },
    { keyword: 'PAYMENT', weight: 9, variants: ['PAYMENT', 'PAYMENT', 'PAY'] },
    { keyword: 'WAGES', weight: 8, variants: ['WAGES', 'WAGS'] },
    { keyword: 'SALARY', weight: 8, variants: ['SALARY', 'SALRY'] },
    { keyword: 'HOURS', weight: 7, variants: ['HOURS', 'HRS', 'HOUR'] },
    { keyword: 'RATE', weight: 7, variants: ['RATE', 'RATE'] },
    { keyword: 'DAILY', weight: 6, variants: ['DAILY', 'DAILY'] },
    { keyword: 'LABOUR', weight: 6, variants: ['LABOUR', 'LABOR', 'LABR'] },
    { keyword: 'OVERTIME', weight: 6, variants: ['OVERTIME', 'OVRTIM'] },
    { keyword: 'DEDUCTION', weight: 5, variants: ['DEDUCTION', 'DEDCTN'] },
    { keyword: 'NET PAY', weight: 5, variants: ['NET PAY', 'NET PAY'] }
  ],

  // ID cards
  id_card: [
    { keyword: 'DRIVER', weight: 10, variants: ['DRIVER', 'DRIVR'] },
    { keyword: 'LICENCE', weight: 10, variants: ['LICENCE', 'LICENSE', 'LICENC'] },
    { keyword: 'NATIONAL ID', weight: 10, variants: ['NATIONAL ID', 'NATIONAL ID'] },
    { keyword: 'IDENTIFICATION', weight: 9, variants: ['IDENTIFICATION', 'IDNTFCTN'] },
    { keyword: 'DATE OF BIRTH', weight: 8, variants: ['DATE OF BIRTH', 'DOB', 'D.O.B.'] },
    { keyword: 'EXPIRY', weight: 7, variants: ['EXPIRY', 'EXPIRY', 'EXP'] },
    { keyword: 'ISSUED', weight: 6, variants: ['ISSUED', 'ISSUD'] },
    { keyword: 'JAMAICA', weight: 6, variants: ['JAMAICA', 'JAMAIC'] },
    { keyword: 'CLASS', weight: 5, variants: ['CLASS', 'CLASS'] }
  ],

  // Unknown - no keywords
  unknown: []
};

/**
 * Normalizes OCR text to handle common OCR errors and variations
 */
function normalizeOCRText(text: string): string {
  return text
    // Convert to uppercase for consistent matching
    .toUpperCase()
    // Remove extra whitespace
    .replace(/\s+/g, ' ')
    // Trim leading/trailing whitespace
    .trim()
    // Remove common OCR artifacts
    .replace(/[|I]/g, 'I') // Common I/l/| confusion
    .replace(/[O0]/g, 'O') // Common O/0 confusion
    .replace(/[S5]/g, 'S') // Common S/5 confusion
    .replace(/[G6]/g, 'G') // Common G/6 confusion
    .replace(/[B8]/g, 'B') // Common B/8 confusion
    .replace(/[Z2]/g, 'Z') // Common Z/2 confusion
    // Remove special characters that might interfere
    .replace(/[^\w\s]/g, ' ')
    // Clean up any double spaces created
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Fuzzy string matching for OCR variants
 */
function fuzzyMatch(text: string, keyword: string, variants: string[] = []): boolean {
  const searchTerms = [keyword, ...variants];
  
  for (const term of searchTerms) {
    // Exact match
    if (text.includes(term)) {
      return true;
    }
    
    // Fuzzy match - allow for 1-2 character differences
    const fuzzyTerm = term.replace(/\s+/g, '');
    const fuzzyText = text.replace(/\s+/g, '');
    
    if (fuzzyText.includes(fuzzyTerm)) {
      return true;
    }
    
    // Check for partial matches (for longer terms)
    if (term.length > 4 && fuzzyText.includes(fuzzyTerm.substring(0, term.length - 1))) {
      return true;
    }
  }
  
  return false;
}

/**
 * Calculate score for a specific document type
 */
function calculateDocumentScore(
  normalizedText: string, 
  documentType: DocumentType,
  keywords: KeywordDefinition[]
): { score: number; foundKeywords: Array<{keyword: string; weight: number; found: boolean}> } {
  let score = 0;
  const foundKeywords: Array<{keyword: string; weight: number; found: boolean}> = [];
  
  for (const keywordDef of keywords) {
    const found = fuzzyMatch(normalizedText, keywordDef.keyword, keywordDef.variants);
    foundKeywords.push({
      keyword: keywordDef.keyword,
      weight: keywordDef.weight,
      found
    });
    
    if (found) {
      score += keywordDef.weight;
    }
  }
  
  return { score, foundKeywords };
}

/**
 * Check if document should use specialized invoice scanner
 */
export function shouldUseInvoiceScanner(classification: ClassificationResult): boolean {
  return (
    classification.documentType === 'invoice' ||
    classification.documentType === 'tax_invoice'
  ) && classification.confidence > 0.6;
}

/**
 * Main classification function
 */
export function classifyDocument(text: string): ClassificationResult {
  // Handle empty or invalid input
  if (!text || typeof text !== 'string') {
    return {
      documentType: 'unknown',
      confidence: 0,
      scores: {} as Record<DocumentType, number>,
      topKeywords: [],
      reasoning: 'Invalid or empty text input'
    };
  }
  
  // Normalize the OCR text
  const normalizedText = normalizeOCRText(text);
  
  // Calculate scores for all document types
  const scores: Partial<Record<DocumentType, number>> = {};
  const allFoundKeywords: Array<{
    type: DocumentType;
    keyword: string;
    weight: number;
    found: boolean;
  }> = [];
  
  for (const [docType, keywords] of Object.entries(DOCUMENT_KEYWORDS) as Array<[DocumentType, KeywordDefinition[]]>) {
    const { score, foundKeywords } = calculateDocumentScore(normalizedText, docType, keywords);
    scores[docType] = score;
    
    // Add to top keywords if found
    foundKeywords
      .filter(kw => kw.found)
      .forEach(kw => {
        allFoundKeywords.push({
          type: docType,
          keyword: kw.keyword,
          weight: kw.weight,
          found: kw.found
        });
      });
  }
  
  // Sort found keywords by weight (highest first)
  const topKeywords = allFoundKeywords
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 10); // Top 10 keywords
  
  // Find the document type with highest score
  let bestType: DocumentType = 'unknown';
  let bestScore = 0;
  
  for (const [docType, score] of Object.entries(scores) as Array<[DocumentType, number]>) {
    if (score > bestScore) {
      bestScore = score;
      bestType = docType;
    }
  }
  
  // Calculate confidence based on score distribution
  const totalScore = Object.values(scores).reduce((sum, score) => sum + score, 0);
  const confidence = totalScore > 0 ? bestScore / totalScore : 0;
  
  // Special handling for edge cases
  let reasoning = `Best match: ${bestType} with score ${bestScore}`;
  
  if (bestScore === 0) {
    reasoning = 'No matching keywords found - classified as unknown';
  } else if (confidence < 0.3) {
    reasoning = `Low confidence match (${(confidence * 100).toFixed(1)}%) - ${bestType} with score ${bestScore}`;
  } else if (confidence > 0.7) {
    reasoning = `High confidence match (${(confidence * 100).toFixed(1)}%) - ${bestType} with score ${bestScore}`;
  } else {
    reasoning = `Medium confidence match (${(confidence * 100).toFixed(1)}%) - ${bestType} with score ${bestScore}`;
  }
  
  // Add top keywords to reasoning
  if (topKeywords.length > 0) {
    reasoning += `. Key indicators: ${topKeywords.slice(0, 3).map(kw => kw.keyword).join(', ')}`;
  }
  
  return {
    documentType: bestType,
    confidence,
    scores: scores as Record<DocumentType, number>,
    topKeywords,
    reasoning
  };
}

/**
 * Helper function to get document type description
 */
export function getDocumentTypeDescription(documentType: DocumentType): string {
  const descriptions: Record<DocumentType, string> = {
    receipt: 'General receipt for goods or services',
    fuel_receipt: 'Fuel/gas station receipt',
    hardware_receipt: 'Hardware store or building materials receipt',
    invoice: 'Commercial invoice for goods/services',
    tax_invoice: 'Tax invoice with VAT/GCT information',
    payment_voucher: 'Payment voucher or authorization form',
    purchase_order: 'Purchase order document',
    estimate: 'Price estimate or quotation',
    worker_payment_form: 'Worker payment or wage form',
    id_card: 'Identification card or driver licence',
    unknown: 'Unknown document type'
  };
  
  return descriptions[documentType] || 'Unknown document type';
}

/**
 * Helper function to validate classification confidence
 */
export function isHighConfidence(result: ClassificationResult): boolean {
  return result.confidence >= 0.7;
}

/**
 * Helper function to get alternative suggestions
 */
export function getAlternativeTypes(result: ClassificationResult, maxAlternatives: number = 3): Array<{
  type: DocumentType;
  score: number;
  confidence: number;
}> {
  const alternatives = Object.entries(result.scores)
    .filter(([type, score]) => type !== result.documentType && score > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, maxAlternatives)
    .map(([type, score]) => ({
      type: type as DocumentType,
      score,
      confidence: score / Object.values(result.scores).reduce((sum, s) => sum + s, 0)
    }));
  
  return alternatives;
}
