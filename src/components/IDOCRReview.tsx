import { useState } from 'react';
import { Check, X, Edit2, AlertCircle, User, Calendar, CreditCard, MapPin } from 'lucide-react';
import { type IDOCRResult } from '../lib/idOCR';

interface IDOCRReviewProps {
  ocrResult: IDOCRResult;
  onAccept: (editedData: Partial<IDOCRResult>) => void;
  onEdit: () => void;
  onCancel: () => void;
}

export function IDOCRReview({ ocrResult, onAccept, onEdit, onCancel }: IDOCRReviewProps) {
  const [editedData, setEditedData] = useState<Partial<IDOCRResult>>({
    fullName: ocrResult.fullName,
    firstName: ocrResult.firstName,
    lastName: ocrResult.lastName,
    address: ocrResult.address,
    dateOfBirth: ocrResult.dateOfBirth,
    documentNumber: ocrResult.documentNumber,
    idNumber: ocrResult.idNumber,
    licenceNumber: ocrResult.licenceNumber,
    expiryDate: ocrResult.expiryDate,
    documentType: ocrResult.documentType,
  });

  const [isEditing, setIsEditing] = useState(false);

  const handleFieldChange = (field: keyof IDOCRResult, value: string) => {
    setEditedData(prev => ({ ...prev, [field]: value }));
  };

  const handleAccept = () => {
    onAccept(editedData);
  };

  const getDocumentTypeLabel = (type: string) => {
    switch (type) {
      case 'national_id':
        return 'Jamaican National ID';
      case 'drivers_licence':
        return "Jamaican Driver's License";
      default:
        return 'Unknown Document';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 80) return 'text-green-600';
    if (confidence >= 60) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getDocumentIcon = (type: string) => {
    switch (type) {
      case 'national_id':
        return <CreditCard className="w-5 h-5" />;
      case 'drivers_licence':
        return <CreditCard className="w-5 h-5" />;
      default:
        return <AlertCircle className="w-5 h-5" />;
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg max-w-2xl w-full mx-auto">
      {/* Header */}
      <div className="border-b border-slate-200 p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {getDocumentIcon(ocrResult.documentType)}
            <div>
              <h2 className="text-xl font-semibold text-slate-900">
                ID Scan Results
              </h2>
              <p className="text-sm text-slate-600">
                {getDocumentTypeLabel(ocrResult.documentType)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-sm font-medium ${getConfidenceColor(ocrResult.confidence)}`}>
              {Math.round(ocrResult.confidence)}% confidence
            </span>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-6">
        {/* Confidence Warning */}
        {ocrResult.confidence < 70 && (
          <div className="mb-6 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <h3 className="text-sm font-medium text-yellow-800">
                  Low OCR Confidence
                </h3>
                <p className="text-sm text-yellow-700 mt-1">
                  The OCR confidence is below 70%. Please review and edit the extracted information before continuing.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Form Fields */}
        <div className="space-y-4">
          {/* Document Type */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Document Type
            </label>
            <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
              {getDocumentIcon(editedData.documentType || 'unknown')}
              <span className="text-slate-900">
                {getDocumentTypeLabel(editedData.documentType || 'unknown')}
              </span>
            </div>
          </div>

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <User className="w-4 h-4 inline mr-2" />
              Full Name
            </label>
            {isEditing ? (
              <input
                type="text"
                value={editedData.fullName || ''}
                onChange={(e) => handleFieldChange('fullName', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter full name"
              />
            ) : (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 min-h-[48px] flex items-center">
                <span className={editedData.fullName ? 'text-slate-900' : 'text-slate-400 italic'}>
                  {editedData.fullName || 'Not detected'}
                </span>
              </div>
            )}
          </div>

          {/* First Name and Last Name */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                First Name
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedData.firstName || ''}
                  onChange={(e) => handleFieldChange('firstName', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter first name"
                />
              ) : (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 min-h-[48px] flex items-center">
                  <span className={editedData.firstName ? 'text-slate-900' : 'text-slate-400 italic'}>
                    {editedData.firstName || 'Not detected'}
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Last Name
              </label>
              {isEditing ? (
                <input
                  type="text"
                  value={editedData.lastName || ''}
                  onChange={(e) => handleFieldChange('lastName', e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter last name"
                />
              ) : (
                <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 min-h-[48px] flex items-center">
                  <span className={editedData.lastName ? 'text-slate-900' : 'text-slate-400 italic'}>
                    {editedData.lastName || 'Not detected'}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <MapPin className="w-4 h-4 inline mr-2" />
              Address
            </label>
            {isEditing ? (
              <textarea
                value={editedData.address || ''}
                onChange={(e) => handleFieldChange('address', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={3}
                placeholder="Enter address"
              />
            ) : (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 min-h-[80px]">
                <span className={editedData.address ? 'text-slate-900' : 'text-slate-400 italic'}>
                  {editedData.address || 'Not detected'}
                </span>
              </div>
            )}
          </div>

          {/* Date of Birth */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-2" />
              Date of Birth
            </label>
            {isEditing ? (
              <input
                type="date"
                value={editedData.dateOfBirth || ''}
                onChange={(e) => handleFieldChange('dateOfBirth', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            ) : (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 min-h-[48px] flex items-center">
                <span className={editedData.dateOfBirth ? 'text-slate-900' : 'text-slate-400 italic'}>
                  {editedData.dateOfBirth || 'Not detected'}
                </span>
              </div>
            )}
          </div>

          {/* Document Number */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <CreditCard className="w-4 h-4 inline mr-2" />
              Document Number
            </label>
            {isEditing ? (
              <input
                type="text"
                value={editedData.documentNumber || ''}
                onChange={(e) => handleFieldChange('documentNumber', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="Enter document number"
              />
            ) : (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 min-h-[48px] flex items-center">
                <span className={editedData.documentNumber ? 'text-slate-900' : 'text-slate-400 italic'}>
                  {editedData.documentNumber || 'Not detected'}
                </span>
              </div>
            )}
          </div>

          {/* Expiry Date */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              <Calendar className="w-4 h-4 inline mr-2" />
              Expiry Date
            </label>
            {isEditing ? (
              <input
                type="date"
                value={editedData.expiryDate || ''}
                onChange={(e) => handleFieldChange('expiryDate', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            ) : (
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 min-h-[48px] flex items-center">
                <span className={editedData.expiryDate ? 'text-slate-900' : 'text-slate-400 italic'}>
                  {editedData.expiryDate || 'Not detected'}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Raw Text (for debugging) */}
        <details className="mt-6">
          <summary className="text-sm font-medium text-slate-700 cursor-pointer hover:text-slate-900">
            View Raw OCR Text
          </summary>
          <div className="mt-2 p-3 bg-slate-50 rounded-lg border border-slate-200">
            <pre className="text-xs text-slate-600 whitespace-pre-wrap">
              {ocrResult.rawText}
            </pre>
          </div>
        </details>
      </div>

      {/* Actions */}
      <div className="border-t border-slate-200 p-6">
        <div className="flex flex-col sm:flex-row gap-3 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          
          {isEditing ? (
            <button
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 bg-slate-600 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Done Editing
            </button>
          ) : (
            <button
              onClick={() => setIsEditing(true)}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
            >
              <Edit2 className="w-4 h-4" />
              Edit Fields
            </button>
          )}
          
          <button
            onClick={handleAccept}
            disabled={!editedData.fullName}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-medium transition-colors flex items-center gap-2"
          >
            <Check className="w-4 h-4" />
            Accept & Fill Form
          </button>
        </div>
      </div>
    </div>
  );
}
