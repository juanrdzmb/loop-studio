import Link from "next/link";

const UTILITY_TOOLS = [
  {
    href: "/gif-studio",
    index: "A",
    name: "GIF Studio",
    description: "Recorte, pixel art y loops ligeros listos para compartir.",
    output: "GIF",
  },
  {
    href: "/slowed-reverb",
    index: "B",
    name: "Slowed + Reverb",
    description: "Diseña el tratamiento de una canción y expórtalo por separado.",
    output: "WAV / MP3",
  },
  {
    href: "/combinar",
    index: "C",
    name: "Combinar",
    description: "Une un GIF o vídeo ya preparado con su master de audio.",
    output: "MP4",
  },
  {
    href: "/manga-motion",
    index: "D",
    name: "Manga Motion Lab",
    description: "Control manual de cámara, tipografía manga y capas 2.5D.",
    output: "MP4",
  },
] as const;

function Arrow({ className = "" }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      fill="none"
      className={`h-4 w-4 ${className}`}
    >
      <path d="M4 10h11M11 6l4 4-4 4" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function WorkflowLink({
  href,
  mode,
  title,
  description,
  steps,
  accent,
  primary = false,
}: {
  href: string;
  mode: string;
  title: string;
  description: string;
  steps: readonly string[];
  accent: "fuchsia" | "cyan";
  primary?: boolean;
}) {
  const accentClasses =
    accent === "fuchsia"
      ? "text-fuchsia-300 border-fuchsia-500/50 group-hover:border-fuchsia-400"
      : "text-cyan-300 border-cyan-500/50 group-hover:border-cyan-400";

  return (
    <Link
      href={href}
      className={`group relative grid overflow-hidden border bg-zinc-950 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 motion-reduce:transition-none lg:grid-cols-[0.72fr_1.28fr] ${
        primary
          ? "border-fuchsia-900/70 hover:border-fuchsia-600 focus-visible:ring-fuchsia-400"
          : "border-zinc-800 hover:border-cyan-700 focus-visible:ring-cyan-400"
      }`}
    >
      <div className="flex min-h-44 flex-col justify-between border-b border-zinc-800/80 p-5 sm:p-6 lg:border-r lg:border-b-0">
        <span className={`w-fit border px-2 py-1 font-mono text-[10px] font-bold tracking-[0.18em] ${accentClasses}`}>
          {mode}
        </span>
        <div>
          <h3 className="text-2xl font-black tracking-[-0.035em] text-white sm:text-3xl">{title}</h3>
          <span
            className={`mt-3 inline-flex items-center gap-2 text-sm font-bold ${
              accent === "fuchsia" ? "text-fuchsia-300" : "text-cyan-300"
            }`}
          >
            Abrir estudio
            <Arrow className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
          </span>
        </div>
      </div>

      <div className="flex flex-col justify-between gap-7 p-5 sm:p-6">
        <p className="max-w-xl text-sm leading-6 text-zinc-300 sm:text-base">{description}</p>
        <ol className="grid grid-cols-3 gap-2" aria-label={`Flujo de ${title}`}>
          {steps.map((step, index) => (
            <li key={step} className="border-t border-zinc-700 pt-2">
              <span className="font-mono text-[9px] text-zinc-600">0{index + 1}</span>
              <span className="mt-1 block text-xs font-semibold text-zinc-300 sm:text-sm">{step}</span>
            </li>
          ))}
        </ol>
      </div>
    </Link>
  );
}

export default function HomePage() {
  return (
    <div className="space-y-16 pb-8 sm:space-y-20">
      <section
        aria-labelledby="home-title"
        className="relative isolate overflow-hidden border border-zinc-800 bg-zinc-950"
      >
        <div
          aria-hidden="true"
          className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_17%_10%,rgba(192,38,211,0.17),transparent_34%),radial-gradient(circle_at_82%_68%,rgba(8,145,178,0.12),transparent_31%)]"
        />

        <div className="grid lg:grid-cols-[1.04fr_0.96fr]">
          <div className="flex flex-col justify-center border-b border-zinc-800 p-6 sm:p-9 lg:min-h-[540px] lg:border-r lg:border-b-0 lg:p-11">
            <div className="mb-7 flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-2 font-mono text-[10px] font-bold tracking-[0.2em] text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_14px_rgba(52,211,153,0.9)]" />
                FLUJO CREATIVO LOCAL
              </span>
              <span className="h-px w-10 bg-zinc-700" aria-hidden="true" />
              <span className="font-mono text-[10px] text-zinc-600">SIN NUBE / SIN CUENTA</span>
            </div>

            <h1
              id="home-title"
              className="max-w-3xl text-4xl font-black leading-[0.96] tracking-[-0.055em] text-white sm:text-5xl lg:text-6xl"
            >
              Haz que un clip se sienta <span className="text-fuchsia-300">dirigido</span>, no repetido.
            </h1>
            <p className="mt-6 max-w-2xl text-sm leading-6 text-zinc-300 sm:text-base sm:leading-7">
              Crea loops continuos en dos formatos o monta un Short multiclip al beat. Previsualización, audio y exportación viven en la misma mesa y se procesan en tu navegador.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/dual-studio"
                className="inline-flex min-h-12 items-center justify-between gap-5 bg-fuchsia-500 px-5 text-sm font-black text-zinc-950 transition-colors hover:bg-fuchsia-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 motion-reduce:transition-none"
              >
                Crear loop en dos formatos <Arrow />
              </Link>
              <Link
                href="/edit-studio"
                className="inline-flex min-h-12 items-center justify-between gap-5 border border-zinc-700 bg-zinc-900/70 px-5 text-sm font-bold text-white transition-colors hover:border-cyan-500 hover:text-cyan-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950 motion-reduce:transition-none"
              >
                Montar un Short <Arrow />
              </Link>
            </div>

            <dl className="mt-10 grid grid-cols-2 gap-x-5 gap-y-4 border-t border-zinc-800 pt-5 sm:grid-cols-4">
              {[
                ["Privacidad", "Sin subidas"],
                ["Calidad", "Hasta 4K"],
                ["Audio", "48 kHz"],
                ["Companion", "Opcional"],
              ].map(([term, value]) => (
                <div key={term}>
                  <dt className="font-mono text-[9px] uppercase tracking-[0.16em] text-zinc-600">{term}</dt>
                  <dd className="mt-1 text-xs font-bold text-zinc-300">{value}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div
            className="relative min-h-[390px] overflow-hidden bg-black/35 p-5 sm:min-h-[470px] sm:p-8 lg:min-h-[540px]"
            aria-hidden="true"
          >
            <div className="flex items-center justify-between border-b border-zinc-800 pb-3 font-mono text-[9px] tracking-[0.16em] text-zinc-600">
              <span>MONITOR DE SALIDA</span>
              <span>TC 00:00:18:12</span>
            </div>

            <div className="absolute top-[18%] left-[8%] w-[72%] border border-zinc-700 bg-zinc-950 p-2 shadow-2xl shadow-black">
              <div className="aspect-video overflow-hidden border border-zinc-800 bg-[linear-gradient(135deg,#18181b_0%,#09090b_48%,#3f0b32_100%)]">
                <div className="relative h-full w-full">
                  <div className="absolute inset-x-[8%] top-[13%] h-px bg-white/15" />
                  <div className="absolute top-[18%] left-[13%] h-[64%] w-[34%] skew-x-[-8deg] border border-fuchsia-400/30 bg-fuchsia-950/45" />
                  <div className="absolute right-[12%] bottom-[15%] h-[49%] w-[31%] border border-zinc-500/40 bg-black/50" />
                  <div className="absolute right-[8%] bottom-[9%] font-mono text-[8px] tracking-[0.15em] text-zinc-400">
                    MASTER 16:9
                  </div>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between font-mono text-[8px] text-zinc-600">
                <span>CONTINUIDAD NATURAL</span>
                <span>2560×1440</span>
              </div>
            </div>

            <div className="absolute top-[10%] right-[7%] w-[29%] border border-fuchsia-500/60 bg-zinc-950 p-1.5 shadow-[-18px_18px_45px_rgba(0,0,0,0.75)] sm:w-[27%]">
              <div className="aspect-[9/16] overflow-hidden border border-zinc-800 bg-[linear-gradient(160deg,#09090b_5%,#1f1824_47%,#083344_100%)]">
                <div className="relative h-full w-full">
                  <div className="absolute inset-y-0 left-1/2 w-px bg-cyan-300/15" />
                  <div className="absolute top-[16%] left-[14%] h-[37%] w-[72%] -rotate-3 border border-cyan-300/25 bg-cyan-950/30" />
                  <div className="absolute inset-x-[14%] bottom-[13%] border-y border-white/20 py-1 text-center font-mono text-[6px] tracking-[0.12em] text-zinc-300">
                    CORTE 9:16
                  </div>
                </div>
              </div>
            </div>

            <div className="absolute right-[7%] bottom-[8%] left-[8%] border border-zinc-800 bg-zinc-950/95 p-3">
              <div className="mb-3 flex justify-between font-mono text-[8px] tracking-[0.12em] text-zinc-600">
                <span>VÍDEO / AUDIO / SFX</span>
                <span>18.4 S</span>
              </div>
              <div className="relative space-y-1.5 overflow-hidden">
                <div className="grid h-3 grid-cols-[1.3fr_0.65fr_1fr_0.8fr] gap-1">
                  <span className="bg-fuchsia-500/45" />
                  <span className="bg-zinc-700" />
                  <span className="bg-cyan-700/70" />
                  <span className="bg-zinc-800" />
                </div>
                <div className="h-2 bg-[repeating-linear-gradient(90deg,rgba(34,211,238,0.55)_0_2px,transparent_2px_5px)] opacity-70" />
                <div className="h-1.5 bg-[repeating-linear-gradient(90deg,rgba(244,244,245,0.35)_0_1px,transparent_1px_7px)]" />
                <span className="absolute top-0 bottom-0 left-[62%] w-px bg-fuchsia-300 shadow-[0_0_9px_rgba(240,171,252,0.85)]" />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section aria-labelledby="workflow-title" className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-[0.72fr_1.28fr] sm:items-end">
          <div>
            <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-fuchsia-300">ELIGE POR MATERIAL</p>
            <h2 id="workflow-title" className="mt-2 text-3xl font-black tracking-[-0.04em] text-white sm:text-4xl">
              Dos estudios. Una decisión sencilla.
            </h2>
          </div>
          <p className="max-w-2xl text-sm leading-6 text-zinc-400 sm:justify-self-end">
            No necesitas aprender toda la suite para empezar. Elige según tengas una toma que debe vivir en loop o varias tomas que deben contar algo.
          </p>
        </div>

        <div className="space-y-3">
          <WorkflowLink
            href="/dual-studio"
            mode="UNA TOMA / DOS FORMATOS"
            title="Dual Studio"
            description="Para un clip protagonista y una canción. Diseña una continuidad natural, prepara el master horizontal y el Short vertical, añade SFX y sal con el pack de publicación listo."
            steps={["Sube un clip", "Ajusta el loop", "Exporta ambos"]}
            accent="fuchsia"
            primary
          />
          <WorkflowLink
            href="/edit-studio"
            mode="VARIAS TOMAS / 9:16"
            title="Edit Studio"
            description="Para un edit con ritmo y progresión. Analiza medios localmente, construye cortes al beat, dirige cada toma y unifica el acabado antes de exportar el Short."
            steps={["Añade medios", "Monta al beat", "Acaba el Short"]}
            accent="cyan"
          />
        </div>
      </section>

      <section aria-labelledby="utilities-title" className="border-t border-zinc-800 pt-8">
        <div className="mb-6 flex flex-col justify-between gap-2 sm:flex-row sm:items-end">
          <div>
            <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-zinc-600">HERRAMIENTAS DE PRECISIÓN</p>
            <h2 id="utilities-title" className="mt-2 text-2xl font-black tracking-tight text-white">
              Entra directamente a una tarea concreta.
            </h2>
          </div>
          <p className="text-xs text-zinc-500">El medio nunca sale de tu equipo.</p>
        </div>

        <div className="grid border-t border-zinc-800 md:grid-cols-2">
          {UTILITY_TOOLS.map((tool) => (
            <Link
              key={tool.href}
              href={tool.href}
              className="group grid grid-cols-[2rem_1fr_auto] items-start gap-3 border-r border-b border-zinc-800 py-5 pr-4 transition-colors md:odd:pr-6 md:even:border-r-0 md:even:pl-6 hover:bg-zinc-900/60 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-fuchsia-400 motion-reduce:transition-none"
            >
              <span className="font-mono text-[10px] text-zinc-600">{tool.index}</span>
              <span>
                <span className="block text-sm font-black text-zinc-200 transition-colors group-hover:text-white motion-reduce:transition-none">
                  {tool.name}
                </span>
                <span className="mt-1 block text-xs leading-5 text-zinc-500">{tool.description}</span>
              </span>
              <span className="flex items-center gap-2 font-mono text-[9px] text-zinc-600">
                {tool.output}
                <Arrow className="transition-transform group-hover:translate-x-1 motion-reduce:transition-none" />
              </span>
            </Link>
          ))}
        </div>
      </section>

      <aside
        className="grid overflow-hidden border border-zinc-800 bg-zinc-900/40 lg:grid-cols-[0.72fr_1.28fr]"
        aria-label="Arquitectura local de exportación"
      >
        <div className="border-b border-zinc-800 p-6 lg:border-r lg:border-b-0">
          <p className="font-mono text-[10px] font-bold tracking-[0.2em] text-emerald-300">PRIVADO POR DISEÑO</p>
          <h2 className="mt-3 text-xl font-black tracking-tight text-white">Tu equipo es el estudio.</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            WebCodecs procesa vídeo y audio en el navegador. El companion local solo amplía análisis y guardado automático cuando decides iniciarlo.
          </p>
        </div>
        <ol className="grid sm:grid-cols-3" aria-label="Pipeline de exportación">
          {[
            ["01", "Medios", "Archivos locales"],
            ["02", "Composición", "Canvas + WebCodecs"],
            ["03", "Entrega", "MP4 / GIF / WAV"],
          ].map(([index, name, detail], itemIndex) => (
            <li
              key={name}
              className="relative border-b border-zinc-800 p-6 last:border-b-0 sm:border-r sm:border-b-0 sm:last:border-r-0"
            >
              <span className="font-mono text-[9px] text-zinc-600">{index}</span>
              <strong className="mt-8 block text-sm text-zinc-200">{name}</strong>
              <span className="mt-1 block text-xs text-zinc-500">{detail}</span>
              {itemIndex < 2 && <Arrow className="absolute top-6 right-4 hidden text-zinc-700 sm:block" />}
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
