import { Card } from "@/components/shared/Card";

export function PageHeader({ label, title, description }: { label: string; title: string; description?: string }) {
  return (
    <Card variant="orange" className="p-6">
      <p className="label-sm label-orange">{label}</p>
      <h1 className="mt-2 font-sans text-2xl font-semibold leading-tight tracking-[-0.018em] md:text-[1.75rem]">{title}</h1>
      {description && <p className="mt-3 max-w-3xl">{description}</p>}
    </Card>
  );
}
