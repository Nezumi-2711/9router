/**
 * Get the local gateway endpoint.
 * @param {number} port - Local server port
 * @returns {Promise<{endpoint: string}>}
 */
async function getEndpoint(port) {
  return { endpoint: `http://localhost:${port}/v1` };
}

/**
 * Get the local gateway endpoint for terminal output.
 * @param {number} port - Local server port
 * @returns {Promise<string>}
 */
async function getEndpointColored(port) {
  const { endpoint } = await getEndpoint(port);
  return endpoint;
}

module.exports = { getEndpoint, getEndpointColored };