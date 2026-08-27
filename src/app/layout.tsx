import type { Metadata } from "next";
import { HeaderNav } from "@/components/HeaderNav";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loop Studio — Perfect Loops, Manga Motion 2.5D & Audio VFX",
  description:
    "Crea animaciones y loops continuos, Manga Motion 2.5D, efectos Slowed + Reverb y exporta en MP4 HD 60 FPS. 100% en tu navegador y local.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" className="h-full antialiased dark">
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100 selection:bg-fuchsia-600 selection:text-white">
        <HeaderNav />
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">{children}</main>
        <footer className="text-center text-xs text-zinc-500 py-6 border-t border-zinc-900 flex flex-col items-center gap-1">
          <p className="font-medium text-zinc-400">
            Loop Studio · GIF Studio · Slowed+Reverb · Video+Song · Manga Motion 2.5D
          </p>
          <p className="text-[11px] text-zinc-600">
            Todo se procesa 100% local en tu equipo con aceleración gráfica GPU.
          </p>
        </footer>
      </body>
    </html>
  );
}
