import { motion } from "framer-motion";
import { AlertTriangle, Briefcase, CheckCircle2, MessageSquare, VolumeX, Captions, Megaphone } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAccessibility } from "@/contexts/AccessibilityContext";
import { useNavigate } from "react-router-dom";
import { dispatchVisualAlert } from "@/components/VisualAlertBanner";

const alerts = [
  {
    icon: AlertTriangle,
    iconColor: "text-urgent",
    borderColor: "border-l-urgent",
    title: "Scheme Deadline",
    desc: "Assistive Device Grant applications close in 2 days.",
    time: "URGENT",
    timeColor: "text-urgent",
    isUrgent: true,
  },
  {
    icon: Briefcase,
    iconColor: "text-accent",
    borderColor: "border-l-accent",
    title: "New Job Match",
    desc: "3 new Frontend roles match your profile in New Delhi.",
    time: "3 HOURS AGO",
    timeColor: "text-muted-foreground",
    isUrgent: false,
  },
  {
    icon: CheckCircle2,
    iconColor: "text-success",
    borderColor: "border-l-success",
    title: "Profile Verified",
    desc: "Your disability certificate has been verified for 2024.",
    time: "YESTERDAY",
    timeColor: "text-muted-foreground",
    isUrgent: false,
  },
  {
    icon: MessageSquare,
    iconColor: "text-info",
    borderColor: "border-l-info",
    title: "Mentor Message",
    desc: "Anil K. responded to your career inquiry.",
    time: "2 DAYS AGO",
    timeColor: "text-muted-foreground",
    isUrgent: false,
  },
];

const RecentAlerts = () => {
  const { settings } = useAccessibility();
  const navigate = useNavigate();

  const isHearingA11yActive = settings.visualAlerts || settings.liveCaptions;

  return (
    <Card className="border border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold text-foreground">Recent Alerts</CardTitle>
          {isHearingA11yActive && (
            <Badge
              variant="outline"
              className="bg-amber-500/10 text-amber-500 border-amber-500/30 text-[10px] uppercase font-bold flex items-center gap-1.5"
            >
              <VolumeX className="h-3 w-3" />
              Visual Alert Mode
            </Badge>
          )}
        </div>
        {isHearingA11yActive && (
          <p className="text-[11px] text-muted-foreground">
            Hearing Accessibility active: Important updates display explicit text priorities and visual prominence.
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {alerts.map((alert, i) => {
          const highlightVisual = isHearingA11yActive && alert.isUrgent;

          return (
            <motion.div
              key={alert.title}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.2 + i * 0.1 }}
              className={`flex items-start gap-3 rounded-lg border-l-4 ${alert.borderColor} bg-card p-3 transition-all ${
                highlightVisual ? "ring-2 ring-red-500/30 border-l-[6px] bg-red-500/5" : ""
              }`}
            >
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-muted ${alert.iconColor}`}>
                <alert.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-1">
                  <p className="text-sm font-semibold text-foreground">{alert.title}</p>
                  {highlightVisual && (
                    <Badge className="bg-red-500 text-white text-[9px] font-black uppercase px-1.5 py-0 h-4">
                      ACTION REQUIRED
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.desc}</p>
                <div className="flex items-center justify-between mt-1">
                  <p className={`text-xs font-bold uppercase tracking-wider ${alert.timeColor}`}>{alert.time}</p>
                  {isHearingA11yActive && alert.isUrgent && (
                    <button
                      onClick={() =>
                        dispatchVisualAlert({
                          type: "deadline",
                          title: "IMPORTANT DEADLINE ALERT",
                          message: alert.desc,
                          urgent: true,
                        })
                      }
                      className="text-[10px] text-primary hover:underline font-semibold"
                    >
                      Show Visual Banner
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}

        {isHearingA11yActive && (
          <div className="pt-2 flex items-center justify-between border-t border-border">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate("/captions")}
              className="text-xs text-primary hover:text-primary gap-1.5 h-7 px-2"
            >
              <Captions className="h-3.5 w-3.5" /> Open EduCaption Room
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                dispatchVisualAlert({
                  type: "announcement",
                  title: "TEST ANNOUNCEMENT",
                  message: "Visual Alert mechanism functioning properly for hearing accessibility.",
                  urgent: false,
                })
              }
              className="text-xs text-muted-foreground hover:text-foreground gap-1 h-7 px-2"
            >
              <Megaphone className="h-3 w-3" /> Test
            </Button>
          </div>
        )}

        <button className="w-full text-center text-sm font-medium text-muted-foreground hover:text-accent mt-2 transition-colors">
          VIEW HISTORY
        </button>
      </CardContent>
    </Card>
  );
};

export default RecentAlerts;
