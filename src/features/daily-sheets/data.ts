import type { RpcClient } from "@/lib/rpc";
import type {
  DailySheetRevisionRow,
  DailySheetRow,
  DispositionType,
  ProductRow,
  PurchaseDispositionRow,
  PurchaseLineRow,
  StoreRow,
  SupplierRow,
} from "@/lib/supabase/types";
import type { DispositionInput, PurchaseLineInput } from "@/features/daily-sheets/domain/allocation";

export interface SheetLineView extends PurchaseLineRow {
  productName: string;
  supplierName: string | null;
  dispositions: Array<PurchaseDispositionRow & { storeName: string | null }>;
}

export interface SheetView {
  sheet: Pick<DailySheetRow, "id" | "business_date" | "status" | "version" | "current_revision_id">;
  revision: Pick<DailySheetRevisionRow, "id" | "revision_no" | "status" | "version" | "revision_kind" | "reason">;
  lines: SheetLineView[];
}

export async function loadSheetByDate(client: RpcClient, date: string): Promise<SheetView | null> {
  const { data: rawSheet } = await client
    .from("daily_sheets")
    .select("id, business_date, status, version, current_revision_id")
    .eq("business_date", date)
    .maybeSingle();
  const sheet = rawSheet as SheetView["sheet"] | null;
  if (!sheet) return null;

  if (!sheet.current_revision_id) {
    throw new Error("اليومية موجودة بلا إصدار حالي؛ بيانات غير متسقة");
  }

  const { data: rawRevision, error: revisionError } = await client
    .from("daily_sheet_revisions")
    .select("id, revision_no, status, version, revision_kind, reason")
    .eq("id", sheet.current_revision_id)
    .single();
  const revision = rawRevision as SheetView["revision"] | null;
  if (revisionError || !revision) throw new Error("تعذر تحميل إصدار اليومية");

  const { data: linesData, error: linesError } = await client
    .from("purchase_lines")
    .select("*")
    .eq("revision_id", revision.id)
    .order("line_no");
  if (linesError) throw new Error("تعذر تحميل سطور الشراء");
  const rawLines = (linesData ?? []) as PurchaseLineRow[];

  const lineIds = rawLines.map((line) => line.id);
  const { data: dispositionsData } = lineIds.length
    ? await client.from("purchase_dispositions").select("*").in("purchase_line_id", lineIds)
    : { data: [] as PurchaseDispositionRow[] };
  const dispositions = (dispositionsData ?? []) as PurchaseDispositionRow[];

  const { data: productsData } = await client.from("products").select("*");
  const { data: suppliersData } = await client.from("suppliers").select("*");
  const { data: storesData } = await client.from("stores").select("*");
  const products = (productsData ?? []) as ProductRow[];
  const suppliers = (suppliersData ?? []) as SupplierRow[];
  const stores = (storesData ?? []) as StoreRow[];

  const productName = new Map(products.map((p) => [p.id, p.name]));
  const supplierName = new Map(suppliers.map((s) => [s.id, s.name]));
  const storeName = new Map(stores.map((s) => [s.id, s.name]));

  const lines: SheetLineView[] = rawLines.map((line) => ({
    ...line,
    productName: productName.get(line.product_id) ?? "صنف محذوف",
    supplierName: line.supplier_id ? (supplierName.get(line.supplier_id) ?? null) : null,
    dispositions: dispositions
      .filter((d) => d.purchase_line_id === line.id)
      .map((d) => ({ ...d, storeName: d.store_id ? (storeName.get(d.store_id) ?? null) : null })),
  }));

  return { sheet, revision, lines };
}

export function toDomainLines(lines: ReadonlyArray<SheetLineView>): PurchaseLineInput[] {
  return lines.map((line) => ({
    id: line.id,
    productId: line.product_id,
    supplierId: line.supplier_id,
    status: line.purchase_status,
    quantity: line.purchased_quantity,
    unitPrice: line.basket_unit_price,
    cancellationReason: line.cancellation_reason,
    freeReason: line.free_reason,
  }));
}

export function toDomainDispositions(lines: ReadonlyArray<SheetLineView>): DispositionInput[] {
  return lines.flatMap((line) =>
    line.dispositions
      .filter((d): d is typeof d & { disposition_type: DispositionType } =>
        d.disposition_type === "store_distribution" ||
        d.disposition_type === "inventory_remaining" ||
        d.disposition_type === "damaged",
      )
      .map((d) => ({
        lineId: line.id,
        type: d.disposition_type as DispositionInput["type"],
        storeId: d.store_id,
        quantity: d.quantity,
        reason: d.reason,
      })),
  );
}

export async function loadCatalog(client: RpcClient) {
  const [stores, suppliers, products] = await Promise.all([
    client.from("stores").select("id, code, name, sort_order, active").eq("active", true).order("sort_order"),
    client.from("suppliers").select("id, name, active").eq("active", true).order("name"),
    client.from("products").select("id, name, sort_order, active, unit_name").eq("active", true).order("sort_order"),
  ]);
  return {
    stores: (stores.data ?? []) as unknown as Array<Pick<StoreRow, "id" | "code" | "name" | "sort_order" | "active">>,
    suppliers: (suppliers.data ?? []) as unknown as Array<Pick<SupplierRow, "id" | "name" | "active">>,
    products: (products.data ?? []) as unknown as Array<
      Pick<ProductRow, "id" | "name" | "sort_order" | "active" | "unit_name">
    >,
  };
}
