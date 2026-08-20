/**
 * electron-builder config — Azure Trusted Signing via env vars.
 * Non-secret values: AZURE_CODESIGN_* (repo variables or workflow env).
 * Auth: AZURE_TENANT_ID, AZURE_CLIENT_ID, AZURE_CLIENT_SECRET (GitHub secrets).
 */
const base = require("./package.json").build;

const azureEndpoint = process.env.AZURE_CODESIGN_ENDPOINT?.trim();
const azureProfile = process.env.AZURE_CODESIGN_CERT_PROFILE?.trim();
const azureAccount = process.env.AZURE_CODESIGN_ACCOUNT?.trim();
const azurePublisher = process.env.AZURE_CODESIGN_PUBLISHER?.trim();

const azureSignOptions =
  azureEndpoint && azureProfile && azureAccount && azurePublisher
    ? {
        publisherName: azurePublisher,
        endpoint: azureEndpoint,
        certificateProfileName: azureProfile,
        codeSigningAccountName: azureAccount,
        timestampRfc3161: "http://timestamp.acs.microsoft.com",
        timestampDigest: "SHA256",
        fileDigest: "SHA256",
      }
    : null;

module.exports = {
  ...base,
  win: {
    ...base.win,
    // Must stay true so Meetra's icon/metadata are written into the installer exe.
    // Azure Trusted Signing still runs via azureSignOptions (not the default signtool cert).
    // With this false, Windows desktop/taskbar shortcuts keep the Electron default icon.
    signAndEditExecutable: true,
    signExecutable: azureSignOptions != null,
    azureSignOptions,
  },
};
