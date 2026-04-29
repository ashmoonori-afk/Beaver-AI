// PRD `## Acceptance` checklist parser. v0.2 M2.2.
//
// Extracts `- [ ]` / `- [x]` items from a frozen prd.md so the M2.3
// dispatcher can map them 1:1 to prd_tasks rows. Pure regex — no
// markdown library dep — because validate.ts already proved the
// strict-format extraction works on the prd-author prompt's output.
//
// Targets PRD ≥ 90% accuracy on real LLM outputs; the M2.2 acceptance
// item ships 20 fixture PRDs that exercise common LLM deviations
// (extra leading spaces, mixed checkbox state, headings of other
// levels, duplicate Acceptance sections, fenced code blocks).

export interface ParsedAcceptanceItem {
  /** 0-based index in checklist order. Stable id input for prd_tasks.idx. */
  idx: number;
  /** The body text after `- [ ]` / `- [x]`. Whitespace-trimmed. */
  text: string;
  /** True when the source line was `- [x]` (already done). The
   *  dispatcher seeds these as status='done' so an amendment of an
   *  already-implemented PRD doesn't redo finished work. */
  done: boolean;
}

export interface ParseAcceptanceResult {
  items: ParsedAcceptanceItem[];
  /** Lines that *looked* like a checklist item but did not match the
   *  strict format (e.g. `- [] foo`, `[x] foo`). Reported so callers
   *  can warn the user to clean up prd.md before dispatch. */
  warnings: string[];
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const STRICT_ITEM_RE = /^\s*-\s+\[([ xX])\]\s+(\S.*?)\s*$/;
const LOOSE_ITEM_RE = /^\s*[-*]\s*\[\s*[xX ]?\s*\]\s*(.*)$/;

/** Find every `## Acceptance` (or any-level Acceptance heading) and
 *  return the items inside the first one that has at least one
 *  parseable entry. Lines inside ``` fenced blocks are skipped so
 *  worked examples in the PRD don't pollute the parse. */
export function parseAcceptanceChecklist(markdown: string): ParseAcceptanceResult {
  const lines = markdown.split('\n');
  const sections = findAcceptanceSections(lines);

  for (const section of sections) {
    const result = extractItemsBetween(lines, section.start, section.end);
    if (result.items.length > 0) return result;
  }
  return { items: [], warnings: [] };
}

interface SectionRange {
  /** Line idx (0-based) of the heading line itself. */
  start: number;
  /** Line idx (0-based) of the next same-or-shallower heading, or
   *  `lines.length` when EOF. The acceptance items live in (start, end). */
  end: number;
}

/** Return every Acceptance section — there may be multiple if the LLM
 *  put one inside an example block. We respect heading depth so a
 *  `### Acceptance` inside `## Solution sketch` doesn't get adopted
 *  unless the top-level `## Acceptance` is missing. */
function findAcceptanceSections(lines: string[]): SectionRange[] {
  const headings: { idx: number; depth: number; title: string }[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = HEADING_RE.exec(line);
    if (m && m[1] !== undefined && m[2] !== undefined) {
      headings.push({ idx: i, depth: m[1].length, title: m[2].trim() });
    }
  }

  const out: SectionRange[] = [];
  for (let i = 0; i < headings.length; i += 1) {
    const h = headings[i]!;
    if (!isAcceptanceTitle(h.title)) continue;
    let end = lines.length;
    for (let j = i + 1; j < headings.length; j += 1) {
      const next = headings[j]!;
      if (next.depth <= h.depth) {
        end = next.idx;
        break;
      }
    }
    out.push({ start: h.idx, end });
  }
  // Order by depth (top-level first) so the canonical `## Acceptance`
  // wins over a stray `### Acceptance` inside an example.
  out.sort((a, b) => {
    const da = headings.find((h) => h.idx === a.start)?.depth ?? 99;
    const db = headings.find((h) => h.idx === b.start)?.depth ?? 99;
    return da - db;
  });
  return out;
}

/** Case-insensitive match against the canonical title plus a couple
 *  of common LLM misspellings. Anything else is rejected so we don't
 *  scoop items out of "Acceptance criteria for US-001" sub-headings. */
function isAcceptanceTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  return t === 'acceptance' || t === 'acceptance criteria' || t === 'acceptance checklist';
}

function extractItemsBetween(
  lines: string[],
  start: number,
  end: number,
): ParseAcceptanceResult {
  const items: ParsedAcceptanceItem[] = [];
  const warnings: string[] = [];
  let inFence = false;
  for (let i = start + 1; i < end; i += 1) {
    const line = lines[i] ?? '';
    if (line.trimStart().startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const strict = STRICT_ITEM_RE.exec(line);
    if (strict && strict[1] !== undefined && strict[2] !== undefined) {
      const done = strict[1] === 'x' || strict[1] === 'X';
      items.push({ idx: items.length, text: strict[2].trim(), done });
      continue;
    }
    const loose = LOOSE_ITEM_RE.exec(line);
    if (loose) warnings.push(line.trim());
  }
  return { items, warnings };
}
