// Ergänzt app.json: Build-Nummer aus der CI, eigene Config-Plugins.
module.exports = ({ config }) => {
  const build = parseInt(process.env.BUILD_NUMBER || '', 10);
  const version = process.env.APP_VERSION || config.version;
  return {
    ...config,
    version,
    ios: { ...config.ios, ...(build ? { buildNumber: String(build) } : {}) },
    android: { ...config.android, ...(build ? { versionCode: build } : {}) },
    plugins: [...(config.plugins || []), './plugins/withoutPushEntitlement', './plugins/withReleaseSigning'],
  };
};
