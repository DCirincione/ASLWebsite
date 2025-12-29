"use client";

import { useEffect, useState } from "react";

type Toggle = "on" | "off";
const FONT_MIN = 0.9;
const FONT_MAX = 1.5;
const FONT_STEP = 0.1;
const STORAGE_KEY = "asl-accessibility-settings";

export function AccessibilityControls() {
  const getSavedSettings = () => {
    if (typeof window === "undefined") {
      return {
        fontScale: 1,
        theme: "light" as const,
        contrast: "off" as Toggle,
        highlightLinks: "off" as Toggle,
      };
    }
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      return {
        fontScale: 1,
        theme: "light" as const,
        contrast: "off" as Toggle,
        highlightLinks: "off" as Toggle,
      };
    }
    try {
      const parsed = JSON.parse(saved) as {
        fontScale?: number;
        theme?: "light" | "dark";
        contrast?: Toggle;
        highlightLinks?: Toggle;
      };
      return {
        fontScale: parsed.fontScale ?? 1,
        theme: parsed.theme ?? ("light" as const),
        contrast: parsed.contrast ?? ("off" as Toggle),
        highlightLinks: parsed.highlightLinks ?? ("off" as Toggle),
      };
    } catch {
      return {
        fontScale: 1,
        theme: "light" as const,
        contrast: "off" as Toggle,
        highlightLinks: "off" as Toggle,
      };
    }
  };

  const [fontScale, setFontScale] = useState(1);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [contrast, setContrast] = useState<Toggle>("off");
  const [highlightLinks, setHighlightLinks] = useState<Toggle>("off");
  const [open, setOpen] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  const resetAll = () => {
    setFontScale(1);
    setTheme("light");
    setContrast("off");
    setHighlightLinks("off");
    setOpen(false);
  };

  const increaseFont = () =>
    setFontScale((prev) => Math.min(FONT_MAX, parseFloat((prev + FONT_STEP).toFixed(2))));
  const decreaseFont = () =>
    setFontScale((prev) => Math.max(FONT_MIN, parseFloat((prev - FONT_STEP).toFixed(2))));

  useEffect(() => {
    const saved = getSavedSettings();
    setFontScale(saved.fontScale);
    setTheme(saved.theme);
    setContrast(saved.contrast);
    setHighlightLinks(saved.highlightLinks);
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const root = document.documentElement;
    root.dataset.fontScale = fontScale.toString();
    root.dataset.theme = theme;
    root.dataset.contrast = contrast === "on" ? "high" : "normal";
    root.style.setProperty("--font-scale", fontScale.toString());
    if (highlightLinks === "on") {
      root.classList.add("highlight-links");
    } else {
      root.classList.remove("highlight-links");
    }
    const toStore = {
      fontScale,
      theme,
      contrast,
      highlightLinks,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toStore));
  }, [fontScale, theme, contrast, highlightLinks, hydrated]);

  const toggleOpen = () => setOpen((prev) => !prev);

  if (!hydrated) {
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
            aria-pressed={contrast === "on"}
            onClick={() => setContrast(contrast === "on" ? "off" : "on")}
          >
            High contrast
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
