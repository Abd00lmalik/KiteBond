export function KiteBondMark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M14 2L26 14L14 26L2 14Z" stroke="#F97316" strokeWidth="2" fill="none" />
      <circle cx="14" cy="14" r="3" fill="#F97316" />
      <line x1="14" y1="6" x2="14" y2="22" stroke="#F97316" strokeWidth="1" strokeOpacity="0.4" />
    </svg>
  );
}

export function KiteBondWordmark() {
  return (
    <span className="font-semibold tracking-tight text-base">
      <span className="text-white">Kite</span>
      <span className="text-orange-500">Bond</span>
    </span>
  );
}
