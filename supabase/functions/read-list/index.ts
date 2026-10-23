// read-list: turns a photo of a handwritten grocery list into clean items using Claude vision.
// Body: { image: "<base64 jpeg>", mediaType?: "image/jpeg" }  →  { items: [{ name, quantity, category, unsure }] }
// Needs the ANTHROPIC_API_KEY secret (Supabase → Edge Functions → Secrets).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5-5";
const CATEGORIES = ["Produce", "Meat & Seafood", "Dairy & Eggs", "Bakery & Bread", "Frozen", "Pantry",
  "Snacks & Drinks", "Household", "Personal Care", "Pets", "Other"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const PROMPT = `This is a photo of a handwritten grocery/shopping list. Extract every item on it.

Rules:
- Read every column. Go down the left column first, then the next column.
- SKIP anything that is crossed out or scribbled out. Do not include it at all.
- Write each item as the normal product name, spelled correctly, with a capital first letter.
  Fix misspellings and expand shorthand: "gatoraide" → "Gatorade", "chxn" → "chicken", "chs" → "cheese",
  "bk sausage" → "Breakfast sausage", "nap kins" → "Napkins", "mac-n-cheese" → "Mac and cheese".
- Keep brand names (Cheerios, V8, Mr. Clean) and descriptive words (frozen, shredded, sliced).
- If an item has a note in parentheses (e.g. "V8 (H)"), keep the note in the name.
- Put a quantity or size in "quantity" (e.g. "24 Hawaiian rolls" → name "Hawaiian rolls", quantity "24"). Otherwise use "".
- If the same item is written twice, include it twice; the app removes duplicates.
- Set "unsure" to true only when you genuinely can't tell what a word says; give your best guess as the name.
- Pick the store aisle "category" from the allowed list.
- Ignore page headings, dates, store names, doodles and notebook printing.
If the photo has no list, return an empty items array.

Respond ONLY by calling the save_list tool.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST an image" }, 405);

  // tolerate stray spaces / quotes from copy-paste
  const key = (Deno.env.get("ANTHROPIC_API_KEY") ?? "").trim().replace(/^["']+|["']+$/g, "").trim();
  if (!key) return json({ error: "no_api_key", message: "ANTHROPIC_API_KEY secret is not set in Supabase" }, 503);

  let body: { image?: string; mediaType?: string };
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }
  const image = (body.image ?? "").replace(/^data:[^,]+,/, "");
  if (!image || image.length < 100) return json({ error: "no_image" }, 400);
  if (image.length > 7_000_000) return json({ error: "image_too_large" }, 413);
  const mediaType = ["image/jpeg", "image/png", "image/webp"].includes(body.mediaType ?? "") ? body.mediaType : "image/jpeg";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 4000,
      tools: [{
        name: "save_list",
        description: "Save the grocery items read from the photo.",
        input_schema: {
          type: "object",
          properties: {
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  quantity: { type: "string" },
                  category: { type: "string", enum: CATEGORIES },
                  unsure: { type: "boolean" },
                },
                required: ["name", "quantity", "category", "unsure"],
              },
            },
          },
          required: ["items"],
        },
      }],
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text", text: PROMPT },
        ],
      }],
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("Anthropic error", res.status, detail.slice(0, 500));
    const code = res.status === 401 ? "bad_api_key" : res.status === 400 && /credit/i.test(detail) ? "no_credit" : "ai_error";
    // Safe diagnostics only: never return the key itself.
    const keyCheck = { startsWithSkAnt: key.startsWith("sk-ant-"), length: key.length, hasSpaces: /\s/.test(key) };
    return json({ error: code, status: res.status, message: detail.slice(0, 300), keyCheck }, 502);
  }
  const data = await res.json();
  const tool = (data.content ?? []).find((c: { type: string }) => c.type === "tool_use");
  let items = Array.isArray(tool?.input?.items) ? tool.input.items : null;
  if (!items) {
    // Model answered in text instead of calling the tool: pull the JSON out of it.
    const text = (data.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("\n");
    const m = text.match(/\{[\s\S]*"items"[\s\S]*\}/) || text.match(/\[[\s\S]*\]/);
    try { const parsed = m ? JSON.parse(m[0]) : null; items = Array.isArray(parsed) ? parsed : parsed?.items ?? []; } catch { items = []; }
    if (!items.length) console.error("No items parsed from model reply", text.slice(0, 300));
  }
  const clean = items
    .filter((i: { name?: unknown }) => typeof i?.name === "string" && i.name.trim())
    .map((i: { name: string; quantity?: string; category?: string; unsure?: boolean }) => ({
      name: i.name.trim().slice(0, 120),
      quantity: (i.quantity ?? "").toString().trim().slice(0, 40),
      category: CATEGORIES.includes(i.category ?? "") ? i.category : "Other",
      unsure: !!i.unsure,
    }));
  return json({ items: clean, model: MODEL });
});
