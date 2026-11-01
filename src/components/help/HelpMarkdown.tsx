// src/components/help/HelpMarkdown.tsx — the Help Center's article look (headings, lists, tables, tips) and its
// read-aloud player, shared by the Help Center and the HQ Manual. Moved here unchanged from HelpCenterPage.tsx.
/* eslint-disable react-refresh/only-export-components */
import React, { useEffect, useState } from "react";
import { Pause, Play, Square, Volume2 } from "lucide-react";

export function renderMarkdown(content: string): React.ReactNode {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith("# ")) {
      elements.push(<h1 key={i} className="text-2xl font-black text-slate-800 dark:text-slate-100 mb-4 mt-2">{line.slice(2)}</h1>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={i} className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-3 mt-6 pb-2 border-b border-slate-200 dark:border-slate-700">{line.slice(3)}</h2>);
    } else if (line.startsWith("### ")) {
      elements.push(<h3 key={i} className="text-base font-bold text-slate-600 dark:text-slate-300 mb-2 mt-4">{line.slice(4)}</h3>);
    } else if (line.startsWith("- ")) {
      const items: string[] = [];
      while (i < lines.length && lines[i].startsWith("- ")) {
        items.push(lines[i].slice(2));
        i++;
      }
      elements.push(
        <ul key={i} className="list-none space-y-1.5 mb-4 ml-2">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-300">
              <span className="text-blue-500 mt-1 flex-shrink-0">▸</span>
              <span dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-800 dark:text-slate-100">$1</strong>') }}/>
            </li>
          ))}
        </ul>
      );
      continue;
    } else if (/^\d+\./.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\./.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s/, ""));
        i++;
      }
      elements.push(
        <ol key={i} className="list-none space-y-2 mb-4 ml-2">
          {items.map((item, j) => (
            <li key={j} className="flex items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
              <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-600 dark:text-blue-400 text-xs font-bold flex items-center justify-center">{j+1}</span>
              <span className="mt-0.5" dangerouslySetInnerHTML={{ __html: item.replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-800 dark:text-slate-100">$1</strong>') }}/>
            </li>
          ))}
        </ol>
      );
      continue;
    } else if (line.startsWith("| ")) {
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        if (!lines[i].includes("---")) {
          rows.push(lines[i].split("|").filter(c => c.trim()).map(c => c.trim()));
        }
        i++;
      }
      if (rows.length > 0) {
        elements.push(
          <div key={i} className="overflow-x-auto mb-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-800">
                  {rows[0].map((cell, j) => (
                    <th key={j} className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">{cell}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {rows.slice(1).map((row, j) => (
                  <tr key={j} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    {row.map((cell, k) => (
                      <td key={k} className="px-4 py-2.5 text-slate-600 dark:text-slate-300">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }
      continue;
    } else if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      elements.push(
        <pre key={i} className="bg-slate-100 dark:bg-slate-800 rounded-xl p-4 text-xs font-mono text-slate-700 dark:text-slate-300 overflow-x-auto mb-4 border border-slate-200 dark:border-slate-700">
          {codeLines.join("\n")}
        </pre>
      );
    } else if (line.startsWith("⚠️") || line.startsWith("💡")) {
      elements.push(
        <div key={i} className={`flex items-start gap-2 p-3 rounded-xl mb-4 text-sm ${line.startsWith("⚠️") ? "bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 text-amber-700 dark:text-amber-400" : "bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 text-blue-700 dark:text-blue-400"}`}>
          <span dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }}/>
        </div>
      );
    } else if (line.trim()) {
      elements.push(
        <p key={i} className="text-sm text-slate-600 dark:text-slate-300 mb-3 leading-relaxed"
          dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-800 dark:text-slate-100">$1</strong>') }}/>
      );
    }
    i++;
  }
  return elements;
}

// ─── Text-to-speech player ─────────────────────────────────────────────────
export function SpeechPlayer({ text }: { text: string }) {
  const [speaking, setSpeaking] = useState(false);
  const [paused, setPaused] = useState(false);
  const [rate, setRate] = useState(1);
  const [supported] = useState(() => "speechSynthesis" in window);

  // Clean text for speech — remove markdown symbols
  function cleanText(raw: string): string {
    return raw
      .replace(/#{1,6}\s/g, "") // headings
      .replace(/\*\*(.*?)\*\*/g, "$1") // bold
      .replace(/\*(.*?)\*/g, "$1") // italic
      .replace(/`{1,3}[^`]*`{1,3}/g, "") // code
      .replace(/\|.*\|/g, "") // tables
      .replace(/[-─═]/g, "") // dividers
      .replace(/\[.*?\]\(.*?\)/g, "") // links
      .replace(/⚠️|💡|✅|▸|📏|📐|🔢|📦|🧱/g, "") // emojis
      .replace(/\n{2,}/g, ". ") // paragraph breaks
      .replace(/\n/g, " ") // line breaks
      .trim();
  }

  function play() {
    if (!supported) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText(text));
    utterance.rate = rate;
    utterance.lang = "en-US";
    // Pick a clear voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v =>
      v.name.includes("Google") || v.name.includes("Daniel") || v.name.includes("Samantha")
    );
    if (preferred) utterance.voice = preferred;
    utterance.onstart = () => { setSpeaking(true); setPaused(false); };
    utterance.onend = () => { setSpeaking(false); setPaused(false); };
    utterance.onpause = () => setPaused(true);
    utterance.onresume = () => setPaused(false);
    window.speechSynthesis.speak(utterance);
  }

  function pause() {
    if (speaking && !paused) {
      window.speechSynthesis.pause();
      setPaused(true);
    } else if (paused) {
      window.speechSynthesis.resume();
      setPaused(false);
    }
  }

  function stop() {
    window.speechSynthesis.cancel();
    setSpeaking(false);
    setPaused(false);
  }

  // Stop when component unmounts
  useEffect(() => {
    return () => window.speechSynthesis.cancel();
  }, []);

  // Restart with new rate
  function changeRate(newRate: number) {
    setRate(newRate);
    if (speaking) {
      stop();
      setTimeout(() => {
        const utterance = new SpeechSynthesisUtterance(cleanText(text));
        utterance.rate = newRate;
        utterance.lang = "en-US";
        utterance.onstart = () => { setSpeaking(true); setPaused(false); };
        utterance.onend = () => { setSpeaking(false); setPaused(false); };
        window.speechSynthesis.speak(utterance);
      }, 100);
    }
  }

  if (!supported) return null;

  return (
    <div className="flex items-center gap-2 flex-wrap p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 mb-6">
      {/* Play / Pause button */}
      {!speaking ? (
        <button onClick={play}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold transition-colors">
          <Volume2 size={15}/> Listen
        </button>
      ) : (
        <button onClick={pause}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-semibold transition-colors">
          {paused ? <Play size={15}/> : <Pause size={15}/>}
          {paused ? "Resume" : "Pause"}
        </button>
      )}

      {/* Stop button */}
      {speaking && (
        <button onClick={stop}
          className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
          <Square size={13}/> Stop
        </button>
      )}

      {/* Speaking indicator */}
      {speaking && !paused && (
        <div className="flex items-center gap-1.5">
          <div className="flex gap-0.5">
            {[0,1,2].map(i => (
              <div key={i} className="w-1 bg-blue-500 rounded-full animate-bounce"
                style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 0.15}s` }}/>
            ))}
          </div>
          <span className="text-xs text-blue-500 font-medium">Reading...</span>
        </div>
      )}

      {/* Speed controls */}
      <div className="flex items-center gap-1 ml-auto">
        <span className="text-xs text-slate-400 mr-1">Speed:</span>
        {[0.75, 1, 1.25, 1.5, 2].map(r => (
          <button key={r} onClick={() => changeRate(r)}
            className={`px-2 py-1 rounded-lg text-xs font-semibold transition-colors ${
              rate === r
                ? "bg-blue-600 text-white"
                : "text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700"
            }`}>
            {r}x
          </button>
        ))}
      </div>
    </div>
  );
}

