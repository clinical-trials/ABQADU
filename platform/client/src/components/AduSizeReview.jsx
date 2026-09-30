import React from 'react';

const SOURCE='https://documents.cabq.gov/planning/IDO/2025_IDO_Update/IDO_2026_Effective-2026-05-06.pdf';
export const emptySizeReview=()=>({primary_house_sqft:'',adu_sqft:''});
export const sizeReviewOf=review=>({...emptySizeReview(),...review?.size_review});
export function floorArea(value) {
  if(typeof value!=='string' || !/^\d{1,7}(?:\.\d{1,2})?$/.test(value.trim()))return null;
  const area=Number(value);return area>0 && area<=1000000?area:null;
}
export const sameSizeReview=(one,two)=>['primary_house_sqft','adu_sqft'].every(key=>one?.[key]===two?.[key]);
export const validSizeReview=value=>!!value && typeof value==='object' && !Array.isArray(value)
  && Object.keys(value).length===2 && ['primary_house_sqft','adu_sqft'].every(key=>value[key]==='' || floorArea(value[key])!==null);
export const sizeRecovery=review=>{
  const sizes=sizeReviewOf(review);
  return sizes.primary_house_sqft || sizes.adu_sqft ? `Floor-area comparison\nMain house: ${sizes.primary_house_sqft||'Unknown'} sq ft\nProposed ADU: ${sizes.adu_sqft||'Unknown'} sq ft` : '';
};

export default function AduSizeReview({value,onChange,jurisdiction,jobSqft}) {
  const house=floorArea(value.primary_house_sqft),adu=floorArea(value.adu_sqft),jobArea=floorArea(String(jobSqft??''));
  const ratio=house!==null && adu!==null ? house/adu : null;
  const displayedRatio=ratio===null?'Not measured':ratio<.01?'<0.01:1':`${ratio.toLocaleString('en-US',{maximumFractionDigits:2})}:1`;
  return <div className="gis-size-review">
    <h3>House &amp; ADU size</h3>
    <p className="gis-help">Compare gross floor area from the plans, including all floors and measured to the outside of exterior walls. For the City ADU size limit, an attached garage or shed is excluded.</p>
    <div className="gis-form-grid">
      <label>Main house gross floor area (sq ft)<input inputMode="decimal" maxLength={10} value={value.primary_house_sqft} onChange={event=>onChange({...value,primary_house_sqft:event.target.value})} placeholder="Not measured"/></label>
      <label>Proposed ADU gross floor area (sq ft)<input inputMode="decimal" maxLength={10} value={value.adu_sqft} onChange={event=>onChange({...value,adu_sqft:event.target.value})} placeholder="Not measured"/></label>
    </div>
    {jobArea!==null && <button className="gis-size-fill" type="button" onClick={()=>onChange({...value,adu_sqft:jobArea.toFixed(2)})}>Use job’s {jobArea.toLocaleString('en-US')} sq ft for ADU</button>}
    <div className="gis-size-ratio" aria-label="House to ADU area ratio"><span>House : ADU</span><strong>{displayedRatio}</strong><small>Area comparison only. No citywide 2:1 requirement was verified.</small></div>
    <div className="gis-size-reference" aria-label="Jurisdiction size reference">
      {jurisdiction==='albuquerque' ? <>
        <b>{adu===null?'City general ADU limit: 750 sq ft GFA':adu>750?'Exceeds the general 750 sq ft cap':'At or below the general 750 sq ft cap'}</b>
        <p>This is not zoning approval. Downtown CPO-3 in R-1 has a 650 sq ft limit. The combined area of accessory buildings is also limited by side/rear-yard coverage; setbacks, overlays and other requirements still need review.</p>
      </> : <><b>Confirm the jurisdiction and its size rules.</b><p>The City of Albuquerque’s general 750 sq ft limit does not apply throughout the metro area. Confirm county or other municipal rules for this address.</p></>}
      <a href={SOURCE} target="_blank" rel="noopener noreferrer">City IDO · May 6, 2026 · §4-3(F)(6)</a>
      <p>Use the applicable ordinance edition and confirm zoning and overlays with Planning. The entered areas do not establish buildable yard space.</p>
    </div>
  </div>;
}
