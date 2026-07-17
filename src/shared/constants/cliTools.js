// MITM Tools — IDE tools intercepted via MITM proxy
export const MITM_TOOLS = {
  antigravity: {
    id: "antigravity",
    name: "Antigravity",
    image: "/providers/antigravity.png",
    color: "#4285F4",
    description: "Google Antigravity IDE with MITM",
    configType: "mitm",
    mitmDomain: "daily-cloudcode-pa.googleapis.com",
    modelAliases: ["gemini-3.5-flash-low", "gemini-3-flash-agent", "gemini-3.5-flash-extra-low", "gemini-3.1-pro-low", "gemini-pro-agent", "claude-sonnet-4-6", "claude-opus-4-6-thinking", "gpt-oss-120b-medium", "gemini-3-flash"],
    defaultModels: [
      { id: "gemini-3.5-flash-low", name: "Gemini 3.5 Flash (Medium) / Default", alias: "gemini-3.5-flash-low" },
      { id: "gemini-3-flash-agent", name: "Gemini 3.5 Flash (High)", alias: "gemini-3-flash-agent" },
      { id: "gemini-3.5-flash-extra-low", name: "Gemini 3.5 Flash (Low)", alias: "gemini-3.5-flash-extra-low" },
      { id: "gemini-3.1-pro-low", name: "Gemini 3.1 Pro (Low)", alias: "gemini-3.1-pro-low" },
      { id: "gemini-pro-agent", name: "Gemini 3.1 Pro (High)", alias: "gemini-pro-agent" },
      { id: "claude-sonnet-4-6", name: "Claude Sonnet 4.6 (Thinking)", alias: "claude-sonnet-4-6" },
      { id: "claude-opus-4-6-thinking", name: "Claude Opus 4.6 (Thinking)", alias: "claude-opus-4-6-thinking" },
      { id: "gpt-oss-120b-medium", name: "GPT-OSS 120B (Medium)", alias: "gpt-oss-120b-medium" },
      { id: "gemini-3-flash", name: "Gemini 3 Flash (Command)", alias: "gemini-3-flash" },
    ],
  },
  copilot: {
    id: "copilot",
    name: "GitHub Copilot",
    image: "/providers/copilot.png",
    color: "#1F6FEB",
    description: "GitHub Copilot IDE with MITM",
    configType: "mitm",
    mitmDomain: "api.individual.githubcopilot.com",
    modelAliases: ["gpt-5-mini", "gpt-5.4-nano", "claude-haiku-4.5", "gpt-4o", "gpt-4.1"],
    defaultModels: [
      // Verified via live MITM passthrough capture of the GitHub Copilot CLI: its model
      // picker offers "GPT-5 mini" (default → wire id "gpt-5-mini"), "Claude Haiku 4.5"
      // ("claude-haiku-4.5") and "Auto". "Auto" is NOT a wire id — Copilot dispatches
      // concrete models dynamically (observed "gpt-5.4-nano" for light tasks and
      // "claude-haiku-4.5"), so it needs no slot of its own. Without a slot for
      // gpt-5-mini / gpt-5.4-nano, getMappedModel returns null and the /chat/completions
      // call is passed through to GitHub Copilot instead of the configured provider —
      // and gpt-5-mini is the CLI default, so the primary turn leaks (same class as the
      // Kiro "auto" misrouting). gpt-4o / gpt-4.1 are kept for the VS Code Copilot Chat picker.
      { id: "gpt-5-mini", name: "GPT-5 mini", alias: "gpt-5-mini" },
      { id: "gpt-5.4-nano", name: "GPT-5.4 nano", alias: "gpt-5.4-nano" },
      { id: "claude-haiku-4.5", name: "Claude Haiku 4.5", alias: "claude-haiku-4.5" },
      { id: "gpt-4o", name: "GPT-4o", alias: "gpt-4o" },
      { id: "gpt-4.1", name: "GPT-4.1", alias: "gpt-4.1" },
    ],
  },
  kiro: {
    id: "kiro",
    name: "Kiro",
    image: "/providers/kiro.png",
    color: "#FF6B00",
    description: "Kiro IDE with MITM",
    configType: "mitm",
    mitmDomain: "q.us-east-1.amazonaws.com",
    defaultModels: [
      { id: "claude-sonnet-5", name: "Claude Sonnet 5", alias: "claude-sonnet-5" },
      { id: "claude-sonnet-4.5", name: "Claude Sonnet 4.5", alias: "claude-sonnet-4.5" },
      { id: "claude-sonnet-4", name: "Claude Sonnet 4", alias: "claude-sonnet-4" },
      { id: "claude-haiku-4.5", name: "Claude Haiku 4.5", alias: "claude-haiku-4.5" },
      { id: "deepseek-3.2", name: "DeepSeek 3.2", alias: "deepseek-3.2" },
      { id: "minimax-m2.1", name: "MiniMax M2.1", alias: "minimax-m2.1" },
      { id: "gpt-5.6-sol", name: "GPT 5.6 Sol", alias: "gpt-5.6-sol", contextLength: 272000, rateMultiplier: 2.4 },
      { id: "gpt-5.6-terra", name: "GPT 5.6 Terra", alias: "gpt-5.6-terra", contextLength: 272000, rateMultiplier: 1.2 },
      { id: "gpt-5.6-luna", name: "GPT 5.6 Luna", alias: "gpt-5.6-luna", contextLength: 272000, rateMultiplier: 0.6 },
      { id: "simple-task", name: "Qwen3 Coder Next", alias: "simple-task" },
    ],
  },
  // cursor: {
  //   id: "cursor",
  //   name: "Cursor",
  //   image: "/providers/cursor.png",
  //   color: "#000000",
  //   description: "Cursor IDE with MITM",
  //   configType: "mitm",
  //   mitmDomain: "api2.cursor.sh",
  //   defaultModels: [
  //     { id: "claude-sonnet-4-5", name: "Claude Sonnet 4.5", alias: "claude-sonnet-4-5" },
  //     { id: "claude-opus-4", name: "Claude Opus 4", alias: "claude-opus-4" },
  //     { id: "gpt-4o", name: "GPT-4o", alias: "gpt-4o" },
  //   ],
  // },
};

// CLI Tools configuration
export const CLI_TOOLS = {
  claude: {
    id: "claude",
    name: "Claude Code",
    image: "/providers/claude.png",
    color: "#D97757",
    description: "Anthropic Claude Code CLI",
    configType: "env",
    envVars: {
      baseUrl: "ANTHROPIC_BASE_URL",
      model: "ANTHROPIC_MODEL",
      opusModel: "ANTHROPIC_DEFAULT_OPUS_MODEL",
      sonnetModel: "ANTHROPIC_DEFAULT_SONNET_MODEL",
      fableModel: "ANTHROPIC_DEFAULT_FABLE_MODEL",
      haikuModel: "ANTHROPIC_DEFAULT_HAIKU_MODEL",
    },
    modelAliases: ["default", "sonnet", "opus", "fable", "haiku", "opusplan"],
    settingsFile: "~/.claude/settings.json",
    defaultModels: [
      { id: "fable", name: "Claude Fable", alias: "fable", envKey: "ANTHROPIC_DEFAULT_FABLE_MODEL", defaultValue: "cc/claude-fable-5" },
      { id: "opus", name: "Claude Opus", alias: "opus", envKey: "ANTHROPIC_DEFAULT_OPUS_MODEL", defaultValue: "cc/claude-opus-4-8" },
      { id: "sonnet", name: "Claude Sonnet", alias: "sonnet", envKey: "ANTHROPIC_DEFAULT_SONNET_MODEL", defaultValue: "cc/claude-sonnet-5" },
      { id: "haiku", name: "Claude Haiku", alias: "haiku", envKey: "ANTHROPIC_DEFAULT_HAIKU_MODEL", defaultValue: "cc/claude-haiku-4-5-20251001" },
    ],
  },
  codex: {
    id: "codex",
    name: "OpenAI Codex CLI / App",
    image: "/providers/codex.png",
    color: "#10A37F",
    description: "OpenAI Codex CLI",
    configType: "custom",
  },
  opencode: {
    id: "opencode",
    name: "OpenCode",
    image: "/providers/opencode.png",
    color: "#E87040",
    description: "OpenCode AI Terminal Assistant",
    configType: "custom",
  },
  cowork: {
    id: "cowork",
    name: "Claude Cowork",
    image: "/providers/claude.png",
    color: "#D97757",
    description: "Claude Desktop Cowork (third-party inference)",
    configType: "custom",
  },
  cursor: {
    id: "cursor",
    name: "Cursor",
    image: "/providers/cursor.png",
    color: "#000000",
    description: "Cursor AI Code Editor",
    configType: "guide",
    modelSelection: "multiple",
    requiresExternalUrl: true,
    notes: [
      { type: "warning", text: "Requires Cursor Pro account to use this feature." },
      { type: "cloudCheck", text: "Cursor routes requests through its own server, so local endpoint is not supported. Please enable Tunnel or Cloud Endpoint in Settings." },
    ],
    guideSteps: [
      { step: 1, title: "Open Settings", desc: "Go to Settings → Models" },
      { step: 2, title: "Enable OpenAI API", desc: "Enable \"OpenAI API key\" option" },
      { step: 3, title: "Base URL", value: "{{baseUrl}}", copyable: true },
      { step: 4, title: "API Key", type: "apiKeySelector" },
      { step: 5, title: "Add Custom Model", desc: "Click \"View All Models\" → \"Add Custom Model\". Repeat this step for each model selected below." },
      { step: 6, title: "Select Custom Models", desc: "Add the exact 9Router model IDs below to Cursor. Click a selected model ID to copy it.", type: "modelSelector", multiple: true },
    ],
  },
  copilot: {
    id: "copilot",
    name: "GitHub Copilot (VSCode)",
    image: "/providers/copilot.png",
    color: "#1F6FEB",
    description: "GitHub Copilot in VS Code via custom models",
    configType: "custom",
  },
  "grok-build": {
    id: "grok-build",
    name: "Grok Build",
    image: "/providers/grok-cli.png",
    color: "#1DA1F2",
    description: "xAI Grok Build TUI coding agent",
    configType: "custom",
    docsUrl: "https://x.ai/cli",
    defaultCommand: "grok",
    notes: [
      { type: "info", text: "Grok Build uses ~/.grok/config.toml with a custom 9Router model." },
      { type: "warning", text: "Config path: Linux/macOS ~/.grok/config.toml • Windows %USERPROFILE%\\.grok\\config.toml" },
    ],
  },
  // HIDDEN: gemini-cli
  // "gemini-cli": {
  //   id: "gemini-cli",
  //   name: "Gemini CLI",
  //   icon: "terminal",
  //   color: "#4285F4",
  //   description: "Google Gemini CLI",
  //   configType: "env",
  //   envVars: {
  //     baseUrl: "GEMINI_API_BASE_URL",
  //     model: "GEMINI_MODEL",
  //   },
  //   defaultModels: [
  //     { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", alias: "pro" },
  //     { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", alias: "flash" },
  //   ],
  // },
};

// Get all provider models for mapping dropdown
export const getProviderModelsForMapping = (providers) => {
  const result = [];
  providers.forEach(conn => {
    if (conn.isActive && (conn.testStatus === "active" || conn.testStatus === "success")) {
      result.push({
        connectionId: conn.id,
        provider: conn.provider,
        name: conn.name,
        models: conn.models || [],
      });
    }
  });
  return result;
};
