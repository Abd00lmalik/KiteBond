"use client";

import { useEffect, useState } from "react";

interface GlitchHeadlineProps {
  text: string;
  className?: string;
}

const GLITCH_INTERVAL = 5000;
const GLITCH_DURATION = 400;
const GLITCH_STEPS = 4;
const GLITCH_CHARS = "!<>-_\\/[]{}-=+*^?#";

function randomChar() {
  return GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)];
}

function corruptText(text: string, intensity: number): string {
  return text
    .split("")
    .map((char) => {
      if (char === " ") return " ";
      return Math.random() < intensity ? randomChar() : char;
    })
    .join("");
}

export function GlitchHeadline({ text, className = "" }: GlitchHeadlineProps) {
  const [displayText, setDisplayText] = useState(text);
  const [isGlitching, setIsGlitching] = useState(false);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const triggerGlitch = () => {
      setIsGlitching(true);
      let step = 0;
      const stepDuration = GLITCH_DURATION / GLITCH_STEPS;

      const interval = window.setInterval(() => {
        step += 1;
        const intensity = step < GLITCH_STEPS / 2 ? step / GLITCH_STEPS : (GLITCH_STEPS - step) / GLITCH_STEPS;
        setDisplayText(corruptText(text, intensity * 0.4));

        if (step >= GLITCH_STEPS) {
          window.clearInterval(interval);
          setDisplayText(text);
          setIsGlitching(false);
        }
      }, stepDuration);
    };

    const timer = window.setInterval(triggerGlitch, GLITCH_INTERVAL);
    const init = window.setTimeout(triggerGlitch, 2000);

    return () => {
      window.clearInterval(timer);
      window.clearTimeout(init);
    };
  }, [text]);

  return (
    <h1
      className={className}
      aria-label={text}
      style={{
        fontVariantNumeric: "tabular-nums",
        letterSpacing: isGlitching ? "0.01em" : undefined
      }}
    >
      <span aria-hidden="true">{displayText}</span>
    </h1>
  );
}
