"use client";

import { useCallback, useRef, useState } from "react";

interface Props {
  accept: string;
  label: string;
  hint?: string;
  onFile: (file: File) => void;
  compact?: boolean;
}

export default function FileDropzone({ accept, label, hint, onFile, compact }: Props) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (files && files.length > 0) onFile(files[0]);
    },
    [onFile]
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handleFiles(e.dataTransfer.files);
      }}
      className={`cursor-pointer rounded-xl border-2 border-dashed transition-colors text-center ${
        compact ? "p-4" : "p-10"
      } ${
        over
          ? "border-fuchsia-400 bg-fuchsia-400/10"
          : "border-zinc-600 hover:border-zinc-400 bg-zinc-900/60"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <div className="text-3xl mb-2">🎬</div>
      <div className="font-medium">{label}</div>
      {hint && <div className="text-sm text-zinc-400 mt-1">{hint}</div>}
    </div>
  );
}
