"use client";

import { motion, useReducedMotion, type HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type CardVariant = "default" | "orange" | "green" | "red" | "amber" | "glass";

const variants: Record<CardVariant, string> = {
  default: "border-[var(--border-default)] bg-[var(--bg-card)]",
  orange: "border-[var(--border-orange)] bg-[var(--bg-card)] shadow-[var(--shadow-orange)]",
  green: "border-[var(--border-green)] bg-[var(--bg-card)] shadow-[var(--shadow-green)]",
  red: "border-[var(--border-red)] bg-[var(--bg-card)] shadow-[var(--shadow-red)]",
  amber: "border-[var(--border-amber)] bg-[var(--bg-card)]",
  glass: "border-[var(--border-dim)] bg-[var(--bg-glass)]"
};

export function Card({
  children,
  className,
  variant = "default",
  interactive = false,
  ...props
}: HTMLMotionProps<"div"> & { children: ReactNode; variant?: CardVariant; interactive?: boolean }) {
  const reducedMotion = useReducedMotion();
  return (
    <motion.div
      whileHover={interactive && !reducedMotion ? { y: -3, backgroundColor: "var(--bg-card-hover)" } : undefined}
      transition={{ type: "spring", stiffness: 420, damping: 30 }}
      className={cn("cyber-card relative overflow-hidden rounded-[var(--radius-lg)] border p-5 shadow-[var(--shadow-md)]", variants[variant], className)}
      {...props}
    >
      {children}
    </motion.div>
  );
}
