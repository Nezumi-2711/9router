import { VIETNAM_TIME_ZONE } from "../config/time.js";

// Debug logging utility — only active in dev mode (NODE_ENV !== "production")
// Outputs are tagged with [DBG:tag] for easy grep/filter
const isDev = process.env.NODE_ENV !== "production";

function ts() {
  return new Date().toLocaleTimeString("en-US", { timeZone: VIETNAM_TIME_ZONE, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function dbg(tag, msg) {
  if (!isDev) return;
  console.log(`[${ts()}] 🐛 [DBG:${tag}] ${msg}`);
}

export const isDebugEnabled = isDev;
