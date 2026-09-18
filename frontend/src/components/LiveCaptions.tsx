import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Mic,
  Square,
  Play,
  Pause,
  Trash2,
  Copy,
  Download,
  Maximize2,
  Minimize2,
  Sparkles,
  AlertCircle,
  Languages,
  Sun,
  Moon,
  Contrast,
  Radio,
  WifiOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useAccessibility, CaptionFontSize, CaptionBackground } from "@/contexts/AccessibilityContext";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface CaptionEntry {
  id: string;
  /** The committed final text for this segment */
  text: string;
  timestamp: string;
  isFinal: true;
}

export interface LiveCaptionsProps {
  initialLanguage?: string;
  standalonePage?: boolean;
  className?: string;
}

// ─── Language options ─────────────────────────────────────────────────────────

const SUPPORTED_LANGUAGES = [
  { code: "en-IN", name: "English (India)", native: "English (IN)" },
  { code: "hi-IN", name: "Hindi (हिन्दी)", native: "हिन्दी" },
  { code: "mr-IN", name: "Marathi (मराठी)", native: "मराठी" },
];

// ─── Demo content ─────────────────────────────────────────────────────────────

const DEMO_LECTURE_STEPS = [
  {
    interim: ["Good", "Good morning", "Good morning everyone,"],
    final: "Good morning everyone, welcome to today's lecture.",
  },
  {
    interim: ["Today we are", "Today we are going to study", "Today we are going to study database"],
    final: "Today we are going to study database normalization in DBMS.",
  },
  {
    interim: ["Normalization helps", "Normalization helps reduce data redundancy", "reduce data redundancy and maintain"],
    final: "Normalization helps reduce data redundancy and guarantees data integrity.",
  },
  {
    interim: ["First normal form", "First normal form 1NF requires", "requires atomic attribute values"],
    final: "First Normal Form requires that each attribute column contains only atomic, indivisible values.",
  },
  {
    interim: ["Second normal form", "Second normal form eliminates", "eliminates partial functional dependency"],
    final: "Second Normal Form ensures that all non-key attributes are fully functionally dependent on the primary key.",
  },
  {
    interim: ["Please submit", "Please submit your homework assignment", "assignment by Friday evening"],
    final: "Please submit your normalization case study assignment by Friday at 5:00 PM.",
  },
];

// ─── Deduplication helper ─────────────────────────────────────────────────────
/**
 * Checks if `next` begins with text already at the tail of `existing`.
 * Trims any overlapping prefix so we never double-emit words when the
 * browser's recognition session restarts and re-confirms a few words
 * from the previous session.
 */
function deduplicateOverlap(existing: string, next: string): string {
  if (!existing || !next) return next;
  const existingTail = existing.slice(-120).toLowerCase().trim();
  const nextLower = next.toLowerCase().trim();

  // Try progressively shorter overlaps (min 6 chars to avoid false positives)
  for (let len = Math.min(existingTail.length, nextLower.length, 80); len >= 6; len--) {
    const tail = existingTail.slice(-len);
    if (nextLower.startsWith(tail)) {
      return next.slice(len).trim();
    }
  }
  return next;
}

/** Ensure there is a single space between two text segments */
function joinSegments(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a.trimEnd() + " " + b.trimStart();
}

// ─── Recognition status ───────────────────────────────────────────────────────
type RecogStatus = "off" | "listening" | "reconnecting" | "paused" | "error";

// ─── Component ────────────────────────────────────────────────────────────────

export const LiveCaptions: React.FC<LiveCaptionsProps> = ({
  standalonePage = false,
  className = "",
}) => {
  const { settings, update: updateSettings } = useAccessibility();

  // Caption display preferences
  const [fontSize, setFontSize] = useState<CaptionFontSize>(settings.captionFontSize || "large");
  const [theme, setTheme] = useState<CaptionBackground>(settings.captionBackground || "dark");
  const [selectedLang, setSelectedLang] = useState<string>(settings.captionLanguage || "en-IN");
  const [isExpanded, setIsExpanded] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  // Recognition state
  const [recogStatus, setRecogStatus] = useState<RecogStatus>("off");
  const [isPaused, setIsPaused] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isSupported, setIsSupported] = useState(true);

  /**
   * finalTranscript — accumulated string of all confirmed final speech.
   * This is the single source of truth for completed speech. It is NEVER
   * cleared on recognition restarts, only on explicit "Clear".
   */
  const [finalTranscript, setFinalTranscript] = useState<string>("");

  /**
   * interimText — the in-flight partial recognition for the current utterance.
   * It is replaced (not appended) on every interim event, and cleared when
   * the recognition finalises that utterance.
   */
  const [interimText, setInterimText] = useState<string>("");

  /**
   * timestampedSegments — lightweight log of when each final segment arrived.
   * Used only for the download/copy feature. NOT used for display (we display
   * the single continuous finalTranscript).
   */
  const segmentsRef = useRef<{ text: string; ts: string }[]>([]);

  // ── Refs that survive re-renders and closure captures ──────────────────────
  const recognitionRef = useRef<any>(null);
  const shouldContinueRef = useRef(false); // true = user wants captions running
  const pausedRef = useRef(false);
  const isDemoRef = useRef(false);
  const selectedLangRef = useRef(selectedLang);
  const finalTranscriptRef = useRef(finalTranscript); // for deduplication inside callbacks
  const restartTimerRef = useRef<any>(null);
  const demoIntervalRef = useRef<any>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isRecognitionRunningRef = useRef(false); // guard against double-start

  // Keep refs in sync
  useEffect(() => { selectedLangRef.current = selectedLang; }, [selectedLang]);
  useEffect(() => { finalTranscriptRef.current = finalTranscript; }, [finalTranscript]);

  // ── Browser support check ─────────────────────────────────────────────────
  useEffect(() => {
    if (typeof window !== "undefined") {
      const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      setIsSupported(!!SpeechRec);
    }
  }, []);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (autoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [finalTranscript, interimText, autoScroll]);

  // ── Cleanup on unmount ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      shouldContinueRef.current = false;
      isDemoRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      if (demoIntervalRef.current) clearInterval(demoIntervalRef.current);
      try { recognitionRef.current?.abort(); } catch {}
      recognitionRef.current = null;
    };
  }, []);

  // ── Preference sync helpers ───────────────────────────────────────────────
  const handleFontSizeChange = (size: CaptionFontSize) => {
    setFontSize(size);
    updateSettings({ captionFontSize: size });
  };

  const handleThemeChange = (newTheme: CaptionBackground) => {
    setTheme(newTheme);
    updateSettings({ captionBackground: newTheme });
  };

  const handleLangChange = (lang: string) => {
    setSelectedLang(lang);
    selectedLangRef.current = lang;
    updateSettings({ captionLanguage: lang });
    if (shouldContinueRef.current && !isDemoRef.current) {
      // Restart recognition with new language; transcript is preserved
      stopRecognitionInstance();
      restartTimerRef.current = setTimeout(() => startRecognitionInstance(lang), 250);
      toast.info(`Caption language switched to ${lang}`);
    }
  };

  // ── Core recognition lifecycle ────────────────────────────────────────────

  const startRecognitionInstance = useCallback((langCode?: string) => {
    const lang = langCode ?? selectedLangRef.current;
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) return;

    // Guard: don't start if already running
    if (isRecognitionRunningRef.current) return;

    let recognition: any;
    try {
      recognition = new SpeechRec();
    } catch {
      setRecogStatus("error");
      return;
    }

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.lang = lang;

    recognition.onstart = () => {
      isRecognitionRunningRef.current = true;
      setRecogStatus("listening");
    };

    recognition.onresult = (event: any) => {
      if (pausedRef.current || !shouldContinueRef.current) return;

      let newFinal = "";
      let newInterim = "";

      // Only process results from the current resultIndex onwards
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript: string = event.results[i][0]?.transcript ?? "";
        if (event.results[i].isFinal) {
          newFinal += transcript;
        } else {
          newInterim += transcript;
        }
      }

      if (newFinal.trim()) {
        // Deduplicate overlap with existing accumulated transcript
        const deduped = deduplicateOverlap(finalTranscriptRef.current, newFinal.trim());
        if (deduped) {
          const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
          segmentsRef.current.push({ text: deduped, ts });
          setFinalTranscript(prev => {
            const joined = joinSegments(prev, deduped);
            finalTranscriptRef.current = joined;
            return joined;
          });
        }
        setInterimText("");
      } else {
        setInterimText(newInterim.trim());
      }
    };

    recognition.onerror = (event: any) => {
      const err: string = event.error ?? "";
      if (err === "not-allowed" || err === "service-not-allowed") {
        shouldContinueRef.current = false;
        setRecogStatus("error");
        toast.error("Microphone permission denied. Please allow microphone access to use Live Captions.");
      } else if (err === "audio-capture") {
        shouldContinueRef.current = false;
        setRecogStatus("error");
        toast.error("No microphone found. Please connect a microphone and try again.");
      } else if (err === "network") {
        // Will attempt auto-restart via onend
        console.warn("[EduCaption] Network error, will attempt restart.");
      } else if (err === "no-speech" || err === "aborted") {
        // Normal — silence or our own abort; handled by onend
      } else {
        console.warn("[EduCaption] Speech recognition error:", err);
      }
    };

    recognition.onend = () => {
      isRecognitionRunningRef.current = false;
      // Clear any stale interim text from this session
      setInterimText("");

      if (shouldContinueRef.current && !pausedRef.current && !isDemoRef.current) {
        // Auto-restart — show reconnecting status briefly
        setRecogStatus("reconnecting");
        if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
        restartTimerRef.current = setTimeout(() => {
          if (shouldContinueRef.current && !isDemoRef.current) {
            startRecognitionInstance();
          }
        }, 300);
      } else {
        setRecogStatus(pausedRef.current ? "paused" : "off");
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
    } catch (err: any) {
      isRecognitionRunningRef.current = false;
      if (err?.name !== "InvalidStateError") {
        setRecogStatus("error");
        toast.error(err?.message || "Failed to start speech recognition.");
      }
    }
  }, []); // no deps — reads all live values via refs

  const stopRecognitionInstance = useCallback(() => {
    isRecognitionRunningRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch {}
      recognitionRef.current = null;
    }
  }, []);

  // ── Public controls ───────────────────────────────────────────────────────

  const handleStartCaptions = () => {
    if (isDemoRef.current) handleStopDemo();
    shouldContinueRef.current = true;
    pausedRef.current = false;
    setIsPaused(false);
    setRecogStatus("listening");
    toast.success("Live Captions started — microphone listening.");
    startRecognitionInstance();
  };

  const handleStopCaptions = () => {
    shouldContinueRef.current = false;
    pausedRef.current = false;
    setIsPaused(false);
    stopRecognitionInstance();
    setInterimText("");
    setRecogStatus("off");
    toast.info("Live Captions stopped.");
  };

  const handleTogglePause = () => {
    if (!shouldContinueRef.current && !isDemoRef.current) return;
    const nextPaused = !isPaused;
    pausedRef.current = nextPaused;
    setIsPaused(nextPaused);
    if (nextPaused) {
      // Stop the recognition instance (will not restart because pausedRef=true)
      stopRecognitionInstance();
      setRecogStatus("paused");
      setInterimText("");
      toast.info("Captions paused.");
    } else {
      // Resume
      setRecogStatus("listening");
      toast.info("Captions resumed.");
      startRecognitionInstance();
    }
  };

  // ── Demo Mode ─────────────────────────────────────────────────────────────

  const handleStartDemo = () => {
    // Stop real recognition cleanly
    shouldContinueRef.current = false;
    stopRecognitionInstance();

    isDemoRef.current = true;
    setIsDemoMode(true);
    setIsPaused(false);
    pausedRef.current = false;
    toast.success("Demo Mode started — simulating a live classroom lecture.");

    let stepIndex = 0;
    let interimIdx = 0;

    demoIntervalRef.current = setInterval(() => {
      if (pausedRef.current) return;
      const step = DEMO_LECTURE_STEPS[stepIndex % DEMO_LECTURE_STEPS.length];

      if (interimIdx < step.interim.length) {
        setInterimText(step.interim[interimIdx]);
        interimIdx++;
      } else {
        const ts = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
        segmentsRef.current.push({ text: step.final, ts });
        setFinalTranscript(prev => {
          const joined = joinSegments(prev, step.final);
          finalTranscriptRef.current = joined;
          return joined;
        });
        setInterimText("");
        interimIdx = 0;
        stepIndex++;
      }
    }, 1200);
  };

  const handleStopDemo = () => {
    isDemoRef.current = false;
    if (demoIntervalRef.current) {
      clearInterval(demoIntervalRef.current);
      demoIntervalRef.current = null;
    }
    setIsDemoMode(false);
    setIsPaused(false);
    pausedRef.current = false;
    setInterimText("");
    toast.info("Demo Mode stopped.");
  };

  // ── Utilities ─────────────────────────────────────────────────────────────

  const handleClear = () => {
    setFinalTranscript("");
    finalTranscriptRef.current = "";
    setInterimText("");
    segmentsRef.current = [];
    toast.info("Transcript cleared.");
  };

  const handleCopy = async () => {
    const text = finalTranscript + (interimText ? " " + interimText : "");
    if (!text.trim()) { toast.info("Transcript is empty."); return; }
    try {
      await navigator.clipboard.writeText(text.trim());
      toast.success("Transcript copied to clipboard!");
    } catch {
      toast.error("Failed to copy transcript.");
    }
  };

  const handleDownload = () => {
    if (!finalTranscript.trim() && segmentsRef.current.length === 0) {
      toast.info("Transcript is empty.");
      return;
    }
    const header = [
      "================================================",
      "EduCaption — Classroom Lecture Transcript",
      `Date: ${new Date().toLocaleDateString()}`,
      `Language: ${selectedLang}`,
      "================================================\n",
    ].join("\n");

    const body = segmentsRef.current.length > 0
      ? segmentsRef.current.map(s => `[${s.ts}] ${s.text}`).join("\n")
      : finalTranscript;

    const blob = new Blob([header + body], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Lecture_Transcript_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Transcript downloaded as .txt");
  };

  // ── Style maps ────────────────────────────────────────────────────────────

  const themeStyles = {
    dark:           { container: "bg-slate-950 border-slate-800",             text: "text-slate-50",   interimBg: "bg-amber-500/10 border-amber-500/30 text-amber-300",   ctrl: "text-slate-100 border-slate-700 hover:bg-slate-800" },
    light:          { container: "bg-white border-slate-200 shadow-sm",        text: "text-slate-900",  interimBg: "bg-indigo-50 border-indigo-200 text-indigo-700",        ctrl: "text-slate-700 border-slate-300 hover:bg-slate-100" },
    "high-contrast":{ container: "bg-black border-yellow-400",                 text: "text-yellow-300 font-bold", interimBg: "bg-yellow-400/10 border-yellow-300 text-yellow-100", ctrl: "text-yellow-300 border-yellow-600 hover:bg-yellow-400/10" },
  }[theme];

  const fontSizeClass = {
    normal: "text-base sm:text-lg leading-relaxed",
    large:  "text-xl sm:text-2xl md:text-3xl leading-snug font-medium",
    xl:     "text-2xl sm:text-3xl md:text-4xl leading-tight font-bold",
  }[fontSize];

  // Status dot/label
  const statusConfig = (() => {
    if (isDemoMode)              return { dot: "bg-amber-400 animate-pulse", label: "Demo Mode", labelClass: "text-amber-300" };
    switch (recogStatus) {
      case "listening":    return { dot: "bg-red-500 animate-pulse",    label: "Live — Listening",   labelClass: "text-red-400" };
      case "reconnecting": return { dot: "bg-yellow-400 animate-pulse", label: "Reconnecting...",    labelClass: "text-yellow-400" };
      case "paused":       return { dot: "bg-slate-400",                label: "Captions Paused",    labelClass: "text-slate-400" };
      case "error":        return { dot: "bg-red-600",                  label: "Error",              labelClass: "text-red-500" };
      default:             return { dot: "bg-slate-600",                label: "Captions Off",       labelClass: "text-slate-500" };
    }
  })();

  const isActive = shouldContinueRef.current || isDemoMode;

  // ── Button style helpers — explicit, theme-aware ──────────────────────────
  // These use inline style overrides to be completely immune to
  // CSS cascade issues from the container's colour scheme.
  const btnPrimary = "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-bold shadow-md transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
  const btnSecondary = "inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50";

  return (
    <div
      className={`rounded-2xl border flex flex-col transition-all ${
        isExpanded ? "fixed inset-4 z-50 shadow-2xl" : "w-full"
      } ${themeStyles.container} ${className}`}
      style={isExpanded ? { maxHeight: "calc(100vh - 2rem)" } : {}}
      role="region"
      aria-label="EduCaption Live Classroom Captions"
    >
      {/* ── Header bar ── */}
      <div className={`flex flex-wrap items-center justify-between gap-3 border-b px-5 py-3.5 rounded-t-2xl ${themeStyles.container} border-inherit`}>

        {/* Status */}
        <div className="flex items-center gap-3 min-w-0">
          <span className={`h-3 w-3 flex-shrink-0 rounded-full ${statusConfig.dot}`} />
          <span className={`text-xs sm:text-sm font-bold tracking-wide uppercase truncate ${statusConfig.labelClass}`}>
            {statusConfig.label}
          </span>
          {isDemoMode && (
            <Badge className="bg-amber-500 hover:bg-amber-600 text-black text-[10px] font-extrabold uppercase px-2 py-0.5 flex-shrink-0">
              DEMO
            </Badge>
          )}
          {recogStatus === "listening" && !isPaused && (
            <span className={`hidden sm:inline-flex items-center gap-1 text-xs font-medium ${statusConfig.labelClass}`}>
              <Radio className="h-3.5 w-3.5 animate-pulse" />
              Listening to room audio…
            </span>
          )}
          {recogStatus === "reconnecting" && (
            <span className="hidden sm:inline-flex items-center gap-1 text-xs font-medium text-yellow-400">
              <WifiOff className="h-3.5 w-3.5" />
              Auto-reconnecting…
            </span>
          )}
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Language */}
          <div className="flex items-center gap-1.5">
            <Languages className={`h-4 w-4 flex-shrink-0 ${themeStyles.text} opacity-70`} />
            <Select value={selectedLang} onValueChange={handleLangChange}>
              <SelectTrigger className={`h-8 text-xs w-36 border bg-transparent ${themeStyles.ctrl}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SUPPORTED_LANGUAGES.map((l) => (
                  <SelectItem key={l.code} value={l.code} className="text-xs">
                    {l.native}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Font size */}
          <div className={`flex items-center border rounded-lg p-0.5 ${themeStyles.ctrl}`}>
            {(["normal", "large", "xl"] as CaptionFontSize[]).map((sz) => (
              <button
                key={sz}
                onClick={() => handleFontSizeChange(sz)}
                aria-label={`Caption font size: ${sz}`}
                className={`px-2 py-1 text-xs rounded-md transition-colors font-semibold ${
                  fontSize === sz
                    ? "bg-primary text-white"
                    : `${themeStyles.text} hover:bg-white/10`
                }`}
              >
                {sz === "normal" ? "A" : sz === "large" ? "A+" : "A++"}
              </button>
            ))}
          </div>

          {/* Theme */}
          <div className={`flex items-center border rounded-lg p-0.5 ${themeStyles.ctrl}`}>
            {([
              { key: "dark"          as CaptionBackground, Icon: Moon,     title: "Dark Cinema" },
              { key: "light"         as CaptionBackground, Icon: Sun,      title: "Clean Light" },
              { key: "high-contrast" as CaptionBackground, Icon: Contrast, title: "High Contrast" },
            ] as const).map(({ key, Icon, title }) => (
              <button
                key={key}
                onClick={() => handleThemeChange(key)}
                title={title}
                aria-label={title}
                className={`p-1.5 rounded-md transition-colors ${
                  theme === key
                    ? "bg-primary text-white"
                    : `${themeStyles.text} hover:bg-white/10`
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
              </button>
            ))}
          </div>

          {/* Expand */}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Minimise panel" : "Expand to fullscreen"}
            aria-label={isExpanded ? "Minimise caption panel" : "Expand caption panel to fullscreen"}
            className={`p-1.5 rounded-md border transition-colors ${themeStyles.ctrl}`}
          >
            {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
        </div>
      </div>

      {/* ── Unsupported browser banner ── */}
      {!isSupported && (
        <div className="flex items-center gap-3 bg-amber-500/15 border-b border-amber-500/30 px-5 py-2.5 text-xs text-amber-300">
          <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <span className="flex-1">
            <strong>Notice: </strong>Live speech recognition is not supported in this browser.
            Use <strong>Google Chrome</strong> or <strong>Microsoft Edge</strong>.
            Demo Mode is still available below.
          </span>
          <button
            onClick={handleStartDemo}
            className="ml-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs px-3 py-1 transition-colors"
          >
            Try Demo
          </button>
        </div>
      )}

      {/* ── Caption Display Area ── */}
      <div
        ref={scrollContainerRef}
        className={`flex-1 overflow-y-auto px-6 py-6 transition-all ${
          standalonePage ? "min-h-[380px] max-h-[550px]" : "min-h-[260px] max-h-[420px]"
        }`}
        aria-live="polite"
        aria-atomic="false"
        aria-label="Live caption transcript"
      >
        {/* Empty state */}
        {!finalTranscript && !interimText && (
          <div className={`h-full flex flex-col items-center justify-center text-center py-12 px-4 opacity-50 ${themeStyles.text}`}>
            <Mic className="h-12 w-12 mb-3 stroke-1 opacity-50" />
            <h4 className="text-base font-bold">Classroom Audio Will Appear Here</h4>
            <p className="text-xs sm:text-sm max-w-md mt-1 leading-relaxed">
              Press <strong>"Start Captions"</strong> to begin capturing lecture audio, or launch{" "}
              <strong>"Demo Mode"</strong> to preview a simulated lesson.
            </p>
          </div>
        )}

        {/* ── Continuous transcript block — single paragraph, not split per segment ── */}
        {finalTranscript && (
          <div className="transition-all animate-in fade-in duration-300">
            <p className={`${fontSizeClass} ${themeStyles.text} tracking-normal whitespace-pre-wrap break-words`}>
              {finalTranscript}
            </p>
          </div>
        )}

        {/* Interim (in-flight) speech */}
        {interimText && (
          <div className={`mt-4 rounded-xl border p-3.5 transition-all ${themeStyles.interimBg}`}>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="inline-block h-2 w-2 rounded-full bg-current animate-ping" />
              <span className="text-[10px] font-bold uppercase tracking-wider opacity-80">
                {isDemoMode ? "Demo — Recognising…" : "Recognising Speech…"}
              </span>
            </div>
            <p className={`${fontSizeClass} italic font-normal`}>{interimText}</p>
          </div>
        )}
      </div>

      {/* ── Bottom Control Panel ── */}
      {/*
        IMPORTANT: buttons here use EXPLICIT inline colour values so they are
        never invisible regardless of the caption panel's theme or the
        surrounding page's CSS variables. We use bg/text/border classes that
        are not inherited from the parent, and we do NOT use text-inherit or
        border-inherit at this level.
      */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-inherit px-5 py-3.5 rounded-b-2xl" style={{ backgroundColor: "inherit" }}>

        {/* Left: primary action buttons */}
        <div className="flex items-center gap-2 flex-wrap">

          {!isActive ? (
            /* ── START CAPTIONS ── */
            <button
              onClick={handleStartCaptions}
              disabled={!isSupported}
              aria-label="Start live captions"
              className={`${btnPrimary} bg-red-600 text-white hover:bg-red-500 focus-visible:ring-red-500 shadow-red-700/30`}
            >
              <Mic className="h-4 w-4" />
              Start Captions
            </button>
          ) : (
            <>
              {/* ── STOP ── */}
              <button
                onClick={isDemoMode ? handleStopDemo : handleStopCaptions}
                aria-label="Stop captions"
                className={`${btnPrimary} bg-slate-700 text-white hover:bg-slate-600 focus-visible:ring-slate-500`}
              >
                <Square className="h-4 w-4" />
                Stop
              </button>

              {/* ── PAUSE / RESUME (real captions only) ── */}
              {!isDemoMode && (
                <button
                  onClick={handleTogglePause}
                  aria-label={isPaused ? "Resume captions" : "Pause captions"}
                  className={`${btnSecondary} ${
                    isPaused
                      ? "bg-green-600 text-white border-green-700 hover:bg-green-500"
                      : "bg-amber-500 text-black border-amber-600 hover:bg-amber-400"
                  } focus-visible:ring-primary`}
                >
                  {isPaused ? (
                    <><Play className="h-3.5 w-3.5" /> Resume</>
                  ) : (
                    <><Pause className="h-3.5 w-3.5" /> Pause</>
                  )}
                </button>
              )}
            </>
          )}

          {/* ── DEMO MODE toggle ── */}
          {!shouldContinueRef.current && (
            <button
              onClick={isDemoMode ? handleStopDemo : handleStartDemo}
              aria-label={isDemoMode ? "Stop demo mode" : "Start demo captions"}
              className={`${btnSecondary} ${
                isDemoMode
                  ? "bg-amber-500/20 text-amber-300 border-amber-500 hover:bg-amber-500/30"
                  : "bg-purple-600 text-white border-purple-700 hover:bg-purple-500"
              } focus-visible:ring-purple-400`}
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-400" />
              {isDemoMode ? "Stop Demo" : "Demo Mode"}
            </button>
          )}

          {/* ── CLEAR ── */}
          {(finalTranscript || interimText) && (
            <button
              onClick={handleClear}
              aria-label="Clear transcript"
              title="Clear current transcript"
              className={`${btnSecondary} bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-600 focus-visible:ring-slate-500`}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>

        {/* Right: export + auto-scroll */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* COPY */}
          <button
            onClick={handleCopy}
            disabled={!finalTranscript && !interimText}
            aria-label="Copy transcript to clipboard"
            title="Copy transcript to clipboard"
            className={`${btnSecondary} bg-slate-700 text-slate-100 border-slate-600 hover:bg-slate-600 focus-visible:ring-slate-500 disabled:opacity-40`}
          >
            <Copy className="h-3.5 w-3.5" />
            Copy
          </button>

          {/* DOWNLOAD */}
          <button
            onClick={handleDownload}
            disabled={!finalTranscript}
            aria-label="Download transcript as text file"
            title="Download lecture transcript as .txt"
            className={`${btnSecondary} bg-slate-700 text-slate-100 border-slate-600 hover:bg-slate-600 focus-visible:ring-slate-500 disabled:opacity-40`}
          >
            <Download className="h-3.5 w-3.5" />
            Download
          </button>

          {/* AUTO-SCROLL */}
          <button
            onClick={() => setAutoScroll(!autoScroll)}
            aria-label={`Auto-scroll is ${autoScroll ? "on" : "off"}. Click to toggle.`}
            title="Toggle auto-scroll to latest speech"
            className={`text-[11px] px-2.5 py-1.5 rounded-lg border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              autoScroll
                ? "bg-primary text-white border-primary hover:bg-primary/90"
                : "bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600 hover:text-slate-200"
            }`}
          >
            Auto-scroll {autoScroll ? "ON" : "OFF"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LiveCaptions;
