type ProofTimestampProps = {
  value?: string | Date | null;
};

export function ProofTimestamp({ value }: ProofTimestampProps) {
  if (!value) return <span className="text-[var(--text-muted)]">Pending</span>;
  const date = typeof value === "string" ? new Date(value) : value;
  return (
    <time dateTime={date.toISOString()} className="text-[var(--text-secondary)]">
      {date.toLocaleString()}
    </time>
  );
}
