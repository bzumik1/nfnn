/// <reference types="@angular/localize" />

export interface ThreadStateCount {
  readonly state: string;
  readonly label: string;
  readonly count: number;
}

const THREAD_LINE = /^".*" #\d+ .*\bstate=([A-Z_]+)/;
const KNOWN_STATES = ['RUNNABLE', 'BLOCKED', 'WAITING', 'TIMED_WAITING', 'NEW', 'TERMINATED'];

export function threadStates(dump: string): ThreadStateCount[] {
  const counts = new Map<string, number>();
  for (const line of dump.split('\n')) {
    const state = THREAD_LINE.exec(line)?.[1];
    if (state !== undefined) {
      counts.set(state, (counts.get(state) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort(([left], [right]) => rank(left) - rank(right) || left.localeCompare(right))
    .map(([state, count]) => ({ state, label: stateLabel(state), count }));
}

function rank(state: string): number {
  const known = KNOWN_STATES.indexOf(state);
  return known === -1 ? KNOWN_STATES.length : known;
}

function stateLabel(state: string): string {
  switch (state) {
    case 'RUNNABLE':
      return $localize`:@@admin.logs.threads.state.runnable:Běží`;
    case 'BLOCKED':
      return $localize`:@@admin.logs.threads.state.blocked:Zablokovaná`;
    case 'WAITING':
      return $localize`:@@admin.logs.threads.state.waiting:Čekají`;
    case 'TIMED_WAITING':
      return $localize`:@@admin.logs.threads.state.timedWaiting:Čekají na čas`;
    case 'NEW':
      return $localize`:@@admin.logs.threads.state.new:Nová`;
    case 'TERMINATED':
      return $localize`:@@admin.logs.threads.state.terminated:Skončená`;
    default:
      return state;
  }
}
