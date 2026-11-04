// Android: Release-APK mit eigenem Keystore signieren, wenn die
// Umgebungsvariablen gesetzt sind (in der CI aus GitHub-Secrets).
// Ohne Keystore wird mit dem Debug-Key signiert (nur zum Testen!).
const { withAppBuildGradle } = require('expo/config-plugins');

const RELEASE_CONFIG = `
        release {
            if (System.getenv("FAMILYCAL_KEYSTORE")) {
                storeFile file(System.getenv("FAMILYCAL_KEYSTORE"))
                storePassword System.getenv("FAMILYCAL_KEYSTORE_PASSWORD")
                keyAlias System.getenv("FAMILYCAL_KEY_ALIAS")
                keyPassword System.getenv("FAMILYCAL_KEY_PASSWORD")
            }
        }`;

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      console.warn('[withReleaseSigning] build.gradle ist nicht Groovy – Signierung bitte manuell einrichten.');
      return cfg;
    }
    let src = cfg.modResults.contents;
    if (src.includes('FAMILYCAL_KEYSTORE')) return cfg;

    src = src.replace(/signingConfigs\s*\{/, (m) => m + RELEASE_CONFIG);

    const bt = src.indexOf('buildTypes {');
    const rel = src.indexOf('release {', bt);
    const sc = src.indexOf('signingConfig signingConfigs.debug', rel);
    if (bt < 0 || rel < 0 || sc < 0) {
      console.warn('[withReleaseSigning] release-Block nicht gefunden.');
    } else {
      src =
        src.slice(0, sc) +
        'signingConfig System.getenv("FAMILYCAL_KEYSTORE") ? signingConfigs.release : signingConfigs.debug' +
        src.slice(sc + 'signingConfig signingConfigs.debug'.length);
    }
    cfg.modResults.contents = src;
    return cfg;
  });
};
