const axios = require('axios');

/**
 * MinimaxClient: Integration with Minimax Global API
 * Used to fact-check, refine, and standardise discovered bus stops in Nepal.
 *
 * Uses streaming (stream: true) so the caller can forward live chunks to the browser
 * via Server-Sent Events while the model is still reasoning.
 *
 * @param {Array}    stops     - Raw discovered stops array
 * @param {string}   polyline  - Overview polyline string
 * @param {Function} onChunk   - Optional callback(text) called for every streamed piece
 * @returns {Promise<Array>}   - Parsed refined stops array (resolved when stream ends)
 */

const MINIMAX_API_URL = "https://api.minimax.io/v1/chat/completions";

// ── JSON repair ──────────────────────────────────────────────────────────────
// The model sometimes truncates with "..." or adds commentary after the array.
// This function aggressively cleans and repairs the output before parsing.
function extractAndRepairJSONArray(rawText) {
    // 1. Strip markdown fences
    let text = rawText
        .replace(/```json/gi, '')
        .replace(/```/g, '')
        .trim();

    // 2. Find the opening bracket
    const firstBracket = text.indexOf('[');
    if (firstBracket === -1) return null;
    text = text.substring(firstBracket);

    // 3. Remove truncation artifacts BEFORE trying to find the closing bracket
    text = text
        .replace(/,?\s*\/\/[^\n]*/gm, '')          // // line comments
        .replace(/,?\s*\/\*[\s\S]*?\*\//g, '')      // /* block comments */
        .replace(/,\s*\.\.\.\s*(?=[\,\]\}])/g, '')  // ,  ... before , ] }
        .replace(/\.\.\.\s*,/g, '')                  // ... ,
        .replace(/,?\s*\.\.\.\s*\]/g, ']')           // , ... ] → ]
        .replace(/,?\s*\.\.\.\s*$/gm, '')            // trailing ... on a line
        .replace(/\.\.\./g, '')                       // any remaining ...
        .replace(/,\s*\]/g, ']')                      // trailing comma before ]
        .replace(/,\s*\}/g, '}')                      // trailing comma before }
        .trim();

    // 4. Try to find the last ] and parse
    const lastBracket = text.lastIndexOf(']');
    if (lastBracket !== -1) {
        const candidate = text.substring(0, lastBracket + 1);
        try {
            const parsed = JSON.parse(candidate);
            if (Array.isArray(parsed)) return parsed;
        } catch (_) {}
    }

    // 5. Array may be truncated mid-object — find the last complete object and close the array
    const lastBrace = text.lastIndexOf('}');
    if (lastBrace !== -1) {
        const candidate = text.substring(0, lastBrace + 1) + ']';
        try {
            const parsed = JSON.parse(candidate);
            if (Array.isArray(parsed)) {
                console.warn('[Minimax] Response was truncated — recovered', parsed.length, 'stops from partial output.');
                return parsed;
            }
        } catch (_) {}
    }

    return null;
}

const refineStopsWithMinimax = async (stops, polyline, onChunk) => {
    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
        throw new Error("MINIMAX_API_KEY is not defined in the environment variables.");
    }

    const stopCount = stops.length;

    const systemPrompt = `You are a Nepal Transportation Data Expert. Your sole task is to refine a JSON array of bus stops and return the corrected array.

ABSOLUTE RULES — violating any of these will cause the system to crash:
1. Your ENTIRE response must be a single valid JSON array. Nothing else.
2. NO markdown. NO code fences. NO backticks. NO prose. NO explanations.
3. DO NOT use "..." or any form of truncation. EVER. Output all ${stopCount} stops in full.
4. DO NOT add comments like "// more stops" or "// remaining stops".
5. The response MUST start with "[" and end with "]".
6. Every object in the array must be complete and valid JSON.

What you should correct in each stop:
- Fill in accurate 'municipality', 'district', 'province' for Nepal geography.
- Standardise 'candidateName' to the most official/canonical form.
- Add any aliases to the 'aliases' array.
- Remove stops that are clearly not bus stops (e.g. GPS noise, rivers, mountains).

REQUIRED fields for every stop object:
{
  "candidateName": string,
  "aliases": string[],
  "district": string,
  "municipality": string,
  "province": string,
  "candidateCoordinates": { "lat": number, "lng": number } | null,
  "distanceFromOriginKm": number,
  "durationFromOriginMins": number,
  "sequenceOrder": number
}

BEGIN your response with "[" and END with "]". No other text allowed.`;

    const userPrompt = `Route Polyline: ${polyline || 'N/A'}

Input stops (${stopCount} total — you must output all of them, corrected):
${JSON.stringify(stops, null, 2)}

Output the corrected JSON array now. Start with "[", end with "]", nothing else.`;

    const response = await axios.post(
        MINIMAX_API_URL,
        {
            model: "MiniMax-M3",
            stream: true,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user",   content: userPrompt }
            ],
            temperature: 0.05,   // as deterministic as possible for structured output
            max_tokens: 8192,    // ensure the model has room to complete the full array
        },
        {
            headers: {
                "Content-Type":  "application/json",
                "Authorization": `Bearer ${apiKey}`
            },
            responseType: 'stream'
        }
    );

    return new Promise((resolve, reject) => {
        let reasoningText = ''; // <think> block — shown to admin, NOT parsed as JSON
        let contentText   = ''; // final answer — this is where the JSON lives
        let buffer        = '';

        response.data.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop(); // keep the potentially-incomplete trailing line

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || trimmed === 'data: [DONE]') continue;
                if (!trimmed.startsWith('data: ')) continue;

                try {
                    const parsed = JSON.parse(trimmed.slice(6));
                    const delta  = parsed.choices?.[0]?.delta;
                    if (!delta) continue;

                    if (delta.reasoning_content) {
                        reasoningText += delta.reasoning_content;
                        if (typeof onChunk === 'function') onChunk(delta.reasoning_content);
                    }

                    if (delta.content) {
                        contentText += delta.content;
                        if (typeof onChunk === 'function') onChunk(delta.content);
                    }
                } catch (_) {}
            }
        });

        response.data.on('end', () => {
            // Use only contentText for JSON extraction; fall back to reasoningText
            // if the model didn't use the reasoning/content split.
            const sourceText = contentText.trim() || reasoningText.trim();

            console.log(`[Minimax] Stream ended. Content: ${contentText.length} chars | Reasoning: ${reasoningText.length} chars`);
            if (contentText.length < 50) {
                console.warn('[Minimax] Content very short — raw content:', JSON.stringify(contentText.substring(0, 300)));
            }

            const repaired = extractAndRepairJSONArray(sourceText);

            if (repaired && repaired.length > 0) {
                console.log(`[Minimax] Parsed ${repaired.length} stops successfully.`);
                resolve(repaired);
            } else {
                console.error('[Minimax] All parse attempts failed. Source (first 1000):', sourceText.substring(0, 1000));
                reject(new Error('Could not extract a valid JSON array from the LLM response even after repair attempts.'));
            }
        });

        response.data.on('error', (err) => {
            reject(new Error(`Minimax stream error: ${err.message}`));
        });
    });
};

module.exports = {
    refineStopsWithMinimax
};
