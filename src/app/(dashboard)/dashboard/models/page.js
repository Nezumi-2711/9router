"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  CardSkeleton,
  CapacityBadges,
  Toggle,
} from "@/shared/components";
import ProviderIcon from "@/shared/components/ProviderIcon";
import useUserStore from "@/store/userStore";
import { useNotificationStore } from "@/store/notificationStore";

function groupModelsByProvider(models) {
  return models.reduce((groups, model) => {
    const key = model.providerAlias;
    if (!groups[key]) {
      groups[key] = {
        provider: model.provider,
        models: [],
        modelIds: new Set(),
      };
    }

    // The API normally supplies unique models. Ignore a duplicate defensively
    // so a malformed response cannot produce duplicate React keys.
    if (groups[key].modelIds.has(model.fullModel)) return groups;
    groups[key].modelIds.add(model.fullModel);
    groups[key].models.push(model);
    return groups;
  }, {});
}

function ProviderModelsCard({ group, onSetModelsDisabled, pendingIds }) {
  const [expanded, setExpanded] = useState(true);
  const enabledCount = group.models.filter((model) => !model.disabled).length;
  const disabledCount = group.models.length - enabledCount;
  const isUpdatingGroup = group.models.some((model) => pendingIds.has(model.fullModel));

  const setAllModelsDisabled = (disabled) => {
    const modelIds = group.models
      .filter((model) => model.disabled !== disabled)
      .map((model) => model.model);
    if (modelIds.length > 0) onSetModelsDisabled(group.provider.alias, modelIds, disabled);
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
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate font-semibold text-text-main">{group.provider.name}</h2>
              <Badge variant="success" size="sm" dot>
                {group.models[0].connectionCount} connection{group.models[0].connectionCount === 1 ? "" : "s"}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-text-muted">
              {enabledCount} enabled · {disabledCount} disabled · {group.models.length} models
            </p>
          </div>
          <span className={`material-symbols-outlined ml-auto text-[18px] text-text-muted transition-transform ${expanded ? "rotate-180" : ""}`}>
            expand_more
          </span>
        </button>

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
      </div>

      {expanded ? (
        <div className="border-t border-border">
          {group.models.map((model) => {
            const isPending = pendingIds.has(model.fullModel);
            return (
              <div
                key={model.fullModel}
                className="flex min-w-0 items-center gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <Toggle
                  size="sm"
                  checked={!model.disabled}
                  disabled={isPending}
                  onChange={(enabled) => onSetModelsDisabled(group.provider.alias, [model.model], !enabled)}
                  className="shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span className={`truncate text-sm font-medium ${model.disabled ? "text-text-muted line-through" : "text-text-main"}`}>
                      {model.name || model.alias}
                    </span>
                    {model.alias !== model.model ? (
                      <Badge variant="default" size="sm">{model.alias}</Badge>
                    ) : null}
                    <CapacityBadges caps={model.caps} />
                  </div>
                  <p className="mt-0.5 truncate font-mono text-xs text-text-muted">{model.model}</p>
                </div>
                <Badge variant={model.disabled ? "default" : "success"} size="sm">
                  {model.disabled ? "Disabled" : "Enabled"}
                </Badge>
              </div>
            );
          })}
        </div>
      ) : null}
    </Card>
  );
}

export default function ModelsPage() {
  const router = useRouter();
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
    if (user && user.role !== "admin") router.replace("/dashboard");
  }, [router, user]);

  useEffect(() => {
    if (user?.role !== "admin") return;

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
  }, [user?.role]);

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

  const setModelsDisabled = async (providerAlias, modelIds, disabled) => {
    const matchingModels = models.filter((model) => (
      model.provider.alias === providerAlias && modelIds.includes(model.model)
    ));
    const ids = matchingModels.map((model) => model.fullModel);
    if (ids.length === 0) return;

    setPendingIds((current) => new Set([...current, ...ids]));
    setModels((current) => current.map((model) => (
      ids.includes(model.fullModel) ? { ...model, disabled } : model
    )));

    try {
      const response = await fetch("/api/models/connected", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ providerAlias, modelIds, disabled }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to update models");
      notify.success(`${modelIds.length} model${modelIds.length === 1 ? "" : "s"} ${disabled ? "disabled" : "enabled"}.`);
    } catch (updateError) {
      setModels((current) => current.map((model) => (
        ids.includes(model.fullModel) ? { ...model, disabled: !disabled } : model
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

  if (user && user.role !== "admin") return null;

  if (loading || !user) {
    return (
      <div className="flex flex-col gap-4">
        <CardSkeleton />
        <CardSkeleton />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 flex-col gap-6 px-1 sm:px-0">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-text-main">Models</h1>
            <Badge variant="default" size="sm">{models.length}</Badge>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Manage which models are available through the API for connected providers.
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
              ? "No models are available. Add and activate a provider connection first."
              : "No models match your search."}
          </p>
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          {filteredGroups.map((group) => (
            <ProviderModelsCard
              key={group.provider.alias}
              group={group}
              pendingIds={pendingIds}
              onSetModelsDisabled={setModelsDisabled}
            />
          ))}
        </div>
      )}
    </div>
  );
}