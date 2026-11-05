// src/pages/GetAppPage.tsx — /get-app: how a worker puts the "Magnus Workers" Android app on their phone (public page, big pictures,
// few words). The app file is built by GitHub (mobile/, .github/workflows/android-worker-app.yml) and always the newest at APK_URL.
import { useForceLightPage } from "../hooks/useForceLightPage";
import { isNativeApp } from "../lib/nativeApp";

export const APK_URL = "https://github.com/magnusboysacct-sketch/magnus-system-v3/releases/latest/download/magnus-workers.apk";

function say(t: string) {
  try { window.speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(t); u.rate = 0.95; window.speechSynthesis.speak(u); } catch { /* no voice */ }
}

export default function GetAppPage() {
  useForceLightPage();
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const android = /android/i.test(ua), iphone = /iphone|ipad|ipod/i.test(ua);
  const steps: [string, string, string][] = [
    ["⬇️", "Tap the big green button.", "Tap the big green button to download the app."],
    ["📂", "When it finishes, tap Open.", "When the download finishes, tap Open."],
    ["⚙️", "If the phone asks, tap Settings, then turn on \"Allow from this source\". Go back.", "If the phone says it is not allowed, tap Settings, turn on allow from this source, then go back."],
    ["✅", "Tap Install. If it warns about an unknown app, tap \"More details\" then \"Install anyway\".", "Tap Install. If it warns about an unknown app, tap more details, then install anyway."],
    ["📍", "Open Magnus Workers. The phone asks for each permission only the first time it is needed. Tap \"While using the app\" or \"Allow\".", "Open Magnus Workers. The phone asks for each permission only the first time it is needed. Tap while using the app, or allow."],
    ["🔢", "Sign in with your worker number and PIN.", "Sign in with your worker number and your PIN."],
    ["🔋", "Phone Settings → Apps → Magnus Workers → Battery → \"Unrestricted\". (So the phone does not stop the clock.)", "Last, open the phone settings, apps, Magnus Workers, battery, and choose unrestricted, so the phone does not stop the clock."],
  ];
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-md px-4 py-6 space-y-5">
        <div className="text-center">
          <img src="/icon-192x192.png" alt="" className="mx-auto h-20 w-20 rounded-2xl" />
          <h1 className="mt-3 text-3xl font-extrabold">Magnus Workers app</h1>
          <p className="mt-1 text-lg text-slate-600">Clock in and out on your phone. It keeps working with the phone locked.</p>
          <button onClick={() => say(`To get the app: ${steps.map((s) => s[2]).join(" ")}`)} className="mt-3 min-h-[52px] rounded-xl border-2 border-slate-300 bg-white px-4 text-lg font-semibold">🔊 Read it to me</button>
        </div>

        {isNativeApp() ? (
          <div className="rounded-2xl border-2 border-green-300 bg-green-50 p-4 text-xl text-green-900">✅ You already have the app. <a href="/worker" className="underline font-bold">Open the clock</a></div>
        ) : iphone ? (
          <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-lg text-amber-900">
            📱 The app is for Android phones. On iPhone, use the website: open <b>app.magnusboys.com/worker</b> in Safari, tap <b>Share</b> ⬆️ then <b>Add to Home Screen</b>.
          </div>
        ) : (<>
          <a href={APK_URL} onClick={() => say("Downloading. When it finishes, tap Open.")}
            className="block w-full rounded-3xl bg-green-600 hover:bg-green-500 active:bg-green-700 px-4 py-6 text-center text-white shadow-lg">
            <div className="text-5xl leading-none">⬇️</div>
            <div className="mt-2 text-3xl font-extrabold">GET THE APP</div>
            <div className="text-lg opacity-90">Android · free</div>
          </a>
          {!android && <p className="text-center text-base text-slate-500">Open this page on the worker's Android phone: <b>app.magnusboys.com/get-app</b></p>}
        </>)}

        {!iphone && !isNativeApp() && (
          <ol className="space-y-3">
            {steps.map(([icon, text], i) => (
              <li key={i} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-700 text-lg font-bold text-white">{i + 1}</span>
                <span className="text-3xl leading-none">{icon}</span>
                <span className="text-lg">{text}</span>
              </li>
            ))}
          </ol>
        )}
        <div className="rounded-2xl border-2 border-blue-200 bg-white p-4 space-y-2">
          <div className="text-xl font-bold">🔒 What the app uses, and why</div>
          <div className="text-lg">📍 <b>Location</b>: only while you are clocked in, to show you are on the site. It stops when you clock out. Never after work.</div>
          <div className="text-lg">📷 <b>Camera</b>: only when YOU tap a camera button (your face at clock in, pictures of the work).</div>
          <div className="text-lg">🎤 <b>Microphone</b>: only while YOU hold the 🎤 button. You don't have to use it.</div>
          <div className="text-lg">🔔 <b>Notifications</b>: "You are clocked in" and "Are you still on the site?".</div>
          <div className="text-base text-slate-600">The app cannot turn on the camera or microphone by itself. Android shows a green dot at the top of the screen whenever they are in use. You can change any permission any time: phone Settings → Apps → Magnus Workers → Permissions.</div>
        </div>
        <p className="text-center text-base text-slate-500">The app shows a "You are clocked in" notice while you are clocked in. That is how it checks you are on the site. It stops when you clock out.</p>
        <a href="/worker" className="block text-center text-lg text-blue-700 underline">Use the website instead</a>
      </div>
    </div>
  );
}
