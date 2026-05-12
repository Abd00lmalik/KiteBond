import { ExternalLink } from "lucide-react";
import { explorerTx, truncateHash } from "@/lib/utils";

type TxLinkProps = {
  hash?: string | null;
  className?: string;
};

export function TxLink({ hash, className }: TxLinkProps) {
  if (!hash) {
    return <span className={className}>Pending</span>;
  }

  return (
    <a
      href={explorerTx(hash)}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center gap-1 font-mono text-xs text-link transition hover:text-blue-300 ${className || ""}`}
    >
      {truncateHash(hash, 6, 4)}
      <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  );
}
