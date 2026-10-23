export type MarkdownInline =
  | { kind: 'text'; text: string }
  | { kind: 'break' }
  | { kind: 'strong'; children: MarkdownInline[] }
  | { kind: 'em'; children: MarkdownInline[] }
  | { kind: 'link'; href: string; children: MarkdownInline[] };

export type MarkdownBlock =
  | { kind: 'heading'; level: 2 | 3; content: MarkdownInline[] }
  | { kind: 'paragraph'; content: MarkdownInline[] }
  | { kind: 'quote'; content: MarkdownInline[] }
  | { kind: 'list'; ordered: boolean; items: MarkdownInline[][] };

const HEADING = /^(#{1,6})\s+(.*)$/;
const BULLET = /^\s{0,3}[-*+]\s+(.*)$/;
const NUMBERED = /^\s{0,3}\d{1,9}[.)]\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const CONTINUATION = /^\s{2,}(\S.*)$/;
const ESCAPABLE = '\\`*_[]()#+-.!>';
const SAFE_HREF = /^(https?:\/\/[^\s/]|mailto:[^\s]|\/(?!\/))/i;
const BARE_URL = /^https?:\/\/[^\s<>]+/i;
const TRAILING_PUNCTUATION = /[.,;:!?)]+$/;

type OpenBlock =
  | { kind: 'paragraph' | 'quote'; lines: string[] }
  | { kind: 'list'; ordered: boolean; items: string[] };

export function parseMarkdown(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  let open: OpenBlock | null = null;
  const close = () => {
    if (open) {
      blocks.push(finish(open));
      open = null;
    }
  };

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = HEADING.exec(line);
    const bullet = BULLET.exec(line);
    const numbered = NUMBERED.exec(line);
    const quote = QUOTE.exec(line);
    const current = open as OpenBlock | null;
    if (line.trim() === '') {
      close();
    } else if (heading) {
      close();
      blocks.push({
        kind: 'heading',
        level: heading[1].length <= 2 ? 2 : 3,
        content: parseInline(heading[2].trim()),
      });
    } else if (bullet || numbered) {
      const ordered = !bullet;
      const item = (bullet ?? numbered)![1].trim();
      if (current?.kind === 'list' && current.ordered === ordered) {
        current.items.push(item);
      } else {
        close();
        open = { kind: 'list', ordered, items: [item] };
      }
    } else if (quote) {
      if (current?.kind === 'quote') {
        current.lines.push(quote[1].trim());
      } else {
        close();
        open = { kind: 'quote', lines: [quote[1].trim()] };
      }
    } else if (current?.kind === 'list' && CONTINUATION.test(line)) {
      const last = current.items.length - 1;
      current.items[last] = `${current.items[last]} ${line.trim()}`;
    } else if (current?.kind === 'paragraph') {
      current.lines.push(line.trim());
    } else {
      close();
      open = { kind: 'paragraph', lines: [line.trim()] };
    }
  }
  close();
  return blocks;
}

function finish(block: OpenBlock): MarkdownBlock {
  if (block.kind === 'list') {
    return { kind: 'list', ordered: block.ordered, items: block.items.map(parseInline) };
  }
  const content: MarkdownInline[] = [];
  block.lines.forEach((line, index) => {
    if (index > 0) {
      content.push({ kind: 'break' });
    }
    content.push(...parseInline(line));
  });
  return { kind: block.kind, content: merged(content) };
}

export function parseInline(text: string): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  let plain = '';
  const flush = () => {
    if (plain) {
      nodes.push({ kind: 'text', text: plain });
      plain = '';
    }
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i];
    if (char === '\\' && i + 1 < text.length && ESCAPABLE.includes(text[i + 1])) {
      plain += text[i + 1];
      i += 2;
      continue;
    }
    const emphasis = char === '*' || char === '_' ? emphasisAt(text, i) : null;
    if (emphasis) {
      flush();
      nodes.push(emphasis.node);
      i = emphasis.end;
      continue;
    }
    const link = char === '[' ? linkAt(text, i) : null;
    if (link) {
      flush();
      nodes.push(link.node);
      i = link.end;
      continue;
    }
    const bare = char === 'h' && startsWord(text, i) ? BARE_URL.exec(text.slice(i)) : null;
    if (bare) {
      const href = bare[0].replace(TRAILING_PUNCTUATION, '');
      flush();
      nodes.push({ kind: 'link', href, children: [{ kind: 'text', text: href }] });
      i += href.length;
      continue;
    }
    plain += char;
    i += 1;
  }
  flush();
  return merged(nodes);
}

function emphasisAt(text: string, start: number): { node: MarkdownInline; end: number } | null {
  const marker = text[start];
  const double = text[start + 1] === marker;
  const delimiter = double ? marker + marker : marker;
  const from = start + delimiter.length;
  if (from >= text.length || /\s/.test(text[from])) {
    return null;
  }
  if (marker === '_' && !startsWord(text, start)) {
    return null;
  }
  let search = from;
  while (search < text.length) {
    let close = findUnescaped(text, delimiter, search);
    if (close < 0) {
      return null;
    }
    if (double && text[close + 2] === marker) {
      close += 1;
    }
    const afterClose = close + delimiter.length;
    const closesStrongInside = !double && text[afterClose] === marker && text[close - 1] !== marker;
    const valid =
      close > from &&
      !/\s/.test(text[close - 1]) &&
      !closesStrongInside &&
      (marker !== '_' || !/[\p{L}\p{N}]/u.test(text[afterClose] ?? ''));
    if (valid) {
      const children = parseInline(text.slice(from, close));
      return {
        node: double ? { kind: 'strong', children } : { kind: 'em', children },
        end: afterClose,
      };
    }
    search = close + 1;
  }
  return null;
}

function linkAt(text: string, start: number): { node: MarkdownInline; end: number } | null {
  const closeLabel = findUnescaped(text, ']', start + 1);
  if (closeLabel < 0 || text[closeLabel + 1] !== '(') {
    return null;
  }
  let depth = 0;
  let closeHref = -1;
  for (let i = closeLabel + 2; i < text.length; i += 1) {
    if (text[i] === '(') {
      depth += 1;
    } else if (text[i] === ')') {
      if (depth === 0) {
        closeHref = i;
        break;
      }
      depth -= 1;
    }
  }
  if (closeHref < 0) {
    return null;
  }
  const label = text.slice(start + 1, closeLabel);
  const href = text.slice(closeLabel + 2, closeHref).trim();
  if (!label.trim() || /\s/.test(href) || !SAFE_HREF.test(href)) {
    return { node: { kind: 'text', text: text.slice(start, closeHref + 1) }, end: closeHref + 1 };
  }
  return { node: { kind: 'link', href, children: parseInline(label) }, end: closeHref + 1 };
}

function findUnescaped(text: string, needle: string, from: number): number {
  let index = text.indexOf(needle, from);
  while (index > 0 && text[index - 1] === '\\') {
    index = text.indexOf(needle, index + 1);
  }
  return index;
}

function startsWord(text: string, index: number): boolean {
  return index === 0 || !/[\p{L}\p{N}_]/u.test(text[index - 1]);
}

function merged(nodes: MarkdownInline[]): MarkdownInline[] {
  return nodes.reduce<MarkdownInline[]>((result, node) => {
    const last = result[result.length - 1];
    if (node.kind === 'text' && last?.kind === 'text') {
      result[result.length - 1] = { kind: 'text', text: last.text + node.text };
    } else {
      result.push(node);
    }
    return result;
  }, []);
}
