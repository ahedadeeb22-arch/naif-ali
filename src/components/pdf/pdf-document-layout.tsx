"use client";

import { Printer, ArrowRight } from "lucide-react";
import Link from "next/link";

export interface PdfDocumentLayoutProps {
  title: string;
  subtitle?: string;
  dateStr?: string;
  documentNo?: string;
  landscape?: boolean;
  backHref?: string;
  backLabel?: string;
  children: React.ReactNode;
}

export function PdfDocumentLayout({
  title,
  subtitle,
  dateStr,
  documentNo,
  landscape = false,
  backHref = "/",
  backLabel = "العودة",
  children,
}: PdfDocumentLayoutProps) {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-100 p-2 sm:p-6 print:min-h-0 print:bg-white print:p-0">
      {/* شريط الإجراءات العلوي المعزول عن الطباعة */}
      <div className="mx-auto mb-4 flex max-w-5xl items-center justify-between rounded-xl bg-white p-3 shadow-sm print:hidden">
        <div className="flex items-center gap-2">
          {backHref && (
            <Link
              href={backHref}
              className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ArrowRight size={16} />
              <span>{backLabel}</span>
            </Link>
          )}
          <div>
            <h1 className="text-base font-bold text-brand-900">{title}</h1>
            {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 rounded-lg bg-brand-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-brand-800"
          >
            <Printer size={16} />
            <span>طباعة / تصدير PDF</span>
          </button>
        </div>
      </div>

      {/* ورقة المستند الرسمية القياسية A4 */}
      <div
        className={`pdf-sheet mx-auto bg-white p-6 shadow-md print:m-0 print:w-full print:p-0 print:shadow-none ${landscape ? "max-w-[297mm]" : "max-w-[210mm]"
          }`}
        style={{ minHeight: landscape ? "210mm" : "297mm" }}
      >
        {/* ترويسة التقرير الرسمية */}
        <header className="border-b-2 border-brand-900 pb-4">
          <div className="flex items-start justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded bg-brand-900 font-bold text-white">
                  خ
                </span>
                <span className="text-lg font-black text-brand-900">نظام مشتريات وتوزيع الخضروات</span>
              </div>
              <p className="text-xs text-slate-600">إدارة المشتريات والتوزيع اليومي وحسابات الموردين والبقالات</p>
            </div>

            <div className="text-start text-xs space-y-1">
              <div className="font-bold text-brand-900">
                نوع التقرير: <span className="font-semibold text-slate-800">{title}</span>
              </div>
              {dateStr && (
                <div>
                  التاريخ: <span className="num font-semibold text-slate-800">{dateStr}</span>
                </div>
              )}
              {documentNo && (
                <div>
                  رقم المستند: <span className="num font-semibold text-slate-800">{documentNo}</span>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* محتوى المستند */}
        <main className="py-4">{children}</main>

        {/* تذييل المستند الرسمي */}
        <footer className="mt-8 border-t border-slate-300 pt-3 text-center text-[10px] text-slate-500 print:mt-auto">
          <div className="flex items-center justify-between">
            <span>تم استخراج هذا التقرير آلياً من النظام المعتمد</span>
            <span>العملة: ريال يمني (YER)</span>
            <span>نظام الخضروات المحاسبي</span>
          </div>
        </footer>
      </div>

      {/* تنسيقات الطباعة الإضافية A4 */}
      <style jsx global>{`
        @media print {
          @page {
            size: ${landscape ? "A4 landscape" : "A4 portrait"};
            margin: 10mm;
          }
          body {
            background: white !important;
            color: black !important;
          }
          .pdf-sheet {
            box-shadow: none !important;
            border: none !important;
            width: 100% !important;
            max-width: 100% !important;
            min-height: 0 !important;
          }
          thead {
            display: table-header-group;
          }
          tr {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
}
