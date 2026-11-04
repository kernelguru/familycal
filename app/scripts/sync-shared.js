// Kopiert die gemeinsame Kalender-Logik aus /shared in die App.
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', '..', 'shared', 'calendar.js');
const dst = path.join(__dirname, '..', 'src', 'lib', 'calendar.js');
if (fs.existsSync(src)) {
  fs.copyFileSync(src, dst);
  console.log('shared/calendar.js -> app/src/lib/calendar.js');
} else if (!fs.existsSync(dst)) {
  console.error('shared/calendar.js nicht gefunden!');
  process.exit(1);
}
