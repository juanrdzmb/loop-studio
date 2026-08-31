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
  highlight?: boolean;
}

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dual-studio",
    label: "Dual Studio 16:9 + 9:16",
    shortLabel: "Dual Studio",
    icon: "⚡",
    badge: "16:9 + 9:16",
    highlight: true,
  },
  {
    href: "/edit-studio",
    label: "Edit Studio multiclip",
    shortLabel: "Edit Studio",
    icon: "✂️",
  },
  {
    href: "/",
    label: "GIF Studio",
    shortLabel: "GIF Studio",
    icon: "🌀",
  },
];

export function HeaderNav() {
  const pathname = usePathname();

  return (
    <header className="border-b border-zinc-800 bg-zinc-950/90 backdrop-blur-md sticky top-0 z-50">
      <nav className="max-w-7xl mx-auto px-2 sm:px-4 h-16 flex items-center justify-between gap-2">
        {/* Brand Logo */}
        <Link href="/" className="flex items-center gap-2 group shrink-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-fuchsia-600 to-pink-500 flex items-center justify-center text-white text-base sm:text-lg shadow-lg shadow-fuchsia-950/50 group-hover:scale-105 transition-transform">
            🌀
          </div>
          <div className="flex flex-col">
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

            if (item.highlight) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`px-2 sm:px-3 py-1.5 rounded-xl font-semibold transition-all flex items-center gap-1 sm:gap-1.5 shrink-0 shadow-sm text-[11px] sm:text-xs ${
                    isActive
                      ? "bg-gradient-to-r from-fuchsia-600 to-pink-600 text-white shadow-fuchsia-900/60 ring-1 ring-fuchsia-400/50"
                      : "bg-fuchsia-950/40 border border-fuchsia-800/50 text-fuchsia-300 hover:bg-fuchsia-900/60 hover:text-white"
                  }`}
                >
                  <span>{item.icon}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                  <span className="sm:hidden inline">{item.shortLabel || item.label}</span>
                  {item.badge && (
                    <span className="px-1.5 py-0.2 text-[8px] sm:text-[9px] font-extrabold uppercase rounded bg-fuchsia-400 text-zinc-950 hidden md:inline">
                      {item.badge}
                    </span>
                  )}
                </Link>
              );
            }

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-2 sm:px-2.5 py-1.5 rounded-xl transition-all flex items-center gap-1 sm:gap-1.5 shrink-0 text-[11px] sm:text-xs ${
                  isActive
                    ? "bg-zinc-800 text-white font-semibold ring-1 ring-zinc-700 shadow"
                    : "text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900"
                }`}
              >
                <span>{item.icon}</span>
                <span className="hidden md:inline">{item.label}</span>
                <span className="md:hidden inline">{item.shortLabel || item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </header>
  );
}
