/**
 * VisualClassroomCommunication.tsx
 *
 * Replaces the old "Visual Classroom Alerts" 4-button simulation card.
 *
 * Provides a persistent, scrollable feed of real classroom announcements
 * sent by teachers / admins. Designed specifically for deaf and
 * hard-of-hearing students who need visual access to information that
 * would otherwise be communicated through sound or verbal speech.
 *
 * Architecture:
 *   Firebase classroom_announcements collection (broadcast)
 *   → onSnapshot real-time listener
 *   → rendered as persistent accessible feed
 *   → Important/Urgent also dispatched via existing VisualAlertBanner
 *
 * Demo Mode:
 *   Injects mock announcements into local state only.
 *   Clearly labelled. Does not touch Firebase.
 */

import React, {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from "react";
import {
  subscribeToAnnouncements,
  type ClassroomAnnouncement,
  type AnnouncementType,
} from "@/firebase/collections/classroomAnnouncements";
import { dispatchVisualAlert } from "@/components/VisualAlertBanner";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  Megaphone,
  AlertTriangle,
  BookOpen,
  PlayCircle,
  StopCircle,
  CheckCircle2,
  Check,
  Sparkles,
  Clock,
  VolumeX,
  RefreshCw,
  WifiOff,
  Info,
} from "lucide-react";

// ─── Demo data ────────────────────────────────────────────────────────────────

const DEMO_ANNOUNCEMENTS: Omit<ClassroomAnnouncement, "id" | "createdAt" | "acknowledged">[] = [
  {
    type: "class_start",
    message: "Database Management Systems lecture has begun in Room 304. Please take your seats.",
    senderName: "Prof. Sharma",
    senderId: "demo",
  },
  {
    type: "normal",
    message: "Please open Chapter 5 in your textbooks for today's lecture on normalization.",
    senderName: "Prof. Sharma",
    senderId: "demo",
  },
  {
    type: "assignment",
    message: "Assignment 3 — Normalization Case Study — is due this Friday at 5:00 PM. Submissions via the portal.",
    senderName: "Prof. Sharma",
    senderId: "demo",
  },
  {
    type: "urgent",
    message: "Campus fire drill in 10 minutes. Please stay seated unless the alarm activates. This is a reminder only.",
    senderName: "Administration",
    senderId: "demo",
  },
];

// ─── Type metadata ─────────────────────────────────────────────────────────────

interface TypeMeta {
  label: string;
  Icon: React.FC<{ className?: string }>;
  badgeClass: string;
  cardClass: string;
  iconClass: string;
}

const TYPE_META: Record<AnnouncementType, TypeMeta> = {
  normal: {
    label: "ANNOUNCEMENT",
    Icon: Megaphone,
    badgeClass: "bg-blue-500/20 text-blue-400 border-blue-500/30",
    cardClass: "border-l-blue-500 bg-blue-500/5",
    iconClass: "text-blue-400 bg-blue-500/10",
  },
  important: {
    label: "IMPORTANT",
    Icon: Info,
    badgeClass: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    cardClass: "border-l-amber-500 bg-amber-500/5",
    iconClass: "text-amber-400 bg-amber-500/10",
  },
  urgent: {
    label: "URGENT",
    Icon: AlertTriangle,
    badgeClass: "bg-red-500/20 text-red-400 border-red-500/30",
    cardClass: "border-l-red-500 bg-red-500/5 ring-1 ring-red-500/20",
    iconClass: "text-red-400 bg-red-500/10",
  },
  assignment: {
    label: "ASSIGNMENT",
    Icon: BookOpen,
    badgeClass: "bg-violet-500/20 text-violet-400 border-violet-500/30",
    cardClass: "border-l-violet-500 bg-violet-500/5",
    iconClass: "text-violet-400 bg-violet-500/10",
  },
  class_start: {
    label: "CLASS STARTED",
    Icon: PlayCircle,
    badgeClass: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
    cardClass: "border-l-emerald-500 bg-emerald-500/5",
    iconClass: "text-emerald-400 bg-emerald-500/10",
  },
  class_end: {
    label: "CLASS ENDED",
    Icon: StopCircle,
    badgeClass: "bg-slate-500/20 text-slate-400 border-slate-500/30",
    cardClass: "border-l-slate-400 bg-slate-500/5",
    iconClass: "text-slate-400 bg-slate-500/10",
  },
  emergency: {
    label: "EMERGENCY",
    Icon: AlertTriangle,
    badgeClass: "bg-red-600/30 text-red-300 border-red-500/50",
    cardClass: "border-l-red-600 bg-red-600/10 ring-2 ring-red-500/30",
    iconClass: "text-red-300 bg-red-600/20",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function relativeTime(createdAt: ClassroomAnnouncement["createdAt"]): string {
  if (!createdAt) return "just now";
  try {
    const ms = createdAt.toMillis();
    const diff = Date.now() - ms;
    if (diff < 60_000) return "just now";
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} hr ago`;
    return new Date(ms).toLocaleDateString();
  } catch {
    return "just now";
  }
}

function absoluteTime(createdAt: ClassroomAnnouncement["createdAt"]): string {
  if (!createdAt) return "";
  try {
    return new Date(createdAt.toMillis()).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function needsFloatingBanner(type: AnnouncementType): boolean {
  return type === "urgent" || type === "emergency" || type === "important";
}

// ─── Single announcement card ─────────────────────────────────────────────────

interface AnnouncementCardProps {
  announcement: ClassroomAnnouncement;
  isDemo?: boolean;
  onAcknowledge: (id: string) => void;
  acknowledged: boolean;
}

const AnnouncementCard: React.FC<AnnouncementCardProps> = React.memo(
  ({ announcement, isDemo, onAcknowledge, acknowledged }) => {
    const meta = TYPE_META[announcement.type] ?? TYPE_META.normal;
    const { Icon } = meta;

    return (
      <article
        role="article"
        aria-label={`${meta.label}: ${announcement.message}`}
        className={`rounded-xl border-l-4 p-4 transition-all animate-in fade-in slide-in-from-top-2 duration-300 ${meta.cardClass}`}
      >
        {/* Header row */}
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-2.5 min-w-0">
            {/* Icon */}
            <div
              className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${meta.iconClass}`}
              aria-hidden="true"
            >
              <Icon className="h-4 w-4" />
            </div>

            {/* Type badge + demo badge */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge
                variant="outline"
                className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0 h-5 border ${meta.badgeClass}`}
              >
                {meta.label}
              </Badge>
              {isDemo && (
                <Badge className="bg-amber-500 text-black text-[9px] font-black uppercase px-1.5 py-0 h-5">
                  DEMO
                </Badge>
              )}
            </div>
          </div>

          {/* Timestamp */}
          <time
            className="text-[11px] text-muted-foreground font-mono flex-shrink-0"
            title={absoluteTime(announcement.createdAt)}
            aria-label={`Received ${relativeTime(announcement.createdAt)}`}
          >
            {relativeTime(announcement.createdAt)}
          </time>
        </div>

        {/* Message body */}
        <p className="text-sm font-semibold text-foreground leading-relaxed mb-3">
          {announcement.message}
        </p>

        {/* Footer: sender + acknowledge */}
        <div className="flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">
            {announcement.senderName}
          </span>

          {/* Acknowledge button — for important / urgent / emergency */}
          {(announcement.type === "important" ||
            announcement.type === "urgent" ||
            announcement.type === "emergency") && (
            <button
              onClick={() => onAcknowledge(announcement.id)}
              disabled={acknowledged}
              aria-label={
                acknowledged
                  ? `${meta.label} announcement acknowledged`
                  : `Acknowledge ${meta.label} announcement`
              }
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                acknowledged
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 cursor-default"
                  : "bg-foreground/10 text-foreground border border-border hover:bg-foreground/20 focus-visible:ring-primary"
              }`}
            >
              {acknowledged ? (
                <>
                  <Check className="h-3 w-3" aria-hidden="true" />
                  Acknowledged
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  Acknowledge
                </>
              )}
            </button>
          )}
        </div>
      </article>
    );
  },
);
AnnouncementCard.displayName = "AnnouncementCard";

// ─── Main component ───────────────────────────────────────────────────────────

interface VisualClassroomCommunicationProps {
  className?: string;
}

export const VisualClassroomCommunication: React.FC<VisualClassroomCommunicationProps> = ({
  className = "",
}) => {
  // ── Real Firebase announcements ──────────────────────────────────────────
  const [liveAnnouncements, setLiveAnnouncements] = useState<ClassroomAnnouncement[]>([]);
  const [firebaseError, setFirebaseError]         = useState<string | null>(null);
  const [firebaseLoading, setFirebaseLoading]     = useState(true);

  // ── Demo Mode ────────────────────────────────────────────────────────────
  const [isDemoMode, setIsDemoMode]               = useState(false);
  const [demoAnnouncements, setDemoAnnouncements] = useState<ClassroomAnnouncement[]>([]);
  const demoTimerRef                              = useRef<ReturnType<typeof setTimeout> | null>(null);
  const demoIndexRef                              = useRef(0);

  // ── Acknowledged IDs (local UI state — see implementation_plan for Firebase hookup) ──
  const [acknowledgedIds, setAcknowledgedIds]     = useState<Set<string>>(new Set());

  // ── Seen IDs — track which announcements have already triggered the banner ──
  const seenBannerIds = useRef<Set<string>>(new Set());

  // ── Firebase subscription ────────────────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToAnnouncements(
      (items) => {
        setLiveAnnouncements(items);
        setFirebaseLoading(false);
        setFirebaseError(null);

        // Dispatch floating banners for new Important/Urgent items
        items.forEach((item) => {
          if (seenBannerIds.current.has(item.id)) return;
          seenBannerIds.current.add(item.id);
          if (needsFloatingBanner(item.type)) {
            const meta = TYPE_META[item.type];
            dispatchVisualAlert({
              type:
                item.type === "emergency" || item.type === "urgent"
                  ? "emergency"
                  : item.type === "important"
                  ? "announcement"
                  : "announcement",
              title: meta.label,
              message: item.message,
              urgent: item.type === "urgent" || item.type === "emergency",
            });
          }
        });
      },
      (err) => {
        setFirebaseLoading(false);
        setFirebaseError(
          err.message?.includes("permission")
            ? "Unable to load announcements — sign in to view classroom communications."
            : "Unable to connect to classroom announcements. Check your connection.",
        );
      },
    );

    return () => unsub();
  }, []);

  // ── Demo Mode helpers ─────────────────────────────────────────────────────
  const stopDemo = useCallback(() => {
    if (demoTimerRef.current) {
      clearTimeout(demoTimerRef.current);
      demoTimerRef.current = null;
    }
    setIsDemoMode(false);
    setDemoAnnouncements([]);
    demoIndexRef.current = 0;
  }, []);

  const scheduleNextDemo = useCallback((idx: number) => {
    if (idx >= DEMO_ANNOUNCEMENTS.length) return;

    demoTimerRef.current = setTimeout(() => {
      const src = DEMO_ANNOUNCEMENTS[idx];
      const item: ClassroomAnnouncement = {
        ...src,
        id: `demo-${idx}-${Date.now()}`,
        createdAt: null,
        acknowledged: [],
      };

      setDemoAnnouncements((prev) => [item, ...prev]);

      // Trigger floating banner for demo urgent / important items too
      if (needsFloatingBanner(item.type)) {
        const meta = TYPE_META[item.type];
        dispatchVisualAlert({
          type:
            item.type === "emergency" || item.type === "urgent"
              ? "emergency"
              : "announcement",
          title: `DEMO — ${meta.label}`,
          message: item.message,
          urgent: item.type === "urgent" || item.type === "emergency",
        });
      }

      scheduleNextDemo(idx + 1);
    }, idx === 0 ? 400 : 2800);
  }, []);

  const startDemo = useCallback(() => {
    stopDemo();
    setIsDemoMode(true);
    toast.success("Demo Mode started — simulating classroom announcements.");
    scheduleNextDemo(0);
  }, [stopDemo, scheduleNextDemo]);

  // Cleanup on unmount
  useEffect(() => () => stopDemo(), [stopDemo]);

  // ── Acknowledge handler ───────────────────────────────────────────────────
  const handleAcknowledge = useCallback((id: string) => {
    setAcknowledgedIds((prev) => new Set([...prev, id]));
    toast.success("Announcement acknowledged.");
    // NOTE: To persist acknowledgement to Firebase, call updateDoc here:
    // updateDoc(doc(db, "classroom_announcements", id), {
    //   acknowledged: arrayUnion(user.uid)
    // });
  }, []);

  // ── Combined feed — demo items first (newest top), then live ─────────────
  const feedItems = useMemo(() => {
    if (isDemoMode) return demoAnnouncements;
    return liveAnnouncements;
  }, [isDemoMode, demoAnnouncements, liveAnnouncements]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <Card className={`border border-border ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle className="flex items-center gap-2 text-base font-bold">
              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <VolumeX className="h-4 w-4" aria-hidden="true" />
              </div>
              Visual Classroom Communication
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1 max-w-xl">
              Important classroom announcements are delivered visually so no student misses
              information communicated through sound or speech.
            </p>
          </div>

          {/* Demo / Live indicators */}
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            {isDemoMode && (
              <Badge className="bg-amber-500 text-black text-[10px] font-black uppercase">
                DEMO MODE
              </Badge>
            )}
            {!isDemoMode && !firebaseLoading && !firebaseError && (
              <Badge
                variant="outline"
                className="text-[10px] bg-emerald-500/10 text-emerald-500 border-emerald-500/30 flex items-center gap-1"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse inline-block" aria-hidden="true" />
                Live
              </Badge>
            )}
            {firebaseLoading && (
              <Badge variant="outline" className="text-[10px] text-muted-foreground flex items-center gap-1">
                <RefreshCw className="h-2.5 w-2.5 animate-spin" aria-hidden="true" />
                Connecting…
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* ── Connection error notice ── */}
        {firebaseError && !isDemoMode && (
          <div
            role="status"
            className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5"
          >
            <WifiOff className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-amber-300">{firebaseError}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Use Demo Mode to preview how announcements appear.
              </p>
            </div>
          </div>
        )}

        {/* ── Live announcement feed ── */}
        {/*
          aria-live="polite" so screen readers announce new items without interrupting.
          Urgent/emergency items also use the separate VisualAlertBanner with
          aria-live="assertive" for immediate announcement.
        */}
        <div
          role="feed"
          aria-label="Classroom announcements"
          aria-live="polite"
          aria-atomic="false"
          aria-busy={firebaseLoading}
          className="space-y-3 max-h-[480px] overflow-y-auto pr-1"
        >
          {feedItems.length === 0 && !firebaseLoading && (
            <div className="flex flex-col items-center justify-center py-10 text-center opacity-60">
              <Megaphone className="h-10 w-10 mb-3 stroke-1 opacity-40" aria-hidden="true" />
              <p className="text-sm font-semibold text-foreground">
                No classroom announcements yet
              </p>
              <p className="text-xs text-muted-foreground mt-1 max-w-xs leading-relaxed">
                When your teacher sends an announcement, it will appear here. Use Demo Mode
                to preview how it looks.
              </p>
            </div>
          )}

          {feedItems.map((item) => (
            <AnnouncementCard
              key={item.id}
              announcement={item}
              isDemo={isDemoMode}
              onAcknowledge={handleAcknowledge}
              acknowledged={acknowledgedIds.has(item.id)}
            />
          ))}
        </div>

        {/* ── Bottom controls bar ── */}
        <div className="flex items-center justify-between gap-3 pt-2 border-t border-border flex-wrap">
          {/* Left: demo toggle */}
          <div className="flex items-center gap-2">
            {!isDemoMode ? (
              <button
                onClick={startDemo}
                aria-label="Start demo mode to preview classroom announcements"
                className="inline-flex items-center gap-1.5 rounded-lg border border-purple-500/40 bg-purple-500/10 px-3 py-1.5 text-xs font-semibold text-purple-400 hover:bg-purple-500/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400"
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Preview Demo
              </button>
            ) : (
              <button
                onClick={stopDemo}
                aria-label="Stop demo mode"
                className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/15 px-3 py-1.5 text-xs font-semibold text-amber-400 hover:bg-amber-500/25 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400"
              >
                <StopCircle className="h-3.5 w-3.5" aria-hidden="true" />
                Stop Demo
              </button>
            )}
          </div>

          {/* Right: item count */}
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden="true" />
            {isDemoMode
              ? `${feedItems.length} demo announcement${feedItems.length !== 1 ? "s" : ""}`
              : `${feedItems.length} announcement${feedItems.length !== 1 ? "s" : ""}`}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default VisualClassroomCommunication;
