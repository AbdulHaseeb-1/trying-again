#!/usr/bin/env node

const { execSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

function getLanIp() {
  try {
    const output = execSync('powershell -Command "(Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias \\"*\\" | Where-Object { $_.IPAddress -notlike \\"127.*\\" -and $_.IPAddress -notlike \\"169.254.*\\" }).IPAddress"', { encoding: 'utf-8' });
    const ips = output.trim().split('\n').filter(Boolean);
    return ips[0] || 'localhost';
  } catch {
    return 'localhost';
  }
}

function main() {
  const lanIp = getLanIp();
  const envPath = path.resolve(__dirname, '../.env');
  const content = `EXPO_PUBLIC_CALENDAR_API_URL=http://${lanIp}:4000\n`;
  
  fs.writeFileSync(envPath, content);
  console.log(`Updated .env with LAN IP: ${lanIp}`);
  console.log(`Frontend will call API at: http://${lanIp}:4000`);
}

main();