import { BRAND } from "@/lib/brand";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl p-16">
      <h1 className="text-4xl">{BRAND.name}</h1>
      <p className="mt-4">{BRAND.tagline}</p>
      <footer className="mt-16 text-sm opacity-70">{BRAND.legalLine}</footer>
    </main>
  );
}
