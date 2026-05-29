# Standalone Web OAuth

DesktopCal's web build and Windows executable use the same React UI and the same c8table-backed
`EntryRepository`. There is no separate web database: desktop, web, Android, and c8table all read
and write the same table records.

## 1 OAuth App Setup

Create an OAuth App in c8table/Teable settings:

- Homepage URL: the deployed DesktopCal web URL.
- Callback URL: use the exact `回调` value shown in `设置 -> OAuth 登录`.
- For local web development this is usually `http://127.0.0.1:5600/`, or your LAN URL if you open
  the web app from another device.
- For the packaged Windows executable this is usually `http://tauri.localhost/`.
- Flow: Authorization Code with PKCE.
- Scopes: `table|read field|read field|create record|read record|create record|update record|delete`.

Only the OAuth Client ID is used by the browser. Do not put a client secret in the web app.

## 2 Local Development

```powershell
uv run --no-editable desktopcal web
```

The default Vite dev URL is:

```text
http://127.0.0.1:5600/
```

Override the port when needed:

```powershell
$env:VITE_DEV_PORT = "5610"
npm run dev:web
```

## 3 Login Options

Preferred web login:

1. Open `设置`.
2. Save the c8table OAuth Client ID in `OAuth 登录`.
3. Click `登录`.
4. Approve access in c8table.

The app stores OAuth access and refresh tokens in browser local storage and refreshes access tokens
before they expire. Manual API token entry remains available for local/internal desktop usage.

## 4 Build

```powershell
npm run build:web
```

Deploy `apps/web/dist` to a static web host. The callback URL registered in c8table must match the
deployed URL root because PKCE redirects back to that page with `code` and `state` query parameters.
