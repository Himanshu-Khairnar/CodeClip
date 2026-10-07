"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

interface LightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
}

/** Full-screen image viewer. Esc or a click outside the image closes it. */
export function Lightbox({ src, alt, onClose }: LightboxProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-fade"
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="Close preview"
        autoFocus
        className="absolute right-3 top-3 rounded-full bg-white/10 p-2 text-white transition-[background-color,transform] duration-150 hover:bg-white/20 active:scale-90"
      >
        <X className="h-5 w-5" />
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-md object-contain shadow-2xl animate-pop [animation-duration:280ms]"
      />
      <p className="pointer-events-none absolute bottom-3 left-1/2 max-w-[90vw] -translate-x-1/2 truncate rounded-full bg-black/60 px-3 py-1 text-xs text-white/80">
        {alt}
      </p>
    </div>,
    document.body
  );
}
