export interface NormalizedOcrToken {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
}

export interface NormalizedOcrLayout {
  version: 1;
  normalized_text: string;
  tokens: NormalizedOcrToken[];
}

type UnknownRecord = Record<string, any>;

function asNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function getText(candidate: UnknownRecord): string {
  const value =
    candidate.text ?? candidate.word ?? candidate.value ?? candidate.content ?? candidate.label ?? "";
  return String(value).trim();
}

function getBBox(candidate: UnknownRecord): { x: number; y: number; width: number; height: number } {
  const bbox = (candidate.bbox ?? candidate.box ?? candidate.rect ?? {}) as UnknownRecord;

  const x = asNumber(candidate.x ?? candidate.left ?? bbox.x ?? bbox.left ?? bbox.min_x ?? 0);
  const y = asNumber(candidate.y ?? candidate.top ?? bbox.y ?? bbox.top ?? bbox.min_y ?? 0);

  const width = asNumber(
    candidate.width ??
      bbox.width ??
      (bbox.max_x !== undefined && bbox.min_x !== undefined ? asNumber(bbox.max_x) - asNumber(bbox.min_x) : 0)
  );

  const height = asNumber(
    candidate.height ??
      bbox.height ??
      (bbox.max_y !== undefined && bbox.min_y !== undefined ? asNumber(bbox.max_y) - asNumber(bbox.min_y) : 0)
  );

  return {
    x,
    y,
    width: Math.max(0, width),
    height: Math.max(0, height),
  };
}

function collectTokenCandidates(root: unknown): UnknownRecord[] {
  if (!root) return [];

  if (Array.isArray(root)) {
    return root.flatMap((item) => collectTokenCandidates(item));
  }

  if (typeof root !== "object") return [];

  const record = root as UnknownRecord;
  const buckets = [
    record.tokens,
    record.words,
    record.items,
    record.lines,
    record.blocks,
    record.children,
  ].filter(Boolean);

  if (buckets.length > 0) {
    return buckets.flatMap((bucket) => collectTokenCandidates(bucket));
  }

  const text = getText(record);
  if (text) return [record];

  return [];
}

export function normalizeOcrLayout(textContent?: string, textJson?: string): NormalizedOcrLayout {
  const parsedTextContent = (textContent ?? "").trim();

  let parsedJson: unknown = undefined;
  if (textJson && textJson.trim()) {
    try {
      parsedJson = JSON.parse(textJson);
    } catch {
      parsedJson = undefined;
    }
  }

  const tokenCandidates = collectTokenCandidates(parsedJson);

  const tokens: NormalizedOcrToken[] = tokenCandidates
    .map((candidate, index) => {
      const text = getText(candidate);
      const bbox = getBBox(candidate);

      if (!text) return null;

      return {
        text,
        index,
        ...bbox,
      } satisfies NormalizedOcrToken;
    })
    .filter((token): token is NormalizedOcrToken => !!token);

  const normalizedText =
    tokens.length > 0 ? tokens.map((token) => token.text).join(" ").replace(/\s+/g, " ").trim() : parsedTextContent;

  return {
    version: 1,
    normalized_text: normalizedText,
    tokens,
  };
}
