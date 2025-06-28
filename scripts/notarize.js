const { notarize } = require('@electron/notarize');
const path = require('path');

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== 'darwin') return;

  const appName = context.packager.appInfo.productFilename;
  console.log('• Notarising with notarytool…');
  return await notarize({
    appBundleId: 'com.cloudcode.app',
    appPath: path.join(appOutDir, `${appName}.app`),
    tool: 'notarytool',
    keychainProfile: 'notarization-profile'
  });
};