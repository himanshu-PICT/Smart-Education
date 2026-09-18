import React from "react";
import DashboardLayout from "@/components/DashboardLayout";
import PageHeader from "@/components/PageHeader";
import LiveCaptions from "@/components/LiveCaptions";
import VisualClassroomCommunication from "@/components/VisualClassroomCommunication";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import {
  Captions,
  ShieldCheck,
  Sparkles,
  CheckCircle2,
  Sliders,
} from "lucide-react";

export const CaptionsPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <DashboardLayout>
      <div className="max-w-5xl mx-auto space-y-6 pb-12" id="main-content">

        {/* ── Page Header ── */}
        <PageHeader
          icon={<Captions className="h-5 w-5 text-white" />}
          title="EduCaption — Live Classroom Captions"
          subtitle="Follow lectures and classroom announcements through real-time text."
        >
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/accessibility")}
              className="gap-1.5 border-white/20 bg-white/10 text-white hover:bg-white/20 text-xs"
            >
              <Sliders className="h-3.5 w-3.5" /> All Accessibility Tools
            </Button>
          </div>
        </PageHeader>

        {/* ── Live Speech Monitor ── */}
        <Card className="border-2 border-primary/40 shadow-xl overflow-hidden bg-gradient-to-b from-card to-card/90">
          <CardHeader className="pb-3 border-b border-border/50">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2.5 text-lg font-bold">
                <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Captions className="h-5 w-5" />
                </div>
                Live Classroom Speech Monitor
              </CardTitle>
              {/* No technical-marketing badges — removed "100% Client-Side" and "Zero Latency" */}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Follow classroom conversations with real-time captions.
              No audio data leaves your device.
            </p>
          </CardHeader>

          <CardContent className="p-4 sm:p-6">
            <LiveCaptions standalonePage={true} />
          </CardContent>
        </Card>

        {/* ── Visual Classroom Communication ── */}
        {/*
          Replaces the old four-button "Non-Auditory Notification Simulation" card.
          This component connects to Firebase and displays real announcements from
          teachers / admins. It also provides Demo Mode for offline presentations.
        */}
        <VisualClassroomCommunication />

        {/* ── Feature Highlights ── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border border-border bg-card/60">
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <ShieldCheck className="h-4 w-4 text-emerald-500" />
                Private &amp; Secure
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Captions are processed in-browser via the Speech Recognition API. No microphone
                recordings or raw audio streams are stored or sent to any server.
              </p>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card/60">
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <Sparkles className="h-4 w-4 text-accent" />
                Real-Time Interim Speech
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Words appear as they are spoken, with a smooth transition to stable text once
                each sentence is confirmed — designed for reading at classroom distance.
              </p>
            </CardContent>
          </Card>

          <Card className="border border-border bg-card/60">
            <CardContent className="p-5 space-y-2">
              <div className="flex items-center gap-2 text-sm font-bold text-foreground">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                Exportable Transcripts
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                Save complete lecture notes with one click using the Copy or Download options,
                ensuring every student retains full study records.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
};

export default CaptionsPage;
