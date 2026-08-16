import Link from "next/link";

export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <p className="text-sm text-slate-500">
          Mira — see{" "}
          <a href="/admin" className="text-accent underline">
            /admin
          </a>{" "}
          to manage businesses.
        </p>
        <Link
          href="/portal/signup"
          className="mt-6 inline-flex items-center justify-center rounded bg-accent px-4 py-2 text-sm font-medium text-white transition hover:bg-accent-dark"
        >
          Create account
        </Link>
      </div>
    </main>
  );
}
