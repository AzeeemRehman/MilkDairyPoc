import Link from "next/link";

export default function Forbidden() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="card max-w-md p-6 text-center">
        <h1 className="text-lg font-semibold">Not allowed</h1>
        <p className="mt-2 text-sm text-slate-600">Your role does not have access to this page.</p>
        <Link href="/" className="btn-primary mt-4">
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
