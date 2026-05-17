import Image from "next/image";

export function KiteBondMark({ size = 28 }: { size?: number }) {
  return (
    <Image
      src="/kitebond-mark.svg"
      alt=""
      width={size}
      height={size}
      priority
      aria-hidden="true"
    />
  );
}

export function KiteBondWordmark() {
  return (
    <span className="inline-flex items-center gap-2">
      <KiteBondMark size={32} />
      <span className="font-semibold tracking-tight text-base">
        <span className="text-white">Kite</span>
        <span className="text-orange-500">Bond</span>
      </span>
    </span>
  );
}
