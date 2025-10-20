## Notion Integration Setup (Single Database with Tags)

This guide configures a single Notion database as the parent for all notes. Pages are created as rows in the database with a title and a tag indicating the note type: `Notes`, `Do Later`, or `Idea`.

### 1) Create a Notion Integration
- Go to `https://www.notion.so/my-integrations`
- Click `+ New integration`
- Name it (e.g., "Pomodoro Notes Sync")
- Save the `Internal Integration Token` – this is your `NOTION_TOKEN`
- To retrieve later: open your integration, click “Show” next to Secret.
- Share the database with this integration so it has access

How to get `NOTION_TOKEN`:
- Visit `https://www.notion.so/my-integrations`, pick your integration.
- Click “Show” next to the Secret field; copy the token.

### 2) Create a Notion Database
- Create a new database (table view is fine)
- Add properties:
  - `Name` (type: Title) – default property
  - `Tags` (type: Multi-select) – add options: `notes`, `do later`, `idea` (lowercase)
- Copy the database ID (from the URL or via the API)

### 3) Configure Environment Variables in Vercel
Set these env vars on your Vercel Project:
- `NOTION_TOKEN` – your integration token
- `NOTION_DATABASE_ID` – ID of the database created above

How to get `NOTION_DATABASE_ID`:
- Open the database as a full page in Notion.
- Click the “Share” menu → “Copy link”. The database ID is the 32-character UUID in the URL.
- Alternatively, use the Notion API to list databases and copy the `id`.

Optional fallback (only if you choose not to use a database):
- `NOTION_NOTES_PAGE_ID`, `NOTION_DO_LATER_PAGE_ID`, `NOTION_IDEA_PAGE_ID` – parent page IDs for each type

### 4) Deploy the API Function
The serverless API is at `mobile/api/notion/index.js`, exposed as `/api/notion` per `mobile/vercel.json`.
- Deploy to Vercel and verify the endpoint: `https://<your-vercel-app>/api/notion`

### 5) Configure the Mobile App Endpoint
`mobile/app.json` contains:
```json
{
  "expo": {
    "extra": {
      "notionEndpoint": "https://<your-vercel-app>/api/notion"
    }
  }
}
```
This endpoint is read in `mobile/App.js` via `expo-constants`.

### 6) How It Works
- On session completion, the app formats your notes and, upon your confirmation, posts them to `/api/notion`.
- The API parses the note header for date and type.
- If `NOTION_DATABASE_ID` is set, it creates a row in the database with:
  - `Name`: `YYYY-MM-DD HH:mm - <TypeLabel>`
  - `Tags`: multi-select with `<TypeLabel>`
  - Content: blocks built from the note body
- If the database is not configured, it falls back to creating a page under a type-specific parent page.

### Troubleshooting
- 401 Unauthorized: Check `NOTION_TOKEN` and integration permissions.
- 404 Not Found: Verify `NOTION_DATABASE_ID` or fallback page IDs.
- 400 Bad Request: Ensure properties `Name` (Title) and `Tags` (Multi-select) exist with matching option names.
- Slow uploads: Use confirmation to avoid unnecessary syncs.

### Security
- Tokens are stored in Vercel env vars and used server-side only.
- Client never accesses `NOTION_TOKEN`.
- All communication is over HTTPS.