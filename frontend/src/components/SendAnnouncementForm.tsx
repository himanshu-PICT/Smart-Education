import React, { useState, useCallback } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { sendAnnouncement, type AnnouncementType } from "@/firebase/collections/classroomAnnouncements";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Megaphone, Send, Loader2 } from "lucide-react";

// ─── Types ─────────────────────────────────────────────────────────────────────

interface SendAnnouncementFormProps {
  /** Called after a successful send (e.g. to refresh a list) */
  onSent?: () => void;
}

const TYPE_OPTIONS: { value: AnnouncementType; label: string; description: string }[] = [
  { value: "normal",     label: "Announcement",  description: "General classroom information" },
  { value: "important",  label: "Important",     description: "Requires student attention" },
  { value: "urgent",     label: "Urgent",        description: "Immediate action required" },
  { value: "assignment", label: "Assignment",    description: "Homework / submission notice" },
  { value: "class_start",label: "Class Started", description: "Session has begun" },
  { value: "class_end",  label: "Class Ended",   description: "Session has finished" },
  { value: "emergency",  label: "Emergency",     description: "Safety or evacuation notice" },
];

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * SendAnnouncementForm
 *
 * A small, self-contained form that lets an admin / moderator write and send
 * a classroom announcement to the shared Firestore broadcast feed.
 *
 * Intended for use inside the AdminPage "Announcements" tab.
 */
export const SendAnnouncementForm: React.FC<SendAnnouncementFormProps> = ({ onSent }) => {
  const { user, profile } = useAuth();

  const [message, setMessage]       = useState("");
  const [type, setType]             = useState<AnnouncementType>("normal");
  const [senderName, setSenderName] = useState<string>(
    profile?.fullName || profile?.full_name || user?.displayName || "Instructor",
  );
  const [sending, setSending]       = useState(false);

  const handleSend = useCallback(async () => {
    const trimmed = message.trim();
    if (!trimmed) {
      toast.warning("Please enter a message before sending.");
      return;
    }
    if (!user) {
      toast.error("You must be signed in to send announcements.");
      return;
    }

    setSending(true);
    try {
      await sendAnnouncement({
        message: trimmed,
        type,
        senderName: senderName.trim() || "Instructor",
        senderId: user.uid,
      });
      toast.success("Announcement sent to all students.");
      setMessage("");
      setType("normal");
      onSent?.();
    } catch (err: any) {
      console.error("[SendAnnouncementForm] send error:", err);
      toast.error(err?.message || "Failed to send announcement. Check your permissions.");
    } finally {
      setSending(false);
    }
  }, [message, type, senderName, user, onSent]);

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base font-bold">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Megaphone className="h-4 w-4" />
          </div>
          Send Visual Announcement
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          This message will appear immediately in students' Visual Classroom Communication feed.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Message */}
        <div className="space-y-1.5">
          <Label htmlFor="announcement-message" className="text-sm font-semibold">
            Message
          </Label>
          <Textarea
            id="announcement-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="e.g. Please open Chapter 5 for today's lecture."
            rows={3}
            maxLength={500}
            className="resize-none text-sm"
            aria-describedby="announcement-message-hint"
          />
          <p id="announcement-message-hint" className="text-[11px] text-muted-foreground text-right">
            {message.length} / 500
          </p>
        </div>

        {/* Priority / Type */}
        <div className="space-y-1.5">
          <Label htmlFor="announcement-type" className="text-sm font-semibold">
            Priority
          </Label>
          <Select value={type} onValueChange={(v) => setType(v as AnnouncementType)}>
            <SelectTrigger id="announcement-type" className="text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-sm">
                  <span className="font-semibold">{opt.label}</span>
                  <span className="ml-2 text-muted-foreground text-xs">{opt.description}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Sender name */}
        <div className="space-y-1.5">
          <Label htmlFor="announcement-sender" className="text-sm font-semibold">
            Your Name <span className="text-muted-foreground font-normal">(shown to students)</span>
          </Label>
          <Input
            id="announcement-sender"
            value={senderName}
            onChange={(e) => setSenderName(e.target.value)}
            placeholder="Prof. Sharma"
            maxLength={60}
            className="text-sm"
          />
        </div>

        {/* Submit */}
        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          aria-label="Send classroom announcement"
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50"
        >
          {sending ? (
            <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
          ) : (
            <><Send className="h-4 w-4" /> Send Announcement</>
          )}
        </button>
      </CardContent>
    </Card>
  );
};

export default SendAnnouncementForm;
