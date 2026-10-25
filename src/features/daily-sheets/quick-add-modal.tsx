"use client";

import { useState } from "react";
import { saveCatalogRecordAction } from "@/features/operations/actions";
import { X, Plus, Loader2 } from "lucide-react";

export function QuickAddModal({
  isOpen,
  onClose,
  type,
  onSuccess: _onSuccess,
}: {
  isOpen: boolean;
  onClose: () => void;
  type: "product" | "supplier";
  onSuccess?: (newItem: { id: string; name: string }) => void;
}) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setPending(true);
    setError(null);

    const res = await saveCatalogRecordAction({
      entity: type === "product" ? "products" : "suppliers",
      id: null,
      name: name.trim(),
      code: null,
      sortOrder: 100,
      unitName: type === "product" ? "سلة" : null,
      notes: null,
      active: true,
    });

    setPending(false);
    if (res.ok) {
      setName("");
      onClose();
      // استدعاء onSuccess وإعادة تحميل الصفحة
      window.location.reload();
    } else {
      setError(res.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="font-bold text-brand-900 text-sm">
            {type === "product" ? "إضافة صنف جديد" : "إضافة مورد جديد"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              {type === "product" ? "اسم الصنف" : "اسم المورد"}
            </label>
            <input
              type="text"
              required
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === "product" ? "مثال: خس، ملفوف..." : "مثال: أبو أحمد..."}
              className="w-full rounded-xl border border-slate-300 p-2.5 text-sm focus:border-brand-900 focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-rose-600">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={pending || !name.trim()}
              className="flex items-center gap-1.5 rounded-xl bg-brand-900 px-4 py-2 text-xs font-bold text-white hover:bg-brand-800 disabled:opacity-50"
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
              <span>حفظ الإضافة</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
