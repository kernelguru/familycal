// Entfernt das Push-Entitlement (aps-environment), das expo-notifications
// automatisch setzt. Beim Sideloaden mit kostenloser Apple-ID lässt sich die
// App sonst nicht signieren. Lokale Benachrichtigungen funktionieren ohne.
const { withEntitlementsPlist } = require('expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (cfg) => {
    delete cfg.modResults['aps-environment'];
    return cfg;
  });
};
