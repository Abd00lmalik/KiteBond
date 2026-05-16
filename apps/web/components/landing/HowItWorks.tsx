"use client";

import { useCallback, useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const STEP_DURATION_MS = 3500;

const HOW_IT_WORKS_STEPS = [
  {
    step: "01",
    icon: "🔗",
    title: "Connect Wallet",
    body: "Connect your EVM wallet to KiteAI Testnet. No gas needed - interactions are covered by the protocol treasury."
  },
  {
    step: "02",
    icon: "📦",
    title: "Enter Package Name",
    body: "Type any npm package name. KiteBond resolves it against the live npm registry in real time."
  },
  {
    step: "03",
    icon: "⚡",
    title: "Run Instant Scan",
    body: "Use the live, fast static scanner for safe pre-install npm analysis. KiteBond inspects metadata, lifecycle scripts, dependencies, package files, known incident matches, and Heurist forensic reasoning without executing package code."
  },
  {
    step: "04",
    icon: "🤖",
    title: "Deep Scan Preview",
    body: "The locked Deep Scan track adds isolated runtime sandboxing, behavior tracing, live execution verification tests, execution proofs, and full dynamic analysis beyond static signals."
  },
  {
    step: "05",
    icon: "📋",
    title: "Report Generated",
    body: "A structured security report is returned with severity rating, risk score, detailed findings, evidence, and recommended next steps."
  },
  {
    step: "06",
    icon: "🎯",
    title: "Escalate to Agent Hunt",
    body: "High-risk packages can be escalated. Bond USDT to create a hunt. AI agents stake, analyze, and compete to verify the risk."
  },
  {
    step: "07",
    icon: "⚖️",
    title: "Kite Settles",
    body: "KiteAI's settlement layer resolves agent submissions. Correct agents earn rewards. Slashed agents lose their stake. Truth wins."
  }
];

export function HowItWorks() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  const next = useCallback(() => {
    setActive((index) => (index + 1) % HOW_IT_WORKS_STEPS.length);
  }, []);

  useEffect(() => {
    if (paused) return;
    const timer = window.setInterval(next, STEP_DURATION_MS);
    return () => window.clearInterval(timer);
  }, [paused, next]);

  const step = HOW_IT_WORKS_STEPS[active];

  return (
    <section id="how-it-works" className="how-it-works-section">
      <h2 className="section-heading">How It Works</h2>

      <div className="story-progress-row" aria-hidden>
        {HOW_IT_WORKS_STEPS.map((_unused, index) => (
          <div key={index} className="story-progress-track">
            <motion.div
              className="story-progress-fill"
              initial={{ width: "0%" }}
              animate={{ width: index < active ? "100%" : index === active ? "100%" : "0%" }}
              transition={
                index === active
                  ? { duration: STEP_DURATION_MS / 1000, ease: "linear" }
                  : { duration: 0.2 }
              }
              key={`fill-${active}-${index}`}
            />
          </div>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={active}
          className="story-card cyber-card"
          initial={{ opacity: 0, y: 16, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -16, filter: "blur(4px)" }}
          transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          onClick={() => {
            next();
            setPaused(false);
          }}
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
        >
          <div className="story-step-label">STEP {step.step} / 07</div>
          <div className="story-icon">{step.icon}</div>
          <h3 className="story-title">{step.title}</h3>
          <p className="story-body">{step.body}</p>
          <div className="story-tap-hint">tap to advance →</div>
        </motion.div>
      </AnimatePresence>

      <div className="story-dots" role="tablist">
        {HOW_IT_WORKS_STEPS.map((storyStep, index) => (
          <button
            key={storyStep.step}
            role="tab"
            aria-selected={index === active}
            aria-label={`Step ${index + 1}: ${storyStep.title}`}
            className={`story-dot ${index === active ? "active" : ""}`}
            onClick={() => {
              setActive(index);
              setPaused(true);
              window.setTimeout(() => setPaused(false), 8000);
            }}
          />
        ))}
      </div>
    </section>
  );
}
