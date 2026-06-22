const { addWorkDays, workDaysBetween, isWorkDay } = require('../src/services/calendar');

const cal = { work_days: [1, 2, 3, 4, 5], exceptions: new Set(['2026-07-04']) };

test('addWorkDays skips weekends', () => {
  const fri = new Date('2026-06-19'); // Friday
  const result = addWorkDays(fri, 1, cal);
  expect(result.toISOString().slice(0, 10)).toBe('2026-06-22'); // Monday
});

test('addWorkDays skips exception dates', () => {
  const thu = new Date('2026-07-02'); // Thursday before July 4
  const result = addWorkDays(thu, 2, cal);
  // Fri Jul 3 = +1, Sat = skip, Sun = skip, Mon Jul 6 = +2 (Jul 4 is exception)
  expect(result.toISOString().slice(0, 10)).toBe('2026-07-06');
});

test('addWorkDays negative lag', () => {
  const mon = new Date('2026-06-22'); // Monday
  const result = addWorkDays(mon, -1, cal);
  expect(result.toISOString().slice(0, 10)).toBe('2026-06-19'); // Friday
});

test('workDaysBetween counts correctly', () => {
  const mon = new Date('2026-06-22');
  const fri = new Date('2026-06-26');
  expect(workDaysBetween(mon, fri, cal)).toBe(4);
});

test('isWorkDay returns false for weekend', () => {
  const sat = new Date('2026-06-20');
  expect(isWorkDay(sat, cal)).toBe(false);
});

test('isWorkDay returns false for exception', () => {
  const holiday = new Date('2026-07-04');
  expect(isWorkDay(holiday, cal)).toBe(false);
});
