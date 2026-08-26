import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Loop Studio — GIFs con loop perfecto y slowed + reverb",
  description:
    "Recorta videos, crea GIFs pixel art con loop perfecto, aplica slowed + reverb y combina todo en un MP4. 100% en tu navegador.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-100">
        <header className="border-b border-zinc-800 bg-zinc-900/80 backdrop-blur sticky top-0 z-50">
          <nav className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="font-bold text-lg tracking-tight">
              🌀 Loop<span className="text-fuchsia-400">Studio</span>
            </Link>
            <div className="flex gap-1 text-sm">
              <Link
                href="/"
                className="px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                GIF Studio
              </Link>
              <Link
                href="/slowed-reverb"
                className="px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                Slowed + Reverb
              </Link>
              <Link
                href="/combinar"
                className="px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                Combinar → MP4
              </Link>
              <Link
                href="/video-loop"
                className="px-3 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
              >
                Video + Canción
              </Link>
            </div>
          </nav>
        </header>
        <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8">{children}</main>
        <footer className="text-center text-xs text-zinc-500 py-4 border-t border-zinc-900">
          Todo se procesa localmente en tu navegador · Sin subidas a servidores
        </footer>
      </body>
    </html>
  );
}
