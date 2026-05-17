import Image from "next/image";

interface KiteBondMarkProps {
  size?: number;
  className?: string;
}

export function KiteBondMark({ size = 28, className }: KiteBondMarkProps) {
  return (
    <Image
      src="/kb-mark.svg"
      alt="KiteBond"
      width={size}
      height={size}
      className={className}
      priority
    />
  );
}

export function KiteBondWordmark({ iconSize = 24 }: { iconSize?: number }) {
  return (
    <div className="flex items-center gap-2">
      <KiteBondMark size={iconSize} />
      <span className="font-semibold text-sm tracking-tight">
        <span className="text-white">Kite</span>
        <span className="text-orange-500">Bond</span>
      </span>
    </div>
  );
}
