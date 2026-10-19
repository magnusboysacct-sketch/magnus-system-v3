// The two panels about an unconfirmed email on /login:
//  - CheckYourEmail: the full-card screen shown after signing up (stays until the person acts).
//  - EmailNotConfirmedPanel: the inline panel shown when someone signs in before confirming.
import ResendConfirmation from "./ResendConfirmation";
import { mailProviderFor } from "../lib/signupPending";

const SPAM_TIP = "Can't find it? Check your spam or promotions folder.";

function Envelope() {
  return (
    <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-blue-50 border border-blue-100" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-10 w-10 text-blue-600" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="5" width="18" height="14" rx="2.5" />
        <path d="M3.5 7.5 12 13.5l8.5-6" />
      </svg>
    </div>
  );
}

export function CheckYourEmail({ email, lastSentAt, onSent, onBack, onConfirmed }: {
  email: string;
  lastSentAt: number;
  onSent: (sentAt: number) => void;
  onBack: () => void;       // "Wrong email? Go back": the signup form again, fields kept
  onConfirmed: () => void;  // "I've confirmed - Sign in"
}) {
  const provider = mailProviderFor(email);
  const steps = ["Open your email inbox", "Click \"Confirm my account\" in our email", "You'll be signed in automatically"];
  return (
    <div className="p-5 sm:p-6 text-center" data-testid="check-your-email">
      <Envelope />
      <h2 className="text-xl font-bold text-slate-900 leading-snug">Check your email to finish signing up</h2>
      <p className="mt-2 text-sm text-slate-600">
        We sent a confirmation link to <strong className="break-words text-slate-900">{email}</strong>
      </p>

      <ol className="mt-5 space-y-3 text-left">
        {steps.map((s, i) => (
          <li key={s} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">{i + 1}</span>
            <span className="pt-0.5 text-sm text-slate-700">{s}</span>
          </li>
        ))}
      </ol>

      {provider && (
        <a
          href={provider.url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 flex min-h-[48px] w-full items-center justify-center rounded-md bg-blue-600 hover:bg-blue-500 text-white px-4 py-3 text-sm font-semibold transition"
        >
          Open {provider.name}
        </a>
      )}

      <p className="mt-4 text-sm text-slate-600">{SPAM_TIP}</p>

      <div className="mt-4 text-left">
        <ResendConfirmation email={email} lastSentAt={lastSentAt} onSent={onSent} />
      </div>

      <button type="button" onClick={onBack} className="mt-3 min-h-[44px] w-full text-sm text-slate-600 underline hover:text-slate-800">
        Wrong email? Go back
      </button>

      <div className="mt-3 border-t border-slate-100 pt-4">
        <button
          type="button"
          onClick={onConfirmed}
          className="w-full min-h-[48px] rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 px-4 py-3 text-sm font-semibold transition"
        >
          I've confirmed - Sign in
        </button>
      </div>
    </div>
  );
}

export function EmailNotConfirmedPanel({ email, lastSentAt, onSent }: { email: string; lastSentAt: number; onSent: (sentAt: number) => void }) {
  return (
    <div role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900" data-testid="email-not-confirmed">
      <p className="font-semibold">Please confirm your email first.</p>
      <p className="mt-1">We sent a link to <strong className="break-words">{email}</strong>. Open it to activate your account, then sign in.</p>
      <p className="mt-2 text-amber-800">{SPAM_TIP}</p>
      <div className="mt-3">
        <ResendConfirmation email={email} lastSentAt={lastSentAt} onSent={onSent} />
      </div>
    </div>
  );
}
