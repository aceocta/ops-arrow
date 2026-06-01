# Pre-Release Checklist — iOS TestFlight / Android Internal Testing

**App:** Ops Arrow (ScratchCard)
**Bundle ID:** `com.aceocta.opsarrow`
**Target version:** `1.0.2` (versionCode `2`) — bump if already used in either store

> Tick each box as you complete the step. Items already verified are pre-ticked.

---

## 1. Backend — `ScratchCard.Api/appsettings.json`

- [ ] **`FirebasePush:ServiceAccountFilePath`** — change from `J:\ScratchCard\...` (Windows-only dev path) to a path that resolves on Azure App Service (e.g. relative `firebase-adminsdk.json`); upload the JSON to the deployment.
- [ ] **`WhatsApp:AccessToken`** — populate with the long-lived Meta Business token, OR disable the `notifications.whatsapp` plan feature for test tenants.
- [ ] **`WhatsApp:TemplateName`** — set to the approved Meta template name.
- [ ] **`Stripe:SecretKey`** — switch from `sk_live_...` to `sk_test_...` for the test channel (testers will otherwise be charged real money).
- [ ] **`Stripe:WebhookSecret`** — switch to the **test** webhook signing secret matching the test endpoint in Stripe Dashboard.
- [ ] **`Auth:PasswordResetBaseUrl` / `Invitation:InvitationAcceptBaseUrl`** — confirm UAT URL is the intended landing (currently `wa-ops-arrow-uat-...azurewebsites.net`).
- [ ] Restart UAT Azure App Service so the `AddUserPhoneNumber` migration auto-applies.
- [ ] Verify the migration ran:
  ```sql
  SELECT MigrationId FROM __EFMigrationsHistory
  WHERE MigrationId LIKE '%AddUserPhoneNumber%';
  ```
- [x] `dotnet build ScratchCard.Api/ScratchCard.Api.csproj` clean (0 errors).
- [x] Test override `recipientPhone = "+447389097320"` removed from `MetaWhatsAppSender.cs`.

---

## 2. Mobile — Config

- [ ] **`ScratchCard.Mobile/.env` → `EXPO_PUBLIC_API_BASE_URL`** — replace ngrok URL (`https://gaming-lent-startup.ngrok-free.dev/api`) with the stable HTTPS UAT/prod API URL.
- [ ] **`ScratchCard.Mobile/app.json` → `extra.apiBaseUrl`** — replace `http://localhost:5268/api` with the same HTTPS URL (this is the in-binary fallback if env var isn't injected at build time).
- [ ] **`ScratchCard.Mobile/app.json` → `version`** — bump if `1.0.2` already exists in either store.
- [ ] **`ScratchCard.Mobile/app.json` → `android.versionCode`** — bump if `2` already exists in Play.
- [ ] **`ScratchCard.Mobile/app.json` → `ios.buildNumber`** — bump if already used in TestFlight.
- [x] `npx tsc --noEmit -p tsconfig.json` clean.
- [x] `console.log` calls gated by `__DEV__` (verified in `analytics.ts`, `crashReporter.ts`).

---

## 3. Mobile — Native / Firebase

- [x] Bundle ID matches across all four locations:
  - `app.json` → `ios.bundleIdentifier` = `com.aceocta.opsarrow`
  - `app.json` → `android.package` = `com.aceocta.opsarrow`
  - `google-services.json` → `package_name` = `com.aceocta.opsarrow`
  - `GoogleService-Info.plist` → `BUNDLE_ID` = `com.aceocta.opsarrow`
- [x] `POST_NOTIFICATIONS` declared in `app.json` permissions.
- [x] `POST_NOTIFICATIONS` requested at runtime for Android 13+ in `pushRegistration.ts`.
- [ ] In Firebase Console (`ops-arrow-d583c`), confirm both apps are in **Production** APNs mode (not Sandbox) — TestFlight builds use production APNs.
- [ ] APNs auth key uploaded in Firebase → Project Settings → Cloud Messaging.
- [x] Firebase native config files present in `ScratchCard.Mobile/`:
  - `GoogleService-Info.plist`
  - `google-services.json`

---

## 4. Mobile — Build (EAS)

- [ ] `eas.json` has a `preview` (or equivalent internal) profile that injects the correct `EXPO_PUBLIC_API_BASE_URL`.
- [ ] `eas build --profile preview --platform ios` succeeds.
- [ ] `eas build --profile preview --platform android` succeeds.
- [ ] iOS provisioning profile + distribution certificate valid for TestFlight.
- [ ] Android upload keystore exists in EAS credentials (`eas credentials`).

---

## 5. Store Setup

### App Store Connect (iOS)

- [ ] App record created with bundle ID `com.aceocta.opsarrow`.
- [ ] TestFlight internal testers group exists and includes the right Apple IDs.
- [ ] Export compliance question answered (encryption: usually "uses only standard HTTPS").
- [ ] Privacy policy URL filled in (required because the app collects user data: phone, possibly location).
- [ ] App Privacy → Data Collection form completed.

### Google Play Console (Android)

- [ ] App record created with package name `com.aceocta.opsarrow`.
- [ ] Internal Testing track set up with tester email list.
- [ ] Content rating questionnaire submitted.
- [ ] Data Safety form completed.
- [ ] Target API level meets current Play requirement (API 34+ as of 2025).

---

## 6. Smoke Test (after upload, before notifying testers)

Install the internal build on **one real iOS device** and **one real Android device**, then:

- [ ] App launches without crash, sign-in screen renders.
- [ ] Sign in succeeds (proves API URL + HTTPS work).
- [ ] Push permission prompt appears on first launch (iOS) / after sign-in (Android 13+).
- [ ] Test push delivers — call `POST /api/notifications/push/test?userId=<id>` as PlatformAdmin and confirm device receives it.
- [ ] Create a shift → enter closing numbers → save → push notification arrives.
- [ ] Close a shift → WhatsApp message arrives (if WhatsApp configured).
- [ ] Day-end close → report generated, downloads/opens correctly.
- [ ] Profile edit → set phone number with country code → saves (validates `AddUserPhoneNumber` migration is live).
- [ ] iPad: orientation unlock works (rotate landscape ↔ portrait), content centred at tablet width.

---

## 7. Backout Plan

- [ ] Previous UAT API deployment slot kept available in Azure (in case the migration or new code causes issues).
- [ ] Previous `versionCode` / `buildNumber` noted so a hotfix can be re-submitted without numbering conflicts:
  - Previous iOS `buildNumber`: ________
  - Previous Android `versionCode`: ________
- [ ] Plan in place to roll back EAS build (`eas build:list` → reactivate prior).

---

## Priority — fix these four first

The four items most likely to break a tester's experience the moment they install:

1. **Mobile API URL** (sections 2.1 and 2.2) — without a stable HTTPS URL, every API call fails.
2. **Stripe test keys** (section 1.4 and 1.5) — live keys = real charges on testers' cards.
3. **Firebase service-account path** (section 1.1) — Windows path won't exist on Azure, push silently fails.
4. **UAT restart for migration** (section 1.7) — without it, anything touching `Users.PhoneNumber` returns 500.

---

_Generated for pre-release sanity check._
