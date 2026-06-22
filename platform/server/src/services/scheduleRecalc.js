const { pool } = require('../db');
const { runCPM } = require('./cpm');
const { offsetToDate } = require('./calendar');

async function recalcProject(projectId) {
  const { rows: acts } = await pool.query(
    'SELECT id, duration_days, planned_start, calendar_id FROM activities WHERE project_id=$1',
    [projectId]
  );
  const { rows: deps } = await pool.query(
    `SELECT d.* FROM dependencies d
     JOIN activities a ON a.id = d.predecessor_id WHERE a.project_id=$1`,
    [projectId]
  );
  const { rows: projRows } = await pool.query(
    'SELECT start_date FROM projects WHERE id=$1', [projectId]
  );

  if (!acts.length || !projRows.length) return;

  const projectStart = new Date(projRows[0].start_date || new Date());

  // Default calendar (Mon-Fri, no exceptions)
  const defaultCal = { work_days: [1, 2, 3, 4, 5], exceptions: new Set() };

  const results = runCPM(acts, deps);

  // Write CPM results back to DB and convert offsets → dates
  for (const r of results) {
    const cal = defaultCal; // TODO: load per-activity calendar
    const planned_start  = offsetToDate(projectStart, r.es, cal);
    const planned_finish = offsetToDate(projectStart, r.ef - 1, cal);

    await pool.query(
      `UPDATE activities SET
         es=$1, ef=$2, ls=$3, lf=$4,
         total_float=$5, free_float=$6, is_critical=$7,
         planned_start=$8, planned_finish=$9
       WHERE id=$10`,
      [r.es, r.ef, r.ls, r.lf,
       r.total_float, r.free_float, r.is_critical,
       planned_start.toISOString().slice(0, 10),
       planned_finish.toISOString().slice(0, 10),
       r.id]
    );
  }
}

module.exports = { recalcProject };
