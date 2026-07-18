"use client";

import { Input } from "@/shared/components";
import { cn } from "@/shared/utils/cn";

/** Reusable endpoint row component */
export default function EndpointRow({ label, url, copyId, copied, onCopy, badge, actions, className }) {
  return (
    <div className={cn("grid grid-cols-[5.5rem_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border-subtle bg-surface-2/40 p-2.5", className)}>
      <span className={`rounded-md px-2 py-1 text-center font-mono text-[11px] font-medium tracking-wide ${
          (badge === "CF" || badge === "TS") ? "bg-primary/10 text-primary" : "bg-surface-2 text-text-muted"
        }`}>{label}</span>
      <Input value={url} readOnly className="min-w-0 font-mono text-sm" />
      <button
        type="button"
        onClick={() => onCopy(url, copyId)}
        className="grid size-9 place-items-center rounded-lg text-text-muted transition-colors hover:bg-primary/10 hover:text-primary"
        title={copied === copyId ? "Copied" : "Copy endpoint"}
        aria-label={copied === copyId ? "Endpoint copied" : `Copy ${label} endpoint`}
      >
        <span className="material-symbols-outlined text-[18px]">{copied === copyId ? "check" : "content_copy"}</span>
      </button>
      {actions}
    </div>
  );
}
