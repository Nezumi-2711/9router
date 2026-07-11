import { getProviderConnections, getProviderNodes } from "@/lib/db";
import { AI_PROVIDERS, FREE_PROVIDERS } from "@/shared/constants/providers";

function isLLMProvider(providerId) {
  const provider = AI_PROVIDERS[providerId];
  return !provider?.serviceKinds || provider.serviceKinds.includes("llm");
}

/**
 * Return the provider types available to the request router.
 *
 * Provider credentials are selected globally after a valid dashboard API key
 * is authenticated, so a regular user can route through any active
 * connection. This intentionally differs from provider-management APIs,
 * which only return connections owned by the signed-in user.
 */
export async function getUsageTopologyProviders() {
  const [connections, providerNodes] = await Promise.all([
    getProviderConnections({ isActive: true }),
    getProviderNodes(),
  ]);
  const nodeNameMap = Object.fromEntries(
    providerNodes
      .filter((node) => node.id && node.name)
      .map((node) => [node.id, node.name]),
  );
  const seen = new Set();
  const providers = [];

  for (const connection of connections) {
    if (!connection.provider || !isLLMProvider(connection.provider) || seen.has(connection.provider)) continue;
    seen.add(connection.provider);
    providers.push({
      provider: connection.provider,
      nodeName: nodeNameMap[connection.provider] || null,
    });
  }

  for (const provider of Object.values(FREE_PROVIDERS)) {
    if (!provider.noAuth || !provider.id || !isLLMProvider(provider.id) || seen.has(provider.id)) continue;
    seen.add(provider.id);
    providers.push({ provider: provider.id, name: provider.name });
  }

  return providers;
}