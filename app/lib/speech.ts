"use client";

// Web Speech API wrapper. Chrome/Edge/Safari support; Firefox doesn't.

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechRecognitionEvent) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};

type SpeechRecognitionEvent = {
  resultIndex: number;
  results: { [key: number]: { [key: number]: { transcript: string }; isFinal: boolean } } & { length: number };
};

type SpeechRecognitionErrorEvent = {
  error: string;
  message?: string;
};

export function isSpeechSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!((window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition);
}

export function createRecognition(lang = "fr-FR"): SpeechRecognitionLike | null {
  if (typeof window === "undefined") return null;
  const Ctor = (window as unknown as { SpeechRecognition?: new () => SpeechRecognitionLike; webkitSpeechRecognition?: new () => SpeechRecognitionLike }).SpeechRecognition ||
    (window as unknown as { webkitSpeechRecognition?: new () => SpeechRecognitionLike }).webkitSpeechRecognition;
  if (!Ctor) return null;
  const rec = new Ctor();
  rec.lang = lang;
  rec.continuous = false;
  rec.interimResults = true;
  return rec;
}
