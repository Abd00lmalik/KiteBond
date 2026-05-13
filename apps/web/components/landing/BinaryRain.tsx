const COLUMNS = Array.from({ length: 12 }, (_, index) => ({
  left: `${(index / 12) * 100}%`,
  content: Array.from({ length: 20 }, () => (Math.random() > 0.5 ? "1" : "0")).join(" "),
  duration: `${8 + Math.random() * 10}s`,
  delay: `${-Math.random() * 8}s`,
  opacity: 0.08 + Math.random() * 0.12
}));

export function BinaryRain() {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        pointerEvents: "none",
        zIndex: 0
      }}
    >
      {COLUMNS.map((col, index) => (
        <div
          key={`${col.left}-${index}`}
          className="binary-col"
          style={{
            left: col.left,
            animationDuration: col.duration,
            animationDelay: col.delay,
            opacity: col.opacity
          }}
        >
          {col.content}
        </div>
      ))}
    </div>
  );
}
