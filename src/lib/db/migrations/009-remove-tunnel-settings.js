const REMOVED_SETTING_KEYS = [
  "tunnelEnabled",
  "tunnelUrl",
  "tunnelProvider",
  "tailscaleEnabled",
  "tailscaleUrl",
  "tunnelDashboardAccess",
];

const removeTunnelSettingsMigration = {
  version: 9,
  name: "remove-tunnel-settings",
  up(db) {
    const row = db.get("SELECT data FROM settings WHERE id = 1");
    if (!row?.data) return;

    let settings;
    try {
      settings = JSON.parse(row.data);
    } catch {
      return;
    }

    let changed = false;
    for (const key of REMOVED_SETTING_KEYS) {
      if (Object.prototype.hasOwnProperty.call(settings, key)) {
        delete settings[key];
        changed = true;
      }
    }

    if (changed) {
      db.run("UPDATE settings SET data = ? WHERE id = 1", [JSON.stringify(settings)]);
    }
  },
};

export default removeTunnelSettingsMigration;
