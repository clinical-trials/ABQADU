import React from 'react';

export default function BidPricingGuidance({ onChoose }) {
  return <section aria-label="Company pricing guideline" style={{ padding: 12, margin: '12px 0', borderRadius: 8, background: '#f2f0e7', color: '#3d463b', fontSize: 14, lineHeight: 1.5, overflowWrap: 'anywhere' }}>
    <b>60% starting markup · 100% company target</b>
    <p style={{ margin: '6px 0' }}>Overhead &amp; profit is added to direct job costs. At 100% markup, $100,000 in costs becomes a $200,000 price, before contingency and tax. That leaves 50% of the price to cover overhead and profit.</p>
    {onChoose && <>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
        {[[60, 'Use 60%'], [100, 'Use 100% target']].map(([value, label]) => <button key={value} type="button" onClick={() => onChoose(value)} style={{ minHeight: 44, padding: '8px 12px', background: '#fff', border: '1px solid #a9b19e', borderRadius: 6, color: '#36503d', font: 'inherit', cursor: 'pointer' }}>{label}</button>)}
      </div>
      <small>Changes this draft’s pricing. Save Bid to keep the change.</small>
    </>}
  </section>;
}
