"use client";

/** Inline tooltip, Claude Code CLI style */
export default function Tooltip({ text }) {
  return (
    <span className="relative group inline-flex items-center">
      <button
        type="button"
        className="material-symbols-outlined text-[14px] text-text-muted cursor-help rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
        aria-label={text}
      >
        help
      </button>
      <span role="tooltip" className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 z-50 w-64 rounded bg-gray-900 dark:bg-gray-800 text-white text-xs px-2.5 py-1.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity shadow-lg">
        {text}
      </span>
    </span>
  );
}
