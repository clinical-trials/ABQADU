/**
 * CPM engine — topological sort + forward/backward pass + float.
 * All offsets are work-day integers relative to project start (0-indexed).
 *
 * Dependency types:
 *   FS (lag): ES_succ = max(ES_succ, EF_pred + lag)
 *   SS (lag): ES_succ = max(ES_succ, ES_pred + lag)
 *   FF (lag): EF_succ = max(EF_succ, EF_pred + lag)  → ES_succ = EF_succ - dur
 *   SF (lag): EF_succ = max(EF_succ, ES_pred + lag)  → ES_succ = EF_succ - dur
 */

function runCPM(activities, dependencies) {
  if (!activities.length) return [];

  const byId = new Map(activities.map(a => [a.id, { ...a, es: 0, ef: 0, ls: 0, lf: 0 }]));

  // Build graph
  const succs = new Map(activities.map(a => [a.id, []]));
  const preds = new Map(activities.map(a => [a.id, []]));
  const inDeg = new Map(activities.map(a => [a.id, 0]));

  for (const dep of dependencies) {
    succs.get(dep.predecessor_id).push(dep);
    preds.get(dep.successor_id).push(dep);
    inDeg.set(dep.successor_id, inDeg.get(dep.successor_id) + 1);
  }

  // Kahn's topological sort — detects cycles
  const queue = [...activities.filter(a => inDeg.get(a.id) === 0).map(a => a.id)];
  const order = [];
  const tempDeg = new Map(inDeg);

  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const dep of succs.get(id)) {
      const newDeg = tempDeg.get(dep.successor_id) - 1;
      tempDeg.set(dep.successor_id, newDeg);
      if (newDeg === 0) queue.push(dep.successor_id);
    }
  }

  if (order.length !== activities.length) {
    throw new Error('Cycle detected in activity dependencies');
  }

  // Forward pass
  for (const id of order) {
    const act = byId.get(id);
    let esMin = 0;

    for (const dep of preds.get(id)) {
      const pred = byId.get(dep.predecessor_id);
      const lag = dep.lag_days || 0;

      switch (dep.dep_type) {
        case 'FS':
          esMin = Math.max(esMin, pred.ef + lag);
          break;
        case 'SS':
          esMin = Math.max(esMin, pred.es + lag);
          break;
        case 'FF':
          esMin = Math.max(esMin, pred.ef + lag - act.duration_days);
          break;
        case 'SF':
          esMin = Math.max(esMin, pred.es + lag - act.duration_days);
          break;
      }
    }

    act.es = esMin;
    act.ef = act.es + act.duration_days;
  }

  const projectEnd = Math.max(...[...byId.values()].map(a => a.ef));

  // Backward pass — initialize LF = projectEnd
  for (const act of byId.values()) act.lf = projectEnd;

  for (const id of [...order].reverse()) {
    const act = byId.get(id);

    for (const dep of succs.get(id)) {
      const succ = byId.get(dep.successor_id);
      const lag = dep.lag_days || 0;
      const ls_succ = succ.lf - succ.duration_days;

      switch (dep.dep_type) {
        case 'FS':
          act.lf = Math.min(act.lf, ls_succ - lag);
          break;
        case 'SS':
          act.lf = Math.min(act.lf, ls_succ - lag + act.duration_days);
          break;
        case 'FF':
          act.lf = Math.min(act.lf, succ.lf - lag);
          break;
        case 'SF':
          act.lf = Math.min(act.lf, succ.lf - lag + act.duration_days);
          break;
      }
    }

    act.ls = act.lf - act.duration_days;
  }

  // Float + critical path
  for (const act of byId.values()) {
    act.total_float = act.ls - act.es;
    act.is_critical = act.total_float === 0;

    // Free float: how much can this activity slip without delaying any successor?
    let ff = act.total_float;
    for (const dep of succs.get(act.id)) {
      const succ = byId.get(dep.successor_id);
      const lag = dep.lag_days || 0;
      switch (dep.dep_type) {
        case 'FS': ff = Math.min(ff, succ.es - act.ef - lag); break;
        case 'SS': ff = Math.min(ff, succ.es - act.es - lag); break;
        case 'FF': ff = Math.min(ff, succ.ef - act.ef - lag); break;
        case 'SF': ff = Math.min(ff, succ.ef - act.es - lag); break;
      }
    }
    act.free_float = Math.max(0, ff);
  }

  return [...byId.values()];
}

module.exports = { runCPM };
