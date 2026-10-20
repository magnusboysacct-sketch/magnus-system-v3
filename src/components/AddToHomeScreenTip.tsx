// The "Add to your home screen" tip of the worker portal: shown after a sign-in (WorkerHomePage decides when), with simple steps for Android and iPhone.
import { TIP_STEPS, isIPhoneLike } from "../lib/workerPortalInstall";

export default function AddToHomeScreenTip({ onClose, onNever }: { onClose: () => void; onNever: () => void }) {
  const iphoneFirst = typeof navigator !== "undefined" && isIPhoneLike(navigator.userAgent);
  const Block = ({ title, steps }: { title: string; steps: readonly string[] }) => (
    <div className="rounded-xl bg-slate-50 border border-slate-200 p-4">
      <div className="text-lg font-bold text-slate-900">{title}</div>
      <ol className="mt-2 space-y-2">
        {steps.map((s, i) => (
          <li key={s} className="flex items-start gap-3 text-lg text-slate-700">
            <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-700 text-base font-bold text-white">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
    </div>
  );
  return (
    <div role="dialog" aria-label="Add to your home screen" className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-3">
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl space-y-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Add this to your home screen</h2>
          <p className="mt-1 text-lg text-slate-600">Then you can open your portal with one tap. You stay signed in on this phone.</p>
        </div>
        {iphoneFirst
          ? (<><Block title="iPhone" steps={TIP_STEPS.iphone} /><Block title="Android" steps={TIP_STEPS.android} /></>)
          : (<><Block title="Android (Chrome)" steps={TIP_STEPS.android} /><Block title="iPhone (Safari)" steps={TIP_STEPS.iphone} /></>)}
        <button onClick={onClose} className="w-full min-h-[56px] rounded-xl bg-blue-700 text-white text-xl font-semibold">Got it</button>
        <button onClick={onNever} className="w-full min-h-[48px] text-lg text-slate-600 underline">Don&apos;t show this again</button>
      </div>
    </div>
  );
}
