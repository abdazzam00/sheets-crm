# Sheets CRM — Build Checklist

## Operating principle
Ship in small slices. Each slice must:
- build (npm run build)
- lint (npm run lint)
- deploy (vercel --prod)
- have a minimal manual test plan executed

Keep API usage low per iteration; prefer heuristics + caching; make AI calls optional and batched.

---

## 0) Safety / Reliability
- [ ] Never hard-fail imports for bad/mis-mapped columns; drop invalid values and continue.
- [ ] Ensure all secrets only in Vercel env vars; never logged to client.
- [ ] Add server-side rate-limit/backoff + clear UI errors.

---

## 1) Core UX — Sheet-like editing
- [ ] All cells editable (except computed link render) with autosave.
- [ ] Long text fields (Research Notes, Email Template, Snippets) open in modal editor.
- [ ] Modal editor supports markdown + linkify + placeholder insertion.
- [ ] Table stays compact (1–2 line preview) and stable.

Manual tests:
- edit any cell -> persists after refresh
- edit long text via modal -> persists
- links open in new tab

---

## 2) CSV Import robustness
- [ ] Auto-map via heuristics first; never map Domain to non-domain-like columns.
- [ ] If ambiguous, optional OpenAI auto-map; cache mapping per file signature.
- [ ] Combine First+Last name -> Executive Name; support alternate headers ("Executive names").
- [ ] Domain extraction from URLs; fallback derive domain from email.

Manual tests:
- import Apollo export
- import custom CSV (Company Name, Website URL, Executive names, Top Executive Email)
- re-import same file -> no duplicates

---

## 3) Deduplication
- [ ] Prevent duplicates of firms: domain primary, else normalized company name.
- [ ] Prevent duplicates of executives: email primary, else executiveLinkedIn, else (domain+execName).
- [ ] Merge strategy: keep existing non-empty, fill blanks from incoming.

Manual tests:
- import file with duplicate rows -> single merged record
- import second file with overlapping firms -> merged

---

## 4) Import Undo + Delete
- [ ] Import batch id tracked for every import
- [ ] Import event log stores before/after
- [ ] "Undo latest import" requires typing UNDO
- [ ] Row selection + delete selected

Manual tests:
- import -> undo -> records revert
- delete selected -> removed

---

## 5) Export to Google Sheets (Phase A)
- [ ] Export CSV
- [ ] Export TSV (best for copy/paste)
- [ ] Export dialog filters (missing domain, missing exec linkedin/email, category, exec search verified)

Manual tests:
- export -> paste into Google Sheets -> columns align

---

## 6) Research Snippets tab
- [ ] CRUD for snippets (key/value)
- [ ] Placeholder system uses snippets

Manual tests:
- set snippet -> preview template uses it

---

## 7) AI actions (row-based)
- [ ] OpenAI: verify exec search vs staffing (tri-state)
- [ ] OpenAI: fill missing domain
- [ ] OpenAI: draft/refresh email template
- [ ] Perplexity: categorize firm
- [ ] Perplexity: deep research notes

Requirements:
- run is explicit per-row
- caching by (rowId, action, inputs-hash)
- background job queue (don’t block UI)

---

## 8) Perplexity Chat panel
- [ ] Chat request -> propose new firms
- [ ] Never propose existing firms (dedupe check)
- [ ] Add selected -> enqueue enrichment pipeline step-by-step

---

## 9) Google Sheets Sync (Phase B)
- [ ] OAuth flow + select target sheet
- [ ] Export filtered rows directly into sheet
- [ ] Optional: upsert by domain/email keys

---

## Current known issues to watch
- Vercel build cache / stale UI
- Client-side parsing of huge CSVs (need streaming or server upload)
- Rate limit errors from OpenAI/Perplexity
