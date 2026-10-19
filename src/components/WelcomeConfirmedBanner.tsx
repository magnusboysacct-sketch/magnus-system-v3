// Shown once, on the dashboard, after someone confirmed their email through the link in the signup email (/auth/confirm sets the flag).
import { useEffect, useState } from "react";
import { takeWelcomeFlag } from "../lib/signupPending";

export default function WelcomeConfirmedBanner() {
  const [show, setShow] = useState(false);

  // Reading the flag removes it, so a refresh or a later visit does not show the message again.
  useEffect(() => {
    if (takeWelcomeFlag()) setShow(true);
  }, []);

  useEffect(() => {
    if (!show) return;
    const id = window.setTimeout(() => setShow(false), 15000);
    return () => window.clearTimeout(id);
  }, [show]);

  if (!show) return null;
  return (
    <div className="fixed inset-x-4 top-4 z-[100] mx-auto max-w-md" role="status">
      <div className="flex items-start gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 shadow-lg text-emerald-900">
        <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">✓</span>
        <p className="flex-1 text-sm font-medium">Your email is confirmed. Welcome to Magnus Boy&apos;s System!</p>
        <button type="button" onClick={() => setShow(false)} aria-label="Close" className="-m-2 flex h-11 w-11 shrink-0 items-center justify-center text-xl leading-none text-emerald-700 hover:text-emerald-900">×</button>
      </div>
    </div>
  );
}
