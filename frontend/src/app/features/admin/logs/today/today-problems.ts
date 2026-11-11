import { pragueDay } from '../../../donations/donation-date';
import { LogMatchResponse } from '../../admin-api';
import { entriesOf, LogEntry, linesOf } from '../reader/log-lines';

export interface TodayProblem {
  readonly entry: LogEntry;
  readonly count: number;
}

export function todayProblems(matches: readonly LogMatchResponse[], today: string): TodayProblem[] {
  const problems = new Map<string, { entry: LogEntry; count: number }>();
  for (const match of matches) {
    for (const entry of entriesOf(linesOf({ from: match.offset, text: match.line }), 'spring')) {
      if (entry.at === null || pragueDay(entry.at) !== today) {
        continue;
      }
      const key = `${entry.level} ${entry.logger} ${entry.message}`;
      const known = problems.get(key);
      if (known === undefined) {
        problems.set(key, { entry, count: 1 });
      } else {
        known.count += 1;
      }
    }
  }
  return [...problems.values()];
}
