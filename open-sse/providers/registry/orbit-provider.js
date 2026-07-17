export default {
  id: "orbit-provider",
  priority: 100,
  alias: "orbit",
  display: {
    name: "Orbit Provider",
    icon: "public_dns",
    color: "#8B5CF6",
    textIcon: "OB",
  },
  category: "apikey",
  authType: "apikey",
  transport: {
    baseUrl: "https://api.orbit-provider.com/anthropic/v1/messages",
    format: "claude",
    headers: {
      "anthropic-version": "2023-06-01",
    },
    usage: {
      url: "https://api.orbit-provider.com/v1/usage",
    },
  },
  models: [
    { id: "claude-opus-4-8", name: "Claude Opus 4.8" },
    { id: "claude-opus-4-7", name: "Claude Opus 4.7" },
    { id: "claude-opus-4-6", name: "Claude Opus 4.6" },
    { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 (Thinking)" },
  ],
  serviceKinds: ["llm"],
  features: {
    usage: true,
    usageApikey: true,
  },
  thinkingConfig: {
    options: ["auto", "on", "off"],
    defaultMode: "auto",
  },
};
