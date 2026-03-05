import React from "react";
import { Lock } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName: string;
}

export default function PaywallModal({ isOpen, onClose, featureName }: PaywallModalProps) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleUpgrade = () => {
    onClose();
    navigate("/billing");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 p-6 max-w-md w-full mx-4">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full">
            <Lock size={24} className="text-blue-600 dark:text-blue-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Pro Feature</h2>
        </div>

        <p className="text-slate-700 dark:text-slate-300 mb-6">
          <strong>{featureName}</strong> is a Pro feature. Upgrade your plan to unlock this and other premium features.
        </p>

        <div className="flex gap-3">
          <button
            onClick={handleUpgrade}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-semibold transition-colors"
          >
            View Plans
          </button>
          <button
            onClick={onClose}
            className="flex-1 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-900 dark:text-slate-100 py-2 px-4 rounded-lg font-semibold transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
