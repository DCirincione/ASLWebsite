"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type Toggle = "on" | "off";
const FONT_MIN = 0.9;
const FONT_MAX = 1.5;
const FONT_STEP = 0.1;
const STORAGE_KEY = "asl-accessibility-settings";
const DEFAULT_THEME = "dark" as const;

export function AccessibilityControls() {
  const getSavedSettings = () => {
    if (typeof window === "undefined") {
      return {
        fontScale: 1,
        theme: DEFAULT_THEME,
        highlightLinks: "off" as Toggle,
      };
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return {
        fontScale: 1,
        theme: DEFAULT_THEME,
        highlightLinks: "off" as Toggle,
      };
    }
    try {
      const parsed = JSON.parse(saved) as {
        fontScale?: number;
        theme?: "light" | "dark";
        highlightLinks?: Toggle;
      };
      return {
        fontScale: parsed.fontScale ?? 1,
        theme: parsed.theme ?? DEFAULT_THEME,
        highlightLinks: parsed.highlightLinks ?? ("off" as Toggle),
      };
    } catch {
      return {
        fontScale: 1,
        theme: DEFAULT_THEME,
        highlightLinks: "off" as Toggle,
      };
    }
  };

  const [initialSettings] = useState(() => getSavedSettings());
  const [fontScale, setFontScale] = useState(initialSettings.fontScale);
  const [theme, setTheme] = useState<"light" | "dark">(initialSettings.theme);
  const [highlightLinks, setHighlightLinks] = useState<Toggle>(initialSettings.highlightLinks);
  const [open, setOpen] = useState(false);
  const isHydrated = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );

  const resetAll = () => {
    setFontScale(1);
    setTheme(DEFAULT_THEME);
    setHighlightLinks("off");
    setOpen(false);
  };

  const increaseFont = () =>
    setFontScale((prev) => Math.min(FONT_MAX, parseFloat((prev + FONT_STEP).toFixed(2))));
  const decreaseFont = () =>
    setFontScale((prev) => Math.max(FONT_MIN, parseFloat((prev - FONT_STEP).toFixed(2))));

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.fontScale = fontScale.toString();
    root.dataset.theme = theme;
    root.style.setProperty("--font-scale", fontScale.toString());
    if (highlightLinks === "on") {
      root.classList.add("highlight-links");
    } else {
      root.classList.remove("highlight-links");
    }
    const toStore = {
      fontScale,
      theme,
      highlightLinks,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  }, [fontScale, theme, highlightLinks]);

  const toggleOpen = () => setOpen((prev) => !prev);

  if (!isHydrated) {
    return null;
  }

  return (
    <>
      <button
        type="button"
        className="ada-toggle"
        aria-expanded={open}
        aria-controls="ada-menu"
        onClick={toggleOpen}
      >
        ADA
      </button>
      <div
        id="ada-menu"
        className="accessibility-panel"
        data-open={open ? "true" : "false"}
      >
        <div className="accessibility-panel__header">
          <span className="accessibility-bar__label">Accessibility</span>
          <button
            type="button"
            className="chip chip--ghost"
            onClick={() => setOpen(false)}
          >
            Close
          </button>
        </div>
        <div className="accessibility-panel__controls">
          <div className="font-controls">
            <span className="accessibility-bar__label">Text size</span>
            <div className="font-controls__actions">
              <button
                type="button"
                className="chip"
                onClick={decreaseFont}
                aria-label="Decrease text size"
                disabled={fontScale <= FONT_MIN}
              >
                –
              </button>
              <span className="font-controls__value">
                {(fontScale * 100).toFixed(0)}%
              </span>
              <button
                type="button"
                className="chip"
                onClick={increaseFont}
                aria-label="Increase text size"
                disabled={fontScale >= FONT_MAX}
              >
                +
              </button>
            </div>
          </div>
          <button
            type="button"
            className="chip"
            aria-pressed={theme === "dark"}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          >
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={highlightLinks === "on"}
            onClick={() =>
              setHighlightLinks(highlightLinks === "on" ? "off" : "on")
            }
          >
            Highlight links
          </button>
          <button type="button" className="chip chip--ghost" onClick={resetAll}>
            Reset
          </button>
        </div>
      </div>
    </>
  );
}
