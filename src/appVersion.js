function appVersionText({ platform, version, build } = {}) {
  const name = platform === 'android' ? 'Android' : platform === 'ios' ? 'Apple' : 'This screen';
  const versionText = version == null || version === '' ? '' : String(version);
  const buildText = build == null || build === '' ? '' : String(build);
  if (versionText && buildText) return `${name} version ${versionText}, build ${buildText}`;
  if (versionText) return `${name} version ${versionText}`;
  if (buildText) return `${name} build ${buildText}`;
  return name;
}

function installedAppVersion(application, constants, platform) {
  const config = constants?.expoConfig || {};
  const version = application?.nativeApplicationVersion || config.version || '';
  let build = application?.nativeBuildVersion;
  if (build == null || build === '') {
    if (platform === 'android' && config.android?.versionCode != null) build = config.android.versionCode;
    if (platform === 'ios' && config.ios?.buildNumber) build = config.ios.buildNumber;
  }
  return appVersionText({ platform, version, build });
}

module.exports = { appVersionText, installedAppVersion };
