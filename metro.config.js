const { getSentryExpoConfig } = require("@sentry/react-native/metro");
const path = require("path");

const config = getSentryExpoConfig(__dirname);

// .claude worktree dizini Metro tarafından taranmasın
config.watchFolders = (config.watchFolders ?? []).filter(
  (f) => !f.includes(".claude")
);
config.resolver = {
  ...config.resolver,
  blockList: [
    ...(Array.isArray(config.resolver?.blockList)
      ? config.resolver.blockList
      : config.resolver?.blockList
        ? [config.resolver.blockList]
        : []),
    /\.claude\/.*/,
  ],
};

module.exports = config;
