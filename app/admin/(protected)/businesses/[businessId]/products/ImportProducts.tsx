"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { IMPORT_TEMPLATE_CSV, parseProductsCsv } from "@/lib/products/csvImport";
import type { ImportParse } from "@/lib/products/csvImport";
import { importFromShopify, importProducts, previewShopifyStore } from "./actions";

// Pick a spreadsheet (or paste from one), see exactly what will be added and what is wrong, then confirm.
// The checking happens here in the browser so it feels instant; the server checks again when you confirm.
export function ImportProducts({ businessId, currency = "₦" }: { businessId: string; currency?: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ imported: number; skippedExisting: number } | null>(null);

  const [shopAddress, setShopAddress] = useState("");
  const [shopLoading, setShopLoading] = useState(false);
  const [shopPreview, setShopPreview] = useState<{ address: string; result: ImportParse } | null>(null);

  async function lookUpStore() {
    setShopLoading(true);
    setError(null);
    setDone(null);
    setShopPreview(null);
    const result = await previewShopifyStore({ address: shopAddress });
    setShopLoading(false);
    if (result.fatal) {
      setError(result.fatal);
      return;
    }
    setShopPreview({ address: shopAddress, result });
  }

  async function confirmShop() {
    if (!shopPreview) return;
    setWorking(true);
    setError(null);
    const result = await importFromShopify({ businessId, address: shopPreview.address });
    setWorking(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone({ imported: result.imported, skippedExisting: result.skippedExisting });
    setShopPreview(null);
    setShopAddress("");
    router.refresh();
  }

  const parsed = useMemo(() => (text.trim() ? parseProductsCsv(text) : null), [text]);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setDone(null);
    setError(null);
    setText(await file.text());
  }

  async function confirm() {
    setWorking(true);
    setError(null);
    const result = await importProducts({ businessId, csv: text });
    setWorking(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setDone({ imported: result.imported, skippedExisting: result.skippedExisting });
    setText("");
    router.refresh();
  }

  const template = `data:text/csv;charset=utf-8,${encodeURIComponent(IMPORT_TEMPLATE_CSV)}`;

  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-line p-3">
        <label htmlFor="import-shop" className="ui-label">Import from a Shopify store</label>
        <p className="text-sm text-muted">Paste the store&apos;s website address and Mira loads its products, prices, options and first photo for you to review before anything is saved.</p>
        <div className="flex gap-2">
          <input
            id="import-shop"
            className="ui-field min-w-0 flex-1"
            value={shopAddress}
            onChange={(e) => { setShopAddress(e.target.value); setShopPreview(null); }}
            placeholder="mystore.com"
            inputMode="url"
            autoCapitalize="none"
          />
          <button type="button" className="ui-btn ui-btn-secondary" disabled={shopLoading || !shopAddress.trim()} onClick={lookUpStore}>
            {shopLoading ? "Looking…" : "Look up"}
          </button>
        </div>
        {shopPreview && (
          <div className="space-y-3">
            <p className="text-sm text-ink">
              Found <strong>{shopPreview.result.rows.length}</strong> product{shopPreview.result.rows.length === 1 ? "" : "s"}
              {shopPreview.result.problems.length > 0 ? <>, <strong>{shopPreview.result.problems.length}</strong> will be skipped</> : null}.
              Stock counts are not public on Shopify, so only sold-out items are marked.
            </p>
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-mist/60 p-2 text-sm">
              {shopPreview.result.rows.slice(0, 8).map((row) => (
                <li key={row.name} className="flex justify-between gap-3 px-2 py-1 text-ink">
                  <span className="min-w-0 truncate">{row.name}</span>
                  <span className="shrink-0 text-muted">{currency}{row.price.toLocaleString()}{row.stockQuantity === 0 ? " · sold out" : ""}</span>
                </li>
              ))}
              {shopPreview.result.rows.length > 8 && <li className="px-2 py-1 text-xs text-muted">…and {shopPreview.result.rows.length - 8} more</li>}
            </ul>
            <button type="button" className="ui-btn ui-btn-primary" disabled={working || shopPreview.result.rows.length === 0} onClick={confirmShop}>
              {working ? "Importing…" : `Import ${shopPreview.result.rows.length} product${shopPreview.result.rows.length === 1 ? "" : "s"}`}
            </button>
          </div>
        )}
      </div>

      <p className="text-sm text-muted">
        Or add many products at once. Use a spreadsheet saved as CSV with columns <strong className="text-ink">name</strong> and <strong className="text-ink">price</strong>,
        and optionally <strong className="text-ink">stock</strong> and <strong className="text-ink">description</strong>. Prices like 450000, ₦450,000 and 450k all work.{" "}
        <a href={template} download="mira-products-template.csv" className="font-medium text-accent hover:underline">Download a template</a>
      </p>

      <label className="ui-btn ui-btn-secondary cursor-pointer">
        Choose a file
        <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
      </label>

      <div>
        <label htmlFor="import-paste" className="ui-label">Or paste from your spreadsheet</label>
        <textarea
          id="import-paste"
          className="ui-field min-h-[96px] font-mono text-xs"
          value={text}
          onChange={(e) => { setDone(null); setText(e.target.value); }}
          placeholder={"name,price,stock\nTecno Camon 30,230000,10"}
        />
      </div>

      {parsed?.fatal && <p className="rounded-xl bg-marigold/20 px-3 py-2 text-sm text-ink">{parsed.fatal}</p>}

      {parsed && !parsed.fatal && (
        <div className="space-y-3">
          <p className="text-sm text-ink">
            <strong>{parsed.rows.length}</strong> ready to import
            {parsed.problems.length > 0 ? <>, <strong>{parsed.problems.length}</strong> to fix</> : null}.
          </p>

          {parsed.rows.length > 0 && (
            <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl bg-mist/60 p-2 text-sm">
              {parsed.rows.slice(0, 8).map((row) => (
                <li key={row.name} className="flex justify-between gap-3 px-2 py-1 text-ink">
                  <span className="min-w-0 truncate">{row.name}</span>
                  <span className="shrink-0 text-muted">{currency}{row.price.toLocaleString()}{row.stockQuantity !== null ? ` · ${row.stockQuantity} in stock` : ""}</span>
                </li>
              ))}
              {parsed.rows.length > 8 && <li className="px-2 py-1 text-xs text-muted">…and {parsed.rows.length - 8} more</li>}
            </ul>
          )}

          {parsed.problems.length > 0 && (
            <div className="rounded-xl bg-marigold/20 p-3 text-sm text-ink">
              <p className="font-medium">These rows will be skipped:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5">
                {parsed.problems.slice(0, 8).map((p) => <li key={`${p.line}-${p.message}`}>Line {p.line}: {p.message}</li>)}
              </ul>
              {parsed.problems.length > 8 && <p className="mt-1 text-xs text-muted">…and {parsed.problems.length - 8} more</p>}
            </div>
          )}

          <button type="button" className="ui-btn ui-btn-primary" disabled={working || parsed.rows.length === 0} onClick={confirm}>
            {working ? "Importing…" : `Import ${parsed.rows.length} product${parsed.rows.length === 1 ? "" : "s"}`}
          </button>
        </div>
      )}

      {error && <p className="text-sm text-danger">{error}</p>}
      {done && (
        <p className="rounded-xl bg-lime px-3 py-2 text-sm text-ink">
          Imported {done.imported} product{done.imported === 1 ? "" : "s"}.
          {done.skippedExisting > 0 ? ` ${done.skippedExisting} already existed and were skipped.` : ""}
        </p>
      )}
    </div>
  );
}
