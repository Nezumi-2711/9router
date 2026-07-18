const TOKEN_FORMATTER = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const COMPACT_TOKEN_FORMATTER = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 1,
});

export function formatTokenCount(value, compact = false) {
  const amount = Math.max(0, Number(value) || 0);
  return (compact ? COMPACT_TOKEN_FORMATTER : TOKEN_FORMATTER).format(amount);
}
