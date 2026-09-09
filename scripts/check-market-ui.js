const fs = require('fs');

const read = (file) => fs.readFileSync(file, 'utf8');
const checks = [
  ['charts use native SVG paths', /react-native-svg/.test(read('src/components/market-ui.tsx')) && /<Path/.test(read('src/components/market-ui.tsx'))],
  ['charts include gradient area fill', /LinearGradient/.test(read('src/components/market-ui.tsx'))],
  ['charts expose a touch crosshair', /onTouchMove/.test(read('src/components/market-ui.tsx')) && /chartTooltip/.test(read('src/components/market-ui.tsx'))],
  ['market rows use asset icons', /AssetIcon/.test(read('src/components/market-ui.tsx'))],
  ['app icon and splash are configured', /marketpulse-icon\.png/.test(read('app.json')) && /marketpulse-splash\.png/.test(read('app.json'))],
];

for (const [label, passed] of checks) console.log(`${passed ? 'PASS' : 'FAIL'} ${label}`);
process.exit(checks.every(([, passed]) => passed) ? 0 : 1);
