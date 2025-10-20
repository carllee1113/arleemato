// Vercel serverless function to create Notion pages from pomodoro notes
// Single-parent database with tag classification. Falls back to page parents if database not configured.
// Env vars:
// - NOTION_TOKEN: Notion integration secret (Bearer token)
// - NOTION_DATABASE_ID: Target Notion database to store all notes
// Optional fallback (if NOTION_DATABASE_ID is not set):
// - NOTION_NOTES_PAGE_ID, NOTION_DO_LATER_PAGE_ID, NOTION_IDEA_PAGE_ID
//
// POST body JSON: { entries: [ { header: string, body: string } ] }
// Header format: "YYYY-MM-DD HH:mm <TypeLabel>: " where TypeLabel ∈ {Notes, Do Later, Idea}

module.exports = async (req, res) => {
  // CORS: allow web app to call this endpoint
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const token = process.env.NOTION_TOKEN;
  const databaseId = process.env.NOTION_DATABASE_ID;
  const parentIds = {
    NOTE: process.env.NOTION_NOTES_PAGE_ID,
    DO_LATER: process.env.NOTION_DO_LATER_PAGE_ID,
    IDEA: process.env.NOTION_IDEA_PAGE_ID,
  };

  if (!token) {
    return res.status(500).json({ error: 'Missing NOTION_TOKEN env' });
  }

  let entries;
  try {
    // Safely parse JSON body for environments that provide body as string
    let data = req.body;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch (_) { data = {}; }
    }
    data = data || {};
    entries = Array.isArray(data.entries) ? data.entries : [];
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!entries.length) {
    return res.status(200).json({ ok: true, created: 0, details: [] });
  }

  const results = [];
  for (const entry of entries) {
    const parsed = parseHeader(entry.header || '');
    const body = (entry.body || '').trim();
    if (!body) { results.push({ ok: false, error: 'Empty body' }); continue; }

    try {
      let resp;
      if (databaseId) {
        resp = await notionCreatePageInDatabase(token, databaseId, parsed, body);
      } else {
        const parent = parentIds[parsed.type];
        if (!parent) {
          results.push({ ok: false, error: `Missing parent page for ${parsed.type}` });
          continue;
        }
        const title = `${parsed.dateStr} - ${parsed.typeLabel}`;
        resp = await notionCreatePageUnderPage(token, parent, title, parsed, body);
      }
      const ok = resp && (resp.status === 200 || resp.status === 201);
      results.push({ ok, status: resp?.status });
    } catch (err) {
      results.push({ ok: false, error: String(err) });
    }
  }

  return res.status(200).json({ ok: true, created: results.filter(r => r.ok).length, details: results });
};

function parseHeader(header) {
  const m = header.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(Notes|Do Later|Idea):\s*/);
  const dateStr = m ? `${m[1]} ${m[2]}` : new Date().toISOString().slice(0,16).replace('T',' ');
  const typeLabel = m ? m[3] : 'Notes';
  const tagName = typeLabel.toLowerCase();
  const map = { 'Notes': 'NOTE', 'Do Later': 'DO_LATER', 'Idea': 'IDEA' };
  const type = map[typeLabel] || 'NOTE';
  return { dateStr, typeLabel, type, tagName };
}

function buildChildren(parsed, body) {
  return [
    { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: body } }] } }
  ];
}

async function notionCreatePageInDatabase(token, databaseId, parsed, body) {
  const title = `${parsed.dateStr} - ${parsed.typeLabel}`;
  // Requires database with properties: Name (title), Tags (multi_select)
  return fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify({
      parent: { database_id: databaseId },
      properties: {
        Name: { title: [{ text: { content: title } }] },
        Tags: { multi_select: [{ name: parsed.tagName }] }
      },
      children: buildChildren(parsed, body)
    })
  });
}

async function notionCreatePageUnderPage(token, parentPageId, title, parsed, body) {
  return fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28'
    },
    body: JSON.stringify({
      parent: { page_id: parentPageId },
      properties: {
        title: [{ type: 'text', text: { content: title } }]
      },
      children: buildChildren(parsed, body)
    })
  });
}