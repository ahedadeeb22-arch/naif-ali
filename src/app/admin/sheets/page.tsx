import { SheetPage } from "@/features/daily-sheets/sheet-page";

export const metadata = { title: "الكشف اليومي — الإدارة" };

export default async function AdminSheetsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; edit?: string }>;
}) {
  const params = await searchParams;
  const isComprehensiveEdit = params.edit === "true" || params.edit === "1";
  return (
    <SheetPage
      role="admin"
      searchDate={params.date}
      isComprehensiveEdit={isComprehensiveEdit}
    />
  );
}
