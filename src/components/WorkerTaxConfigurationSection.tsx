// Worker Tax Configuration Section - Phase 2B Step 3
// Admin-only Jamaican worker tax configuration UI
// PHASE 2B STEP 3 UI ONLY — NOT ACTIVE PAYROLL

import React, { useState, useEffect } from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle, XCircle, Globe, Settings, FileText } from 'lucide-react';
import { useAdminAccess } from '../hooks/useAdminAccess';
import { fetchWorkerTaxInfo, upsertWorkerTaxInfo, validateNISNumber, validateTRN, sanitizePayrollCountry } from '../lib/payroll';
import type { WorkerTaxInfo } from '../lib/payroll';

interface WorkerTaxConfigurationSectionProps {
  workerId: string;
  companyId: string;
  isVisible: boolean;
}

export default function WorkerTaxConfigurationSection({ 
  workerId, 
  companyId, 
  isVisible 
}: WorkerTaxConfigurationSectionProps) {
  const { isAdmin, loading: adminLoading } = useAdminAccess();
  const [taxInfo, setTaxInfo] = useState<Partial<WorkerTaxInfo> | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [warnings, setWarnings] = useState<Record<string, string>>({});
  const [activeTab, setActiveTab] = useState<'us' | 'jamaican'>('us');

  // Form state
  const [formData, setFormData] = useState({
    // US Tax Fields
    filing_status: 'single' as 'single' | 'married' | 'head_of_household',
    federal_allowances: 0,
    additional_federal_withholding: 0,
    state_allowances: 0,
    additional_state_withholding: 0,
    health_insurance: 0,
    retirement_401k_percent: 0,
    retirement_401k_fixed: 0,
    is_exempt_federal: false,
    is_exempt_state: false,
    is_exempt_fica: false,
    
    // Jamaican Statutory Fields
    nis_number: '',
    tax_file_number: '',
    trn: '',
    payroll_country: 'US',
    jamaican_payroll_enabled: false,
    is_exempt_nis: false,
    is_exempt_nht: false,
    is_exempt_education_tax: false,
    is_exempt_paye: false,
    statutory_notes: '',
  });

  useEffect(() => {
    if (isVisible && workerId && companyId && isAdmin) {
      loadTaxInfo();
    }
  }, [isVisible, workerId, companyId, isAdmin]);

  // PHASE 2B STEP 4 INTEGRATION TESTING ONLY — NOT ACTIVE PAYROLL
  const loadTaxInfo = async () => {
    setLoading(true);
    setErrors({});
    setWarnings({});
    
    try {
      console.log('Loading tax info for worker:', workerId); // Debug log for testing
      const data = await fetchWorkerTaxInfo(workerId);
      
      if (data) {
        console.log('Tax info loaded:', data); // Debug log for testing
        setTaxInfo(data);
        setFormData({
          filing_status: data.filing_status || 'single',
          federal_allowances: data.federal_allowances || 0,
          additional_federal_withholding: data.additional_federal_withholding || 0,
          state_allowances: data.state_allowances || 0,
          additional_state_withholding: data.additional_state_withholding || 0,
          health_insurance: data.health_insurance || 0,
          retirement_401k_percent: data.retirement_401k_percent || 0,
          retirement_401k_fixed: data.retirement_401k_fixed || 0,
          is_exempt_federal: data.is_exempt_federal || false,
          is_exempt_state: data.is_exempt_state || false,
          is_exempt_fica: data.is_exempt_fica || false,
          
          // Handle Jamaican fields with null-safe loading for backward compatibility
          nis_number: data.nis_number || '',
          tax_file_number: data.tax_file_number || '',
          trn: data.trn || '',
          payroll_country: data.payroll_country || 'US',
          jamaican_payroll_enabled: data.jamaican_payroll_enabled || false,
          is_exempt_nis: data.is_exempt_nis || false,
          is_exempt_nht: data.is_exempt_nht || false,
          is_exempt_education_tax: data.is_exempt_education_tax || false,
          is_exempt_paye: data.is_exempt_paye || false,
          statutory_notes: data.statutory_notes || '',
        });
      } else {
        console.log('No existing tax info found for worker:', workerId); // Debug log for testing
        // Initialize with defaults for new workers
        setFormData({
          filing_status: 'single',
          federal_allowances: 0,
          additional_federal_withholding: 0,
          state_allowances: 0,
          additional_state_withholding: 0,
          health_insurance: 0,
          retirement_401k_percent: 0,
          retirement_401k_fixed: 0,
          is_exempt_federal: false,
          is_exempt_state: false,
          is_exempt_fica: false,
          
          nis_number: '',
          tax_file_number: '',
          trn: '',
          payroll_country: 'US',
          jamaican_payroll_enabled: false,
          is_exempt_nis: false,
          is_exempt_nht: false,
          is_exempt_education_tax: false,
          is_exempt_paye: false,
          statutory_notes: '',
        });
      }
    } catch (error) {
      console.error('Failed to load tax info:', error);
      setErrors({ general: 'Failed to load tax information' });
    } finally {
      setLoading(false);
    }
  };

  const validateField = (field: string, value: any): string | null => {
    switch (field) {
      case 'nis_number':
        const nisValidation = validateNISNumber(value);
        if (!nisValidation.valid) {
          return nisValidation.error || null;
        }
        break;
      
      case 'tax_file_number':
      case 'trn':
        const trnValidation = validateTRN(value);
        if (!trnValidation.valid) {
          return trnValidation.error || null;
        }
        break;
      
      case 'payroll_country':
        const sanitized = sanitizePayrollCountry(value);
        if (sanitized !== value && value.trim() !== '') {
          return 'Country will be normalized to standard format';
        }
        break;
    }
    
    return null;
  };

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    // Clear existing error/warning for this field
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[field];
      return newErrors;
    });
    setWarnings(prev => {
      const newWarnings = { ...prev };
      delete newWarnings[field];
      return newWarnings;
    });
    
    // Soft validation (non-blocking)
    const validation = validateField(field, value);
    if (validation) {
      if (validation.includes('must be') || validation.includes('format')) {
        setErrors(prev => ({ ...prev, [field]: validation }));
      } else {
        setWarnings(prev => ({ ...prev, [field]: validation }));
      }
    }
  };

  // PHASE 2B STEP 4 INTEGRATION TESTING ONLY — NOT ACTIVE PAYROLL
  const handleSave = async () => {
    if (!isAdmin) return;
    
    setSaving(true);
    setErrors({});
    
    try {
      // Ensure all Jamaican fields are properly handled for persistence
      const sanitizedData = {
        ...formData,
        payroll_country: sanitizePayrollCountry(formData.payroll_country),
        federal_allowances: Number(formData.federal_allowances) || 0,
        additional_federal_withholding: Number(formData.additional_federal_withholding) || 0,
        state_allowances: Number(formData.state_allowances) || 0,
        additional_state_withholding: Number(formData.additional_state_withholding) || 0,
        health_insurance: Number(formData.health_insurance) || 0,
        retirement_401k_percent: Number(formData.retirement_401k_percent) || 0,
        retirement_401k_fixed: Number(formData.retirement_401k_fixed) || 0,
        // Ensure Jamaican fields are properly typed for database persistence
        nis_number: formData.nis_number?.trim() || null,
        tax_file_number: formData.tax_file_number?.trim() || null,
        trn: formData.trn?.trim() || null,
        is_exempt_nis: Boolean(formData.is_exempt_nis),
        is_exempt_nht: Boolean(formData.is_exempt_nht),
        is_exempt_education_tax: Boolean(formData.is_exempt_education_tax),
        is_exempt_paye: Boolean(formData.is_exempt_paye),
        jamaican_payroll_enabled: Boolean(formData.jamaican_payroll_enabled),
        statutory_notes: formData.statutory_notes?.trim() || null,
      };

      console.log('Saving tax info:', sanitizedData); // Debug log for testing
      await upsertWorkerTaxInfo(workerId, companyId, sanitizedData);
      setTaxInfo({ ...taxInfo, ...sanitizedData });
      console.log('Tax info saved successfully'); // Debug log for testing
      
    } catch (error) {
      console.error('Failed to save tax info:', error);
      setErrors({ general: 'Failed to save tax information' });
    } finally {
      setSaving(false);
    }
  };

  // Admin access check
  if (adminLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <ShieldCheck className="w-12 h-12 text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-slate-900 mb-2">Access Denied</h3>
        <p className="text-slate-600">You don't have permission to access tax configuration.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Settings className="w-5 h-5 text-slate-600" />
          <h3 className="text-lg font-semibold text-slate-900">Tax Configuration</h3>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </div>

      {/* General Error */}
      {errors.general && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
          <XCircle className="w-4 h-4 text-red-600" />
          <span className="text-sm text-red-700">{errors.general}</span>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('us')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'us'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            US Tax Information
          </button>
          <button
            onClick={() => setActiveTab('jamaican')}
            className={`py-2 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'jamaican'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
            }`}
          >
            Jamaican Statutory Information
          </button>
        </nav>
      </div>

      {/* US Tax Information Tab */}
      {activeTab === 'us' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Filing Status</label>
              <select
                value={formData.filing_status}
                onChange={(e) => handleFieldChange('filing_status', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              >
                <option value="single">Single</option>
                <option value="married">Married</option>
                <option value="head_of_household">Head of Household</option>
              </select>
            </div>
            
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Federal Allowances</label>
              <input
                type="number"
                min="0"
                value={formData.federal_allowances}
                onChange={(e) => handleFieldChange('federal_allowances', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              />
            </div>
            
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Additional Federal Withholding</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.additional_federal_withholding}
                onChange={(e) => handleFieldChange('additional_federal_withholding', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              />
            </div>
            
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">State Allowances</label>
              <input
                type="number"
                min="0"
                value={formData.state_allowances}
                onChange={(e) => handleFieldChange('state_allowances', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              />
            </div>
            
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Additional State Withholding</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.additional_state_withholding}
                onChange={(e) => handleFieldChange('additional_state_withholding', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              />
            </div>
            
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Health Insurance</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.health_insurance}
                onChange={(e) => handleFieldChange('health_insurance', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              />
            </div>
            
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">401k Percentage (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={formData.retirement_401k_percent}
                onChange={(e) => handleFieldChange('retirement_401k_percent', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              />
            </div>
            
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">401k Fixed Amount</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={formData.retirement_401k_fixed}
                onChange={(e) => handleFieldChange('retirement_401k_fixed', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              />
            </div>
          </div>

          {/* Exemptions */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-900">Tax Exemptions</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_exempt_federal}
                  onChange={(e) => handleFieldChange('is_exempt_federal', e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Exempt Federal Tax</span>
              </label>
              
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_exempt_state}
                  onChange={(e) => handleFieldChange('is_exempt_state', e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Exempt State Tax</span>
              </label>
              
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.is_exempt_fica}
                  onChange={(e) => handleFieldChange('is_exempt_fica', e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">Exempt FICA</span>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Jamaican Statutory Information Tab */}
      {activeTab === 'jamaican' && (
        <div className="space-y-4">
          {/* Payroll Country */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Payroll Country</label>
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-slate-400" />
                <select
                  value={formData.payroll_country}
                  onChange={(e) => handleFieldChange('payroll_country', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                >
                  <option value="US">United States (US)</option>
                  <option value="JM">Jamaica (JM)</option>
                </select>
              </div>
              {warnings.payroll_country && (
                <div className="flex items-center gap-1 mt-1">
                  <AlertTriangle className="w-3 h-3 text-yellow-500" />
                  <span className="text-xs text-yellow-600">{warnings.payroll_country}</span>
                </div>
              )}
            </div>
            
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Jamaican Payroll Enabled</label>
              <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg bg-slate-50">
                <input
                  type="checkbox"
                  checked={formData.jamaican_payroll_enabled}
                  onChange={(e) => handleFieldChange('jamaican_payroll_enabled', e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-900">Enable Jamaican Payroll</span>
                  <p className="text-xs text-slate-600">Enable Jamaican statutory calculations for this worker</p>
                </div>
              </label>
            </div>
          </div>

          {/* Jamaican Tax Numbers */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-900">Jamaican Tax Identification</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">NIS Number</label>
                <input
                  type="text"
                  placeholder="1234567"
                  value={formData.nis_number}
                  onChange={(e) => handleFieldChange('nis_number', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                />
                {errors.nis_number && (
                  <div className="flex items-center gap-1 mt-1">
                    <XCircle className="w-3 h-3 text-red-500" />
                    <span className="text-xs text-red-600">{errors.nis_number}</span>
                  </div>
                )}
              </div>
              
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Tax File Number (TRN)</label>
                <input
                  type="text"
                  placeholder="123-456-789"
                  value={formData.tax_file_number}
                  onChange={(e) => handleFieldChange('tax_file_number', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                />
                {errors.tax_file_number && (
                  <div className="flex items-center gap-1 mt-1">
                    <XCircle className="w-3 h-3 text-red-500" />
                    <span className="text-xs text-red-600">{errors.tax_file_number}</span>
                  </div>
                )}
              </div>
              
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">Temporary Reference Number</label>
                <input
                  type="text"
                  placeholder="For workers without TRN"
                  value={formData.trn}
                  onChange={(e) => handleFieldChange('trn', e.target.value)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
                />
                {errors.trn && (
                  <div className="flex items-center gap-1 mt-1">
                    <XCircle className="w-3 h-3 text-red-500" />
                    <span className="text-xs text-red-600">{errors.trn}</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Jamaican Exemptions */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-slate-900">Jamaican Statutory Exemptions</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg">
                <input
                  type="checkbox"
                  checked={formData.is_exempt_nis}
                  onChange={(e) => handleFieldChange('is_exempt_nis', e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-900">Exempt NIS</span>
                  <p className="text-xs text-slate-600">National Insurance Scheme</p>
                </div>
              </label>
              
              <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg">
                <input
                  type="checkbox"
                  checked={formData.is_exempt_nht}
                  onChange={(e) => handleFieldChange('is_exempt_nht', e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-900">Exempt NHT</span>
                  <p className="text-xs text-slate-600">National Housing Trust</p>
                </div>
              </label>
              
              <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg">
                <input
                  type="checkbox"
                  checked={formData.is_exempt_education_tax}
                  onChange={(e) => handleFieldChange('is_exempt_education_tax', e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-900">Exempt Education Tax</span>
                  <p className="text-xs text-slate-600">Education Tax deductions</p>
                </div>
              </label>
              
              <label className="flex items-center gap-2 p-3 border border-slate-200 rounded-lg">
                <input
                  type="checkbox"
                  checked={formData.is_exempt_paye}
                  onChange={(e) => handleFieldChange('is_exempt_paye', e.target.checked)}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-900">Exempt PAYE</span>
                  <p className="text-xs text-slate-600">Pay As You Earn income tax</p>
                </div>
              </label>
            </div>
          </div>

          {/* Statutory Notes */}
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Statutory Notes</label>
            <div className="flex items-start gap-2">
              <FileText className="w-4 h-4 text-slate-400 mt-1" />
              <textarea
                rows={3}
                placeholder="Notes regarding Jamaican statutory compliance and exemptions..."
                value={formData.statutory_notes}
                onChange={(e) => handleFieldChange('statutory_notes', e.target.value)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-slate-900"
              />
            </div>
          </div>
        </div>
      )}

      {/* Success Message */}
      {taxInfo && Object.keys(errors).length === 0 && !saving && (
        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <CheckCircle className="w-4 h-4 text-green-600" />
          <span className="text-sm text-green-700">Tax configuration saved successfully</span>
        </div>
      )}
    </div>
  );
}
