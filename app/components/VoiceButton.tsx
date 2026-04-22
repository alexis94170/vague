"use client";

import { useEffect, useRef, useState } from "react";
import { createRecognition, isSpeechSupported } from "../lib/speech";
import { haptic } from "../lib/haptics";
import Icon from "./Icon";

type Props = {
  onTranscript: (text: string, isFinal: boolean) => void;
  size?: "sm" | "md";
};

export default function VoiceButton({ onTranscript, size = "md" }: Props) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<ReturnType<typeof createRecognition>>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    setSupported(isSpeechSupported());
  }, []);

  useEffect(() => {
    return () => {
      recRef.current?.abort();
    };
  }, []);

  function toggle() {
    if (!supported) {
      setError("La saisie vocale n'est pas supportée sur ce navigateur.");
      return;
    }
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const rec = createRecognition("fr-FR");
    if (!rec) return;
    recRef.current = rec;
    setError(null);

    rec.onresult = (e) => {
      let finalText = "";
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      if (finalText) onTranscript(finalText, true);
      else if (interim) onTranscript(interim, false);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") setError("Autorise le micro pour utiliser la dictée.");
      else if (e.error !== "no-speech" && e.error !== "aborted") setError(`Erreur : ${e.error}`);
      setListening(false);
    };
    rec.onend = () => setListening(false);

    try {
      rec.start();
      setListening(true);
      haptic("light");
    } catch {
      // ignore (already started)
    }
  }

  if (!supported) return null;

  const dims = size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const icon = size === "sm" ? 14 : 16;

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggle}
        className={`no-select flex ${dims} shrink-0 items-center justify-center rounded-full transition active:scale-90 ${
          listening
            ? "bg-rose-500 text-white animate-pulse"
            : "text-[var(--text-muted)] hover:bg-[var(--bg-hover)]"
        }`}
        title={listening ? "Arrêter la dictée" : "Dicter"}
      >
        <svg viewBox="0 0 24 24" width={icon} height={icon} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <rect x="9" y="2" width="6" height="12" rx="3" />
          <path d="M5 10v2a7 7 0 0 0 14 0v-2" />
          <line x1="12" y1="21" x2="12" y2="19" />
        </svg>
      </button>
      {error && (
        <div className="absolute right-0 top-full mt-1 whitespace-nowrap rounded-md bg-rose-500 px-2 py-1 text-[10.5px] text-white">
          {error}
          <button onClick={() => setError(null)} className="ml-1 opacity-80 hover:opacity-100"><Icon name="x" size={9} /></button>
        </div>
      )}
    </div>
  );
}
