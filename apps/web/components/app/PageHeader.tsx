import { Card } from "@/components/shared/Card";

export function PageHeader({ label, title, description }: { label: string; title: string; description?: string }) {
  return (
    <Card variant="orange" className="p-6">
      <p className="label-sm label-orange">{label}</p>
      <h1 className="mt-2 text-3xl md:text-4xl">{title}</h1>
      {description && <p className="mt-3 max-w-3xl">{description}</p>}
    </Card>
  );
}
