import React from 'react';
import { CircleCheck as CheckCircle, CircleAlert as AlertCircle, CreditCard as Edit, Eye } from 'lucide-react';
import type { OCRResult } from '../lib/receiptOCR';

// Format local date without timezone conversion
function formatLocalDate(isoDateString: string): string {
  // Parse YYYY-MM-DD format directly without timezone conversion
  const match = isoDateString.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const [, year, month, day] = match;
    // Create local date string in M/D/YYYY format
    return `${parseInt(month)}/${parseInt(day)}/${year}`;
  }
  
  // Fallback for any other format
  return isoDateString;
}

interface OCRPreviewProps {
  ocrResult: OCRResult;
  onAccept: () => void;
  onEdit: () => void;
}

export function OCRPreview({ ocrResult, onAccept, onEdit }: OCRPreviewProps) {
  console.log('=== DEBUG: OCR PREVIEW COMPONENT START ===');
  console.log('OCRPreview: Received OCR result object');
  console.log('OCRPreview: OCR result details:');
  console.log('  - Vendor:', ocrResult.vendor);
  console.log('  - Date:', ocrResult.date);
  console.log('  - Amount:', ocrResult.amount);
  console.log('  - Tax:', ocrResult.tax);
  console.log('  - Receipt Number:', ocrResult.receiptNumber);
  console.log('  - Confidence:', ocrResult.confidence);
  console.log('  - Requires Manual Entry:', ocrResult.requiresManualEntry);
  console.log('  - Raw text length:', ocrResult.rawText?.length || 0);
  console.log('  - Raw text preview:', ocrResult.rawText?.substring(0, 100) + (ocrResult.rawText?.length > 100 ? '...' : ''));

  const hasData = !!(ocrResult.vendor || ocrResult.date || ocrResult.amount || ocrResult.tax || ocrResult.receiptNumber);
  const confidenceLevel = ocrResult.confidence;
  const hasRawText = !!(ocrResult.rawText && ocrResult.rawText.trim().length > 0);
  const requiresManualEntry = ocrResult.requiresManualEntry || false;
  
  console.log('OCRPreview: Data analysis:');
  console.log('  - hasData:', hasData);
  console.log('  - hasRawText:', hasRawText);
  console.log('  - confidenceLevel:', confidenceLevel);
  console.log('  - rawText trimmed length:', ocrResult.rawText?.trim().length || 0);
  
  // Determine confidence color and message
  let confidenceColor = 'text-red-600';
  let confidenceMessage = 'Low confidence - Please verify all fields';
  let borderColor = 'border-red-200';
  let bgColor = 'bg-red-50';
  let titleColor = 'text-red-900';
  let icon = AlertCircle;

  console.log('=== DEBUG: OCR PREVIEW DEBUG INFO ===');
  console.log('OCRPreview: Debug preview modal would show:');
  console.log('  - Raw OCR Text:', ocrResult.rawText?.substring(0, 200) + (ocrResult.rawText?.length > 200 ? '...' : ''));
  console.log('  - Parsed Vendor:', ocrResult.vendor);
  console.log('  - Parsed Date:', ocrResult.date);
  console.log('  - Parsed Amount:', ocrResult.amount);
  console.log('  - Parsed Tax:', ocrResult.tax);
  console.log('  - Parsed Receipt Number:', ocrResult.receiptNumber);
  console.log('  - Confidence:', ocrResult.confidence);
  console.log('  - Has Data:', hasData);
  console.log('  - Has Raw Text:', hasRawText);
  console.log('OCRPreview: Component would render:', hasData ? 'Full preview' : hasRawText ? 'Limited preview' : 'No data detected');
  
  if (confidenceLevel >= 0.8) {
    confidenceColor = 'text-green-600';
    confidenceMessage = 'High confidence - Data looks accurate';
    borderColor = 'border-green-200';
    bgColor = 'bg-green-50';
    titleColor = 'text-green-900';
    icon = CheckCircle;
  } else if (confidenceLevel >= 0.6) {
    confidenceColor = 'text-yellow-600';
    confidenceMessage = 'Medium confidence - Please review carefully';
    borderColor = 'border-yellow-200';
    bgColor = 'bg-yellow-50';
    titleColor = 'text-yellow-900';
    icon = AlertCircle;
  }

  // Show manual entry message when OCR is garbage
  if (requiresManualEntry) {
    console.log('=== DEBUG: MANUAL ENTRY REQUIRED ===');
    console.log('OCRPreview: OCR detected as garbage - showing manual entry message');
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-red-900 mb-1">
              No reliable data detected
            </h4>
            <p className="text-xs text-red-700 mb-3">
              The receipt image quality is too poor for reliable OCR extraction. 
              Please enter the receipt details manually.
            </p>
            
            {/* Show raw OCR text for reference */}
            {hasRawText && (
              <details className="text-xs mb-4">
                <summary className="cursor-pointer text-red-800 hover:text-red-900 font-medium">
                  Raw OCR Text (for reference)
                </summary>
                <div className="mt-2 p-3 bg-red-100 rounded border border-red-200 max-h-48 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-red-700 text-xs">{ocrResult.rawText || 'No text extracted'}</pre>
                </div>
              </details>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onEdit}
            className="px-3 py-2 bg-red-600 text-white text-xs rounded hover:bg-red-700 flex items-center gap-1"
          >
            <Edit className="w-3 h-3" />
            Enter Manually
          </button>
        </div>
      </div>
    );
  }

  // TEMPORARY: Only show "No data detected" when OCR text is empty or nearly empty
  if (!hasData && !hasRawText) {
    console.log('=== DEBUG: NO DATA DETECTED ===');
    console.log('OCRPreview: No structured data and no raw text - showing "No data detected"');
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-yellow-900 mb-1">
              No data detected
            </h4>
            <p className="text-xs text-yellow-700">
              The receipt was scanned, but no text could be extracted. The image may be too blurry or faded.
              Please try again with a clearer image or enter the details manually.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // TEMPORARY: Always show debug info when raw text exists but no structured data
  if (!hasData && hasRawText) {
    console.log('=== DEBUG: RAW TEXT EXISTS BUT NO STRUCTURED DATA ===');
    console.log('OCRPreview: Raw OCR text exists but no structured data extracted');
    console.log('OCRPreview: This should show "Limited data detected" with raw text visible');
    
    // The existing logic below will handle this case
  }

  // Always show the preview if we have raw OCR text, even if no structured data was extracted
  if (!hasData && hasRawText) {
    return (
      <div className={`rounded-lg border ${borderColor} ${bgColor} p-4`}>
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className={`text-sm font-medium ${titleColor} mb-1`}>
              Limited data detected
            </h4>
            <p className="text-xs text-yellow-700 mb-3">
              The receipt was scanned with {Math.round(confidenceLevel * 100)}% confidence, but we couldn't extract structured information.
              Raw OCR text is available below for manual entry.
            </p>
            
            {/* Show raw OCR text for reference - collapsed by default */}
            {hasRawText && (
              <details className="text-xs mb-4">
                <summary className="cursor-pointer text-yellow-800 hover:text-yellow-900 font-medium">
                  Raw OCR Text (for manual entry)
                </summary>
                <div className="mt-2 p-3 bg-yellow-100 rounded border border-yellow-200 max-h-48 overflow-y-auto">
                  <pre className="whitespace-pre-wrap text-yellow-700 text-xs">{ocrResult.rawText || 'No text extracted'}</pre>
                </div>
              </details>
            )}
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <button
            onClick={onEdit}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Edit className="w-4 h-4" />
            Enter Manually
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-lg border ${borderColor} ${bgColor} p-4 space-y-4`}>
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          {React.createElement(icon, { className: `w-5 h-5 ${confidenceColor} flex-shrink-0 mt-0.5` })}
          <div>
            <h4 className={`text-sm font-medium ${titleColor} mb-1`}>
              Receipt data detected
            </h4>
            <p className={`text-xs ${
              confidenceLevel >= 0.8 ? 'text-green-700' : 
              confidenceLevel >= 0.6 ? 'text-yellow-700' : 
              'text-red-700'
            }`}>
              {confidenceMessage}. Review the detected information and click "Use This Data" to auto-fill the form.
            </p>
          </div>
        </div>
        <span className={`text-xs font-medium ${confidenceColor}`}>
          {Math.round(confidenceLevel * 100)}% confidence
        </span>
      </div>

      <div className={`grid grid-cols-2 gap-3 bg-white rounded-lg p-3 border ${
        confidenceLevel >= 0.8 ? 'border-green-100' : 
        confidenceLevel >= 0.6 ? 'border-yellow-100' : 
        'border-red-100'
      }`}>
        {ocrResult.vendor && (
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Vendor</div>
            <div className="text-sm text-slate-900">{ocrResult.vendor}</div>
          </div>
        )}

        {ocrResult.date && (
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Date</div>
            <div className="text-sm text-slate-900">
              {formatLocalDate(ocrResult.date)}
            </div>
          </div>
        )}

        {ocrResult.amount && (
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Amount</div>
            <div className="text-sm font-medium text-slate-900">
              ${ocrResult.amount.toFixed(2)}
            </div>
          </div>
        )}

        {ocrResult.tax && (
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Tax</div>
            <div className="text-sm text-slate-900">
              ${ocrResult.tax.toFixed(2)}
            </div>
          </div>
        )}

        {ocrResult.receiptNumber && (
          <div className="col-span-2">
            <div className="text-xs font-medium text-slate-500 mb-1">Receipt #</div>
            <div className="text-sm text-slate-900">{ocrResult.receiptNumber}</div>
          </div>
        )}
      </div>

      {/* Show raw OCR text for reference - collapsed by default */}
      <details className="text-xs">
        <summary className="cursor-pointer text-slate-600 hover:text-slate-800 font-medium">
          Raw OCR Text (for manual entry or verification)
        </summary>
        <div className="mt-2 p-3 bg-slate-100 rounded border border-slate-200 max-h-48 overflow-y-auto">
          <pre className="whitespace-pre-wrap text-slate-600 text-xs">{ocrResult.rawText || 'No text extracted'}</pre>
        </div>
      </details>

      <div className="flex gap-2">
        {/* Only show "Use This Data" when we have actual structured data */}
        {hasData && (
          <button
            onClick={onAccept}
            className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium text-white hover:opacity-90 ${
              confidenceLevel >= 0.8 ? 'bg-green-600 hover:bg-green-700' : 
              confidenceLevel >= 0.6 ? 'bg-yellow-600 hover:bg-yellow-700' : 
              'bg-red-600 hover:bg-red-700'
            }`}
          >
            <CheckCircle className="w-4 h-4" />
            Use This Data
          </button>
        )}
        <button
          onClick={onEdit}
          className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          <Edit className="w-4 h-4" />
          Edit Manually
        </button>
      </div>
    </div>
  );
}
