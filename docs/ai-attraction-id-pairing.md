# AI Attraction ID Pairing — Analysis

## The problem

The frontend generates attraction IDs as **`{cityId}_{index}`** (e.g. `paris_0`, `tokyo_2`) — a positional index into a fixed catalog defined in `getAttractions()` inside `attractions.data.ts`. The AI plan prompt currently tells DeepSeek to invent **kebab-case names** (`torre-eiffel`, `senso-ji`), which will never match anything in the frontend catalog. City IDs have the same problem (`nueva-york` vs `newyork`, `roma` vs `rome`).

## Recommended approach: inject the catalog into the plan prompt

When the frontend calls `/ai/plan`, it already knows which cities the trip involves (from the suggestion). It passes a `cityCatalog` field alongside the request — a compact map of city → ordered attraction names. The backend embeds that into the plan system prompt as a reference table, so the AI picks exact IDs instead of inventing them.

**Request shape change** (backend):
```ts
// new optional field on /ai/plan
cityCatalog?: {
  [cityId: string]: string[];  // ["Torre Eiffel", "El Louvre", ...]
}
```

**Prompt injection** (backend adds a `<catalog>` block to the plan system prompt):
```
<catalog>
Use ONLY the following IDs. Never invent attraction or city IDs.
paris:
  paris_0 → Torre Eiffel
  paris_1 → El Louvre
  paris_2 → Montmartre
tokyo:
  tokyo_0 → Templo Senso-ji
  ...
</catalog>
```

**Frontend**: calls `getAttractions(city)` for each city in the suggestion and passes the resulting `{ id, name }` pairs.

## Why this is better than the alternatives

| Approach | Accuracy | Complexity | Token cost |
|---|---|---|---|
| Inject catalog into prompt | Exact match — AI uses real IDs | Small API change | Low (only relevant cities, ~50–100 tokens per city) |
| Fuzzy-match after AI response | ~85% reliable, breaks on generic names like "Museo Nacional" | Significant backend logic | None |
| Inject full 120-city catalog always | Exact match | No API change | High (~3k tokens per call) |
| Use `{cityId}_N` by position | Works for index 0–4, but AI may pick wrong index | Prompt change only | None |

## City ID normalization (also needed)

Regardless of approach, the plan prompt should include the valid city ID list from `cities.data.ts` (just the IDs — one line), because the AI currently has no way to know `newyork` not `nueva-york`, or `marrakech` not `marruecos`. The cities list is ~120 entries, about 200 tokens — cheap.

## Minimal implementation plan

1. **`POST /ai/plan`** — add `cityCatalog?: Record<string, string[]>` to the request body
2. **`ai.controller.ts`** — build the catalog block and append it before `</formato_respuesta>` in the plan system prompt
3. **`prompts/ai-trip-prompts.json`** — change the `IMPORTANTE` line to: *"Los `cityId` deben venir de la lista de ciudades provista. Los `attractionId` deben venir exactamente del catálogo provisto — nunca inventes IDs."*
4. **Frontend** — on the plan call, pass `cityCatalog` built from `getAttractions()` for each city named in the selected suggestion's `highlights`

This keeps the AI as the intelligence layer (deciding *which* attractions to visit and in what order) while the data catalog remains the single source of truth for IDs.
