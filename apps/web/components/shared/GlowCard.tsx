"use client";

import type { ReactNode } from "react";
import { motion, type HTMLMotionProps, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

type GlowCardProps = HTMLMotionProps<"div"> & {
  children: ReactNode;
  tone?: "orange" | "green" | "red" | "blue" | "neutral";
};

export function GlowCard({ children, className, tone = "neutral", ...props }: GlowCardProps) {
  const reducedMotion = useReducedMotion();
  const tones = {
    orange: "card--orange",
    green: "card--green",
    red: "card--red",
    blue: "border-[rgba(96,165,250,0.25)]",
    neutral: ""
  };

  return (
    <motion.div
      whileHover={reducedMotion ? undefined : { y: -3, boxShadow: "0 8px 32px rgba(251,146,60,0.12)" }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className={cn(
        "card p-5 transition duration-300",
        tones[tone],
        className
      )}
      {...props}
    >
      {children}
    </motion.div>
  );
}
