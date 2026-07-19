import PropTypes from "prop-types";
import { CapacityBadges } from "@/shared/components";

export default function ModelRow({ model, fullModel, alias, copied, onCopy, testStatus, isCustom, isFree, onDeleteAlias, onRemove, onTest, isTesting, onDisable, caps, thinkingSuffix }) {
  const displayModel = thinkingSuffix ? `${fullModel}(${thinkingSuffix})` : fullModel;
  const borderColor = testStatus === "ok"
    ? "border-green-500/40"
    : testStatus === "error"
    ? "border-red-500/40"
    : "border-border";

  const iconColor = testStatus === "ok"
    ? "#22c55e"
    : testStatus === "error"
    ? "#ef4444"
    : undefined;
  const deleteModel = onRemove || (isCustom ? onDeleteAlias : onDisable);
  const deletesPermanently = !!deleteModel;

  const actionButtonClass = "inline-flex size-7 items-center justify-center rounded-md text-text-muted transition-[background-color,color,transform,box-shadow] duration-150 hover:bg-background hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <div className={`group min-w-0 max-w-full rounded-lg border px-3 py-2 transition-colors ${borderColor} hover:bg-sidebar/50 focus-within:border-primary/50`}>
      <div className="flex min-w-0 items-start gap-2 sm:items-center">
        <span
          className="material-symbols-outlined shrink-0 text-base"
          style={iconColor ? { color: iconColor } : undefined}
        >
          {testStatus === "ok" ? "check_circle" : testStatus === "error" ? "cancel" : "smart_toy"}
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <code className="max-w-[72vw] truncate rounded bg-sidebar px-1.5 py-0.5 font-mono text-xs text-text-muted sm:max-w-90">{displayModel}</code>
          <span className="flex min-w-0 items-center text-[9px] gap-1 pl-1">
            {model.name && <span className="truncate text-[9px] italic text-text-muted/70">{model.name}</span>}
            <CapacityBadges caps={caps} colorOverride="text-text-muted/70" size={12} />
          </span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-0.5 rounded-lg border border-border/80 bg-sidebar/60 p-1 shadow-[0_1px_0_rgb(255_255_255/0.03)]">
          {onTest && (
            <button
              type="button"
              onClick={onTest}
              disabled={isTesting}
              className={actionButtonClass}
              title={isTesting ? "Testing model" : "Test model"}
              aria-label={isTesting ? `Testing ${fullModel}` : `Test ${fullModel}`}
            >
              <span className="material-symbols-outlined text-[17px]" style={isTesting ? { animation: "spin 1s linear infinite" } : undefined}>
                {isTesting ? "progress_activity" : "science"}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => onCopy(displayModel, `model-${model.id}`)}
            className={actionButtonClass}
            title={copied === `model-${model.id}` ? "Copied" : "Copy model ID"}
            aria-label={copied === `model-${model.id}` ? `${fullModel} copied` : `Copy ${fullModel}`}
          >
            <span className="material-symbols-outlined text-[17px]">
              {copied === `model-${model.id}` ? "check" : "content_copy"}
            </span>
          </button>
          {deleteModel && <span className="mx-0.5 h-4 w-px bg-border" aria-hidden="true" />}
          {deleteModel && (
            <button
              type="button"
              onClick={deleteModel}
              className="inline-flex size-7 items-center justify-center rounded-md text-text-muted transition-[background-color,color,transform,box-shadow] duration-150 hover:bg-red-500/12 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/60 active:scale-95"
              title={deletesPermanently ? "Permanently remove model from catalogs and saved configurations" : "Hide model from the dashboard catalog"}
              aria-label={deletesPermanently ? `Permanently delete ${fullModel}` : `Hide ${fullModel}`}
            >
              <span className="material-symbols-outlined text-[17px]">delete</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

ModelRow.propTypes = {
  model: PropTypes.shape({
    id: PropTypes.string.isRequired,
  }).isRequired,
  fullModel: PropTypes.string.isRequired,
  alias: PropTypes.string,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
  testStatus: PropTypes.oneOf(["ok", "error"]),
  isCustom: PropTypes.bool,
  isFree: PropTypes.bool,
  onDeleteAlias: PropTypes.func,
  onRemove: PropTypes.func,
  onTest: PropTypes.func,
  isTesting: PropTypes.bool,
  onDisable: PropTypes.func,
  caps: PropTypes.object,
  thinkingSuffix: PropTypes.string,
};
