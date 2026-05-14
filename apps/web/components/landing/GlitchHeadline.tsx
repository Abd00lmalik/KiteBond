"use client";

import { useEffect, useRef, useState } from "react";

const GLITCH_CHARS = "!<>—_\\/[]{}=+*^?#@$%";
const GLITCH_INTERVAL_MS = 6000;
const GLITCH_DURATION_MS = 500;
const GLITCH_FRAMES = 6;

function corruptText(text: string, intensity: number): string {
  return text
    .split("")
    .map((char) => {
      if (char === " " || char === ".") return char;
      return Math.random() < intensity
        ? GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]
        : char;
    })
    .join("");
}

interface Props {
  text: string;
  className?: string;
}

export function GlitchHeadline({ text, className = "" }: Props) {
  const [display, setDisplay] = useState(text);
  const [offsetX, setOffsetX] = useState(0);
  const activeRef = useRef(false);

  const runGlitch = () => {
    if (activeRef.current) return;
    activeRef.current = true;

    const stepMs = GLITCH_DURATION_MS / GLITCH_FRAMES;
    let frame = 0;

    const tick = window.setInterval(() => {
      frame += 1;
      const progress = frame / GLITCH_FRAMES;
      const intensity = progress < 0.5 ? progress * 2 * 0.45 : (1 - progress) * 2 * 0.45;

      setDisplay(corruptText(text, intensity));
      setOffsetX((Math.random() - 0.5) * 6);

      if (frame >= GLITCH_FRAMES) {
        window.clearInterval(tick);
        setDisplay(text);
        setOffsetX(0);
        activeRef.current = false;
      }
    }, stepMs);
  };

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;

    const init = window.setTimeout(runGlitch, 2500);
    const interval = window.setInterval(runGlitch, GLITCH_INTERVAL_MS);

    return () => {
      window.clearTimeout(init);
      window.clearInterval(interval);
    };
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <h1
      className={`hero-headline ${className}`}
      aria-label={text}
      style={{ transform: `translateX(${offsetX}px)`, transition: "transform 0.05s" }}
    >
      {display}
    </h1>
  );
}
