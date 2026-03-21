import { Shield, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function FinanceAccessDenied() {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-4 flex justify-center">
          <div className="rounded-full bg-orange-100 p-4">
            <Shield className="h-12 w-12 text-orange-600" />
          </div>
        </div>

        <h2 className="mb-2 text-2xl font-bold text-slate-900">
          Access Restricted
        </h2>

        <p className="mb-6 text-sm text-slate-600">
          You do not have permission to access this finance module.
          Please contact your administrator if you need access to financial data.
        </p>

        <button
          onClick={() => navigate('/')}
          className="flex items-center justify-center gap-2 w-full rounded-lg bg-slate-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
        >
          <ArrowLeft size={16} />
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
