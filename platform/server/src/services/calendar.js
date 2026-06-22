// Work-day arithmetic using a calendar object.
// calendar = { work_days: [1,2,3,4,5], exceptions: Set<'YYYY-MM-DD'> }
// work_days: 0=Sun, 1=Mon ... 6=Sat

function isWorkDay(date, calendar) {
  const d = new Date(date);
  const dow = d.getUTCDay();
  const iso = d.toISOString().slice(0, 10);
  if (calendar.exceptions && calendar.exceptions.has(iso)) return false;
  return calendar.work_days.includes(dow);
}

// Add n working days to date. n can be negative.
function addWorkDays(date, n, calendar) {
  const d = new Date(date);
  if (n === 0) return d;
  const step = n > 0 ? 1 : -1;
  let remaining = Math.abs(n);
  while (remaining > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    if (isWorkDay(d, calendar)) remaining--;
  }
  return d;
}

// Count work days from date a to date b (exclusive of a, inclusive of b).
function workDaysBetween(a, b, calendar) {
  const start = new Date(a);
  const end = new Date(b);
  let count = 0;
  const step = end >= start ? 1 : -1;
  const d = new Date(start);
  while (true) {
    d.setUTCDate(d.getUTCDate() + step);
    if (isWorkDay(d, calendar)) count += step;
    if (d.toISOString().slice(0, 10) === end.toISOString().slice(0, 10)) break;
  }
  return count;
}

// Convert work-day offset (integer) from projectStart to actual Date.
function offsetToDate(projectStart, offset, calendar) {
  return addWorkDays(projectStart, offset, calendar);
}

module.exports = { isWorkDay, addWorkDays, workDaysBetween, offsetToDate };
