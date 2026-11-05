export interface StreamEvent {
  readonly event: string;
  readonly data: string;
}

const DEFAULT_EVENT = 'message';
const EVENT_END = /\r\n\r\n|\n\n|\r\r/;

export class EventStreamReader {
  private consumed = 0;
  private pending = '';

  read(textSoFar: string): StreamEvent[] {
    if (textSoFar.length < this.consumed) {
      this.consumed = 0;
      this.pending = '';
    }
    this.pending += textSoFar.slice(this.consumed);
    this.consumed = textSoFar.length;
    const events: StreamEvent[] = [];
    let end = EVENT_END.exec(this.pending);
    while (end !== null) {
      const block = this.pending.slice(0, end.index);
      this.pending = this.pending.slice(end.index + end[0].length);
      const event = eventOf(block);
      if (event !== null) {
        events.push(event);
      }
      end = EVENT_END.exec(this.pending);
    }
    return events;
  }
}

function eventOf(block: string): StreamEvent | null {
  let event = '';
  const data: string[] = [];
  for (const line of block.split(/\r\n|\n|\r/)) {
    if (line === '' || line.startsWith(':')) {
      continue;
    }
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    const value = colon === -1 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'event') {
      event = value;
    } else if (field === 'data') {
      data.push(value);
    }
  }
  if (event === '' && data.length === 0) {
    return null;
  }
  return { event: event || DEFAULT_EVENT, data: data.join('\n') };
}
