import { CircleCheck as CheckCircle, CircleAlert as AlertCircle, CreditCard as Edit } from 'lucide-react';
import type { OCRResult } from '../lib/receiptOCR';

interface OCRPreviewProps {
  ocrResult: OCRResult;
  onAccept: () => void;
  onEdit: () => void;
}

export function OCRPreview({ ocrResult, onAccept, onEdit }: OCRPreviewProps) {
  const hasData = !!(ocrResult.vendor || ocrResult.date || ocrResult.amount);
  const confidenceColor = ocrResult.confidence >= 0.7 ? 'text-green-600' : 'text-yellow-600';

  if (!hasData) {
    return (
      <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h4 className="text-sm font-medium text-yellow-900 mb-1">
              No data detected
            </h4>
            <p className="text-xs text-yellow-700">
              The receipt was scanned, but we couldn't detect vendor, date, or amount information.
              Please enter the details manually.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-green-200 bg-green-50 p-4 space-y-4">
      <div className="flex items-start justify-between">
        <div className="flex items-start gap-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <h4 className="text-sm font-medium text-green-900 mb-1">
              Receipt data detected
            </h4>
            <p className="text-xs text-green-700">
              Review the detected information and click "Use This Data" to auto-fill the form.
            </p>
          </div>
        </div>
        <span className={`text-xs font-medium ${confidenceColor}`}>
          {Math.round(ocrResult.confidence * 100)}% confidence
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 bg-white rounded-lg p-3 border border-green-100">
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
              {new Date(ocrResult.date).toLocaleDateString()}
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

      <div className="flex gap-2">
        <button
          onClick={onAccept}
          className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          <CheckCircle className="w-4 h-4" />
          Use This Data
        </button>
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
