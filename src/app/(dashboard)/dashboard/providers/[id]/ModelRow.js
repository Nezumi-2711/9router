import PropTypes from "prop-types";
import { CapacityBadges } from "@/shared/components";
import ActionMenu from "@/shared/components/ActionMenu";

export default function ModelRow({ model, fullModel, alias, copied, onCopy, testStatus, isCustom, isFree, onDeleteAlias, onRemove, onTest, isTesting, onDeleteModel, caps, thinkingSuffix }) {
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
  const deleteModel = onRemove || (isCustom ? onDeleteAlias : onDeleteModel);
  const deletesPermanently = !!deleteModel;
  const actionItems = [
    ...(onTest ? [{
      id: "test",
      icon: isTesting ? "progress_activity" : "science",
      label: isTesting ? "Testing model…" : "Test model",
      onSelect: onTest,
      disabled: isTesting,
      spinning: isTesting,
    }] : []),
    {
      id: "copy",
      icon: copied === `model-${model.id}` ? "check" : "content_copy",
      label: copied === `model-${model.id}` ? "Model ID copied" : "Copy model ID",
      onSelect: () => onCopy(displayModel, `model-${model.id}`),
    },
    ...(deleteModel ? [{
      id: "delete",
      icon: "delete",
      label: deletesPermanently ? "Permanently delete model" : "Hide model",
      onSelect: deleteModel,
      danger: true,
      dividerBefore: true,
    }] : []),
  ];

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
        <div className="ml-auto">
          <ActionMenu ariaLabel={`Actions for ${fullModel}`} items={actionItems} title={`Actions for ${fullModel}`} />
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
  onDeleteModel: PropTypes.func,
  caps: PropTypes.object,
  thinkingSuffix: PropTypes.string,
};
