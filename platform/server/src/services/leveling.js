/**
 * Resource leveling: delay non-critical activities within their float
 * to resolve resource overallocation.
 *
 * Algorithm:
 * 1. For each resource, build a day-by-day demand map.
 * 2. Find days where demand > max_units_per_day.
 * 3. On overallocated days, find non-critical activities with float > 0.
 * 4. Delay the activity with the most float by 1 day, recompute demand.
 * 5. Repeat until no overallocation or no more float available.
 */

function levelResources(activities, assignments, resources) {
  const resourceMap = new Map(resources.map(r => [r.id, r]));
  const actMap = new Map(activities.map(a => [a.id, { ...a }]));

  // Build demand: resourceId → { day → units }
  function buildDemand() {
    const demand = new Map();
    for (const asn of assignments) {
      const act = actMap.get(asn.activity_id);
      if (!act || act.es == null) continue;
      if (!demand.has(asn.resource_id)) demand.set(asn.resource_id, new Map());
      for (let d = act.es; d < act.ef; d++) {
        const map = demand.get(asn.resource_id);
        map.set(d, (map.get(d) || 0) + asn.units);
      }
    }
    return demand;
  }

  const MAX_ITERATIONS = 500;
  let iterations = 0;

  while (iterations++ < MAX_ITERATIONS) {
    const demand = buildDemand();
    let overloaded = false;

    for (const [resourceId, dayMap] of demand) {
      const resource = resourceMap.get(resourceId);
      if (!resource) continue;

      for (const [day, units] of dayMap) {
        if (units <= resource.max_units_per_day) continue;
        overloaded = true;

        // Find non-critical activities assigned to this resource on this day with float
        const candidates = assignments
          .filter(asn => asn.resource_id === resourceId)
          .map(asn => actMap.get(asn.activity_id))
          .filter(a => a && !a.is_critical && a.total_float > 0 && a.es <= day && a.ef > day)
          .sort((a, b) => b.total_float - a.total_float); // most float first

        if (!candidates.length) break;

        // Delay the most-floated activity by 1 day
        const target = candidates[0];
        target.es += 1;
        target.ef += 1;
        target.ls += 1;
        target.lf += 1;
        target.total_float -= 1;
        break;
      }

      if (overloaded) break;
    }

    if (!overloaded) break;
  }

  return [...actMap.values()];
}

module.exports = { levelResources };
