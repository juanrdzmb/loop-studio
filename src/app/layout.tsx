import type { Metadata } from "next";
import { HeaderNav } from "@/components/HeaderNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loop Studio — Loops y Shorts 100% locales",
  description:
    "Crea loops continuos en 16:9 y 9:16, monta Shorts multiclip al beat y exporta en alta calidad. Todo se procesa localmente en tu navegador.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 selection:bg-fuchsia-600 selection:text-white">
        <a
          href="#contenido-principal"
          className="sr-only z-[60] bg-white px-4 py-3 font-bold text-zinc-950 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Saltar al contenido
        </a>
        <HeaderNav />
        <main
          id="contenido-principal"
          tabIndex={-1}
          className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 focus:outline-none"
        >
          {children}
        </main>
        <footer className="text-center text-xs text-zinc-500 py-6 border-t border-zinc-900 flex flex-col items-center gap-1">
          <p className="font-medium text-zinc-400">
            Loop Studio · Dual Studio · Edit Studio · Herramientas de audio y GIF
          </p>
          <p className="text-[11px] text-zinc-600">
            Todo se procesa 100% local en tu equipo con aceleración gráfica GPU.
          </p>
        </footer>
      </body>
    </html>
  );
}
