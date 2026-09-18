import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AccessibilityProvider, useAccessibility } from "@/contexts/AccessibilityContext";
import LiveCaptions from "@/components/LiveCaptions";
import VisualAlertBanner, { dispatchVisualAlert, PRESET_VISUAL_ALERTS } from "@/components/VisualAlertBanner";

describe("EduCaption & Hearing Accessibility Suite", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("AccessibilityContext initializes with liveCaptions and visualAlerts defaults", () => {
    const TestConsumer = () => {
      const { settings, activeCount } = useAccessibility();
      return (
        <div>
          <span data-testid="liveCaptions">{settings.liveCaptions.toString()}</span>
          <span data-testid="visualAlerts">{settings.visualAlerts.toString()}</span>
          <span data-testid="captionLanguage">{settings.captionLanguage}</span>
          <span data-testid="captionFontSize">{settings.captionFontSize}</span>
          <span data-testid="activeCount">{activeCount}</span>
        </div>
      );
    };

    render(
      <AccessibilityProvider>
        <TestConsumer />
      </AccessibilityProvider>
    );

    expect(screen.getByTestId("liveCaptions").textContent).toBe("false");
    expect(screen.getByTestId("visualAlerts").textContent).toBe("false");
    expect(screen.getByTestId("captionLanguage").textContent).toBe("en-IN");
    expect(screen.getByTestId("captionFontSize").textContent).toBe("large");
    expect(screen.getByTestId("activeCount").textContent).toBe("0");
  });

  it("AccessibilityContext increments activeCount when liveCaptions or visualAlerts are enabled", () => {
    const TestConsumer = () => {
      const { settings, update, activeCount } = useAccessibility();
      return (
        <div>
          <span data-testid="activeCount">{activeCount}</span>
          <button
            onClick={() => update({ liveCaptions: true, visualAlerts: true })}
            data-testid="enableBtn"
          >
            Enable Hearing A11y
          </button>
        </div>
      );
    };

    render(
      <AccessibilityProvider>
        <TestConsumer />
      </AccessibilityProvider>
    );

    expect(screen.getByTestId("activeCount").textContent).toBe("0");

    fireEvent.click(screen.getByTestId("enableBtn"));

    expect(screen.getByTestId("activeCount").textContent).toBe("2");
  });

  it("LiveCaptions renders controls, font options, theme options and copy buttons", () => {
    render(
      <AccessibilityProvider>
        <LiveCaptions />
      </AccessibilityProvider>
    );

    expect(screen.getByText("Start Captions")).toBeInTheDocument();
    expect(screen.getByText("Start Demo Captions")).toBeInTheDocument();
    expect(screen.getByText("Copy")).toBeInTheDocument();
    expect(screen.getByText("Download .txt")).toBeInTheDocument();
    expect(screen.getByText("Auto-scroll ON")).toBeInTheDocument();
  });

  it("LiveCaptions Demo Mode streams simulated classroom lecture", async () => {
    vi.useFakeTimers();

    render(
      <AccessibilityProvider>
        <LiveCaptions />
      </AccessibilityProvider>
    );

    const demoBtn = screen.getByText("Start Demo Captions");
    fireEvent.click(demoBtn);

    // DEMO MODE badge should show
    expect(screen.getByText("DEMO MODE")).toBeInTheDocument();
    expect(screen.getByText("Stop Demo")).toBeInTheDocument();

    // Advance timers for interim & final simulation
    act(() => {
      vi.advanceTimersByTime(2500);
    });

    // Check that lecture text appeared
    expect(
      screen.getByText((content) => content.includes("Good morning") || content.includes("lecture") || content.includes("database"))
    ).toBeInTheDocument();

    // Stop demo
    fireEvent.click(screen.getByText("Stop Demo"));
    expect(screen.getByText("Start Demo Captions")).toBeInTheDocument();

    vi.useRealTimers();
  });

  it("VisualAlertBanner displays accessible, high-visibility non-color-only alerts", () => {
    render(
      <AccessibilityProvider>
        <VisualAlertBanner />
      </AccessibilityProvider>
    );

    // Dispatch a test alert
    act(() => {
      dispatchVisualAlert(PRESET_VISUAL_ALERTS[1]); // IMPORTANT ANNOUNCEMENT
    });

    expect(screen.getByText("IMPORTANT ANNOUNCEMENT")).toBeInTheDocument();
    expect(screen.getByText("VISUAL ALERT")).toBeInTheDocument();
    expect(
      screen.getByText("Prof. Sharma has posted revised lecture notes and assignment guidelines.")
    ).toBeInTheDocument();
    expect(screen.getByText(/Priority: CRITICAL/)).toBeInTheDocument();

    // Dismiss
    const dismissBtn = screen.getByText("Acknowledge & Close");
    fireEvent.click(dismissBtn);

    expect(
      screen.queryByText("Prof. Sharma has posted revised lecture notes and assignment guidelines.")
    ).not.toBeInTheDocument();
  });
});
