import { allowedMethod, database, handleError, respond, safeMutation } from './_lib/common.js';
import { requireAdmin } from './_lib/auth.js';
export default async function handler(req, res) {
  if (!allowedMethod(req, res, ['POST']) || !safeMutation(req, res) || !requireAdmin(req, res)) return;
  if (process.env.ENABLE_AI_TRIAGE !== 'true' || !process.env.ANTHROPIC_API_KEY)
    return respond(res, 503, { error: 'AI triage is disabled until external processing is approved and configured.' });
  try {
    const sql = database();
    const rows = await sql.query("SELECT status,tool,priority,facility,subject FROM tickets WHERE deleted_at IS NULL ORDER BY date_submitted DESC LIMIT 150");
    // Intentionally omit requester names, email addresses and issue descriptions.
    const summary = rows.map(r => [r.status,r.tool,r.priority,r.facility,r.subject].join(' | ')).join('\n');
    const result = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: {
        'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5', max_tokens: 600,
        system: 'Provide a concise executive-level IT support ticket triage summary with counts, top issues, and specific actions. Do not identify individuals. Plain text.',
        messages: [{ role: 'user', content: summary || 'No tickets.' }]
      })
    });
    if (!result.ok) return respond(res, 502, { error: 'AI provider unavailable' });
    const data = await result.json();
    return respond(res, 200, { text: data.content?.find(x => x.type === 'text')?.text || 'No summary available.' });
  } catch (e) { return handleError(res, e); }
}
