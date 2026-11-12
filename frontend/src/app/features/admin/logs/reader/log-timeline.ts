import { LogWindowResponse } from '../../admin-api';
import { LogLine, linesOf } from './log-lines';

export interface LogTimeline {
  readonly lines: readonly LogLine[];
  readonly from: number;
  readonly to: number;
  readonly hasOlder: boolean;
  readonly hasNewer: boolean;
}

export function startTimeline(window: LogWindowResponse): LogTimeline {
  return {
    lines: linesOf(window),
    from: window.from,
    to: window.to,
    hasOlder: window.hasOlder,
    hasNewer: window.hasNewer,
  };
}

export function mergeWindow(timeline: LogTimeline, window: LogWindowResponse): LogTimeline {
  const byOffset = new Map(timeline.lines.map((line) => [line.offset, line]));
  for (const line of linesOf(window)) {
    byOffset.set(line.offset, line);
  }
  const reachesOlder = window.from <= timeline.from;
  const reachesNewer = window.to >= timeline.to;
  return {
    lines: [...byOffset.values()].sort((left, right) => left.offset - right.offset),
    from: Math.min(timeline.from, window.from),
    to: Math.max(timeline.to, window.to),
    hasOlder: reachesOlder ? window.hasOlder : timeline.hasOlder,
    hasNewer: reachesNewer ? window.hasNewer : timeline.hasNewer,
  };
}
