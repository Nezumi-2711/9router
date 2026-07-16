"use client";

const CUSTOM_VALUE = "__custom__";
const UNSET_VALUE = "__unset__";

export default function ApiKeySelect({ value, onChange, apiKeys = [], className = "", mode = "managed", onModeChange }) {
  const matchingKey = apiKeys.find((key) => key.key === value);
  const selectedMode = mode === "custom" ? CUSTOM_VALUE : (matchingKey?.key || UNSET_VALUE);

  const handleSelect = (e) => {
    const next = e.target.value;
    if (next === UNSET_VALUE) return;
    if (next === CUSTOM_VALUE) {
      onModeChange?.("custom");
      onChange("");
    } else {
      onModeChange?.("managed");
      onChange(next);
    }
  };

  const handleCustomInput = (e) => {
    const v = e.target.value;
    onModeChange?.("custom");
    onChange(v);
  };

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <select
        value={selectedMode}
        onChange={handleSelect}
        className="w-full min-w-0 px-2 py-2 bg-surface rounded text-xs border border-border focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
      >
        {selectedMode === UNSET_VALUE && <option value={UNSET_VALUE}>No managed API key selected</option>}
        {apiKeys.map((k) => (
          <option key={k.id} value={k.key}>{k.key}</option>
        ))}
        <option value={CUSTOM_VALUE}>Custom...</option>
      </select>
      {selectedMode === CUSTOM_VALUE && (
        <>
          <input
            type="password"
            value={mode === "custom" ? value : ""}
            onChange={handleCustomInput}
            placeholder="sk-..."
            autoComplete="off"
            className="w-full min-w-0 px-2 py-2 bg-surface rounded border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary/50 sm:py-1.5"
          />
          {mode === "custom" && !value && (
            <span className="text-[11px] font-normal text-amber-600 dark:text-amber-400">Custom keys are not saved. Enter it again to generate the configuration.</span>
          )}
        </>
      )}
    </div>
  );
}
