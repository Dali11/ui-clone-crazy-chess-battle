"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { BarChart3, Home, Menu, Radio, Swords, Trophy, Users, X } from "lucide-react";

const links = [
  { href: "/", label: "Home", icon: Home },
  { href: "/explore/play", label: "Play", icon: Swords },
  { href: "/explore/battles", label: "Battles", icon: Radio },
  { href: "/explore/tournaments", label: "Tournaments", icon: Trophy },
  { href: "/explore/leaderboards", label: "Leaderboards", icon: BarChart3 },
  { href: "/about", label: "About", icon: Users },
];

export default function PublicHomeNav({ signupUrl }: { signupUrl: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-700/70 bg-[#06111c]/95 shadow-[0_8px_24px_rgba(0,0,0,.18)] backdrop-blur-xl">
        <div className="mx-auto flex h-[66px] max-w-[1400px] items-center justify-between gap-3 px-4 sm:h-[74px] sm:px-7 lg:px-9">
          <Link href="/" className="flex min-w-0 items-center gap-2.5" aria-label="Crazy Chess Battles home">
            <Image src="/logo-badge.png" alt="" width={42} height={42} priority className="h-9 w-9 shrink-0 sm:h-10 sm:w-10" />
            <span className="leading-none">
              <span className="block whitespace-nowrap text-[15px] font-black uppercase tracking-tight text-white sm:text-lg">Crazy <b className="text-amber-300">Chess</b></span>
              <span className="mt-1 block text-center text-[8px] font-bold uppercase tracking-[.38em] text-slate-300 sm:text-[9px]">Battles</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label="Main navigation">
            {links.map(({ href, label }) => {
              const active = pathname === href;
              return <Link key={href} href={href} aria-current={active ? "page" : undefined} className={`relative rounded-md px-3 py-2 text-[13px] font-semibold transition ${active ? "text-emerald-300 after:absolute after:inset-x-2 after:-bottom-[9px] after:h-[2px] after:bg-emerald-400 after:shadow-[0_0_10px_rgba(52,211,153,.7)]" : "text-slate-300 hover:bg-white/5 hover:text-white"}`}>{label}</Link>;
            })}
          </nav>

          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <Link href="/login" className="hidden min-h-10 items-center justify-center rounded-lg border border-slate-600 px-4 text-sm font-semibold text-white transition hover:border-slate-400 hover:bg-white/5 sm:inline-flex">Log in</Link>
            <Link href={signupUrl} className="hidden min-h-10 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-500 px-4 text-xs font-black uppercase tracking-wide text-slate-950 shadow-[0_0_18px_rgba(16,230,143,.22)] transition hover:brightness-110 sm:inline-flex sm:px-5 sm:text-sm">Sign up</Link>
            <button type="button" onClick={() => setOpen(true)} className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 text-white transition hover:bg-white/5 lg:hidden" aria-label="Open navigation menu" aria-expanded={open}>
              <Menu className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)}>
          <aside className="ml-auto flex h-full w-[min(86vw,370px)] flex-col border-l border-slate-700 bg-[#06111c] p-5 shadow-2xl" onClick={(event) => event.stopPropagation()} aria-label="Mobile navigation">
            <div className="flex items-center justify-between border-b border-slate-800 pb-5">
              <Link href="/" onClick={() => setOpen(false)} className="flex items-center gap-2.5"><Image src="/logo-badge.png" alt="" width={38} height={38} className="h-9 w-9" /><span className="text-sm font-black uppercase text-white">Crazy <b className="text-amber-300">Chess</b><small className="mt-1 block text-[8px] tracking-[.35em] text-slate-300">BATTLES</small></span></Link>
              <button type="button" onClick={() => setOpen(false)} className="flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/5" aria-label="Close navigation menu"><X className="h-5 w-5" /></button>
            </div>
            <nav className="flex-1 py-4" aria-label="Mobile navigation links">
              {links.map(({ href, label, icon: Icon }) => {
                const active = pathname === href;
                return <Link key={href} href={href} onClick={() => setOpen(false)} aria-current={active ? "page" : undefined} className={`flex items-center gap-3 rounded-lg px-3 py-3.5 text-sm font-semibold transition ${active ? "bg-emerald-400/10 text-emerald-300" : "text-slate-200 hover:bg-white/5 hover:text-white"}`}>
                  <Icon className="h-5 w-5" />{label}
                </Link>;
              })}
            </nav>
            <div className="grid gap-2 border-t border-slate-800 pt-5">
              <Link href="/login" onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center justify-center rounded-lg border border-slate-600 text-sm font-bold text-white">Log in</Link>
              <Link href={signupUrl} onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center justify-center rounded-lg bg-gradient-to-r from-emerald-400 to-emerald-500 text-sm font-black uppercase text-slate-950">Create account</Link>
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
