import Image from "next/image";
import Link from "next/link";

const footerLinks = [
  { href: "/about", label: "About" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/how-battles-work", label: "Battles" },
  { href: "/faq", label: "FAQ" },
  { href: "/explore/tournaments", label: "Tournaments" },
  { href: "/terms", label: "Terms" },
  { href: "/privacy", label: "Privacy" },
];

export default function PublicSiteFooter() {
  return (
    <footer className="border-t border-slate-800 bg-[#050d15] px-4 py-6 sm:px-8 lg:px-10">
      <div className="mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Link href="/" className="flex items-center gap-2 text-slate-200">
          <Image src="/logo-badge.png" alt="" width={28} height={28} className="h-7 w-7" />
          <span className="text-xs font-bold sm:text-sm">Crazy Chess Battles</span>
        </Link>
        <nav className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-400 sm:gap-x-5" aria-label="Footer navigation">
          {footerLinks.map(({ href, label }) => <Link key={href} href={href} className="transition hover:text-emerald-300">{label}</Link>)}
        </nav>
        <span className="text-[10px] text-slate-500">© {new Date().getFullYear()} Crazy Chess Battles</span>
      </div>
    </footer>
  );
}
