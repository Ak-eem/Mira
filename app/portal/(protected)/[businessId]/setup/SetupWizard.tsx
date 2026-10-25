"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { WebsiteImport } from "../WebsiteImport";
import { completeOnboarding, seedFashionStarter } from "./actions";
import { PageHeader } from "@/components/ui/PageHeader";
import { Segmented } from "@/components/ui/Segmented";
import { SwitchRow } from "@/components/ui/Switch";
import { COURIER_OPTIONS, isConnectableCourier } from "@/lib/onboarding";
import { EMPTY_FASHION_ANSWERS, MAX_DELIVERY_NOTE, MAX_RETURN_DAYS, hasAnyFashionAnswer, type FashionAnswers, type PaymentMethod, type ReturnsPolicy } from "@/lib/fashionStarter";

type StepId = "sells" | "fashion" | "website" | "email" | "inventory" | "courier";
type Step = StepId | "done";

const RETURNS_OPTIONS: { value: ReturnsPolicy; label: string }[] = [
  { value: "none", label: "No returns" },
  { value: "exchange", label: "Exchange" },
  { value: "returns", label: "Returns" },
];
const RETURNS_MEANING: Record<ReturnsPolicy, string> = {
  none: "No returns or exchanges.",
  exchange: "Customers can exchange items, but you don't give refunds.",
  returns: "Customers can return and exchange items.",
};
const PAYMENT_OPTIONS: { id: PaymentMethod; label: string }[] = [
  { id: "transfer", label: "Bank transfer" },
  { id: "card", label: "Card" },
  { id: "cod", label: "Pay on delivery" },
];

function YesNo({ legend, value, onChange }: { legend: string; value: boolean | null; onChange: (v: boolean) => void }) {
  return (
    <fieldset>
      <legend className="text-base font-medium text-slate-900">{legend}</legend>
      <div className="mt-3">
        <Segmented
          label={legend}
          options={[{ value: "yes", label: "Yes" }, { value: "no", label: "No" }]}
          value={(value === null ? "" : value ? "yes" : "no") as "yes" | "no"}
          onChange={(v) => onChange(v === "yes")}
        />
      </div>
    </fieldset>
  );
}

export function SetupWizard({ businessId, businessName }: { businessId: string; businessName: string }) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("sells");
  const [sells, setSells] = useState<"fashion" | "other" | null>(null);
  const [fashion, setFashion] = useState<FashionAnswers>(EMPTY_FASHION_ANSWERS);
  const [addedCount, setAddedCount] = useState(0);
  const [starterError, setStarterError] = useState(false);
  const [hasWebsite, setHasWebsite] = useState<boolean | null>(null);
  const [wantsEmail, setWantsEmail] = useState<boolean | null>(null);
  const [tracksInventory, setTracksInventory] = useState<boolean | null>(null);
  const [courier, setCourier] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The fashion questions only appear for fashion stores.
  const STEPS: StepId[] = sells === "fashion" ? ["sells", "fashion", "website", "email", "inventory", "courier"] : ["sells", "website", "email", "inventory", "courier"];
  const stepIndex = step === "done" ? STEPS.length : STEPS.indexOf(step);
  const dashboard = `/portal/${businessId}`;

  const answered: Record<StepId, boolean> = {
    sells: sells !== null,
    // Every fashion question is optional: a blank one simply adds nothing.
    fashion: true,
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

  // Adds the fashion starter answers from what the owner filled in. Best-effort: setup
  // itself is already saved, so a failure here only means the owner adds FAQs by hand.
  async function addStarter(): Promise<void> {
    if (sells !== "fashion" || !hasAnyFashionAnswer(fashion)) return;
    setSaving(true);
    const result = await seedFashionStarter(businessId, fashion);
    setSaving(false);
    setAddedCount(result.added);
    setStarterError(result.error !== null);
  }

  async function next() {
    if (step === "done") return;
    if (stepIndex < STEPS.length - 1) {
      setStep(STEPS[stepIndex + 1]);
      return;
    }
    if (await save()) {
      await addStarter();
      setStep("done");
    }
  }

  // Saves whatever has been answered so far. Skipping is a normal way out:
  // everything here can be changed later in Settings.
  async function skip() {
    if (await save()) {
      await addStarter();
      router.push(dashboard);
    }
  }

  const chosenCourier = COURIER_OPTIONS.find((o) => o.id === courier);

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <PageHeader title={`Let's set up ${businessName}`} subtitle="A few quick questions so Mira starts out knowing your business. You can change any of this later." />

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
          <p className="ui-hint mt-1.5">
            Step {stepIndex + 1} of {STEPS.length}
          </p>
        </div>
      )}

      <section key={step} className="ui-card ui-enter mt-6">
        {step === "sells" && (
          <fieldset>
            <legend className="text-base font-medium text-slate-900">What do you sell?</legend>
            <div className="mt-3">
              <Segmented
                label="What do you sell?"
                options={[{ value: "fashion", label: "Fashion and clothing" }, { value: "other", label: "Something else" }]}
                value={(sells ?? "") as "fashion" | "other"}
                onChange={setSells}
              />
            </div>
            {sells === "fashion" && <p className="ui-hint mt-3">Great. A few quick questions about sizing, delivery and returns come next, so Mira can answer them from day one.</p>}
          </fieldset>
        )}

        {step === "fashion" && (
          <div className="space-y-6">
            <p className="ui-hint">Answer what you can and leave the rest blank. Mira only says what you tell her here, and you can edit all of it later under FAQs and Policies.</p>

            <YesNo legend="Do you make custom or made-to-measure pieces?" value={fashion.madeToMeasure} onChange={(v) => setFashion({ ...fashion, madeToMeasure: v })} />

            <fieldset>
              <legend className="text-base font-medium text-slate-900">What is your returns policy?</legend>
              <div className="mt-3">
                <Segmented
                  label="Returns policy"
                  options={RETURNS_OPTIONS}
                  value={(fashion.returns ?? "") as ReturnsPolicy}
                  onChange={(value) => setFashion({ ...fashion, returns: value, returnDays: value === "none" ? null : fashion.returnDays })}
                />
              </div>
              {fashion.returns && <p className="ui-hint mt-3">{RETURNS_MEANING[fashion.returns]}</p>}
              {(fashion.returns === "exchange" || fashion.returns === "returns") && (
                <label className="mt-3 flex items-center gap-2 text-[15px] text-slate-700">
                  Within
                  <input
                    type="number"
                    min={1}
                    max={MAX_RETURN_DAYS}
                    inputMode="numeric"
                    aria-label="Days after delivery"
                    className="ui-field !w-24"
                    value={fashion.returnDays ?? ""}
                    onChange={(e) => {
                      const n = e.target.value === "" ? null : Math.floor(Number(e.target.value));
                      setFashion({ ...fashion, returnDays: n !== null && n >= 1 && n <= MAX_RETURN_DAYS ? n : null });
                    }}
                  />
                  days of delivery <span className="text-slate-500">(optional)</span>
                </label>
              )}
            </fieldset>

            <div>
              <label htmlFor="fashion-delivery" className="text-base font-medium text-slate-900">How long does delivery take?</label>
              <input
                id="fashion-delivery"
                type="text"
                maxLength={MAX_DELIVERY_NOTE}
                placeholder="e.g. Lagos 1-2 days, other states 3-5 days"
                className="ui-field mt-3"
                value={fashion.deliveryNote}
                onChange={(e) => setFashion({ ...fashion, deliveryNote: e.target.value })}
              />
            </div>

            <fieldset>
              <legend className="text-base font-medium text-slate-900">How do customers pay?</legend>
              <div className="ui-group mt-3">
                {PAYMENT_OPTIONS.map((option) => (
                  <SwitchRow
                    key={option.id}
                    id={`pay-${option.id}`}
                    label={option.label}
                    checked={fashion.payments.includes(option.id)}
                    onChange={(on) => setFashion({ ...fashion, payments: on ? [...fashion.payments, option.id] : fashion.payments.filter((p) => p !== option.id) })}
                  />
                ))}
              </div>
            </fieldset>
          </div>
        )}

        {step === "website" && (
          <div className="space-y-4">
            <YesNo legend="Does your business have a website?" value={hasWebsite} onChange={setHasWebsite} />
            {hasWebsite === true && (
              <div className="space-y-2 border-t border-slate-100 pt-4">
                <p className="ui-hint">
                  Enter your address and Mira will suggest products, services, hours and FAQs from it. Nothing goes live until you confirm.
                </p>
                <WebsiteImport businessId={businessId} embedded />
              </div>
            )}
            {hasWebsite === false && <p className="ui-hint">No problem. If you get a website later you can import from it in Settings.</p>}
          </div>
        )}

        {step === "email" && (
          <div className="space-y-4">
            <YesNo legend="Should Mira reply to your customers' emails too?" value={wantsEmail} onChange={setWantsEmail} />
            {wantsEmail === true && (
              <p className="ui-hint">
                Email replies need a Mira email address set up for your business, which you can&apos;t do yourself yet. We&apos;ve noted that you want it.
              </p>
            )}
            {wantsEmail === false && <p className="ui-hint">Okay. Mira will answer on your website chat (and WhatsApp when it&apos;s connected).</p>}
          </div>
        )}

        {step === "inventory" && (
          <div className="space-y-4">
            <YesNo legend="Do you keep track of how many of each item you have in stock?" value={tracksInventory} onChange={setTracksInventory} />
            {tracksInventory === true && (
              <p className="ui-hint">
                Add a stock number to a product and Mira will use it when answering customers and taking orders. It won&apos;t take an order for more than you have.
              </p>
            )}
            {tracksInventory === false && (
              <p className="ui-hint">No problem. Mira won&apos;t limit orders by stock unless you add a stock number to a product.</p>
            )}
          </div>
        )}

        {step === "courier" && (
          <fieldset>
            <legend className="text-base font-medium text-slate-900">How do you deliver orders?</legend>
            <div role="radiogroup" aria-label="How you deliver orders" className="ui-group mt-3">
              {COURIER_OPTIONS.map((option) => (
                <label key={option.id} className="ui-row justify-between has-[input:focus-visible]:bg-slate-100">
                  <span className="text-[15px] text-slate-900">{option.label}</span>
                  <input type="radio" name="courier" className="sr-only" checked={courier === option.id} onChange={() => setCourier(option.id)} />
                  {courier === option.id && (
                    <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-accent" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10.5l4 4 8-9" /></svg>
                  )}
                </label>
              ))}
            </div>
            {courier !== null && isConnectableCourier(courier) && (
              <p className="ui-hint mt-3">Mira can update your orders automatically when Shiip delivers them. You&apos;ll connect it in Settings once you finish.</p>
            )}
            {chosenCourier && !chosenCourier.connectable && chosenCourier.id !== "self" && (
              <p className="ui-hint mt-3">
                Mira can&apos;t get delivery updates from {chosenCourier.id === "other" ? "other couriers" : chosenCourier.label} yet. We&apos;ve noted it so we know what to build next.
              </p>
            )}
          </fieldset>
        )}

        {step === "done" && (
          <div className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">You&apos;re set up</h2>
            <p className="ui-hint">Mira is ready to answer your customers. You can change any of these answers later in Settings.</p>
            {addedCount > 0 && (
              <p className="ui-hint">
                We added {addedCount} starter {addedCount === 1 ? "answer" : "answers"} from what you told us. Check them under{" "}
                <Link href={`/portal/${businessId}/faqs`} className="font-medium text-accent hover:underline">FAQs</Link> and{" "}
                <Link href={`/portal/${businessId}/policies`} className="font-medium text-accent hover:underline">Policies</Link>.
              </p>
            )}
            {starterError && (
              <p role="alert" className="text-sm text-amber-700">
                We couldn&apos;t add your starter answers just now. You can add them under FAQs and Policies.
              </p>
            )}
            <div className="flex flex-wrap gap-3">
              {isConnectableCourier(courier) && (
                <Link href={`/portal/${businessId}/settings`} className="ui-btn ui-btn-primary">
                  Connect Shiip
                </Link>
              )}
              <Link
                href={dashboard}
                className={isConnectableCourier(courier) ? "ui-btn ui-btn-secondary" : "ui-btn ui-btn-primary"}
              >
                Go to your dashboard
              </Link>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        {step !== "done" && (
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <div className="flex items-center gap-4">
              {stepIndex > 0 && (
                <button type="button" onClick={() => setStep(STEPS[stepIndex - 1])} disabled={saving} className="ui-btn ui-btn-secondary ui-btn-sm">
                  Back
                </button>
              )}
              <button type="button" onClick={() => void skip()} disabled={saving} className="ui-btn ui-btn-plain ui-btn-sm !text-slate-500">
                Skip setup
              </button>
            </div>
            <button
              type="button"
              onClick={() => void next()}
              disabled={saving || !answered[step]}
              className="ui-btn ui-btn-primary"
              aria-busy={saving || undefined}
            >
              {saving ? "Saving..." : stepIndex === STEPS.length - 1 ? "Finish" : "Continue"}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
