import { HBars } from "@/components/charts";

export function IbnrBars({ data }: { data: { name: string; value: number }[] }) {
  return <HBars data={data} xKey="name" yKey="value" color="#a78bfa" height={150} fmt="M" />;
}
