import { Head, Link, usePage } from "@inertiajs/react";
import type { SharedProps } from "../../lib/types";

export default function Home() {
  const { brand } = usePage<SharedProps>().props;

  return (
    <div className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center px-6">
      <Head title="Point of sale that never stops" />
      <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
        {brand.name}
      </h1>
      <p className="mt-4 max-w-lg text-lg text-muted">{brand.tagline}</p>
      <div className="mt-8">
        <Link
          href="/register"
          className="inline-block rounded-lg bg-brand-500 px-5 py-3 font-medium text-white transition hover:bg-brand-600"
        >
          Start your free trial
        </Link>
      </div>
    </div>
  );
}
