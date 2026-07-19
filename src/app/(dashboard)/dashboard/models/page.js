"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  CardSkeleton,
  CapacityBadges,
  Toggle,
} from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import { useCopyToClipboard } from "@/shared/hooks/useCopyToClipboard";
import useUserStore from "@/store/userStore";
import { useNotificationStore } from "@/store/notificationStore";

function groupModelsByProvider(models) {
  return models.reduce((groups, model) => {
    const key = model.providerAlias;
    if (!groups[key]) {
      groups[key] = { provider: model.provider, models: [], modelIds: new Set() };
    }

    if (groups[key].modelIds.has(model.fullModel)) return groups;
    groups[key].modelIds.add(model.fullModel);
    groups[key].models.push(model);
    return groups;
  }, {});
}

function ProviderModelsCard({ group, canManage, onSetModelDisabled, onSetModelsDisabled, pendingIds }) {
  const [expanded, setExpanded] = useState(true);
  const { copied, copy } = useCopyToClipboard();
  const isUpdatingGroup = group.models.some((model) => pendingIds.has(model.fullModel));
  const enabledCount = group.models.filter((model) => !model.disabled).length;
  const disabledCount = group.models.length - enabledCount;

  const setAllModelsDisabled = (disabled) => {
    const modelsToUpdate = group.models.filter((model) => model.disabled !== disabled);
    if (modelsToUpdate.length > 0) onSetModelsDisabled(group.provider.alias, modelsToUpdate, disabled);
  };

  return (
    <Card padding="none" className="overflow-hidden">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="flex min-w-0 items-center gap-3 text-left"
          aria-expanded={expanded}
        >
          <div
            className="flex size-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${group.provider.color?.length > 7 ? group.provider.color : `${group.provider.color || "#6b7280"}15`}` }}
          >
            <ProviderIcon
              src={`/providers/${group.provider.id}.png`}
              alt={group.provider.name}
              size={30}
              className="max-h-7.5 max-w-7.5 rounded-lg object-contain"
              fallbackText={group.provider.textIcon || group.provider.name.slice(0, 2).toUpperCase()}
              fallbackColor={group.provider.color}
            />
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-text-main">{group.provider.name}</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              {group.models.length} added model{group.models.length === 1 ? "" : "s"}
            </p>
          </div>
          <span className={`material-symbols-outlined ml-auto text-[18px] text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}>
            expand_more
          </span>
        </button>
        {canManage ? (
          <div className="flex shrink-0 gap-2">
            <Button
              size="sm"
              variant="secondary"
              icon="check_circle"
              disabled={enabledCount === group.models.length || isUpdatingGroup}
              onClick={() => setAllModelsDisabled(false)}
            >
              Enable all
            </Button>
            <Button
              size="sm"
              variant="secondary"
              icon="pause_circle"
              disabled={disabledCount === group.models.length || isUpdatingGroup}
              onClick={() => setAllModelsDisabled(true)}
            >
              Disable all
            </Button>
          </div>
        ) : null}
      </div>

      {expanded ? (
        <div className="grid grid-cols-1 gap-3 border-t border-border bg-surface-2/30 p-3 sm:grid-cols-2 xl:grid-cols-3">
          {group.models.map((model) => {
            const isPending = pendingIds.has(model.fullModel);
            return (
              <article
                key={model.fullModel}
                className={`flex min-w-0 flex-col gap-4 rounded-xl border bg-surface p-4 transition-colors ${model.disabled ? "border-border-subtle opacity-60" : "border-border hover:border-primary/30"}`}
              >
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-semibold text-text-main" title={model.name || model.alias}>
                    {model.name || model.alias}
                  </h3>
                  <div className="mt-1 flex min-w-0 items-center gap-1">
                    <p className="min-w-0 flex-1 truncate font-mono text-xs text-text-muted" title={model.model}>{model.model}</p>
                    <button
                      type="button"
                      onClick={() => copy(model.model, model.fullModel)}
                      className="flex size-6 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text-main focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                      aria-label={`Copy model ID ${model.model}`}
                      title={copied === model.fullModel ? "Copied" : "Copy model ID"}
                    >
                      <span className="material-symbols-outlined text-[15px]">
                        {copied === model.fullModel ? "check" : "content_copy"}
                      </span>
                    </button>
                  </div>
                </div>

                <div className="flex min-h-5 items-center justify-between gap-3 border-t border-border pt-3">
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {model.alias !== model.model ? <Badge variant="default" size="sm">{model.alias}</Badge> : null}
                    <CapacityBadges caps={model.caps} />
                  </div>
                  {canManage ? (
                    <Toggle
                      size="sm"
                      checked={!model.disabled}
                      disabled={isPending}
                      onChange={(enabled) => onSetModelDisabled(group.provider.alias, model, !enabled)}
                      className="shrink-0"
                    />
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}

export default function ModelsPage() {
  const user = useUserStore((state) => state.user);
  const fetchCurrentUser = useUserStore((state) => state.fetchCurrentUser);
  const notify = useNotificationStore();
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState("");
  const [pendingIds, setPendingIds] = useState(new Set());

  useEffect(() => {
    if (!user) fetchCurrentUser();
  }, [fetchCurrentUser, user]);

  useEffect(() => {
    const loadModels = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch("/api/models/connected", { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load models");
        setModels(data.models || []);
      } catch (loadError) {
        setError(loadError.message);
      } finally {
        setLoading(false);
      }
    };

    loadModels();
  }, []);

  const filteredGroups = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filteredModels = normalizedSearch
      ? models.filter((model) => (
        [model.provider.name, model.name, model.alias, model.model]
          .some((value) => value?.toLowerCase().includes(normalizedSearch))
      ))
      : models;

    return Object.values(groupModelsByProvider(filteredModels))
      .sort((a, b) => a.provider.name.localeCompare(b.provider.name));
  }, [models, search]);

  const setModelDisabled = async (providerAlias, model, disabled) => {
    await setModelsDisabled(providerAlias, [model], disabled);
  };

  const setModelsDisabled = async (providerAlias, modelsToUpdate, disabled) => {
    const ids = modelsToUpdate.map((model) => model.fullModel);
    const modelIds = modelsToUpdate.map((model) => model.model);
    if (ids.length === 0) return;

    setPendingIds((current) => new Set([...current, ...ids]));
    setModels((current) => current.map((item) => (
      ids.includes(item.fullModel) ? { ...item, disabled } : item
    )));

    try {
      const response = await fetch("/api/models/connected", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerAlias, modelIds, disabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update model");
      notify.success(`${modelIds.length} model${modelIds.length === 1 ? "" : "s"} ${disabled ? "disabled" : "enabled"}.`);
    } catch (updateError) {
      setModels((current) => current.map((item) => (
        ids.includes(item.fullModel) ? { ...item, disabled: !disabled } : item
      )));
      notify.error(updateError.message);
    } finally {
      setPendingIds((current) => {
        const next = new Set(current);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  const providerCount = new Set(models.map((model) => model.providerAlias)).size;
  const canManage = user?.role === "admin";

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-text-main">Models</h1>
            <Badge variant="default" size="sm">{models.length}</Badge>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            {canManage
              ? "Manage models available from connected providers."
              : "Browse models currently available through connected providers."}
          </p>
        </div>
        <label className="relative block w-full sm:w-80">
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[18px] text-text-muted">search</span>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search models or providers"
            className="w-full rounded-lg border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text-main outline-none transition-colors placeholder:text-text-muted focus:border-primary"
          />
        </label>
      </div>

      {!error && models.length > 0 ? (
        <section className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border" aria-label="Model overview">
          <div className="bg-surface px-4 py-3">
            <p className="text-xs font-medium text-text-muted">Connected providers</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-text-main">{providerCount}</p>
          </div>
          <div className="bg-surface px-4 py-3">
            <p className="text-xs font-medium text-text-muted">Available models</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-text-main">{models.length}</p>
          </div>
        </section>
      ) : null}

      {error ? (
        <Card className="border-red-500/30 bg-red-500/5 text-sm text-red-600 dark:text-red-400">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{error}</span>
          </div>
        </Card>
      ) : null}

      {!error && filteredGroups.length === 0 ? (
        <Card className="border-dashed text-center">
          <span className="material-symbols-outlined text-[32px] text-text-muted">search_off</span>
          <p className="mt-2 text-sm text-text-muted">
            {models.length === 0
              ? "No models are available. Add an active provider connection or register a custom model first."
              : "No models match your search."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredGroups.map((group) => (
            <ProviderModelsCard
              key={group.provider.alias}
              group={group}
              canManage={canManage}
              pendingIds={pendingIds}
              onSetModelDisabled={setModelDisabled}
              onSetModelsDisabled={setModelsDisabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}