import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, AlertTriangle, Megaphone, Clock, X, VolumeX } from "lucide-react";
import { useAccessibility } from "@/contexts/AccessibilityContext";

export type VisualAlertType = "announcement" | "deadline" | "class" | "emergency";

export interface VisualAlert {
  id: string;
  type: VisualAlertType;
  title: string;
  message: string;
  timestamp: string;
  urgent?: boolean;
}

export const PRESET_VISUAL_ALERTS: Omit<VisualAlert, "id" | "timestamp">[] = [
  {
    type: "class",
    title: "CLASS STARTING",
    message: "Your Database Management Systems lecture has started in Room 304.",
    urgent: false,
  },
  {
    type: "announcement",
    title: "IMPORTANT ANNOUNCEMENT",
    message: "Prof. Sharma has posted revised lecture notes and assignment guidelines.",
    urgent: true,
  },
  {
    type: "deadline",
    title: "ASSIGNMENT DEADLINE",
    message: "Normalization Assignment #2 submission closes tomorrow at 5:00 PM.",
    urgent: true,
  },
  {
    type: "emergency",
    title: "EMERGENCY ANNOUNCEMENT",
    message: "Campus fire alarm drill scheduled today at 2:00 PM. Please follow safety exits.",
    urgent: true,
  },
];

export function dispatchVisualAlert(alert: Omit<VisualAlert, "id" | "timestamp">) {
  if (typeof window !== "undefined") {
    const fullAlert: VisualAlert = {
      ...alert,
      id: "va-" + Date.now() + "-" + Math.random().toString(36).slice(2, 6),
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    window.dispatchEvent(new CustomEvent("edusetu:visual-alert", { detail: fullAlert }));
  }
}

export const VisualAlertBanner: React.FC = () => {
  const { settings } = useAccessibility();
  const [activeAlerts, setActiveAlerts] = useState<VisualAlert[]>([]);

  const dismissAlert = useCallback((id: string) => {
    setActiveAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  useEffect(() => {
    const handleIncomingAlert = (e: Event) => {
      const customEvent = e as CustomEvent<VisualAlert>;
      if (customEvent.detail) {
        setActiveAlerts((prev) => [customEvent.detail, ...prev.slice(0, 2)]);
      }
    };

    window.addEventListener("edusetu:visual-alert", handleIncomingAlert);
    return () => window.removeEventListener("edusetu:visual-alert", handleIncomingAlert);
  }, []);

  if (activeAlerts.length === 0) return null;

  return (
    <aside
      aria-label="High-visibility visual alerts"
      className="fixed top-20 right-4 z-50 flex flex-col gap-3 max-w-md w-full sm:w-96 pointer-events-none"
    >
      <AnimatePresence>
        {activeAlerts.map((alert) => {
          const isEmergency = alert.type === "emergency";
          const isAnnouncement = alert.type === "announcement";
          const isDeadline = alert.type === "deadline";

          const IconComponent = isEmergency
            ? AlertTriangle
            : isAnnouncement
            ? Megaphone
            : isDeadline
            ? Clock
            : Bell;

          return (
            <motion.div
              key={alert.id}
              role="alert"
              aria-live="assertive"
              initial={{ opacity: 0, y: -20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9, transition: { duration: 0.2 } }}
              className={`pointer-events-auto rounded-2xl border-4 p-4 shadow-2xl transition-all ${
                isEmergency
                  ? "bg-red-950 text-white border-red-500 shadow-red-500/30 animate-pulse"
                  : isAnnouncement
                  ? "bg-indigo-950 text-white border-indigo-400 shadow-indigo-500/30"
                  : isDeadline
                  ? "bg-amber-950 text-white border-amber-400 shadow-amber-500/30"
                  : "bg-slate-950 text-white border-emerald-400 shadow-emerald-500/30"
              }`}
            >
              {/* Accessibility Header */}
              <div className="flex items-center justify-between gap-2 border-b border-white/20 pb-2 mb-2.5">
                <div className="flex items-center gap-2">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white font-bold">
                    <IconComponent className="h-4 w-4 text-white" />
                  </div>
                  <div>
                    <span className="text-[11px] font-black uppercase tracking-wider text-white">
                      {alert.title}
                    </span>
                    <span className="ml-2 text-[10px] text-white/70 bg-white/10 px-1.5 py-0.5 rounded font-mono">
                      {alert.timestamp}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 text-[9px] font-bold text-white/90"
                    title="Visual notification (non-auditory)"
                  >
                    <VolumeX className="h-3 w-3 text-white" />
                    VISUAL ALERT
                  </span>
                  <button
                    onClick={() => dismissAlert(alert.id)}
                    className="flex h-6 w-6 items-center justify-center rounded-md bg-white/10 text-white hover:bg-white/20 transition-colors"
                    aria-label="Dismiss alert"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              {/* Alert Content */}
              <p className="text-sm font-semibold leading-snug text-white">
                {alert.message}
              </p>

              {/* Accessible Non-Color Confirmation Notice */}
              <div className="mt-2.5 pt-2 border-t border-white/10 flex items-center justify-between text-[11px] text-white/80">
                <span className="font-medium">
                  Priority: {alert.urgent ? "CRITICAL / IMMEDIATE" : "INFORMATIONAL"}
                </span>
                <button
                  onClick={() => dismissAlert(alert.id)}
                  className="underline hover:text-white text-xs font-semibold cursor-pointer"
                >
                  Acknowledge & Close
                </button>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </aside>
  );
};

export default VisualAlertBanner;
