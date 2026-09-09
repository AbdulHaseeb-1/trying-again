// Learn more https://docs.expo.io/guides/customizing-metro
const { getDefaultConfig } = require('expo/metro-config');
const path = require('node:path');

const config = getDefaultConfig(__dirname);

// The NestJS calendar service lives in `server/` and is never bundled into the
// app. Keeping it out of Metro's watch tree avoids crawling a second
// node_modules and the duplicate-package errors that come with it.
config.resolver.blockList = [
  ...(Array.isArray(config.resolver.blockList)
    ? config.resolver.blockList
    : config.resolver.blockList
      ? [config.resolver.blockList]
      : []),
  new RegExp(`^${path.resolve(__dirname, 'server').replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[/\\\\].*`),
];

module.exports = config;
