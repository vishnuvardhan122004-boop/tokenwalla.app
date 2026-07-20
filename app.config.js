// Extends the static config in app.json.
//
// google-services.json is gitignored, so EAS Build (which only uploads
// git-tracked files) can't see it. It's uploaded to EAS as a secret file
// env var instead; on the builder GOOGLE_SERVICES_JSON holds the path to
// the materialised file. Locally the env var is unset and we fall back to
// the checked-out file at the repo root.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    googleServicesFile:
      process.env.GOOGLE_SERVICES_JSON ?? config.android.googleServicesFile,
  },
});
