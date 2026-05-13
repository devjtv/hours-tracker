# Hours Tracker

Local-first desktop hours tracker for mac, styled after the attached reference.

## Included

- Dark native-style timeline UI with entries grouped by day
- Quick-add popover for time entries
- Project autocomplete based on previous entries
- Task colors and tag system
- Local device storage through Electron main process
- AI end-of-day report generation using your own provider endpoint, model, and API key
- Electron packaging config for mac `.dmg`

## Stack

- Electron
- React
- TypeScript
- Vite

## Local development

```bash
npm install
npm run dev
```

## Package for mac

```bash
npm run package:mac
```

## Releasing a new version

The app uses [electron-updater](https://www.electron.build/auto-update) with GitHub Releases as the update feed. To cut a new release:

1. Bump `version` in `package.json` (e.g. `0.1.0` → `0.1.1`). Use semver.
2. Commit and tag the bump, then push:
   ```bash
   git commit -am "Release v0.1.1"
   git tag v0.1.1
   git push && git push --tags
   ```
3. Export a GitHub token with `repo` scope so electron-builder can upload the release:
   ```bash
   export GH_TOKEN=ghp_xxx
   ```
4. Build and publish:
   ```bash
   npm run release:mac
   ```

This creates a **draft** release on GitHub with the `.dmg`, `.zip`, and `latest-mac.yml` attached. Open the release on GitHub, write release notes, and click **Publish release**.

Installed apps check `latest-mac.yml` on launch and prompt to restart once a new version finishes downloading. Auto-installs work reliably only for code-signed apps — without signing, users may need to manually drag the new `.app` into Applications.

## AI provider notes

Settings supports an OpenAI-compatible chat completions endpoint out of the box.

Examples:

- OpenAI: `https://api.openai.com/v1/chat/completions`
- OpenRouter: `https://openrouter.ai/api/v1/chat/completions`
- Other compatible gateways: use their chat completions URL

If you want Anthropic/Gemini-specific request formats later, add provider adapters in `electron/main.cjs`.
