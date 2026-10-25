"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, inputClass } from "@/components/ui/primitives";
import { saveCatalogRecordAction } from "@/features/operations/actions";

export type CatalogEntity = "stores" | "suppliers" | "products";
export interface CatalogRecord {
  id: string;
  code: string | null;
  name: string;
  active: boolean;
  sort_order?: number;
  unit_name?: string;
  notes?: string | null;
}

function CatalogRow({ entity, record }: { entity: CatalogEntity; record: CatalogRecord }) {
  const router = useRouter();
  const [name, setName] = useState(record.name);
  const [code, setCode] = useState(record.code ?? "");
  const [sortOrder, setSortOrder] = useState(String(record.sort_order ?? 100));
  const [unitName, setUnitName] = useState(record.unit_name ?? "سلة");
  const [notes, setNotes] = useState(record.notes ?? "");
  const [active, setActive] = useState(record.active);
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const save = async () => {
    setPending(true);
    const result = await saveCatalogRecordAction({ entity, id: record.id, name, code: code || null, sortOrder: entity === "suppliers" ? null : Number(sortOrder), unitName: entity === "products" ? unitName : null, notes: entity === "suppliers" ? notes || null : null, active });
    setPending(false);
    setMessage(result.message);
    if (result.ok) router.refresh();
  };

  return <tr className="border-b border-border-subtle">
    <td className="px-2 py-2"><input aria-label="الرمز" value={code} onChange={(event) => setCode(event.target.value)} className="num w-24 rounded border border-border-subtle px-2 py-1.5" /></td>
    <td className="px-2 py-2"><input aria-label="الاسم" value={name} onChange={(event) => setName(event.target.value)} className="min-w-40 rounded border border-border-subtle px-2 py-1.5" /></td>
    {entity !== "suppliers" ? <td className="px-2 py-2"><input aria-label="الترتيب" inputMode="numeric" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} className="num w-20 rounded border border-border-subtle px-2 py-1.5" /></td> : null}
    {entity === "products" ? <td className="px-2 py-2"><input aria-label="الوحدة" value={unitName} onChange={(event) => setUnitName(event.target.value)} className="w-24 rounded border border-border-subtle px-2 py-1.5" /></td> : null}
    {entity === "suppliers" ? <td className="px-2 py-2"><input aria-label="ملاحظات" value={notes} onChange={(event) => setNotes(event.target.value)} className="min-w-32 rounded border border-border-subtle px-2 py-1.5" /></td> : null}
    <td className="px-2 py-2"><input aria-label="نشط" type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} /></td>
    <td className="px-2 py-2"><div className="flex items-center gap-2"><button type="button" disabled={pending} onClick={save} className="rounded bg-brand-900 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50">حفظ</button>{message ? <span className="text-xs text-slate-600">{message}</span> : null}</div></td>
  </tr>;
}

export function CatalogManager({ entity, title, records }: { entity: CatalogEntity; title: string; records: CatalogRecord[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [sortOrder, setSortOrder] = useState(String(records.length + 1));
  const [unitName, setUnitName] = useState("سلة");
  const [notes, setNotes] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const create = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setPending(true);
    const result = await saveCatalogRecordAction({ entity, id: null, name, code: code || null, sortOrder: entity === "suppliers" ? null : Number(sortOrder), unitName: entity === "products" ? unitName : null, notes: entity === "suppliers" ? notes || null : null, active: true });
    setPending(false);
    setMessage(result.message);
    if (result.ok) { setName(""); setCode(""); setNotes(""); router.refresh(); }
  };
  const headers = ["الرمز", "الاسم", ...(entity === "suppliers" ? ["ملاحظات"] : ["الترتيب"]), ...(entity === "products" ? ["الوحدة"] : []), "نشط", "حفظ"];

  return <div className="space-y-4"><header><h1 className="text-xl font-bold text-brand-900">{title}</h1><p className="text-sm text-slate-600">إدارة سجلات الكتالوج النشطة والتاريخية.</p></header><Card title="إضافة سجل"><form onSubmit={create} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><label className="text-sm">الاسم<input required value={name} onChange={(event) => setName(event.target.value)} className={`${inputClass} mt-1`} /></label><label className="text-sm">الرمز<input value={code} onChange={(event) => setCode(event.target.value)} className={`${inputClass} num mt-1`} /></label>{entity !== "suppliers" ? <label className="text-sm">ترتيب العرض<input required inputMode="numeric" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)} className={`${inputClass} num mt-1`} /></label> : null}{entity === "products" ? <label className="text-sm">الوحدة<input required value={unitName} onChange={(event) => setUnitName(event.target.value)} className={`${inputClass} mt-1`} /></label> : null}{entity === "suppliers" ? <label className="text-sm">ملاحظات<input value={notes} onChange={(event) => setNotes(event.target.value)} className={`${inputClass} mt-1`} /></label> : null}<div className="flex items-end gap-3"><button disabled={pending} className="rounded-lg bg-brand-900 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">{pending ? "جارٍ الحفظ…" : "إضافة"}</button>{message ? <span role="status" className="text-xs text-slate-600">{message}</span> : null}</div></form></Card><Card title={`السجلات (${records.length})`}><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-sm"><thead className="border-b border-border-subtle bg-surface"><tr>{headers.map((header) => <th key={header} className="px-2 py-2 text-start">{header}</th>)}</tr></thead><tbody>{records.map((record) => <CatalogRow key={record.id} entity={entity} record={record} />)}</tbody></table></div></Card></div>;
}