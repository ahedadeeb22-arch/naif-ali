"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import {
  BookOpenCheck,
  ClipboardList,
  FileSearch,
  LayoutDashboard,
  LogOut,
  Menu,
  ReceiptText,
  ShieldCheck,
  Store,
  Truck,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import type { NavGroup, NavIcon } from "@/components/layout/nav";
import { createBrowserSupabase } from "@/lib/supabase/client";

const navIcons: Record<NavIcon, LucideIcon> = {
  BookOpenCheck,
  ClipboardList,
  FileSearch,
  LayoutDashboard,
  ReceiptText,
  ShieldCheck,
  Store,
  Truck,
  Users,
  Wallet,
};

const roleLabels: Record<string, string> = {
  admin: "مدير",
  worker: "عامل",
  store_owner: "صاحب بقالة",
};

export function AppShell({
  nav,
  role,
  displayName,
  children,
}: {
  nav: NavGroup[];
  role: string;
  displayName: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const flat = nav.flatMap((group) => group.items);
  const signOut = async () => {
    try {
      const supabase = createBrowserSupabase();
      await supabase.auth.signOut();
    } finally {
      router.replace("/login");
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      {/* شريط التنقل العلوي الملكي للتبديل السريع بين الشاشات الخمس (مطابق للنموذج المرجعي HTML) */}
      <div className="preview-switcher sticky top-0 z-40 bg-gradient-to-r from-[#0c2461] to-[#1e3799] text-white px-3 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2 shadow-md border-b border-white/10 print:hidden">
        <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#f6b93b]">
          <span>👑</span>
          <span className="hidden sm:inline">النظام المحاسبي والرقابي المتكامل</span>
          <span className="sm:hidden font-black">نظام الخضروات</span>
        </div>

        {/* أزرار الشاشات الخمس */}
        <div className="flex items-center gap-1 sm:gap-1.5 overflow-x-auto py-0.5 no-scrollbar max-w-full">
          <Link
            href="/worker"
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              pathname.startsWith("/worker")
                ? "bg-[#f6b93b] text-[#0c2461] shadow-sm font-black"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            1. واجهة العامل
          </Link>
          <Link
            href="/admin/archive"
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              pathname.startsWith("/admin/archive") || (pathname.startsWith("/admin/sheets") && pathname.includes("edit=true"))
                ? "bg-[#f6b93b] text-[#0c2461] shadow-sm font-black"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            🌟 2. التقارير والتعديل الشامل
          </Link>
          <Link
            href="/admin"
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              pathname === "/admin" || pathname.startsWith("/admin/statements") || pathname.startsWith("/admin/vouchers")
                ? "bg-[#f6b93b] text-[#0c2461] shadow-sm font-black"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            3. كشوفات البقالات والموردين
          </Link>
          <Link
            href="/admin/users"
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              pathname.startsWith("/admin/users") || pathname.startsWith("/admin/audit") || pathname.startsWith("/admin/stores") || pathname.startsWith("/admin/suppliers") || pathname.startsWith("/admin/products")
                ? "bg-[#f6b93b] text-[#0c2461] shadow-sm font-black"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            4. الصلاحيات والتدقيق
          </Link>
          <Link
            href="/portal"
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              pathname.startsWith("/portal")
                ? "bg-[#f6b93b] text-[#0c2461] shadow-sm font-black"
                : "bg-white/10 text-white hover:bg-white/20"
            }`}
          >
            5. بوابة صاحب البقالة
          </Link>
          <Link
            href="/demo"
            className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all whitespace-nowrap ${
              pathname.startsWith("/demo")
                ? "bg-[#e58e26] text-white shadow-sm font-black"
                : "bg-amber-400/20 text-amber-200 hover:bg-amber-400/30"
            }`}
          >
            ⚡ وضع المعاينة (Demo)
          </Link>
        </div>

        {/* معلومات المستخدم والدور */}
        <div className="flex items-center gap-2 text-xs">
          <span className="hidden md:inline rounded-full bg-white/15 px-2.5 py-0.5 text-white/90">{displayName}</span>
          <span className="rounded-full bg-[#f6b93b]/20 px-2 py-0.5 text-[#f6b93b] font-bold">{roleLabels[role] ?? role}</span>
          <button
            type="button"
            onClick={signOut}
            className="rounded-lg p-1 hover:bg-white/10 text-white/80 hover:text-white"
            title="تسجيل الخروج"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>

      <header className="app-header sticky top-[45px] z-30 flex items-center justify-between gap-3 border-b border-border-subtle bg-slate-900/95 backdrop-blur px-4 py-2 text-white print:hidden">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="rounded-lg p-1.5 hover:bg-white/10 lg:hidden"
            aria-label={open ? "إغلاق القائمة" : "فتح القائمة"}
            aria-expanded={open}
          >
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <Link href={nav[0]?.items[0]?.href ?? "/"} className="text-sm font-bold text-slate-200 hover:text-white">
            📁 القائمة الجانبية للنظام
          </Link>
        </div>
        <div className="text-xs text-slate-400">
          الوضع: <span className="font-semibold text-emerald-400">متصل بالإنتاج (Supabase)</span>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[1600px]">
        <aside
          className={`app-sidebar fixed inset-y-0 end-0 z-40 w-72 transform overflow-y-auto border-s border-border-subtle bg-white p-4 pt-20 transition-transform lg:static lg:z-auto lg:block lg:w-64 lg:shrink-0 lg:pt-4 ${
            open ? "translate-x-0" : "translate-x-full lg:translate-x-0"
          }`}
          aria-label="القائمة الرئيسية"
        >
          <nav className="space-y-5">
            {nav.map((group) => (
              <div key={group.title}>
                <p className="mb-2 px-2 text-xs font-semibold text-slate-500">{group.title}</p>
                <ul className="space-y-1">
                  {group.items.map((item) => {
                    const active = pathname === item.href;
                    const Icon = navIcons[item.icon];
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                            active ? "bg-brand-900 text-white" : "text-slate-700 hover:bg-surface"
                          }`}
                          aria-current={active ? "page" : undefined}
                        >
                          <Icon size={18} />
                          {item.label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </aside>
        {open ? (
          <button
            type="button"
            aria-label="إغلاق القائمة"
            className="fixed inset-0 z-30 bg-black/30 lg:hidden"
            onClick={() => setOpen(false)}
          />
        ) : null}

        <main className="min-w-0 flex-1 p-4 pb-24 lg:p-6">{children}</main>
      </div>

      <nav className="app-bottom-nav fixed inset-x-0 bottom-0 z-30 flex justify-around border-t border-border-subtle bg-white py-2 lg:hidden">
        {flat.slice(0, 4).map((item) => {
          const Icon = navIcons[item.icon];
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-16 flex-col items-center gap-1 text-xs ${active ? "text-brand-900" : "text-slate-500"}`}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
