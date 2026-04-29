// PRD structure validator.
//
// Used by M1.1 to gate `prompts/prd-author.md` on a parseable shape, and
// reusable by M2.2's acceptance-checklist parser. Pure markdown scan, no
// external dep. Small surface so the M2 parser can extend it without
// rewriting.

/** The exact section list and order the prd-author prompt promises. */
export const PRD_SECTIONS = [
  'Summary',
  'Background',
  'Users',
  'Goals',
  'Non-goals',
  'Solution sketch',
  'Acceptance',
  'Risks',
] as const;

export type PrdSection = (typeof PRD_SECTIONS)[number];

export interface PrdValidationResult {
  /** True iff every required section is present, in order, and the
   *  Acceptance section contains at least one `- [ ]` item. */
  ok: boolean;
  /** Sections from PRD_SECTIONS that were not found. */
  missing: PrdSection[];
  /** Sections that appear in the wrong order. */
  outOfOrder: PrdSection[];
  /** Acceptance items found, in order. Each is the raw text after `- [ ] `. */
  acceptance: string[];
  /** Acceptance items that did not match the strict `- [ ] ...` format. */
  malformedAcceptance: string[];
}

/** Validate a candidate PRD markdown string against the prd-author
 *  contract. Returns ok=true when every section heading is present in
 *  order and the Acceptance section has 1+ well-formed `- [ ]` items. */
export function validatePrd(markdown: string): PrdValidationResult {
  const headings = extractHeadings(markdown);
  const found = new Map<PrdSection, number>();
  for (const h of headings) {
    if ((PRD_SECTIONS as readonly string[]).includes(h.title)) {
      // Keep the first occurrence so duplicate sections still flag the
      // ordered slot, not a later one.
      if (!found.has(h.title as PrdSection)) {
        found.set(h.title as PrdSection, h.lineIdx);
      }
    }
  }

  const missing: PrdSection[] = [];
  for (const section of PRD_SECTIONS) {
    if (!found.has(section)) missing.push(section);
  }

  const outOfOrder: PrdSection[] = [];
  let lastIdx = -1;
  for (const section of PRD_SECTIONS) {
    const idx = found.get(section);
    if (idx === undefined) continue;
    if (idx < lastIdx) outOfOrder.push(section);
    lastIdx = idx;
  }

  const acceptanceStart = found.get('Acceptance');
  const acceptanceEnd = nextHeadingAfter(headings, acceptanceStart ?? -1);
  const { items, malformed } = extractAcceptance(markdown, acceptanceStart, acceptanceEnd);

  const ok =
    missing.length === 0 && outOfOrder.length === 0 && items.length > 0 && malformed.length === 0;

  return {
    ok,
    missing,
    outOfOrder,
    acceptance: items,
    malformedAcceptance: malformed,
  };
}

interface HeadingHit {
  title: string;
  /** 0-based line index in the source markdown. */
  lineIdx: number;
}

const HEADING_RE = /^##\s+(.+?)\s*$/;

/** Pull every `## ...` heading from the markdown source. Lines inside
 *  fenced code blocks are skipped so the worked example in the prompt
 *  doesn't trip the validator on its own training output. */
function extractHeadings(markdown: string): HeadingHit[] {
  const lines = markdown.split('\n');
  const out: HeadingHit[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i] ?? '';
    if (line.startsWith('```')) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const match = HEADING_RE.exec(line);
    if (match && match[1] !== undefined) out.push({ title: match[1], lineIdx: i });
  }
  return out;
}

/** Index of the next heading that follows `from`, or `Infinity` when
 *  none. Used to bound the acceptance section's checklist scan. */
function nextHeadingAfter(headings: HeadingHit[], from: number): number {
  if (from < 0) return Number.POSITIVE_INFINITY;
  for (const h of headings) {
    if (h.lineIdx > from) return h.lineIdx;
  }
  return Number.POSITIVE_INFINITY;
}

const STRICT_ITEM_RE = /^- \[ \]\s+(.+\S)\s*$/;
const LOOSE_CHECKBOX_RE = /^[-*]\s*\[\s*[xX ]?\s*\]\s*(.*)$/;

/** Pull `- [ ] ...` items from the Acceptance section. Items that look
 *  like checklists but break the strict format are reported separately
 *  so the validator can flag them without losing them entirely. */
function extractAcceptance(
  markdown: string,
  start: number | undefined,
  end: number,
): { items: string[]; malformed: string[] } {
  if (start === undefined) return { items: [], malformed: [] };
  const lines = markdown.split('\n');
  const items: string[] = [];
  const malformed: string[] = [];
  // Skip the heading line itself; scan from start+1 up to (but not
  // including) `end`. `end === Infinity` means "to end of file".
  const stop = end === Number.POSITIVE_INFINITY ? lines.length : end;
  for (let i = start + 1; i < stop; i += 1) {
    const line = lines[i] ?? '';
    const strict = STRICT_ITEM_RE.exec(line);
    if (strict && strict[1] !== undefined) {
      items.push(strict[1]);
      continue;
    }
    const loose = LOOSE_CHECKBOX_RE.exec(line);
    if (loose) {
      // Looks like a checklist line but doesn't match the strict shape.
      // Common breakages: `- [x] …` (already done), `-[ ] …` (no space),
      // `- [] …` (no inner space). Surface so the prompt author can fix.
      malformed.push(line.trim());
    }
  }
  return { items, malformed };
}
