"use client";

import { useState } from "react";
import PropTypes from "prop-types";
import styles from "../../DashboardPage.module.css";

const SNIPPET_TABS = [
  { id: "curl", label: "cURL" },
  { id: "node", label: "Node.js" },
  { id: "python", label: "Python" },
];

const normalizeEndpoint = (baseUrl) => (baseUrl || "/v1").replace(/\/+$/, "");

function buildSnippet(language, baseUrl) {
  const endpoint = normalizeEndpoint(baseUrl);

  switch (language) {
    case "node":
      return `import OpenAI from "openai";

const client = new OpenAI({
  baseURL: ${JSON.stringify(endpoint)},
  apiKey: process.env.NINEROUTER_API_KEY,
});

const models = await client.models.list();
console.log(models.data);`;
    case "python":
      return `from openai import OpenAI
import os

client = OpenAI(
    base_url=${JSON.stringify(endpoint)},
    api_key=os.environ["NINEROUTER_API_KEY"],
)

models = client.models.list()
print(models.data)`;
    default:
      return `export NINEROUTER_API_KEY="sk-your-api-key"

curl -s "${endpoint}/models" \\
  -H "Authorization: Bearer $NINEROUTER_API_KEY"`;
  }
}

export default function QuickConnectSnippet({ baseUrl, hasApiKey, requireApiKey, copied, onCopy }) {
  const [activeTab, setActiveTab] = useState("curl");
  const snippet = buildSnippet(activeTab, baseUrl);
  const activeTabLabel = SNIPPET_TABS.find((tab) => tab.id === activeTab)?.label || "cURL";
  const copyId = `quick_connect_${activeTab}`;
  const needsKey = requireApiKey && !hasApiKey;

  return (
    <section className={styles.quickConnect} aria-labelledby="quick-connect-title">
      <div className={styles.quickConnectHeader}>
        <div className={styles.quickConnectIntro}>
          <div className={styles.quickConnectIcon} aria-hidden="true">
            <span className="material-symbols-outlined text-[18px]">terminal</span>
          </div>
          <div>
            <h4 id="quick-connect-title" className={styles.quickConnectTitle}>Make a first request</h4>
            <p className={styles.quickConnectDescription}>Set your key as an environment variable, then list models to confirm that your client is connected.</p>
          </div>
        </div>
        <div className={styles.connectStatus} data-state={needsKey ? "action-required" : "ready"}>
          <span className={styles.connectStatusIndicator} aria-hidden="true" />
          {needsKey ? "Create an API key to connect" : "Connection sample ready"}
        </div>
      </div>

      <div className={styles.snippetTabs} role="tablist" aria-label="Connection sample language">
        {SNIPPET_TABS.map((tab) => (
          <button
            key={tab.id}
            id={`quick-connect-${tab.id}-tab`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls="quick-connect-code"
            data-active={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        id="quick-connect-code"
        className={styles.snippetPanel}
        role="tabpanel"
        aria-labelledby={`quick-connect-${activeTab}-tab`}
      >
        <pre className={styles.snippetPre}><code>{snippet}</code></pre>
        <button
          type="button"
          className={styles.snippetCopy}
          onClick={() => onCopy(snippet, copyId)}
          title={copied === copyId ? "Copied" : `Copy ${activeTabLabel} example`}
          aria-label={copied === copyId ? `${activeTabLabel} example copied` : `Copy ${activeTabLabel} connection example`}
        >
          <span className="material-symbols-outlined text-[18px]">{copied === copyId ? "check" : "content_copy"}</span>
        </button>
      </div>

      {needsKey && (
        <p className={styles.connectGuidance}>
          Create an active key in the credential registry below, then replace <code>sk-your-api-key</code> before running the sample.
        </p>
      )}
    </section>
  );
}

QuickConnectSnippet.propTypes = {
  baseUrl: PropTypes.string.isRequired,
  hasApiKey: PropTypes.bool.isRequired,
  requireApiKey: PropTypes.bool.isRequired,
  copied: PropTypes.string,
  onCopy: PropTypes.func.isRequired,
};
