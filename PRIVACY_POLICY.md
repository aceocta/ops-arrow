# Privacy Policy — Ops Arrow

**Last updated:** 2 June 2026
**Effective date:** 1 June 2026

## 1. Who we are

This Privacy Policy explains how **Aceocta Limited** ("**we**", "**us**", "**our**") collects, uses, shares and protects personal data when you use the **Ops Arrow** mobile application, web application, and related services (together, the "**Service**").

- **Registered address:** 15 Pelham Road South, Gravesend DA11 8QN, UK.
- **Company number:** 16687119
- **Contact for privacy queries:** support@aceocta.com

For the purposes of the UK GDPR, the Data Protection Act 2018, and the EU GDPR:

- We are the **data controller** for personal data of account holders (business owners, managers and staff who sign in to Ops Arrow).
- Where a business customer uses Ops Arrow to record the personal data of **third parties** — for example, visitors signing into a shop's visitor log, customers refused alcohol or age-restricted goods, or delivery suppliers — the **business customer is the data controller** for that third-party data, and **Aceocta Limited acts as a data processor** on their behalf in accordance with our Data Processing Agreement.

---

## 2. The Service in summary

Ops Arrow is a multi-tenant operations platform for shops, forecourts and small retail businesses. A company can run one or more shops, each with its own staff, roles and feature configuration. Depending on the plan and the modules a shop has enabled, it supports:

- **Shift & day management:** opening and closing shifts, recording opening/closing serial numbers, and end-of-day cash reconciliation (sales totals, prize payouts, expected vs. actual cash, notes and attachments).
- **Scratch-card management:** pack stock, activation and reconciliation; sales and missing-ticket tracking; closing-number entry by on-device camera scan or manual entry.
- **Store sales (till reports):** capturing a photograph of a till report and extracting income/expense lines and totals by OCR.
- **Deliveries:** recording delivery notes, with optional AI-assisted parsing of supplier, references, dates and line items.
- **Safe drop management:** recording cash drops into a safe/canister, with an optional manager approval workflow and cash-variance checks.
- **Temperature logs:** scheduled temperature checks per monitoring unit, with reminders and missed-check alerts.
- **Compliance checklists:** daily, weekly and monthly compliance checks with optional photo evidence and manager sign-off.
- **Refusal register:** "No ID, No Sale" refusal records with optional signatures and manager review.
- **Visitor sign-in log:** digital visitor/contractor sign-in with signatures, optional photos and (at forecourts) permit-to-work / passport references.
- **Reports & notifications:** shift-close and day-end reports and reminders, delivered by push notification, email and (optionally) WhatsApp.
- **Subscriptions:** paid plans and per-shop feature access managed through Stripe.

It is offered as a mobile application (iOS, Android) and a web application for administrators.

---

## 3. Personal data we collect

### 3.1 Account holder data (business owners, managers, staff)

When you create or are invited to a user account, we collect:

- **Identity:** first name, last name, email address.
- **Authentication:** password (stored only as a salted PBKDF2 hash via ASP.NET Core Identity — we never see or log it in plain text), password-reset token, signup email-verification code (stored as a one-way hash).
- **Profile:** phone number (optional, with international country code), role within your company.
- **Federated sign-in identifiers:** if you sign in with Apple or Google, we receive your name, email and the provider's user identifier.
- **Session security:** refresh tokens used to keep you signed in are stored only as a one-way hash, with rotation and revocation records used to detect token reuse.
- **Device data for push notifications:** an FCM/APNs device token, platform (iOS/Android), device name, registration date.
- **Last login timestamp.**

### 3.2 Business and shop data

When you set up a business in Ops Arrow we collect:

- **Company:** company name, registration number, billing email, billing phone, registered address (line 1, line 2, city, postcode, country), status flags, the Stripe customer ID we create for billing.
- **Shop / site:** shop name, address, country, fuel-station flag, feature configuration.
- **Shop-user assignments:** which user is assigned to which shop, in which role, invited by whom and when.

### 3.3 Operational data you create in the Service

These records are entered by your staff during normal use:

- **Shifts:** name, start/end times, opened-by user, closed-by user, free-text shift notes, attachments (photos of cash drawer, etc.).
- **Business days:** date, totals (sales, prize payouts, expected cash, difference), notes, attachments.
- **Scratch-card packs:** serial numbers, sales totals, reconciliations.
- **Till reports:** photograph uploaded by you, OCR-extracted text, classified income/expense lines, totals.
- **Delivery notes:** supplier name, delivery date, reference, attached note photo, AI-parsed line items, free-text notes.
- **Compliance checks (daily/weekly/monthly):** result, notes, action required, close-out notes, attachments, who recorded and reviewed each entry.
- **Cash management:** prize payouts and safe-drop ("canister") records, including the staff member who recorded or approved each, and approval notes.
- **Temperature readings:** date, time, temperature, out-of-range flag, staff initials, action taken.
- **Notifications you send** via the Service (push, email, WhatsApp).

### 3.4 Third-party personal data your business records

If you operate features that capture data about people **other than** your staff, that data is processed by us **on your behalf** as a processor:

- **Visitor log:** visitor full name, organisation, phone number, visit type, purpose, host name, **vehicle registration**, **signature image**, **photograph of the visitor** (optional), inductions acknowledged, SPA passport / permit-to-work reference (forecourts).
- **Refusal register:** description of the person refused, observations, staff initials, signature image, review notes, review signature.

> Vehicle registration plates and signature images are personal data under the UK/EU GDPR. Photographs of identifiable individuals are personal data, and photographs of children would be special-category data. The business customer is responsible for collecting these lawfully and displaying its own notice at the point of sign-in.

### 3.5 Subscription and payment data

All paid subscriptions to Ops Arrow are processed by **Stripe**, including those started from the mobile app. On mobile we open Stripe Checkout in your device's in-app browser sheet (Safari View Controller on iOS, Custom Tabs on Android); the payment itself takes place on Stripe's website, not inside the app. We do **not** use Apple In-App Purchase or Google Play Billing.

We collect:

- Plan tier, subscription status, trial dates, renewal dates.
- Stripe customer ID, Stripe subscription ID, payment status, last-4 card digits and expiry (received from Stripe — we never see full card numbers).
- Invoice records and payment transaction history (including raw Stripe response payloads, retained for reconciliation).

### 3.6 Technical data collected automatically

- **Device data:** model, operating system version, app version, language, time zone.
- **Push token:** the FCM/APNs token issued by your device's OS, used solely to deliver notifications.
- **IP address:** logged by our hosting provider for each API request, and recorded in our **Audit Log** alongside the action you performed, for security and accountability.
- **Crash / performance diagnostics:** anonymous aggregate telemetry only. No third-party analytics, advertising or crash-reporting SDK is currently integrated; the app ships with pluggable analytics/crash interfaces that are inactive by default, and debug logging is disabled in production builds.

We do **not** collect: GPS or precise location, contacts, calendar, microphone, SMS or call-log data, browsing history outside the Service, or biometric identifiers (other than signature images you voluntarily record in the visitor / refusal registers).

### 3.7 Sensitive data

We do **not** intentionally collect special-category data (race, religion, health, biometrics, sexual orientation, political opinions, trade-union membership). Free-text fields (shift notes, refusal observations, compliance action descriptions, temperature comments, visitor purpose, delivery notes) may incidentally contain personal data if your staff enter it. Please train staff not to enter special-category data into free-text fields.

### 3.8 Children's data

The Service is not directed at children under 16. We do not knowingly collect personal data from anyone under 16. If a child has been recorded in your visitor log or refusal register, the business customer is the controller for that data and must comply with applicable child-protection rules.

---

## 4. How we use your personal data and the legal basis for processing

| Purpose | Data used | Legal basis (UK/EU GDPR) |
|---|---|---|
| Create and manage your user account | Identity, authentication, profile | **Contract** (Art. 6(1)(b)) |
| Authenticate sign-in (including federated Apple/Google sign-in) | Email, password hash, OAuth identifiers, device data | **Contract** |
| Secure the Service, prevent fraud, audit administrative actions | IP address, audit log entries | **Legitimate interests** (Art. 6(1)(f)) |
| Provide operational features (shifts, deliveries, till, compliance, visitor logs, etc.) | Operational data you enter | **Contract** (with the business customer as joint subject) |
| Process subscription payments | Subscription / payment data | **Contract**; **Legal obligation** (Art. 6(1)(c)) for tax records |
| Send transactional emails (sign-up verification, password reset, invitations, receipts) | Email address, verification codes | **Contract** |
| Send push notifications about shifts, day-end and reports | FCM/APNs token, operational data | **Contract** |
| Send WhatsApp notifications | Phone number, operational data | **Consent** (Art. 6(1)(a)) — withdraw at any time |
| Send marketing emails | Email address | **Consent** — opt-in only, unsubscribe link in every message |
| AI-assisted parsing of delivery notes | The image you upload | **Contract** — you chose to use the feature |
| OCR of till report photographs | The image you upload | **Contract** |
| Customer support | Any data you share when contacting us | **Legitimate interests** |
| Comply with legal obligations (court orders, HMRC) | As required | **Legal obligation** |
| Improve the Service via aggregate, anonymised analytics | Anonymous usage data | **Legitimate interests** |

We do **not** carry out automated decision-making with legal or similarly significant effects, and we do **not** sell your personal data.

### 4.1 On-device vs cloud image processing

It is important to understand the difference in how images are handled:

- **On-device only:** when you scan scratch-card tickets or barcodes, text recognition runs **locally on your device** using on-device machine learning (ML Kit). Those camera images are **not transmitted** to us or any third party — only the extracted text/result is used.
- **Sent to the cloud:** when you photograph a **till report** or a **delivery note** and upload it, that image is sent to a cloud OCR/AI provider (Azure AI Document Intelligence or OpenAI respectively) to extract the data, and to Azure Blob Storage if you save it as an attachment. AI/OCR output may be inaccurate and should be reviewed before you rely on it.

---

## 5. Who we share your data with

We share personal data only with the categories of recipient below, and only as needed to provide and operate the Service.

### 5.1 Sub-processors (service providers)

| Sub-processor | Purpose | Location of processing |
|---|---|---|
| **Microsoft Azure** (Microsoft Ireland Operations Ltd) — Azure SQL Database, Azure Blob Storage | Application hosting; storage of all account, business and operational data; storage of all uploaded attachments (delivery photos, till report photos, signatures, compliance attachments) | **UK South** (production and UAT) |
| **Microsoft Azure AI — Document Intelligence** | OCR of till report photographs | EU / Microsoft region |
| **OpenAI** | AI-assisted parsing of delivery notes you upload (gpt-4.1-mini). OpenAI does not use API content to train its models. | US — safeguarded transfer |
| **Stripe Payments Europe Ltd** | All subscription billing and card processing (web and mobile). On mobile, Stripe Checkout opens in the device's in-app browser sheet. | EU / US |
| **Apple Inc.** / **Google LLC** | Push notification delivery (APNs / FCM) and operating-system services. We do **not** use Apple In-App Purchase or Google Play Billing. | US |
| **Google Firebase** (Cloud Messaging) | Push notification token issuance and delivery (relayed via Apple APNs on iOS devices) | US |
| **Meta Platforms Ireland Ltd** (WhatsApp Business Cloud API) | Optional WhatsApp message delivery | EU / US |
| **Hostinger** | Transactional email delivery (SMTP) | EU (Lithuania) |
| **Apple Sign-In** / **Google Sign-In** | Federated authentication if you choose those sign-in methods | US |

Each sub-processor is engaged under a written contract requiring it to process personal data only on our instructions and to keep it confidential and secure.

We do **not** currently use any third-party analytics, advertising, A/B testing, attribution, crash-reporting (e.g. Sentry, Crashlytics) or product-analytics (e.g. Mixpanel, Amplitude, PostHog, Google Analytics, Segment) services. If we add any in the future, we will update this policy and (where required) seek your consent.

### 5.2 Your employer / business customer

If you use the Service as part of a team, administrators of the business that invited you can see records you created in the Service (shifts you opened, reports you submitted, notes you wrote, visitor log entries you recorded).

### 5.3 Legal and safety disclosures

We may disclose personal data when required by law, court order, or in response to a lawful request by a public authority, or where we believe in good faith that disclosure is necessary to protect our rights, the rights of our customers, or the safety of others.

### 5.4 Business transfers

If we are involved in a merger, acquisition, reorganisation, bankruptcy or sale of assets, your personal data may be transferred. We will notify you and any new owner will be bound by this Privacy Policy or give you notice before your data becomes subject to a different policy.

### 5.5 We do not sell your data

We do not sell, rent, or trade your personal data to third parties for their marketing purposes.

---

## 6. International transfers

Some sub-processors are located outside the UK and European Economic Area (notably in the United States). When personal data is transferred outside the UK/EEA we rely on appropriate safeguards:

- The **UK International Data Transfer Agreement (IDTA)** or the **UK Addendum** to the EU **Standard Contractual Clauses (SCCs)**, or
- An **adequacy decision** issued by the UK Government or the European Commission (for example, the **EU–US Data Privacy Framework** for certified US providers such as Stripe, Microsoft and Google).

You can request a copy of the safeguards in place by writing to support@aceocta.com.

---

## 7. How long we keep your data

| Data category | Retention |
|---|---|
| Account data | While your account is active, plus up to **30 days** after deactivation, then permanently deleted |
| Federated sign-in identifiers (Apple, Google) | Same as account data |
| Audit log (including IP address) | **12 months** |
| Sign-in / authentication logs | **90 days** |
| Business operational data (shifts, reports, attachments, compliance records, visitor logs) | While your subscription is active, plus **90 days** grace period after cancellation |
| Subscription / payment records | **7 years** from the end of the relevant tax year (UK HMRC requirement) |
| Marketing email subscribers | Until you unsubscribe, plus a permanent suppression record so we do not contact you again |
| Crash and diagnostic logs | **30 days** |
| Backups | Encrypted and rotated; deleted within **35 days** |
| Push notification tokens | While the device remains active; cleared on sign-out, account deletion, or after **6 months** of inactivity |
| Signup email-verification codes | **24 hours** after issue (whichever is sooner: use or expiry) |
| Password-reset tokens | **2 hours** after issue or on use |
| Refresh tokens | Until expiry, sign-out or rotation; revoked tokens retained briefly for reuse detection |

After a retention period expires we delete or irreversibly anonymise your personal data, subject to legal retention obligations.

---

## 8. How we keep your data secure

- All data in transit is encrypted with **TLS 1.2 or higher**.
- All data at rest in Azure SQL and Azure Blob Storage is encrypted with **AES-256** (Azure default).
- Passwords are stored as **salted PBKDF2 hashes** via ASP.NET Core Identity; signup verification codes, password-reset tokens and refresh tokens are also stored as one-way hashes. We never see, log or store plain-text credentials.
- API access requires a JSON Web Token bearer credential issued only after successful authentication; access tokens are short-lived and refreshed using rotating refresh tokens with reuse detection.
- On mobile, access and refresh tokens are stored in the operating system's secure keystore (**iOS Keychain** / **Android EncryptedSharedPreferences**) via `expo-secure-store`.
- Multi-tenant isolation: each request is scoped to the user's company and shop; cross-tenant data access is rejected at the API authorisation layer.
- Subscription payments are processed entirely by Stripe — we never see your full card number.
- Access to production systems is limited to authorised personnel, protected by multi-factor authentication, and logged.
- We perform regular security reviews and apply patches to our dependencies.

No system is 100% secure. If we discover a personal-data breach that is likely to result in a risk to your rights and freedoms, we will notify the relevant supervisory authority within 72 hours and, where required, notify you directly.

---

## 9. Your rights

Under UK GDPR and EU GDPR you have the right to:

- **Access** the personal data we hold about you.
- **Rectify** inaccurate or incomplete data.
- **Erase** your data ("right to be forgotten"), subject to legal retention obligations.
- **Restrict** processing in certain circumstances.
- **Portability** — receive your data in a structured, machine-readable format.
- **Object** to processing based on legitimate interests.
- **Withdraw consent** at any time where processing is based on consent (e.g. marketing emails, WhatsApp notifications). Withdrawing consent does not affect the lawfulness of processing before withdrawal.
- **Not be subject to automated decision-making** with legal or similarly significant effects.

To exercise these rights, email **support@aceocta.com** or use the **Delete my account** option in your profile within the app. We will respond within one month. There is no fee unless your request is manifestly unfounded or excessive.

### 9.1 California residents (CCPA / CPRA)

If you reside in California, you also have the right to know what categories of personal information we collect, to delete or correct your personal information, to opt out of any "sale" or "sharing" (we do neither), and to non-discrimination for exercising your rights. To exercise these rights, contact us at the email above.

### 9.2 Complaints

- **UK:** Information Commissioner's Office (ICO) — https://ico.org.uk — Tel 0303 123 1113
- **EU:** Your local Data Protection Authority — list at https://edpb.europa.eu

We would appreciate the chance to deal with your concerns before you approach the ICO, so please contact us first.

---

## 10. Cookies and similar technologies

### 10.1 Web application (admin portal)

The Ops Arrow web app uses **browser local storage** (not cookies) for:

- `adminweb.accessToken` — your sign-in token (cleared on sign-out).
- `adminweb.profile` — your name, email and role, so the app can render without an extra round-trip.

We do **not** use advertising cookies, third-party trackers (Google Analytics, Facebook Pixel, etc.), or cross-site tracking.

### 10.2 Mobile application

The mobile app does not use cookies. It stores:

- The access and refresh tokens in the OS secure keystore (iOS Keychain / Android EncryptedSharedPreferences) via `expo-secure-store`.
- The currently selected shop in the same secure keystore.
- A cached copy of your profile in standard React Native storage so the app can render offline.

---

## 11. Permissions the mobile app requests

| Permission | Why we ask | Optional? |
|---|---|---|
| **Camera** | Capture photographs of till reports, delivery notes, shift attachments, visitor photographs, and to scan barcodes / scratch-card tickets | Yes — only requested when you tap a camera button |
| **Photo library** | Pick existing photographs to attach to deliveries, till reports or compliance records | Yes |
| **Push notifications** (POST_NOTIFICATIONS on Android 13+, APNs on iOS) | Send alerts about shift events and reports | Yes — denial does not affect any other feature |
| **Background notification delivery** (`remote-notification` background mode on iOS) | Receive push payloads when the app is in the background | Required for push to work |
| **Network access** | Communicate with our servers | Required |

We do **not** request: location, contacts, microphone, calendar, SMS, call-log, file-system browsing, or any sensor data.

---

## 12. Push notifications, email and WhatsApp

- **Push:** delivered via Google Firebase Cloud Messaging (FCM), which relays to Apple Push Notification service (APNs) on iOS. You can disable push at any time in your device settings; you can also remove a specific device's token by signing out on that device.
- **Email:** transactional and marketing email is sent via Hostinger SMTP. Marketing emails include an unsubscribe link.
- **WhatsApp:** if a business administrator has enabled the WhatsApp notifications feature and you have provided a phone number, shift-close and day-end report summaries may be sent to that number via the Meta WhatsApp Business Cloud API. Standard WhatsApp terms apply. You may opt out by removing your phone number in profile settings or by replying STOP to the WhatsApp message.
- **Billing:** subscription payments are processed by **Stripe** for both the web app and the mobile app. On mobile, when you choose a plan we open Stripe Checkout in your device's in-app browser sheet — we do not use Apple In-App Purchase or Google Play Billing.

---

## 13. Visitor-log and refusal-register notice (for our business customers)

If you use the Ops Arrow visitor-log or refusal-register features, **you** are the data controller for the personal data of the third parties whose details are recorded (visitors, refused customers, contractors). You must:

- Display a clear notice at the point of capture explaining who you are, what data you are collecting, why, how long you will keep it, and how the person can exercise their rights.
- Collect data lawfully (consent, legitimate interests, or other Art. 6 basis).
- Not collect more than is necessary — for example, do not record vehicle registration unless your site rules require it.
- Respond to subject-access and erasure requests from those third parties; we will assist as a processor where required by our Data Processing Agreement.
- Restrict admin access in Ops Arrow so that only authorised staff can view this data.

---

## 14. Third-party links

The Service may contain links to third-party websites (for example, Stripe's payment portal, Apple/Google subscription management). We are not responsible for the privacy practices of those third parties. We encourage you to read their privacy notices.

---

## 15. Changes to this Privacy Policy

We may update this Privacy Policy from time to time. The "Last updated" date at the top shows when it was last revised. If we make material changes we will notify you by email or in-app notice at least 14 days before the change takes effect. Continued use of the Service after the effective date constitutes acceptance of the revised policy.

---

## 16. Contact us

If you have any questions about this Privacy Policy or wish to exercise any of your rights, please contact us:

- **Email:** support@aceocta.com
- **Post:** Aceocta Limited, 15 Pelham Road South, Gravesend DA11 8QN, UK.

---

_End of Privacy Policy._
