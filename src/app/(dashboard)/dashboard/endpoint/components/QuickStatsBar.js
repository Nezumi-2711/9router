"use client";

import PropTypes from "prop-types";
import styles from "../../DashboardPage.module.css";

const integerFormatter = new Intl.NumberFormat("en-US");
const compactFormatter = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

const statDefinitions = [
  {
    key: "requests",
    label: "Today's requests",
    icon: "trending_up",
    description: "Since local midnight",
    getValue: (stats) => integerFormatter.format(toNumber(stats.totalRequests)),
  },
  {
    key: "input",
    label: "Input tokens",
    icon: "input",
    description: "Prompt volume today",
    getValue: (stats) => compactFormatter.format(toNumber(stats.totalPromptTokens)),
  },
  {
    key: "output",
    label: "Output tokens",
    icon: "output",
    description: "Completion volume today",
    getValue: (stats) => compactFormatter.format(toNumber(stats.totalCompletionTokens)),
  },
  {
    key: "providers",
    label: "Active providers",
    icon: "dns",
    description: "Healthy connections",
    getValue: (_stats, providerSummary) => providerSummary
      ? `${providerSummary.active} / ${providerSummary.total}`
      : "—",
  },
];

export function QuickStatsBarSkeleton() {
  return (
    <section className={`${styles.quickStats} animate-pulse`} aria-label="Loading today's gateway statistics" aria-busy="true">
      <span className="sr-only">Loading today&apos;s gateway statistics.</span>
      {statDefinitions.map((stat) => (
        <div key={stat.key} className={styles.statSkeleton} aria-hidden="true">
          <div className={`${styles.skeletonLine} size-8`} />
          <div className="min-w-0 space-y-2">
            <div className={`${styles.skeletonLine} h-2.5 w-24 max-w-full`} />
            <div className={`${styles.skeletonLine} h-6 w-16`} />
            <div className={`${styles.skeletonLine} h-2.5 w-28 max-w-full`} />
          </div>
        </div>
      ))}
    </section>
  );
}

export default function QuickStatsBar({ stats, providerSummary = null }) {
  if (!stats) return null;

  return (
    <section className={styles.quickStats} aria-labelledby="today-overview-title">
      <h3 id="today-overview-title" className="sr-only">Today&apos;s gateway overview</h3>
      {statDefinitions.map((stat) => (
        <article key={stat.key} className={styles.statCard}>
          <span className={`${styles.statIcon} material-symbols-outlined`} aria-hidden="true">{stat.icon}</span>
          <p className={styles.statLabel}>{stat.label}</p>
          <p className={styles.statValue}>{stat.getValue(stats, providerSummary)}</p>
          <p className={styles.statDescription}>{stat.description}</p>
        </article>
      ))}
    </section>
  );
}

QuickStatsBar.propTypes = {
  stats: PropTypes.shape({
    totalRequests: PropTypes.number,
    totalPromptTokens: PropTypes.number,
    totalCompletionTokens: PropTypes.number,
  }),
  providerSummary: PropTypes.shape({
    active: PropTypes.number.isRequired,
    total: PropTypes.number.isRequired,
  }),
};