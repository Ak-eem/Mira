export default function Home() {
  return (
    <main className="flex min-h-screen items-center justify-center">
      <p className="text-sm text-slate-500">
        Mira — see{" "}
        <a href="/admin" className="text-accent underline">
          /admin
        </a>{" "}
        to manage businesses.
      </p>
    </main>
  );
}
