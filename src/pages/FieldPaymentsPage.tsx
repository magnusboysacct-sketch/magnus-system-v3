import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  HandCoins, 
  Plus, 
  Search, 
  Filter, 
  Download, 
  Smartphone,
  User,
  Users,
  Calendar,
  DollarSign,
  CreditCard,
  CheckCircle,
  Clock,
  XCircle,
  FileText,
  Share2,
  Camera,
  PenTool,
  X
} from "lucide-react";
import { 
  fetchFieldPayments, 
  fetchFieldPaymentSummary,
  createFieldPayment,
  type FieldPayment, 
  type FieldPaymentStatus,
  type PaymentMethod,
  type FieldPaymentFilters 
} from "../lib/fieldPayments";
import { useProjectContext } from "../context/ProjectContext";
import SignaturePad from "../components/SignaturePad";
import MobilePhotoCapture from "../components/MobilePhotoCapture";
import { BaseModal } from "../components/common/BaseModal";
import { downloadFieldPaymentReceipt, shareViaWhatsApp } from "../lib/fieldPaymentReceipt";
import { uploadFieldPaymentImage, uploadFieldPaymentPDF } from "../lib/fieldPayments";

export default function FieldPaymentsPage() {
  const navigate = useNavigate();
  const { currentProject, projects } = useProjectContext();

  // State
  const [payments, setPayments] = useState<FieldPayment[]>([]);
  const [summary, setSummary] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<FieldPayment | null>(null);
  const [companyId, setCompanyId] = useState<string>("");
  const [userId, setUserId] = useState<string>("");
  const [submitAttempts, setSubmitAttempts] = useState(0);
  
  // Field user speed improvements
  const [workers, setWorkers] = useState<any[]>([]);
  const [quickAmounts, setQuickAmounts] = useState<string[]>(["50", "100", "150", "200", "250", "300"]);
  const [showQuickAmount, setShowQuickAmount] = useState(false);
  
  // Filters
  const [filters, setFilters] = useState<FieldPaymentFilters>({
    status: "all",
    payment_method: "all",
    work_date_from: "",
    work_date_to: "",
    worker_name: "",
    project_id: "",
  });

  // Form data for new payment
  const [formData, setFormData] = useState({
    worker_name: "",
    worker_nickname: "",
    worker_id_number: "",
    worker_phone: "",
    worker_address: "",
    work_type: "",
    work_date: new Date().toISOString().split("T")[0],
    hours_worked: "",
    days_worked: "",
    rate_per_hour: "",
    rate_per_day: "",
    total_amount: "",
    payment_method: "cash" as PaymentMethod,
    payment_notes: "",
    location: "",
    weather_conditions: "",
    notes: "",
    project_id: "",
  });

  // Load existing workers for quick select
  useEffect(() => {
    if (companyId) {
      loadWorkersForQuickSelect();
    }
  }, [companyId]);

  // Handle worker name change for auto-suggestions
  function handleWorkerNameChange(value: string) {
    const search = value.toLowerCase();
    const filtered = workers.filter(w => 
      w.first_name.toLowerCase().includes(search) ||
      w.last_name.toLowerCase().includes(search) ||
      w.phone?.includes(search)
    );
    
    // Auto-select if there's only a few matches (1-3)
    if (filtered.length > 0 && filtered.length <= 3) {
      selectWorker(filtered[0]);
    }
  }

  // Select worker from suggestions
  function selectWorker(worker: any) {
    setFormData(prev => ({
      ...prev,
      worker_name: `${worker.first_name} ${worker.last_name}`,
      worker_phone: worker.phone || '',
      worker_nickname: worker.nickname || '',
      // Auto-calculate rate based on recent work history
      rate_per_hour: worker.pay_rate ? worker.pay_rate.toString() : '',
      total_amount: worker.pay_rate ? (worker.pay_rate * 8).toString() : '',
    }));
    
    setFormErrors(prev => ({ ...prev, worker_name: '', worker_phone: '', worker_nickname: '' }));
  }

  // Handle quick amount selection
  function handleQuickAmountSelect(amount: string) {
    const rate = parseFloat(formData.rate_per_hour) || 0;
    const hours = rate > 0 ? parseFloat(amount) / rate : 0;
    
    setFormData(prev => ({
      ...prev,
      total_amount: amount,
      hours_worked: hours > 0 ? hours.toString() : '',
    }));
  }

  async function loadWorkersForQuickSelect() {
    try {
      const { fetchWorkers } = await import("../lib/workers");
      const workersData = await fetchWorkers(companyId);
      
      // Get recent workers from field payments for better suggestions
      const { fetchFieldPayments } = await import("../lib/fieldPayments");
      const paymentsData = await fetchFieldPayments(companyId, filters);
      
      // Create a map of recent workers by phone for quick lookup
      const recentWorkersMap = new Map();
      paymentsData.forEach(payment => {
        if (payment.worker_phone && !recentWorkersMap.has(payment.worker_phone)) {
          recentWorkersMap.set(payment.worker_phone, {
            name: payment.worker_name,
            phone: payment.worker_phone,
            work_type: payment.work_type,
            last_amount: payment.total_amount,
            last_date: payment.work_date,
          });
        }
      });
      
      // Combine existing workers with recent workers
      const combinedWorkers = [...workersData];
      recentWorkersMap.forEach((recentWorker, phone) => {
        if (!workersData.some(w => w.phone === phone)) {
          combinedWorkers.push({
            id: `recent_${phone}`,
            company_id: companyId,
            first_name: recentWorker.name.split(' ')[0] || '',
            last_name: recentWorker.name.split(' ').slice(1).join(' ') || '',
            phone: recentWorker.phone,
            worker_type: 'employee',
            status: 'active',
            pay_rate: recentWorker.last_amount ? recentWorker.last_amount / 8 : null,
            created_at: recentWorker.last_date,
          });
        }
      });
      
      setWorkers(combinedWorkers);
    } catch (error) {
      console.error("Error loading workers for quick select:", error);
    }
  }

  // Form validation errors
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Photo state
  const [idPhoto, setIdPhoto] = useState<File | null>(null);
  const [workerPhoto, setWorkerPhoto] = useState<File | null>(null);
  const [idPhotoPreview, setIdPhotoPreview] = useState<string | null>(null);
  const [workerPhotoPreview, setWorkerPhotoPreview] = useState<string | null>(null);
  const [signatureType, setSignatureType] = useState<"worker" | "supervisor">("worker");

  useEffect(() => {
    loadUserInfo();
  }, []);

  useEffect(() => {
    if (companyId) {
      loadPayments();
      loadSummary();
    }
  }, [companyId, filters]);

  async function loadUserInfo() {
    try {
      const { supabase } = await import("../lib/supabase");
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("user_profiles")
        .select("company_id")
        .eq("id", user.id)
        .single();

      if (profile?.company_id) {
        setCompanyId(profile.company_id);
        setUserId(user.id);
      }
    } catch (error) {
      console.error("Error loading user info:", error);
    }
  }

  
  async function loadPayments() {
    try {
      setLoading(true);
      const data = await fetchFieldPayments(companyId, filters);
      setPayments(data);
    } catch (error) {
      console.error("Error loading payments:", error);
    } finally {
      setLoading(false);
    }
  }

  async function loadSummary() {
    try {
      const data = await fetchFieldPaymentSummary(companyId, {
        work_date_from: filters.work_date_from,
        work_date_to: filters.work_date_to,
        project_id: filters.project_id,
      });
      setSummary(data);
    } catch (error) {
      console.error("Error loading summary:", error);
    }
  }

  function handleCreatePayment() {
    // Reset form errors
    setFormErrors({});
    setError(null);
    setSuccess(null);
    
    setFormData({
      worker_name: "",
      worker_nickname: "",
      worker_id_number: "",
      worker_phone: "",
      worker_address: "",
      work_type: "",
      work_date: new Date().toISOString().split("T")[0],
      hours_worked: "",
      days_worked: "",
      rate_per_hour: "",
      rate_per_day: "",
      total_amount: "",
      payment_method: "cash",
      payment_notes: "",
      location: "",
      weather_conditions: "",
      notes: "",
      project_id: currentProject?.id || "",
    });
    setIdPhoto(null);
    setWorkerPhoto(null);
    setIdPhotoPreview(null);
    setWorkerPhotoPreview(null);
    setShowCreateModal(true);
  }

  // Validate form data
  function validateForm(): boolean {
    const errors: Record<string, string> = {};

    if (!formData.worker_name.trim()) {
      errors.worker_name = "Worker name is required";
    }

    if (!formData.work_type.trim()) {
      errors.work_type = "Work type is required";
    }

    if (!formData.total_amount || parseFloat(formData.total_amount) <= 0) {
      errors.total_amount = "Amount must be greater than 0";
    }

    if (formData.worker_phone && !/^\d{10,15}$/.test(formData.worker_phone.replace(/[^\d]/g, ''))) {
      errors.worker_phone = "Invalid phone number";
    }

    if (formData.hours_worked && parseFloat(formData.hours_worked) < 0) {
      errors.hours_worked = "Hours cannot be negative";
    }

    if (formData.days_worked && parseFloat(formData.days_worked) < 0) {
      errors.days_worked = "Days cannot be negative";
    }

    if (formData.rate_per_hour && parseFloat(formData.rate_per_hour) < 0) {
      errors.rate_per_hour = "Rate cannot be negative";
    }

    if (formData.rate_per_day && parseFloat(formData.rate_per_day) < 0) {
      errors.rate_per_day = "Rate cannot be negative";
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSavePayment() {
    // Prevent duplicate submissions
    if (saving) {
      console.log("Submission already in progress");
      return;
    }

    // Validate form
    if (!validateForm()) {
      setSubmitAttempts(prev => prev + 1);
      setError("Please fix the errors below");
      return;
    }

    // Validate company and user
    if (!companyId) {
      setError("Company information not available");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const paymentData = {
        ...formData,
        total_amount: parseFloat(formData.total_amount),
        hours_worked: formData.hours_worked ? parseFloat(formData.hours_worked) : undefined,
        days_worked: formData.days_worked ? parseFloat(formData.days_worked) : undefined,
        rate_per_hour: formData.rate_per_hour ? parseFloat(formData.rate_per_hour) : undefined,
        rate_per_day: formData.rate_per_day ? parseFloat(formData.rate_per_day) : undefined,
        project_id: formData.project_id || undefined,
        supervisor_name: userId ? "Current User" : undefined,
      };

      const newPayment = await createFieldPayment(paymentData, companyId, userId);
      
      if (!newPayment || !newPayment.id) {
        throw new Error("Failed to create payment record");
      }

      // Upload photos if provided - with error handling
      const uploadPromises = [];
      
      if (idPhoto) {
        uploadPromises.push(
          (async () => {
            try {
              const { url } = await uploadFieldPaymentImage(idPhoto, companyId, newPayment.id, "id_photo");
              const { updateFieldPayment } = await import("../lib/fieldPayments");
              return updateFieldPayment(newPayment.id, { id_photo_url: url });
            } catch (uploadError) {
              console.error("ID photo upload failed:", uploadError);
              // Continue without photo - don't fail the entire payment
              return null;
            }
          })()
        );
      }

      if (workerPhoto) {
        uploadPromises.push(
          (async () => {
            try {
              const { url } = await uploadFieldPaymentImage(workerPhoto, companyId, newPayment.id, "worker_photo");
              const { updateFieldPayment } = await import("../lib/fieldPayments");
              return updateFieldPayment(newPayment.id, { worker_photo_url: url });
            } catch (uploadError) {
              console.error("Worker photo upload failed:", uploadError);
              // Continue without photo - don't fail the entire payment
              return null;
            }
          })()
        );
      }

      // Wait for all uploads to complete (even if some fail)
      await Promise.allSettled(uploadPromises);

      setShowCreateModal(false);
      loadPayments();
      setSuccess("Payment created successfully!");
      
      // Open signature modal for worker
      setSelectedPayment(newPayment);
      setSignatureType("worker");
      setShowSignatureModal(true);
    } catch (error) {
      console.error("Error saving payment:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to save payment";
      setError(errorMessage);
      
      // Don't close modal on error so user can retry
      return;
    } finally {
      setSaving(false);
    }
  }

  async function handleSignatureComplete(signatureData: string) {
    if (!selectedPayment || !selectedPayment.id) {
      setError("No payment selected for signature");
      return;
    }

    if (!companyId) {
      setError("Company information not available");
      return;
    }

    try {
      // Validate signature data
      if (!signatureData || signatureData.trim() === "") {
        setError("Invalid signature data");
        return;
      }

      // Save signature to database
      const { createFieldPaymentSignature } = await import("../lib/fieldPayments");
      await createFieldPaymentSignature(
        {
          field_payment_id: selectedPayment.id,
          signature_type: signatureType,
          signature_data: signatureData,
          signed_by: signatureType === "worker" ? selectedPayment.worker_name : userId ? "Current User" : "Supervisor",
        },
        companyId
      );

      // Update payment status if worker signed
      if (signatureType === "worker") {
        const { updateFieldPayment } = await import("../lib/fieldPayments");
        await updateFieldPayment(selectedPayment.id, {
          status: "signed",
          signed_at: new Date().toISOString(),
        });
        setSuccess("Worker signature saved!");
      } else {
        setSuccess("Supervisor signature saved!");
      }

      setShowSignatureModal(false);
      loadPayments();
    } catch (error) {
      console.error("Error saving signature:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to save signature";
      setError(errorMessage);
      // Don't close modal on error so user can retry
    }
  }

  function handlePhotoCapture(file: File, type: "id" | "worker") {
    if (type === "id") {
      setIdPhoto(file);
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setIdPhotoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    } else {
      setWorkerPhoto(file);
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setWorkerPhotoPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
    setShowPhotoModal(false);
  }

  async function handleDownloadReceipt(payment: FieldPayment) {
    if (!payment || !payment.id) {
      setError("Invalid payment data");
      return;
    }

    if (!companyId) {
      setError("Company information not available");
      return;
    }

    try {
      // Show loading state
      setError(null);
      
      // Load signatures and company info
      const { fetchFieldPaymentSignatures } = await import("../lib/fieldPayments");
      const signatures = await fetchFieldPaymentSignatures(payment.id);
      
      // Get company info with fallback
      const { supabase } = await import("../lib/supabase");
      let company = null;
      
      try {
        const result = await supabase
          .from("company_settings")
          .select("company_name, address, phone")
          .eq("company_id", companyId)
          .single();
        company = result.data;
      } catch (companyError) {
        console.warn("Company settings not found:", companyError);
        // Continue with default values
      }

      // Generate receipt number with date
      const date = new Date().toISOString().split("T")[0].replace(/-/g, "");
      const receiptNumber = `FP-${date}-${payment.id.slice(0, 6)}`;

      downloadFieldPaymentReceipt({
        payment,
        signatures: signatures || [],
        companyName: company?.company_name || "Your Company",
        companyAddress: company?.address,
        companyPhone: company?.phone,
        receiptNumber,
        receiptType: "payment_acknowledgment",
      });
      
      setSuccess("Receipt generated successfully");
    } catch (error) {
      console.error("Error downloading receipt:", error);
      const errorMessage = error instanceof Error ? error.message : "Failed to download receipt";
      setError(errorMessage);
    }
  }

  function handleWhatsAppShare(payment: FieldPayment) {
    shareViaWhatsApp(payment, "Your Company");
  }

  function getStatusIcon(status: FieldPaymentStatus) {
    switch (status) {
      case "completed":
        return <CheckCircle className="w-4 h-4 text-green-600" />;
      case "signed":
        return <PenTool className="w-4 h-4 text-blue-600" />;
      case "draft":
        return <Clock className="w-4 h-4 text-yellow-600" />;
      case "cancelled":
        return <XCircle className="w-4 h-4 text-red-600" />;
      default:
        return null;
    }
  }

  function getPaymentMethodIcon(method: PaymentMethod) {
    switch (method) {
      case "cash":
        return <DollarSign className="w-4 h-4 text-green-600" />;
      case "bank_transfer":
        return <CreditCard className="w-4 h-4 text-blue-600" />;
      case "check":
        return <FileText className="w-4 h-4 text-purple-600" />;
      default:
        return <CreditCard className="w-4 h-4 text-slate-600" />;
    }
  }

  const filteredPayments = payments.filter(payment =>
    payment.worker_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    payment.worker_phone?.includes(searchTerm) ||
    payment.work_type.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Calculate summary stats
  const totalAmount = filteredPayments.reduce((sum, p) => sum + p.total_amount, 0);
  const todayPayments = filteredPayments.filter(p => 
    p.work_date === new Date().toISOString().split("T")[0]
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="border-b border-slate-200 bg-white px-8 py-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-3">
              <HandCoins className="w-8 h-8 text-blue-600" />
              <h1 className="text-2xl font-bold text-slate-900">Field Payments</h1>
            </div>
            <p className="text-sm text-slate-600 mt-1">
              Mobile-first worker payment and receipt system
            </p>
          </div>
          <button
            onClick={handleCreatePayment}
            className="flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            <Plus size={18} />
            New Payment
          </button>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="mx-8 mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-center gap-2">
            <XCircle className="w-5 h-5 text-red-600" />
            <span className="text-sm text-red-700">{error}</span>
            <button
              onClick={() => setError(null)}
              className="ml-auto text-red-600 hover:text-red-800"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {success && (
        <div className="mx-8 mt-4 rounded-lg border border-green-200 bg-green-50 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-sm text-green-700">{success}</span>
            <button
              onClick={() => setSuccess(null)}
              className="ml-auto text-green-600 hover:text-green-800"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Summary Cards */}
      <div className="px-8 py-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-50 p-2.5">
                <HandCoins className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-600">Total Payments</div>
                <div className="text-2xl font-bold text-slate-900">
                  ${totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-green-50 p-2.5">
                <Smartphone className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-600">Today's Payments</div>
                <div className="text-2xl font-bold text-slate-900">{todayPayments.length}</div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-purple-50 p-2.5">
                <User className="w-6 h-6 text-purple-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-600">Unique Workers</div>
                <div className="text-2xl font-bold text-slate-900">
                  {new Set(filteredPayments.map(p => p.worker_phone)).size}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-50 p-2.5">
                <Calendar className="w-6 h-6 text-orange-600" />
              </div>
              <div>
                <div className="text-sm font-medium text-slate-600">This Week</div>
                <div className="text-2xl font-bold text-slate-900">
                  {filteredPayments.filter(p => {
                    const paymentDate = new Date(p.work_date);
                    const today = new Date();
                    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
                    return paymentDate >= weekAgo;
                  }).length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="px-8 pb-4">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by worker name, phone, or work type..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <button
            onClick={() => setShowFilters(!showFilters)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors"
          >
            <Filter size={16} />
            <span className="hidden sm:inline">Filters</span>
          </button>
        </div>

        {showFilters && (
          <div className="mt-4 p-4 border border-slate-200 rounded-lg bg-white">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Status</option>
                <option value="draft">Draft</option>
                <option value="signed">Signed</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>

              <select
                value={filters.payment_method}
                onChange={(e) => setFilters({ ...filters, payment_method: e.target.value as any })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Methods</option>
                <option value="cash">Cash</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="check">Check</option>
                <option value="other">Other</option>
              </select>

              <input
                type="date"
                value={filters.work_date_from}
                onChange={(e) => setFilters({ ...filters, work_date_from: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="From Date"
              />

              <input
                type="date"
                value={filters.work_date_to}
                onChange={(e) => setFilters({ ...filters, work_date_to: e.target.value })}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="To Date"
              />
            </div>
          </div>
        )}
      </div>

      {/* Payments List */}
      <div className="px-8 pb-8">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
              <div className="text-slate-600">Loading payments...</div>
            </div>
          </div>
        ) : filteredPayments.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
            <HandCoins size={48} className="mx-auto mb-4 text-slate-300" />
            <div className="text-lg font-medium text-slate-900">No payments found</div>
            <div className="mt-1 text-sm text-slate-600">Get started by creating your first field payment</div>
            <button
              onClick={handleCreatePayment}
              className="mt-4 rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
            >
              Create Payment
            </button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Worker
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Work Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Method
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Signatures
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-700">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredPayments.map((payment) => (
                    <tr key={payment.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-slate-900">{payment.worker_name}</div>
                          {payment.worker_phone && (
                            <div className="text-xs text-slate-500">{payment.worker_phone}</div>
                          )}
                          {payment.worker_nickname && (
                            <div className="text-xs text-slate-400">"{payment.worker_nickname}"</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-slate-900">{payment.work_type}</div>
                          <div className="text-xs text-slate-500">
                            {new Date(payment.work_date).toLocaleDateString()}
                          </div>
                          {payment.hours_worked && (
                            <div className="text-xs text-slate-500">{payment.hours_worked} hrs</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-semibold text-slate-900">
                          ${payment.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {getPaymentMethodIcon(payment.payment_method)}
                          <span className="text-sm text-slate-600 capitalize">
                            {payment.payment_method.replace("_", " ")}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {getStatusIcon(payment.status)}
                          <span className="text-sm text-slate-600 capitalize">
                            {payment.status.replace("_", " ")}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-1">
                          {payment.signed_at ? (
                            <CheckCircle className="w-4 h-4 text-blue-600" />
                          ) : (
                            <div className="w-4 h-4 border-2 border-slate-300 rounded-full" />
                          )}
                          {payment.supervisor_name && (
                            <CheckCircle className="w-4 h-4 text-green-600" />
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleDownloadReceipt(payment)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                            title="Download Receipt"
                          >
                            <Download size={14} />
                          </button>
                          <button
                            onClick={() => handleWhatsAppShare(payment)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                            title="Share via WhatsApp"
                          >
                            <Share2 size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setSelectedPayment(payment);
                              setSignatureType("supervisor");
                              setShowSignatureModal(true);
                            }}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                            title="Add Supervisor Signature"
                          >
                            <PenTool size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Create Payment Modal */}
      {showCreateModal && (
        <BaseModal isOpen={showCreateModal} onClose={() => setShowCreateModal(false)}>
          <div className="w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <h2 className="text-xl font-bold text-slate-900 mb-6">Create Field Payment</h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Worker Information */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2">Worker Information</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Worker Name *</label>
                    <input
                      type="text"
                      value={formData.worker_name}
                      onChange={(e) => {
                        setFormData({ ...formData, worker_name: e.target.value });
                        if (formErrors.worker_name) {
                          setFormErrors(prev => ({ ...prev, worker_name: "" }));
                          }
                          // Auto-suggest from recent workers
                          if (e.target.value.length >= 2) {
                            handleWorkerNameChange(e.target.value);
                          }
                        }}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formErrors.worker_name ? "border-red-300" : "border-slate-300"
                      }`}
                      placeholder="Full name"
                    />
                    {formErrors.worker_name && (
                      <p className="mt-1 text-xs text-red-600">{formErrors.worker_name}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Nickname</label>
                    <input
                      type="text"
                      value={formData.worker_nickname}
                      onChange={(e) => setFormData({ ...formData, worker_nickname: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Optional nickname"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">ID Number</label>
                    <input
                      type="text"
                      value={formData.worker_id_number}
                      onChange={(e) => setFormData({ ...formData, worker_id_number: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Government ID number"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={formData.worker_phone}
                      onChange={(e) => {
                        setFormData({ ...formData, worker_phone: e.target.value });
                        if (formErrors.worker_phone) {
                          setFormErrors(prev => ({ ...prev, worker_phone: "" }));
                        }
                      }}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formErrors.worker_phone ? "border-red-300" : "border-slate-300"
                      }`}
                      placeholder="Phone number"
                    />
                    {formErrors.worker_phone && (
                      <p className="mt-1 text-xs text-red-600">{formErrors.worker_phone}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                    <textarea
                      value={formData.worker_address}
                      onChange={(e) => setFormData({ ...formData, worker_address: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      placeholder="Worker address (optional)"
                    />
                  </div>

                  {/* Photo Upload */}
                  <div className="space-y-3">
                    <h4 className="text-sm font-semibold text-slate-800">Photos</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="border-2 border-dashed border-slate-300 rounded-lg overflow-hidden">
                        {idPhotoPreview ? (
                          <div className="relative">
                            <img
                              src={idPhotoPreview}
                              alt="ID Photo"
                              className="w-full h-24 object-cover"
                            />
                            <button
                              onClick={() => {
                                setShowPhotoModal(true);
                                // Would track photo type
                              }}
                              className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                            >
                              <Camera className="w-6 h-6 text-white" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              setShowPhotoModal(true);
                              // Would track photo type
                            }}
                            className="p-3 text-center hover:bg-slate-50 transition-colors"
                          >
                            <Camera className="w-6 h-6 mx-auto mb-1 text-slate-400" />
                            <div className="text-xs text-slate-600">ID Photo</div>
                          </button>
                        )}
                      </div>
                      
                      <div className="border-2 border-dashed border-slate-300 rounded-lg overflow-hidden">
                        {workerPhotoPreview ? (
                          <div className="relative">
                            <img
                              src={workerPhotoPreview}
                              alt="Worker Photo"
                              className="w-full h-24 object-cover"
                            />
                            <button
                              onClick={() => setShowPhotoModal(true)}
                              className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity"
                            >
                              <Camera className="w-6 h-6 text-white" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setShowPhotoModal(true)}
                            className="p-3 text-center hover:bg-slate-50 transition-colors"
                          >
                            <Camera className="w-6 h-6 mx-auto mb-1 text-slate-400" />
                            <div className="text-xs text-slate-600">Worker Photo</div>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Work & Payment Details */}
                <div className="space-y-3">
                  <h3 className="text-lg font-semibold text-slate-800 border-b border-slate-200 pb-2">Work & Payment Details</h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Work Type *</label>
                    <input
                      type="text"
                      value={formData.work_type}
                      onChange={(e) => {
                        setFormData({ ...formData, work_type: e.target.value });
                        if (formErrors.work_type) {
                          setFormErrors(prev => ({ ...prev, work_type: "" }));
                        }
                      }}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        formErrors.work_type ? "border-red-300" : "border-slate-300"
                      }`}
                      placeholder="e.g., General Labor, Carpentry, etc."
                    />
                    {formErrors.work_type && (
                      <p className="mt-1 text-xs text-red-600">{formErrors.work_type}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Work Date</label>
                      <input
                        type="date"
                        value={formData.work_date}
                        onChange={(e) => setFormData({ ...formData, work_date: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Project</label>
                      <select
                        value={formData.project_id}
                        onChange={(e) => setFormData({ ...formData, project_id: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">No Project</option>
                        {projects.map((project) => (
                          <option key={project.id} value={project.id}>
                            {project.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Hours Worked</label>
                      <input
                        type="number"
                        step="0.5"
                        value={formData.hours_worked}
                        onChange={(e) => {
                          const hours = parseFloat(e.target.value) || 0;
                          const rate = parseFloat(formData.rate_per_hour) || 0;
                          setFormData({ 
                            ...formData, 
                            hours_worked: e.target.value,
                            total_amount: (hours * rate).toString()
                          });
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.0"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Rate per Hour</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.rate_per_hour}
                        onChange={(e) => {
                          const rate = parseFloat(e.target.value) || 0;
                          const hours = parseFloat(formData.hours_worked) || 0;
                          setFormData({ 
                            ...formData, 
                            rate_per_hour: e.target.value,
                            total_amount: (hours * rate).toString()
                          });
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Days Worked</label>
                      <input
                        type="number"
                        step="0.5"
                        value={formData.days_worked}
                        onChange={(e) => {
                          const days = parseFloat(e.target.value) || 0;
                          const rate = parseFloat(formData.rate_per_day) || 0;
                          setFormData({ 
                            ...formData, 
                            days_worked: e.target.value,
                            total_amount: (days * rate).toString()
                          });
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.0"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-1">Rate per Day</label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.rate_per_day}
                        onChange={(e) => {
                          const rate = parseFloat(e.target.value) || 0;
                          const days = parseFloat(formData.days_worked) || 0;
                          setFormData({ 
                            ...formData, 
                            rate_per_day: e.target.value,
                            total_amount: (days * rate).toString()
                          });
                        }}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Total Amount *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={formData.total_amount}
                      onChange={(e) => {
                        setFormData({ ...formData, total_amount: e.target.value });
                        if (formErrors.total_amount) {
                          setFormErrors(prev => ({ ...prev, total_amount: "" }));
                        }
                      }}
                      className={`w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold ${
                        formErrors.total_amount ? "border-red-300" : "border-slate-300"
                      }`}
                      placeholder="0.00"
                    />
                    
                    {/* Quick Amount Buttons */}
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      {quickAmounts.map((amount) => (
                        <button
                          key={amount}
                          onClick={() => handleQuickAmountSelect(amount)}
                          className="px-3 py-3 text-sm bg-slate-50 hover:bg-blue-50 hover:text-blue-600 rounded-lg transition-colors font-medium active:scale-95"
                        >
                          ${amount}
                        </button>
                      ))}
                    </div>
                    
                    {formErrors.total_amount && (
                      <p className="mt-1 text-xs text-red-600">{formErrors.total_amount}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Payment Method</label>
                    <select
                      value={formData.payment_method}
                      onChange={(e) => setFormData({ ...formData, payment_method: e.target.value as PaymentMethod })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="cash">Cash</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="check">Check</option>
                      <option value="other">Other</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Location</label>
                    <input
                      type="text"
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="Work site location"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Weather Conditions</label>
                    <input
                      type="text"
                      value={formData.weather_conditions}
                      onChange={(e) => setFormData({ ...formData, weather_conditions: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="e.g., Sunny, Rainy, etc."
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">Payment Notes</label>
                    <textarea
                      value={formData.payment_notes}
                      onChange={(e) => setFormData({ ...formData, payment_notes: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={2}
                      placeholder="Any payment-related notes"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">General Notes</label>
                    <textarea
                      value={formData.notes}
                      onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                      rows={3}
                      placeholder="Additional notes about the work"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-6 border-t border-slate-200">
                <button
                  onClick={() => setShowCreateModal(false)}
                  disabled={saving}
                  className="px-6 py-2 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSavePayment}
                  disabled={saving || !formData.worker_name || !formData.work_type || !formData.total_amount}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                >
                  {saving ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Creating...
                    </>
                  ) : (
                    "Create Payment"
                  )}
                </button>
              </div>
            </div>
          </div>
        </BaseModal>
      )}

      {/* Signature Modal */}
      {showSignatureModal && (
        <SignaturePad
          title={signatureType === "worker" ? "Worker Signature" : "Supervisor Signature"}
          subtitle={signatureType === "worker" ? "Please sign to acknowledge payment" : "Supervisor confirmation"}
          onSave={handleSignatureComplete}
          onCancel={() => setShowSignatureModal(false)}
        />
      )}

      {/* Photo Capture Modal */}
      {showPhotoModal && (
        <BaseModal isOpen={showPhotoModal} onClose={() => setShowPhotoModal(false)}>
          <div className="w-full max-w-2xl">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Capture Photo</h3>
              <MobilePhotoCapture
                projectId={currentProject?.id || ""}
                onSuccess={() => setShowPhotoModal(false)}
                onCancel={() => setShowPhotoModal(false)}
              />
            </div>
          </div>
        </BaseModal>
      )}
    </div>
  );
}
