import type { CSSProperties } from "react";
import { Cairo } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { APP } from "@/lib/config";
import "./globals.css";

const cairo = Cairo({
  subsets: ["arabic", "latin"],
  weight: ["400", "600", "700"],
  variable: "--font-cairo",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: APP.name, template: `%s · ${APP.name}` },
  description:
    "نظام محاسبي ورقابي لإدارة طلبات الليل، مشتريات الخضروات، توزيع الكلفة على البقالات، والكشوف المالية.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0c2461",
};

const rootStyle: CSSProperties = {
  // font-family from Cairo next/font, with fontsource fallback
  fontFamily: "var(--font-cairo), 'Cairo', Tahoma, system-ui, sans-serif",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl" className={cairo.variable} suppressHydrationWarning>
      <body className="min-h-screen antialiased" style={rootStyle}>
        {children}
      </body>
    </html>
  );
}
