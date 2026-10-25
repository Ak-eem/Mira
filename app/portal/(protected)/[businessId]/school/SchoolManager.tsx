"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addClass, addSession, addTerm, deleteClass, deleteSession, deleteStudent, deleteTerm,
  importStudents, saveFee, setCurrentSession, type ImportResult,
} from "./actions";

type Session = { id: string; name: string; start_date: string; end_date: string; is_current: boolean };
type Term = { id: string; academic_session_id: string; name: string; sequence: number; start_date: string; end_date: string };
type SchoolClass = { id: string; name: string; arm: string };
type Fee = { classId: string; termId: string; amount: number };
type Student = { id: string; admission_no: string; full_name: string; class_id: string; guardian_name: string | null; guardian_phone: string | null };

const card = "mb-6 rounded-2xl border border-line bg-surface p-5 shadow-soft";
const input = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink";
const primary = "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-dark disabled:opacity-50";
const subtle = "text-xs text-muted underline-offset-2 hover:text-ink hover:underline";
const fmtDate = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-GB", { timeZone: "UTC", day: "numeric", month: "short", year: "numeric" });

export function SchoolManager(props: {
  businessId: string;
  sessions: Session[];
  terms: Term[];
  classes: SchoolClass[];
  fees: Fee[];
  students: Student[];
  studentTotal: number;
}) {
  const { businessId, sessions, terms, classes, fees, students, studentTotal } = props;
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Runs a server action, shows its error, and refreshes the page data when it worked.
  function run(action: () => Promise<{ error: string | null }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.error) { setError(result.error); return; }
      after?.();
      router.refresh();
    });
  }

  const current = sessions.find((s) => s.is_current) ?? null;
  const currentTerms = current ? terms.filter((t) => t.academic_session_id === current.id) : [];
  const feeAt = (classId: string, termId: string) => fees.find((f) => f.classId === classId && f.termId === termId)?.amount;
  const classById = new Map(classes.map((c) => [c.id, `${c.name} ${c.arm}`]));

  const steps = [
    { done: !!current, label: "Add the current academic session" },
    { done: currentTerms.length > 0, label: "Add its terms" },
    { done: classes.length > 0, label: "Add your classes" },
    { done: fees.length > 0, label: "Set the fees" },
    { done: studentTotal > 0, label: "Import your students" },
  ];
  const nextStep = steps.find((s) => !s.done);

  return (
    <div>
      {error && <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      <section className={card}>
        <h2 className="text-sm font-semibold text-ink">{nextStep ? "Setup" : "Setup complete"}</h2>
        <ul className="mt-2 space-y-1 text-sm">
          {steps.map((s) => (
            <li key={s.label} className={s.done ? "text-muted line-through" : s === nextStep ? "font-medium text-ink" : "text-muted"}>
              {s.done ? "✓" : "○"} {s.label}
            </li>
          ))}
        </ul>
      </section>

      <SessionsSection businessId={businessId} sessions={sessions} terms={terms} run={run} pending={pending} />

      <section className={card}>
        <h2 className="text-sm font-semibold text-ink">Classes</h2>
        <p className="mt-1 text-xs text-muted">Write them the way you say them, e.g. &quot;JSS 1 A&quot;, &quot;Primary 3&quot;. A single letter at the end is the arm.</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {classes.length === 0 && <p className="text-sm text-muted">No classes yet.</p>}
          {classes.map((c) => (
            <span key={c.id} className="inline-flex items-center gap-2 rounded-full border border-line bg-white px-3 py-1 text-sm text-ink">
              {c.name} {c.arm}
              <button type="button" aria-label={`Remove ${c.name} ${c.arm}`} disabled={pending} onClick={() => run(() => deleteClass({ businessId, classId: c.id }))} className="text-muted hover:text-red-600">×</button>
            </span>
          ))}
        </div>
        <AddClassForm onAdd={(label, reset) => run(() => addClass({ businessId, label }), reset)} pending={pending} />
      </section>

      <section className={card}>
        <h2 className="text-sm font-semibold text-ink">Fees per term{current ? ` · ${current.name}` : ""}</h2>
        {!current || currentTerms.length === 0 || classes.length === 0 ? (
          <p className="mt-2 text-sm text-muted">Add the current session, its terms and your classes first.</p>
        ) : (
          <>
            <p className="mt-1 text-xs text-muted">Amount charged per class for each term, in naira. Saves when you leave the box. Clear a box to remove that fee.</p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-muted">
                    <th className="py-2 pr-3 font-medium">Class</th>
                    {currentTerms.map((t) => <th key={t.id} className="py-2 pr-3 font-medium">{t.name}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {classes.map((c) => (
                    <tr key={c.id} className="border-t border-line">
                      <td className="py-2 pr-3 text-ink">{c.name} {c.arm}</td>
                      {currentTerms.map((t) => (
                        <td key={t.id} className="py-1.5 pr-3">
                          <FeeInput
                            key={`${c.id}-${t.id}-${feeAt(c.id, t.id) ?? ""}`}
                            initial={feeAt(c.id, t.id)}
                            onSave={(value) => run(() => saveFee({ businessId, classId: c.id, termId: t.id, amount: value }))}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <StudentsSection businessId={businessId} students={students} total={studentTotal} classById={classById} run={run} pending={pending} />
    </div>
  );
}

function FeeInput({ initial, onSave }: { initial: number | undefined; onSave: (value: string) => void }) {
  const [value, setValue] = useState(initial === undefined ? "" : String(initial));
  return (
    <input
      inputMode="decimal"
      aria-label="Fee amount"
      className={`${input} w-32`}
      placeholder="—"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => { if (value !== (initial === undefined ? "" : String(initial))) onSave(value); }}
    />
  );
}

function AddClassForm({ onAdd, pending }: { onAdd: (label: string, reset: () => void) => void; pending: boolean }) {
  const [label, setLabel] = useState("");
  return (
    <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); onAdd(label, () => setLabel("")); }}>
      <input className={input} placeholder="e.g. JSS 1 A" value={label} onChange={(e) => setLabel(e.target.value)} required />
      <button type="submit" disabled={pending} className={`${primary} shrink-0`}>Add class</button>
    </form>
  );
}

type Run = (action: () => Promise<{ error: string | null }>, after?: () => void) => void;

function SessionsSection({ businessId, sessions, terms, run, pending }: { businessId: string; sessions: Session[]; terms: Term[]; run: Run; pending: boolean }) {
  const [name, setName] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");

  return (
    <section className={card}>
      <h2 className="text-sm font-semibold text-ink">Academic calendar</h2>
      <p className="mt-1 text-xs text-muted">Mira uses the session marked current to answer questions about term dates and fees.</p>

      <div className="mt-3 space-y-4">
        {sessions.length === 0 && <p className="text-sm text-muted">No sessions yet.</p>}
        {sessions.map((s) => (
          <div key={s.id} className="rounded-xl border border-line bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-ink">{s.name}</p>
              {s.is_current && <span className="rounded-full bg-marigold px-2 py-0.5 text-[11px] font-semibold text-ink">Current</span>}
              <span className="text-xs text-muted">{fmtDate(s.start_date)} – {fmtDate(s.end_date)}</span>
              <span className="ml-auto flex gap-3">
                {!s.is_current && <button type="button" className={subtle} disabled={pending} onClick={() => run(() => setCurrentSession({ businessId, sessionId: s.id }))}>Make current</button>}
                <button type="button" className={`${subtle} hover:text-red-600`} disabled={pending} onClick={() => { if (confirm(`Delete ${s.name}, its terms and their fees?`)) run(() => deleteSession({ businessId, sessionId: s.id })); }}>Delete</button>
              </span>
            </div>
            <ul className="mt-2 space-y-1 text-sm">
              {terms.filter((t) => t.academic_session_id === s.id).map((t) => (
                <li key={t.id} className="flex items-center gap-2 text-ink">
                  <span>{t.name}</span>
                  <span className="text-xs text-muted">{fmtDate(t.start_date)} – {fmtDate(t.end_date)}</span>
                  <button type="button" aria-label={`Delete ${t.name}`} className="ml-auto text-muted hover:text-red-600" disabled={pending} onClick={() => run(() => deleteTerm({ businessId, termId: t.id }))}>×</button>
                </li>
              ))}
            </ul>
            <AddTermForm onAdd={(f, reset) => run(() => addTerm({ businessId, sessionId: s.id, ...f }), reset)} pending={pending} />
          </div>
        ))}
      </div>

      <form
        className="mt-4 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]"
        onSubmit={(e) => { e.preventDefault(); run(() => addSession({ businessId, name, startDate: start, endDate: end, makeCurrent: sessions.length === 0 || !sessions.some((s) => s.is_current) }), () => { setName(""); setStart(""); setEnd(""); }); }}
      >
        <input className={input} placeholder="New session, e.g. 2026/2027" value={name} onChange={(e) => setName(e.target.value)} required />
        <input type="date" aria-label="Session start" className={input} value={start} onChange={(e) => setStart(e.target.value)} required />
        <input type="date" aria-label="Session end" className={input} value={end} onChange={(e) => setEnd(e.target.value)} required />
        <button type="submit" disabled={pending} className={primary}>Add session</button>
      </form>
    </section>
  );
}

function AddTermForm({ onAdd, pending }: { onAdd: (f: { name: string; startDate: string; endDate: string }, reset: () => void) => void; pending: boolean }) {
  const [name, setName] = useState("");
  const [startDate, setStart] = useState("");
  const [endDate, setEnd] = useState("");
  return (
    <form className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]" onSubmit={(e) => { e.preventDefault(); onAdd({ name, startDate, endDate }, () => { setName(""); setStart(""); setEnd(""); }); }}>
      <input className={input} placeholder="Add a term, e.g. First Term" value={name} onChange={(e) => setName(e.target.value)} required />
      <input type="date" aria-label="Term start" className={input} value={startDate} onChange={(e) => setStart(e.target.value)} required />
      <input type="date" aria-label="Term end" className={input} value={endDate} onChange={(e) => setEnd(e.target.value)} required />
      <button type="submit" disabled={pending} className={primary}>Add term</button>
    </form>
  );
}

function StudentsSection({ businessId, students, total, classById, run, pending }: { businessId: string; students: Student[]; total: number; classById: Map<string, string>; run: Run; pending: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [importing, startImport] = useTransition();
  const [filter, setFilter] = useState("");

  function handleImport() {
    startImport(async () => {
      const r = await importStudents({ businessId, text });
      setResult(r);
      if (!r.error) setText("");
      if (r.imported > 0) router.refresh();
    });
  }

  const q = filter.trim().toLowerCase();
  const shown = q ? students.filter((s) => s.full_name.toLowerCase().includes(q) || s.admission_no.toLowerCase().includes(q)) : students;

  return (
    <section className={card}>
      <h2 className="text-sm font-semibold text-ink">Students{total > 0 ? ` (${total})` : ""}</h2>
      <p className="mt-1 text-xs text-muted">
        Paste rows from a spreadsheet, one student per line: admission number, name, class, guardian name, guardian phone, guardian email (the last three are optional). Classes that don&apos;t exist yet are created. Importing an admission number again updates that student.
        On WhatsApp, a parent messaging from their registered number is shown their own child&apos;s class and fee schedule — never anyone else&apos;s. Mira does not yet know whether a fee has been paid.
      </p>
      <textarea
        className={`${input} mt-3 font-mono`}
        rows={5}
        placeholder={"A001, Ada Obi, JSS 1 A, Mrs Obi, 08031234567, obi@example.com\nA002, Tunde Bello, Primary 3"}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <button type="button" className={`${primary} mt-2`} disabled={importing || !text.trim()} onClick={handleImport}>{importing ? "Importing…" : "Import students"}</button>

      {result && (
        <div className="mt-3 space-y-2 text-sm" role="status">
          {result.error && <p className="text-red-700">{result.error}</p>}
          {result.imported > 0 && <p className="text-ink">Imported {result.imported} student{result.imported === 1 ? "" : "s"}{result.createdClasses.length > 0 ? `, and created ${result.createdClasses.join(", ")}` : ""}.</p>}
          {result.rowErrors.length > 0 && (
            <div className="rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-amber-900">
              <p className="font-medium">{result.rowErrors.length} row{result.rowErrors.length === 1 ? " was" : "s were"} skipped:</p>
              <ul className="mt-1 list-disc pl-5">
                {result.rowErrors.slice(0, 20).map((e) => <li key={`${e.line}-${e.message}`}>Line {e.line}: {e.message}</li>)}
              </ul>
              {result.rowErrors.length > 20 && <p className="mt-1">…and {result.rowErrors.length - 20} more.</p>}
            </div>
          )}
        </div>
      )}

      {total > 0 && (
        <div className="mt-5">
          <input className={input} placeholder="Search by name or admission number" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Search students" />
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead><tr className="text-left text-xs text-muted"><th className="py-2 pr-3 font-medium">Adm. no</th><th className="py-2 pr-3 font-medium">Name</th><th className="py-2 pr-3 font-medium">Class</th><th className="py-2 pr-3 font-medium">Guardian</th><th /></tr></thead>
              <tbody>
                {shown.map((s) => (
                  <tr key={s.id} className="border-t border-line">
                    <td className="py-2 pr-3 text-muted">{s.admission_no}</td>
                    <td className="py-2 pr-3 text-ink">{s.full_name}</td>
                    <td className="py-2 pr-3 text-ink">{classById.get(s.class_id) ?? "—"}</td>
                    <td className="py-2 pr-3 text-muted">{[s.guardian_name, s.guardian_phone].filter(Boolean).join(" · ") || "—"}</td>
                    <td className="py-2 text-right"><button type="button" className={`${subtle} hover:text-red-600`} disabled={pending} onClick={() => { if (confirm(`Remove ${s.full_name}?`)) run(() => deleteStudent({ businessId, studentId: s.id })); }}>Remove</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {total > students.length && <p className="mt-2 text-xs text-muted">Showing the first {students.length} of {total}. Use search to narrow down within these.</p>}
          {shown.length === 0 && <p className="mt-2 text-sm text-muted">No students match.</p>}
        </div>
      )}
    </section>
  );
}
