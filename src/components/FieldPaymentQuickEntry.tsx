import React, { useState, useRef } from "react";
import { Camera, User, DollarSign, Calendar, MapPin, Cloud, Check, X } from "lucide-react";
import SignaturePad from "./SignaturePad";
import UniversalImageCapture, { type ImageCaptureMode } from "./UniversalImageCapture";
import { BaseModal } from "./common/BaseModal";

interface QuickEntryData {
  worker_name: string;
  worker_phone: string;
  work_type: string;
  total_amount: string;
  payment_method: "cash" | "bank_transfer" | "check" | "other";
  work_date: string;
  location: string;
  weather: string;
  notes: string;
}

interface FieldPaymentQuickEntryProps {
  onSave: (data: QuickEntryData, signatures: { worker: string; supervisor: string }, photos: { id: File | null; worker: File | null }) => void;
  onCancel: () => void;
  defaultLocation?: string;
  defaultWeather?: string;
}

export default function FieldPaymentQuickEntry({
  onSave,
  onCancel,
  defaultLocation = "",
  defaultWeather = "",
}: FieldPaymentQuickEntryProps) {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<QuickEntryData>({
    worker_name: "",
    worker_phone: "",
    work_type: "",
    total_amount: "",
    payment_method: "cash",
    work_date: new Date().toISOString().split("T")[0],
    location: defaultLocation,
    weather: defaultWeather,
    notes: "",
  });

  const [signatures, setSignatures] = useState<{ worker: string; supervisor: string }>({
    worker: "",
    supervisor: "",
  });

  const [photos, setPhotos] = useState<{ id: File | null; worker: File | null }>({
    id: null,
    worker: null,
  });

  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [signatureType, setSignatureType] = useState<"worker" | "supervisor">("worker");
  const [photoType, setPhotoType] = useState<"id" | "worker">("id");

  const amountInputRef = useRef<HTMLInputElement>(null);

  function handleNext() {
    if (step < 4) {
      setStep(step + 1);
    }
  }

  function handlePrevious() {
    if (step > 1) {
      setStep(step - 1);
    }
  }

  function handleSignatureSave(signatureData: string) {
    // Validate signature data
    if (!signatureData || signatureData.trim() === "") {
      alert("Invalid signature. Please sign again.");
      return;
    }
    
    setSignatures(prev => ({
      ...prev,
      [signatureType]: signatureData,
    }));
    setShowSignatureModal(false);
  }

  function handlePhotoSelect(file: File) {
    // Validate file
    if (!file) {
      console.error("No file provided");
      return;
    }
    
    // Check file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
      alert("File size must be less than 10MB");
      return;
    }
    
    // Check file type
    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (!validTypes.includes(file.type)) {
      alert("Please select a valid image file (JPG, PNG, or WEBP)");
      return;
    }
    
    setPhotos(prev => ({
      ...prev,
      [photoType]: file,
    }));
    setShowPhotoModal(false);
  }

  function calculateTotal() {
    // Quick calculation helpers
    if (data.work_type.toLowerCase().includes("hour") && data.total_amount) {
      const rate = parseFloat(data.total_amount) || 0;
      setData(prev => ({
        ...prev,
        total_amount: rate.toString(),
      }));
    }
  }

  function isStepValid() {
    switch (step) {
      case 1:
        return data.worker_name.trim() !== "";
      case 2:
        return data.work_type.trim() !== "" && data.total_amount !== "" && parseFloat(data.total_amount) > 0;
      case 3:
        return true; // Photos are optional
      case 4:
        return signatures.worker !== ""; // Worker signature required
      default:
        return false;
    }
  }

  function handleComplete() {
    if (!isStepValid()) return;
    
    // Validate required data
    if (!data.worker_name.trim()) {
      alert("Worker name is required");
      return;
    }
    
    if (!data.work_type.trim()) {
      alert("Work type is required");
      return;
    }
    
    if (!data.total_amount || parseFloat(data.total_amount) <= 0) {
      alert("Amount must be greater than 0");
      return;
    }
    
    if (!signatures.worker) {
      alert("Worker signature is required");
      return;
    }
    
    // Validate photos (optional but check if they exist)
    const photoData: { id: File | null; worker: File | null } = {
      id: photos.id || null,
      worker: photos.worker || null,
    };
    
    onSave(data, signatures, photoData);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-slate-900">Quick Payment Entry</h2>
              <div className="flex items-center gap-2 mt-1">
                {[1, 2, 3, 4].map((s) => (
                  <div
                    key={s}
                    className={`w-8 h-1 rounded-full transition-colors ${
                      s <= step ? "bg-blue-600" : "bg-slate-300"
                    }`}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={onCancel}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <X size={20} className="text-slate-600" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {step === 1 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <User className="w-12 h-12 text-blue-600 mx-auto mb-2" />
                <h3 className="text-lg font-semibold text-slate-900">Worker Information</h3>
                <p className="text-sm text-slate-600">Enter worker details</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Worker Name *
                </label>
                <input
                  type="text"
                  value={data.worker_name}
                  onChange={(e) => setData({ ...data, worker_name: e.target.value })}
                  className="w-full px-4 py-3 text-lg border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Full name"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Phone Number *
                </label>
                <input
                  type="tel"
                  value={data.worker_phone}
                  onChange={(e) => setData({ ...data, worker_phone: e.target.value })}
                  className="w-full px-4 py-3 text-lg border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Phone number"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Work Date
                </label>
                <input
                  type="date"
                  value={data.work_date}
                  onChange={(e) => setData({ ...data, work_date: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <DollarSign className="w-12 h-12 text-green-600 mx-auto mb-2" />
                <h3 className="text-lg font-semibold text-slate-900">Work & Payment</h3>
                <p className="text-sm text-slate-600">Enter work details and amount</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Work Type *
                </label>
                <input
                  type="text"
                  value={data.work_type}
                  onChange={(e) => setData({ ...data, work_type: e.target.value })}
                  className="w-full px-4 py-3 text-lg border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g., General Labor, Carpentry"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Total Amount ($) *
                </label>
                <input
                  ref={amountInputRef}
                  type="number"
                  step="0.01"
                  value={data.total_amount}
                  onChange={(e) => setData({ ...data, total_amount: e.target.value })}
                  className="w-full px-4 py-3 text-lg font-semibold border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Payment Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "cash", label: "Cash" },
                    { value: "bank_transfer", label: "Bank" },
                    { value: "check", label: "Check" },
                    { value: "other", label: "Other" },
                  ].map((method) => (
                    <button
                      key={method.value}
                      onClick={() => setData({ ...data, payment_method: method.value as any })}
                      className={`px-4 py-2 rounded-lg border transition-colors ${
                        data.payment_method === method.value
                          ? "border-blue-600 bg-blue-50 text-blue-600"
                          : "border-slate-300 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {method.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Location
                </label>
                <div className="relative">
                  <MapPin className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={data.location}
                    onChange={(e) => setData({ ...data, location: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Work site location"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Weather
                </label>
                <div className="relative">
                  <Cloud className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    value={data.weather}
                    onChange={(e) => setData({ ...data, weather: e.target.value })}
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g., Sunny, Rainy"
                  />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <Camera className="w-12 h-12 text-purple-600 mx-auto mb-2" />
                <h3 className="text-lg font-semibold text-slate-900">Photos (Optional)</h3>
                <p className="text-sm text-slate-600">Capture ID and worker photos</p>
              </div>

              <div className="space-y-4">
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-slate-900">ID Photo</h4>
                      <p className="text-sm text-slate-600">Government ID or driver's license</p>
                    </div>
                    <button
                      onClick={() => {
                        setPhotoType("id");
                        setShowPhotoModal(true);
                      }}
                      className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Camera size={20} />
                    </button>
                  </div>
                  {photos.id && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
                      <Check size={16} />
                      ID photo captured
                    </div>
                  )}
                </div>

                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-slate-900">Worker Photo</h4>
                      <p className="text-sm text-slate-600">Photo of the worker (optional)</p>
                    </div>
                    <button
                      onClick={() => {
                        setPhotoType("worker");
                        setShowPhotoModal(true);
                      }}
                      className="p-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Camera size={20} />
                    </button>
                  </div>
                  {photos.worker && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
                      <Check size={16} />
                      Worker photo captured
                    </div>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Notes
                </label>
                <textarea
                  value={data.notes}
                  onChange={(e) => setData({ ...data, notes: e.target.value })}
                  className="w-full px-4 py-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Additional notes about the work"
                />
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-4">
              <div className="text-center mb-6">
                <Check className="w-12 h-12 text-green-600 mx-auto mb-2" />
                <h3 className="text-lg font-semibold text-slate-900">Signatures</h3>
                <p className="text-sm text-slate-600">Worker and supervisor signatures</p>
              </div>

              <div className="space-y-4">
                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-slate-900">Worker Signature *</h4>
                      <p className="text-sm text-slate-600">Worker must sign to acknowledge payment</p>
                    </div>
                    <button
                      onClick={() => {
                        setSignatureType("worker");
                        setShowSignatureModal(true);
                      }}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        signatures.worker
                          ? "bg-green-100 text-green-700 border border-green-300"
                          : "bg-blue-600 text-white hover:bg-blue-700"
                      }`}
                    >
                      {signatures.worker ? "Signed" : "Sign"}
                    </button>
                  </div>
                  {signatures.worker && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
                      <Check size={16} />
                      Worker signature captured
                    </div>
                  )}
                </div>

                <div className="border-2 border-dashed border-slate-300 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-slate-900">Supervisor Signature</h4>
                      <p className="text-sm text-slate-600">Optional supervisor confirmation</p>
                    </div>
                    <button
                      onClick={() => {
                        setSignatureType("supervisor");
                        setShowSignatureModal(true);
                      }}
                      className={`px-4 py-2 rounded-lg transition-colors ${
                        signatures.supervisor
                          ? "bg-green-100 text-green-700 border border-green-300"
                          : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                      }`}
                    >
                      {signatures.supervisor ? "Signed" : "Sign"}
                    </button>
                  </div>
                  {signatures.supervisor && (
                    <div className="mt-3 flex items-center gap-2 text-sm text-green-600">
                      <Check size={16} />
                      Supervisor signature captured
                    </div>
                  )}
                </div>
              </div>

              {/* Summary */}
              <div className="bg-slate-50 rounded-xl p-4">
                <h4 className="font-medium text-slate-900 mb-3">Payment Summary</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-slate-600">Worker:</span>
                    <span className="font-medium">{data.worker_name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Work:</span>
                    <span className="font-medium">{data.work_type}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Amount:</span>
                    <span className="font-bold text-lg">${data.total_amount}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">Method:</span>
                    <span className="font-medium capitalize">{data.payment_method.replace("_", " ")}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex gap-3 mt-6 pt-6 border-t border-slate-200">
            {step > 1 && (
              <button
                onClick={handlePrevious}
                className="flex-1 px-4 py-3 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Previous
              </button>
            )}

            {step < 4 ? (
              <button
                onClick={handleNext}
                disabled={!isStepValid()}
                className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleComplete}
                disabled={!isStepValid()}
                className="flex-1 px-4 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors font-semibold"
              >
                Complete Payment
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Signature Modal */}
      {showSignatureModal && (
        <SignaturePad
          title={signatureType === "worker" ? "Worker Signature" : "Supervisor Signature"}
          subtitle={signatureType === "worker" ? "Sign to acknowledge payment" : "Optional supervisor confirmation"}
          onSave={handleSignatureSave}
          onCancel={() => setShowSignatureModal(false)}
        />
      )}

      {/* Photo Modal */}
      {showPhotoModal && (
        <BaseModal isOpen={showPhotoModal} onClose={() => setShowPhotoModal(false)}>
          <div className="w-full max-w-lg">
            <div className="p-6">
              <UniversalImageCapture
                title={photoType === "id" ? "Capture ID Photo" : "Capture Worker Photo"}
                subtitle={photoType === "id" ? "Government ID or driver's license" : "Photo of the worker"}
                mode={photoType === "id" ? "id_photo" : "worker_photo"}
                onImageReady={handlePhotoSelect}
                onCancel={() => setShowPhotoModal(false)}
                maxSize={1600}
                quality={0.8}
              />
            </div>
          </div>
        </BaseModal>
      )}
    </div>
  );
}
