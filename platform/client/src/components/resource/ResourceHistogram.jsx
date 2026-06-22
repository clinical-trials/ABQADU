import React, { useMemo } from 'react';

export default function ResourceHistogram({ assignments, resources }) {
  const resourceMap = useMemo(() =>
    new Map(resources.map(r => [r.id, r])), [resources]);

  // Group by resource — build day-by-day demand
  const byResource = useMemo(() => {
    const map = new Map();
    for (const asn of assignments) {
      if (!asn.planned_start || !asn.planned_finish) continue;
      if (!map.has(asn.resource_id)) map.set(asn.resource_id, { days: new Map() });
      const entry = map.get(asn.resource_id);
      const start = new Date(asn.planned_start);
      const end   = new Date(asn.planned_finish);
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const key = d.toISOString().slice(0, 10);
        entry.days.set(key, (entry.days.get(key) || 0) + parseFloat(asn.units || 1));
      }
    }
    return map;
  }, [assignments]);

  if (!byResource.size) return (
    <div style={{ padding: 24, color: '#A8A29E', fontSize: 13 }}>
      No resource assignments yet.
    </div>
  );

  return (
    <div style={{ padding: 20, fontFamily: 'DM Sans, sans-serif' }}>
      {[...byResource.entries()].map(([resourceId, { days }]) => {
        const resource = resourceMap.get(resourceId);
        if (!resource) return null;
        const maxUnits = parseFloat(resource.max_units_per_day) || 1;
        const dayEntries = [...days.entries()].sort(([a], [b]) => a.localeCompare(b));
        const maxDemand = Math.max(...dayEntries.map(([, v]) => v), maxUnits);

        return (
          <div key={resourceId} style={{ marginBottom: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{resource.name}</span>
              <span style={{ fontSize: 11, color: '#78716C' }}>{resource.trade} · max {maxUnits} units/day</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 80 }}>
              {dayEntries.map(([date, demand]) => {
                const h = Math.round((demand / maxDemand) * 72);
                const overloaded = demand > maxUnits;
                return (
                  <div key={date} title={`${date}: ${demand} units`}
                    style={{
                      flex: 1, minWidth: 4, height: h,
                      background: overloaded ? '#B85C38' : '#3D5247',
                      borderRadius: '2px 2px 0 0',
                      transition: 'height .2s',
                    }} />
                );
              })}
            </div>
            {/* Capacity line label */}
            <div style={{ fontSize: 10, color: '#A8A29E', marginTop: 4 }}>
              {dayEntries.filter(([, d]) => d > maxUnits).length > 0 && (
                <span style={{ color: '#B85C38', fontWeight: 600 }}>
                  ⚠ Overallocated on {dayEntries.filter(([, d]) => d > maxUnits).length} day(s)
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
