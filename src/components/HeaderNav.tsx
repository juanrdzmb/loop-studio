"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface NavItem {
  href: string;
  label: string;
  shortLabel?: string;
  icon: string;
  badge?: string;
  tone: "fuchsia" | "cyan" | "violet";
}

const NAV_TONES = {
  fuchsia: {
    active: "border-fuchsia-400/60 bg-fuchsia-500/15 text-fuchsia-100 shadow-[inset_0_-2px_0_rgba(232,121,249,0.95),0_8px_24px_rgba(112,26,117,0.18)]",
    idle: "border-fuchsia-900/60 bg-fuchsia-950/20 text-fuchsia-300 hover:border-fuchsia-700/80 hover:bg-fuchsia-950/50 hover:text-fuchsia-100",
    icon: "bg-fuchsia-400/15 text-fuchsia-200",
    badge: "bg-fuchsia-300 text-fuchsia-950",
  },
  cyan: {
    active: "border-cyan-400/60 bg-cyan-400/12 text-cyan-100 shadow-[inset_0_-2px_0_rgba(34,211,238,0.95),0_8px_24px_rgba(8,145,178,0.14)]",
    idle: "border-cyan-950/80 bg-cyan-950/10 text-cyan-300/75 hover:border-cyan-800/80 hover:bg-cyan-950/35 hover:text-cyan-100",
    icon: "bg-cyan-400/12 text-cyan-200",
    badge: "bg-cyan-300 text-cyan-950",
  },
  violet: {
    active: "border-violet-400/60 bg-violet-400/12 text-violet-100 shadow-[inset_0_-2px_0_rgba(167,139,250,0.95),0_8px_24px_rgba(91,33,182,0.14)]",
    idle: "border-violet-950/80 bg-violet-950/10 text-violet-300/75 hover:border-violet-800/80 hover:bg-violet-950/35 hover:text-violet-100",
    icon: "bg-violet-400/12 text-violet-200",
    badge: "bg-violet-300 text-violet-950",
  },
} as const;

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dual-studio",
    label: "Dual Studio 16:9 + 9:16",
    shortLabel: "Dual Studio",
    icon: "⚡",
    badge: "16:9 + 9:16",
    tone: "fuchsia",
  },
  {
    href: "/edit-studio",
    label: "Edit Studio multiclip",
    shortLabel: "Edit Studio",
    icon: "✂️",
    tone: "cyan",
  },
  {
    href: "/gif-studio",
    label: "GIF Studio",
    shortLabel: "GIF",
    icon: "🌀",
    tone: "violet",
  },
];

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-800/90 bg-zinc-950/92 shadow-[0_10px_35px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <nav aria-label="Navegación principal" className="max-w-7xl mx-auto px-2 sm:px-4 h-16 flex items-center justify-between gap-2">
        {/* Brand Logo */}
        <Link
          href="/"
          aria-label="Inicio de Loop Studio"
          aria-current={pathname === "/" ? "page" : undefined}
          className="flex items-center gap-2 group shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400"
        >
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-fuchsia-600 to-pink-500 flex items-center justify-center text-white text-base sm:text-lg shadow-lg shadow-fuchsia-950/50 group-hover:scale-105 transition-transform">
            🌀
          </div>
          <div className="hidden flex-col min-[430px]:flex">
            <span className="font-bold text-sm sm:text-base tracking-tight text-white flex items-center gap-1">
              Loop<span className="text-fuchsia-400">Studio</span>
            </span>
            <span className="text-[9px] sm:text-[10px] text-zinc-500 font-mono -mt-0.5 hidden xs:inline">100% Local</span>
          </div>
        </Link>

        {/* Navigation Tabs - Responsive Grid/Flex without horizontal scroll */}
        <div className="flex items-center gap-1 sm:gap-1.5 text-xs">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href;
            const tone = NAV_TONES[item.tone];

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={`group flex min-h-10 shrink-0 items-center gap-1.5 rounded-lg border px-2 py-1.5 text-xs font-bold tracking-tight transition-colors sm:px-2.5 ${isActive ? tone.active : tone.idle}`}
              >
                <span aria-hidden="true" className={`grid h-6 w-6 place-items-center rounded-md text-[12px] ${tone.icon}`}>{item.icon}</span>
                <span className="hidden md:inline">{item.label}</span>
                <span className="md:hidden inline">{item.shortLabel || item.label}</span>
                {item.badge && (
                  <span className={`hidden rounded px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wide lg:inline ${tone.badge}`}>
                    {item.badge}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
