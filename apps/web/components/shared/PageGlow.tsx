type PageGlowProps = {
  color?: "orange" | "green" | "red" | "blue";
  position?: "top-left" | "top-right" | "top-center";
};

const colors = {
  orange: "rgba(251,146,60,0.07)",
  green: "rgba(34,197,94,0.06)",
  red: "rgba(239,68,68,0.06)",
  blue: "rgba(96,165,250,0.05)"
};

const positions = {
  "top-left": { top: -60, left: -60 },
  "top-right": { top: -60, right: -60 },
  "top-center": { top: -80, left: "50%", transform: "translateX(-50%)" }
} as const;

export function PageGlow({ color = "orange", position = "top-right" }: PageGlowProps) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        width: 500,
        height: 400,
        borderRadius: "50%",
        background: `radial-gradient(ellipse, ${colors[color]} 0%, transparent 70%)`,
        filter: "blur(40px)",
        pointerEvents: "none",
        zIndex: 0,
        ...positions[position]
      }}
    />
  );
}
