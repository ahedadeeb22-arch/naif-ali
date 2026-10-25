export type NavIcon =
  | "BookOpenCheck"
  | "ClipboardList"
  | "FileSearch"
  | "LayoutDashboard"
  | "ReceiptText"
  | "ShieldCheck"
  | "Store"
  | "Truck"
  | "Users"
  | "Wallet";

export interface NavItem {
  href: string;
  label: string;
  icon: NavIcon;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const adminNav: NavGroup[] = [
  {
    title: "التشغيل اليومي",
    items: [
      { href: "/admin", label: "لوحة المدير", icon: "LayoutDashboard" },
      { href: "/admin/night-orders", label: "طلبات الليل", icon: "ClipboardList" },
      { href: "/admin/sheets", label: "الكشف اليومي", icon: "BookOpenCheck" },
      { href: "/admin/archive", label: "الأرشيف والتعديل", icon: "FileSearch" },
    ],
  },
  {
    title: "الحسابات",
    items: [
      { href: "/admin/vouchers", label: "سندات القبض والصرف", icon: "ReceiptText" },
      { href: "/admin/statements/stores", label: "كشوف البقالات", icon: "Store" },
      { href: "/admin/statements/suppliers", label: "كشوف الموردين", icon: "Truck" },
      { href: "/admin/opening", label: "الأرصدة الافتتاحية", icon: "Wallet" },
    ],
  },
  {
    title: "الإدارة",
    items: [
      { href: "/admin/stores", label: "البقالات", icon: "Store" },
      { href: "/admin/suppliers", label: "الموردون", icon: "Truck" },
      { href: "/admin/products", label: "الأصناف", icon: "ClipboardList" },
      { href: "/admin/users", label: "المستخدمون والصلاحيات", icon: "Users" },
      { href: "/admin/audit", label: "سجل التدقيق", icon: "ShieldCheck" },
    ],
  },
];

export const workerNav: NavGroup[] = [
  {
    title: "العمل اليومي",
    items: [
      { href: "/worker", label: "مهام اليوم", icon: "LayoutDashboard" },
      { href: "/worker/night-orders", label: "طلبات الليل", icon: "ClipboardList" },
      { href: "/worker/sheets", label: "كشف اليوم", icon: "BookOpenCheck" },
    ],
  },
];

export const portalNav: NavGroup[] = [
  {
    title: "حسابي",
    items: [{ href: "/portal", label: "كشف الحساب", icon: "Store" }],
  },
];
