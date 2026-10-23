"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WebsiteImport } from "../WebsiteImport";
import { completeOnboarding } from "./actions";
import { COURIER_OPTIONS, isConnectableCourier } from "@/lib/onboarding";

const STEPS = ["website", "email", "inventory", "courier"] as const;
type Step = (typeof STEPS)[number] | "done";

function YesNo({ legend, value, onChange }: { legend: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <fieldset>
      <legend className="text-base font-medium text-slate-900">{legend}</legend>
      <div className="mt-3 flex gap-3">
        {[
          { label: "Yes", v: true },
          { label: "No", v: false },
        ].map((option) => (
          <label
            key={option.label}
            className={`flex min-w-24 cursor-pointer items-center justify-center rounded-lg border px-4 py-2 text-sm font-medium has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-indigo-400 ${
              value === option.v ? "border-accent bg-indigo-50 text-accent" : "border-slate-300 text-slate-700 hover:bg-slate-50"
            }`}
          >
            <input type="radio" name={legend} className="sr-only" checked={value === option.v} onChange={() => onChange(option.v)} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function SetupWizard({ businessId, businessName }: { businessId: string; businessName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("website");
  const [hasWebsite, setHasWebsite] = useState<boolean | null>(null);
  const [wantsEmail, setWantsEmail] = useState<boolean | null>(null);
  const [tracksInventory, setTracksInventory] = useState<boolean | null>(null);
  const [courier, setCourier] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stepIndex = step === "done" ? STEPS.length : STEPS.indexOf(step);
  const dashboard = `/portal/${businessId}`;

  const answered: Record<(typeof STEPS)[number], boolean> = {
    website: hasWebsite !== null,
    email: wantsEmail !== null,
    inventory: tracksInventory !== null,
    courier: courier !== null,
  };

  async function save(): Promise<boolean> {
    setSaving(true);
    setError(null);
    const result = await completeOnboarding(businessId, {
      wantsEmailChannel: wantsEmail,
      tracksInventory,
      logisticsProvider: courier,
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      return false;
    }
    return true;
  }

  async function next() {
    if (step === "done") return;
    if (stepIndex < STEPS.length - 1) {
      setStep(STEPS[stepIndex + 1]);
      return;
    }
    if (await save()) setStep("done");
  }

  // Saves whatever has been answered so far. Skipping is a normal way out:
  // everything here can be changed later in Settings.
  async function skip() {
    if (await save()) router.push(dashboard);
  }

  const chosenCourier = COURIER_OPTIONS.find((o) => o.id === courier);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Welcome</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">Let&apos;s set up {businessName}</h1>
      <p className="mt-1 text-sm text-slate-500">A few quick questions so Mira starts out knowing your business. You can change any of this later.</p>

      {step !== "done" && (
        <div className="mt-6">
          <div
            role="progressbar"
            aria-label="Setup progress"
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-valuenow={stepIndex + 1}
            className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200"
          >
            <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${((stepIndex + 1) / STEPS.length) * 100}%` }} />
          </div>
          <p className="mt-1 text-xs text-slate-400">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
        </div>
      )}

      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        {step === "website" && (
          <div className="space-y-4">
            <YesNo legend="Does your business have a website?" value={hasWebsite} onChange={setHasWebsite} />
            {hasWebsite === true && (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <p className="text-sm text-slate-500">
                  Enter your address and Mira will suggest products, services, hours and FAQs from it. Nothing goes live until you confirm.
                </p>
                <WebsiteImport businessId={businessId} embedded />
              </div>
            )}
            {hasWebsite === false && <p className="text-sm text-slate-500">No problem. If you get a website later you can import from it in Settings.</p>}
          </div>
        )}

        {step === "email" && (
          <div className="space-y-4">
            <YesNo legend="Should Mira reply to your customers' emails too?" value={wantsEmail} onChange={setWantsEmail} />
            {wantsEmail === true && (
              <p className="text-sm text-slate-500">
                Email replies need a Mira email address set up for your business, which you can&apos;t do yourself yet. We&apos;ve noted that you want it.
              </p>
            )}
            {wantsEmail === false && <p className="text-sm text-slate-500">Okay. Mira will answer on your website chat (and WhatsApp when it&apos;s connected).</p>}
          </div>
        )}

        {step === "inventory" && (
          <div className="space-y-4">
            <YesNo legend="Do you keep track of how many of each item you have in stock?" value={tracksInventory} onChange={setTracksInventory} />
            {tracksInventory === true && (
              <p className="text-sm text-slate-500">
                Add a stock number to a product and Mira will use it when answering customers and taking orders. It won&apos;t take an order for more than you have.
              </p>
            )}
            {tracksInventory === false && (
              <p className="text-sm text-slate-500">No problem. Mira won&apos;t limit orders by stock unless you add a stock number to a product.</p>
            )}
          </div>
        )}

        {step === "courier" && (
          <fieldset>
            <legend className="text-base font-medium text-slate-900">How do you deliver orders?</legend>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {COURIER_OPTIONS.map((option) => (
                <label
                  key={option.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm has-[input:focus-visible]:ring-2 has-[input:focus-visible]:ring-indigo-400 ${
                    courier === option.id ? "border-accent bg-indigo-50 text-accent" : "border-slate-300 text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <input type="radio" name="courier" className="sr-only" checked={courier === option.id} onChange={() => setCourier(option.id)} />
                  {option.label}
                </label>
              ))}
            </div>
            {courier !== null && isConnectableCourier(courier) && (
              <p className="mt-3 text-sm text-slate-500">Mira can update your orders automatically when Shiip delivers them. You&apos;ll connect it in Settings once you finish.</p>
            )}
            {chosenCourier && !chosenCourier.connectable && chosenCourier.id !== "self" && (
              <p className="mt-3 text-sm text-slate-500">
                Mira can&apos;t get delivery updates from {chosenCourier.id === "other" ? "other couriers" : chosenCourier.label} yet. We&apos;ve noted it so we know what to build next.
              </p>
            )}
          </fieldset>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">You&apos;re set up</h2>
            <p className="text-sm text-slate-500">Mira is ready to answer your customers. You can change any of these answers later in Settings.</p>
            <div className="flex flex-wrap gap-3">
              {isConnectableCourier(courier) && (
                <Link href={`/portal/${businessId}/settings`} className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark">
                  Connect Shiip
                </Link>
              )}
              <Link
                href={dashboard}
                className={
                  isConnectableCourier(courier)
                    ? "rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    : "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark"
                }
              >
                Go to your dashboard
              </Link>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600">
            {error}
          </p>
        )}

        {step !== "done" && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-4">
              {stepIndex > 0 && (
                <button type="button" onClick={() => setStep(STEPS[stepIndex - 1])} disabled={saving} className="text-sm font-medium text-slate-600 hover:underline disabled:opacity-50">
                  Back
                </button>
              )}
              <button type="button" onClick={() => void skip()} disabled={saving} className="text-sm text-slate-400 hover:underline disabled:opacity-50">
                Skip setup
              </button>
            </div>
            <button
              type="button"
              onClick={() => void next()}
              disabled={saving || !answered[step]}
              className="rounded-lg bg-accent px-5 py-2 text-sm font-semibold text-white hover:bg-accent-dark disabled:opacity-50"
            >
              {saving ? "Saving..." : stepIndex === STEPS.length - 1 ? "Finish" : "Continue"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
