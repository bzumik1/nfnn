import { threadStates } from './thread-states';

const DUMP = [
  '"main" #1 state=RUNNABLE',
  '    at java.base/java.lang.Thread.run(Thread.java:1583)',
  '"scheduling-1" #40 daemon state=TIMED_WAITING',
  '    at java.base/jdk.internal.misc.Unsafe.park(Native Method)',
  '"HikariPool-1 housekeeper" #41 daemon state=TIMED_WAITING',
  '"http-nio-8080-exec-1" #42 daemon state=WAITING',
  '"import" #43 state=BLOCKED',
  '    - locked <0x1> (a java.lang.Object)',
  '"http-nio-8080-exec-2" #44 daemon state=RUNNABLE',
  '',
].join('\n');

describe('Given a thread dump of the backend', () => {
  it('when its threads are counted, then each state is named once with its count, running and blocked first', () => {
    expect(threadStates(DUMP)).toEqual([
      { state: 'RUNNABLE', label: 'Běží', count: 2 },
      { state: 'BLOCKED', label: 'Zablokovaná', count: 1 },
      { state: 'WAITING', label: 'Čekají', count: 1 },
      { state: 'TIMED_WAITING', label: 'Čekají na čas', count: 2 },
    ]);
  });

  it('when the dump names a state the page does not know, then it is listed under its own name last', () => {
    expect(threadStates('"a" #1 state=PARKED_SOMEHOW\n"b" #2 state=RUNNABLE\n')).toEqual([
      { state: 'RUNNABLE', label: 'Běží', count: 1 },
      { state: 'PARKED_SOMEHOW', label: 'PARKED_SOMEHOW', count: 1 },
    ]);
  });

  it('when the dump is empty, then no state is listed', () => {
    expect(threadStates('')).toEqual([]);
  });
});
