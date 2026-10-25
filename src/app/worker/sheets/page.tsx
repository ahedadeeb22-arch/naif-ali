import { SheetPage } from "@/features/daily-sheets/sheet-page";

export const metadata = { title: "كشف اليوم" };

export default async function WorkerSheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const params = await searchParams;
  return <SheetPage role="worker" searchDate={params.date} />;
}
