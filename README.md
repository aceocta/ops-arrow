# Scratch Card Management System

Production-style monorepo for scratch card operations with:
- **Backend**: ASP.NET Core .NET 10 Web API, EF Core, SQL Server
- **Mobile**: React Native (Expo) with TypeScript, offline queue, barcode scanning

## Solution Layout

- `ScratchCard.Api` - REST API controllers, auth, middleware
- `ScratchCard.Application` - DTOs, interfaces, validators, business services
- `ScratchCard.Domain` - entities, enums, constants
- `ScratchCard.Infrastructure` - EF Core DbContext, repositories, seed/migrations, notifications, audit
- `ScratchCard.Shared` - shared API response/error contracts
- `ScratchCard.Mobile` - Expo app, navigation, feature screens, offline storage/sync

## Key Implemented Capabilities

### Backend
- Clean architecture project split
- Domain entities and enums for all requested business areas
- Role constants and standard error codes
- Application services for:
  - Auth profile
  - Invitations (token-hash workflow + SSO email check)
  - Users/roles activation
  - Shops/configurations
  - Games, deliveries, packs
  - Business day lifecycle
  - Shift close + offline sync ingest
  - Prize payouts + duplicate checks + limit-based approval status
  - Reports and notification logs
  - Delivery note image parsing (OpenAI vision) to prefill delivery rows
- Global exception middleware
- Standard success response wrapper and standard error payload:
  - `{ "code": "...", "message": "..." }`
- JWT bearer auth wiring (SSO-ready)
- Role-based authorization on endpoints
- Audit logging service
- Notification abstraction + email implementation + SMS stub
- EF Core migration + seed data

### Mobile
- Expo + TypeScript app scaffold
- React Navigation stack structure
- Auth context + SecureStore token persistence
- Active shop context with persisted shop selection
- API client (Axios + bearer interceptor)
- Dashboard screen (report-backed)
- Invitation acceptance screen
- Shift close screen with:
  - Active pack list
  - Scan barcode action
  - Manual entry fallback
  - Client-side serial validation/calculation
  - Read-only sold qty/sales amount calculations
  - Save draft locally
  - Finalize online or queue offline
- Barcode scanner screen (Expo Camera)
- Delivery note auto-fill:
  - Capture/import receipt photo
  - Backend AI extraction for `gameCode-packNumber` pairs
  - Auto-prefill delivery header and pack rows with game defaults
  - Unknown game handling:
    - Highlight rows where game code is not yet in the shop
    - Save-time yes/no confirmation before auto-creating missing games
    - New game defaults on auto-create: price from note, tickets per pack `100`, serial `00->99`, commission `0`
  - Warning surfacing for unknown game codes / duplicate packs
- Offline queue (SQLite)
- Pending sync screen + manual retry
- NetInfo-based auto-sync bootstrap
- Placeholder screens for remaining requested modules/reports/admin sections

### Multi-Shop Under Company
- Backend `Company` entity with `Shop.CompanyId` relationship.
- ShopOwner company APIs:
  - `POST /api/companies`
  - `PUT /api/companies/{id}`
  - `GET /api/companies/{id}`
  - `GET /api/companies/mine`
- Shop APIs support company-aware filtering:
  - `GET /api/shops?companyId=...`
  - `POST /api/shops` with `companyId` or `companyName`
- Auth profile includes `companyId` and `companyName` for each shop assignment.
- Mobile includes:
  - Shop selector screen grouped by company.
  - Active shop switching from Dashboard/Settings.
  - Company Management screen (create/activate/deactivate company).
  - Shop Management screen (create multiple shops under a company).
  - All operational screens use selected `activeShopId`.

## Prerequisites

- .NET SDK 10.0+
- SQL Server or LocalDB
- Node.js 20+ (tested with v22)
- Expo CLI via `npx expo`

## Backend Setup

1. Update API configuration:
   - `ScratchCard.Api/appsettings.json`
   - Set `ConnectionStrings:DefaultConnection`
   - Set `Jwt:Issuer`, `Jwt:Audience`, `Jwt:Secret` (secret must be at least 32 characters)
   - Set `GoogleAuth:AllowedClientIds` with your Google OAuth client IDs
   - Set `OpenAI:ApiKey` (or environment variable `OPENAI_API_KEY`) for delivery note parsing
   - Optionally tune `OpenAI:Model` and `OpenAI:TimeoutSeconds`
   - Configure `Email` SMTP settings

2. Apply migration:

```bash
dotnet ef database update --project ScratchCard.Infrastructure/ScratchCard.Infrastructure.csproj --startup-project ScratchCard.Api/ScratchCard.Api.csproj
```

3. Run API:

```bash
dotnet run --project ScratchCard.Api/ScratchCard.Api.csproj
```

4. Swagger (Development):
- Open `/swagger`

## Mobile Setup

```bash
cd ScratchCard.Mobile
npm install
npm run typecheck
npx expo start
```

### Mobile API Base URL
- Configure `expo.extra.apiBaseUrl` in `ScratchCard.Mobile/app.json`
- Android emulator typically needs host mapping (e.g. `http://10.0.2.2:<port>/api`)
- Configure Google client IDs in `ScratchCard.Mobile/app.json`:
  - `googleAndroidClientId`
  - `googleIosClientId`
  - `googleWebClientId`

## SSO Notes

Google SSO is implemented:
- Mobile uses `expo-auth-session/providers/google` to obtain a Google ID token
- Mobile posts ID token to backend `POST /api/auth/sso/google`
- Backend validates Google ID token with allowed Google client IDs
- Backend issues an internal app JWT used for API authorization
- Invitation acceptance enforces invited email matching before account linkage

### Development Auth Bypass

For local development only, a bypass login is available:
- API endpoint: `POST /api/auth/dev-login`
- Enabled only when both are true:
  - `ASPNETCORE_ENVIRONMENT=Development`
  - `DevAuth:EnableBypassLogin=true` in `ScratchCard.Api/appsettings.Development.json`
- Mobile shows `Dev Login (Bypass Auth)` when:
  - `expo.extra.enableDevAuthBypass=true` in `ScratchCard.Mobile/app.json`

Default dev identity values are configured in:
- `ScratchCard.Api/appsettings.Development.json` under `DevAuth`
- `ScratchCard.Mobile/app.json` under `expo.extra.devBypass*`

### Google OAuth Configuration

1. Create OAuth client IDs in Google Cloud Console:
   - Android client ID
   - iOS client ID
   - Web client ID
2. Add those client IDs:
   - Backend: `ScratchCard.Api/appsettings*.json -> GoogleAuth:AllowedClientIds`
   - Mobile: `ScratchCard.Mobile/app.json -> expo.extra.google*ClientId`
3. Ensure the same Google account email is invited and linked in system users for access.

## Offline Sync Behavior

- Shift close payload is queued in SQLite when offline
- Queue item status transitions: `PendingSync -> Syncing -> Synced/SyncFailed/Conflict`
- Auto-sync runs when network reconnects
- Conflict detection maps server `409` or `offline_sync_conflict`
- Manual retry available in Pending Sync screen

## Delivery Note Auto-Fill (AI)

- API endpoint: `POST /api/deliveries/parse-note` (multipart form fields: `shopId`, `image`)
- Access: `ShopOwner` or `Manager`
- Response includes:
  - Parsed supplier/reference/date
  - Suggested pack rows mapped to shop games
  - Warnings (unknown game code, duplicate image pack, pack already existing in shop)
- Mobile usage:
  - `Receive Delivery` screen -> `Scan Delivery Note` or `Import Photo`
  - Review and edit parsed rows before saving delivery

## Seed Data

Seed includes:
- Roles: ShopOwner, Manager, Cashier
- Default app configurations (all major groups)
- Demo shop
- Demo scratch card games

## Deployment Targets

### Backend
- Azure App Service or Azure Container Apps
- Use environment variables for connection strings, auth, SMTP

### Mobile
- Android/iOS builds via Expo EAS
- Configure bundle/package IDs in `ScratchCard.Mobile/app.json`

## Commands Used for Verification

- Backend build:

```bash
dotnet build ScratchCard.slnx
```

- Mobile type check:

```bash
cd ScratchCard.Mobile
npm run typecheck
```

## Next Production Hardening Steps

1. Restrict Google OAuth clients per environment and move JWT/Google settings to secure secret stores (Azure Key Vault/App Service settings).
2. Expand integration tests for shift close/offline sync conflict cases and financial edge conditions.
3. Replace no-op SMS provider with a real gateway (Twilio/Azure Communication Services).
4. Add CI/CD pipelines (build, test, migration validation, mobile build).
5. Implement full screen-level UX for all placeholder modules.
