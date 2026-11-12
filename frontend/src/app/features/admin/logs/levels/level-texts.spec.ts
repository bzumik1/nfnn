import { canTrace, loggerDescription, remainingText } from './level-texts';

describe('Given a temporary log level', () => {
  const until = '2026-10-23T10:30:00Z';

  it('when minutes remain, then the countdown names them and when the level goes back', () => {
    expect(remainingText(until, Date.parse('2026-10-23T10:07:30Z'))).toBe(
      'vrátí se samo za 23 min (23. 10. 2026 12:30)',
    );
  });

  it('when more than an hour remains, then the countdown names hours and minutes', () => {
    expect(remainingText(until, Date.parse('2026-10-23T08:20:00Z'))).toBe(
      'vrátí se samo za 2 h 10 min (23. 10. 2026 12:30)',
    );
  });

  it('when the time is up, then it says the level is going back now', () => {
    expect(remainingText(until, Date.parse('2026-10-23T10:30:05Z'))).toBe('vrací se právě teď');
  });
});

describe('Given the name of a logger', () => {
  it('when it is one the page watches, then it says in Czech what it writes', () => {
    expect(loggerDescription('ROOT')).toBe('Vše ostatní');
    expect(loggerDescription('cz.novanadeje.app')).toBe('Aplikace');
    expect(loggerDescription('io.github.bzumik1.fio')).toBe('Import z Fio');
    expect(loggerDescription('org.hibernate.SQL')).toBe('Dotazy do databáze, bez hodnot');
    expect(loggerDescription('com.example.Other')).toBeNull();
  });

  it('when TRACE is asked for, then only the site’s own code may have it', () => {
    expect(canTrace('cz.novanadeje.app')).toBe(true);
    expect(canTrace('cz.novanadeje.app.donations')).toBe(true);
    expect(canTrace('cz.novanadeje.application')).toBe(false);
    expect(canTrace('ROOT')).toBe(false);
  });
});
