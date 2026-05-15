# Play Store Readiness Checklist

Updated: May 15, 2026

## 11. Play Store readiness

1. Confirm AAB build can be generated: `IN PROGRESS`
- `production` profile uses `app-bundle` in `eas.json`.
- Run and complete: `npx eas build --platform android --profile production`.

2. Confirm `versionCode` is increased: `DONE`
- `android.versionCode` set to `2` in `app.json`.
- `eas.json` uses remote version source + auto increment for production builds.

3. Confirm package name is final: `DONE (SET)`
- Android package set to `com.aceocta.opsarrow` in `app.json`.
- Note: if you want a different final package, change it before first production publish.

4. Confirm app icon is Play Store ready: `PENDING`
- Play requires 512x512 PNG for store listing icon.
- Replace `assets/icon.png` with a valid square source and upload listing icon in Play Console.

5. Confirm screenshots are needed: `YES`
- Minimum store listing screenshots are required.
- Prepare phone screenshots first; add tablet screenshots if supported.

6. Confirm privacy policy is needed: `YES`
- Add public privacy policy URL in Play Console.
- Add privacy policy link/text in-app as required by policy.

7. Confirm Data Safety form requirements: `YES`
- Complete Data Safety form in Play Console before release.
- Include disclosures for app behavior and SDKs/permissions used.

8. Confirm app access/test login details are needed for Google review: `YES`
- App is login-gated, so reviewer access instructions are required.
- Provide test email/password and any special steps (MFA, OTP, role flow).

## Current project values

- App name: `Ops Arrow`
- App version: `1.0.1`
- Android package: `com.aceocta.opsarrow`
- Android versionCode: `2`
- EAS app version source: `remote`
- EAS production auto increment: `true`

## Pre-release command checklist

1. `npx eas whoami`
2. `npx eas build --platform android --profile production`
3. `npx eas submit --platform android --latest` (optional if you submit from CLI)

