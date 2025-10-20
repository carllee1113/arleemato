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
    const data = req.body || {};
    entries = Array.isArray(data.entries) ? data.entries : [];
  } catch (e) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  if (!entries.length) {
    return res.status(200).json({ ok: true, created: 0, details: [] });
  }

  const results = [];
  for (const entry of entries) {
    const { header = '', body = '' } = entry || {};
    const parsed = parseHeader(header);

    try {
      let resp;
      if (databaseId) {
        resp = await notionCreatePageInDatabase(token, databaseId, parsed, body);
      } else {
        const parentId = parentIds[parsed.type] || parentIds.NOTE;
        if (!parentId) {
          results.push({ ok: false, error: `Missing parent (page) ID for type ${parsed.type}. Set NOTION_DATABASE_ID (recommended) or the specific page ID.` });
          continue;
        }
        const title = `${parsed.dateStr} - ${parsed.typeLabel}`;
        resp = await notionCreatePageUnderPage(token, parentId, title, parsed, body);
      }

      if (!resp.ok) {
        const errText = await resp.text();
        results.push({ ok: false, error: errText });
      } else {
        const json = await resp.json();
        results.push({ ok: true, pageId: json.id });
      }
    } catch (e) {
      results.push({ ok: false, error: String(e) });
    }
  }

  const created = results.filter(r => r.ok).length;
  return res.status(200).json({ ok: true, created, details: results });
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
  const blocks = [];
  blocks.push({
    object: 'block',
    type: 'heading_2',
    heading_2: { rich_text: [{ type: 'text', text: { content: parsed.typeLabel } }] }
  });
  const lines = String(body).split(/\r?\n/).filter(l => l.trim().length);
  for (const line of lines) {
    blocks.push({
      object: 'block',
      type: 'paragraph',
      paragraph: { rich_text: [{ type: 'text', text: { content: line } }] }
    });
  }
  return blocks;
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