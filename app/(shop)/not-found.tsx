import Link from "next/link";

export default function NotFound() {
  return (
    <div className="space-y-3 text-center">
      <h1 className="text-4xl font-semibold">Not found</h1>
      <p className="text-black/60">That page or product does not exist in this demo catalog.</p>
      <Link href="/" className="text-primary underline">Back to the home page</Link>
    </div>
  );
}
