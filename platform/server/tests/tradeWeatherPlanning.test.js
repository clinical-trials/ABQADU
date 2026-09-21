const { tradeWeatherGuidance, planningCrewMessage } = require('../src/services/tradeWeatherPlanning');
const clear = {date:'2026-09-22',high_f:80,low_f:58,rain_chance:10,precip_inches:0,wind_mph:8,gust_mph:12,wind_coverage:'complete'};
test('unknown temperature never becomes a freezing-temperature warning or a plan result',()=>{
  const result=tradeWeatherGuidance({...clear,high_f:null,low_f:null});
  expect(result.concrete.level).toBe('unknown');
  expect(result.concrete.reasons.join(' ')).not.toMatch(/null|Low temperature|curing/);
});
test('unknown rain probability prevents a clear plan without inventing precipitation',()=>{
  const result=tradeWeatherGuidance({...clear,rain_chance:null,precip_inches:null});
  expect(result.concrete.level).toBe('unknown');
  expect(result.concrete.reasons.join(' ')).toMatch(/precipitation|rain/i);
});
test('known rain hazard remains a hold when amount is missing, with honest wording',()=>{
  const result=tradeWeatherGuidance({...clear,rain_chance:80,precip_inches:null});
  expect(result.concrete.level).toBe('hold');
  expect(result.concrete.reasons.join(' ')).toContain('amount unavailable');
  expect(result.concrete.reasons.join(' ')).not.toContain('null');
});
test('gust-only hazard remains a hold with missing sustained wind',()=>{
  const result=tradeWeatherGuidance({...clear,wind_mph:null,gust_mph:40,wind_coverage:'partial',hourly_hours_available:4,hourly_hours_expected:24});
  expect(result.roofing.level).toBe('hold');
  expect(result.roofing.reasons.join(' ')).not.toContain('null');
});
test.each(['temperature_coverage','rain_coverage'])('partial %s does not claim a full-day plan',key=>{
  const result=tradeWeatherGuidance({...clear,[key]:'partial'});
  expect(result.concrete.level).toBe('review');
});
test('provider-specific crew summaries attribute NWS data accurately',()=>{
  const days=[{...clear,trade_guidance:tradeWeatherGuidance(clear)}];
  const message=planningCrewMessage(days,'87106',{start_date:'2026-09-22',end_date:'2026-09-25',time_zone:'America/Denver'},'National Weather Service');
  expect(message).toContain('derived from National Weather Service data');
  expect(message).not.toContain('Apple');
});
test('missing condition descriptions prevent a clear lightning assessment',()=>{
  expect(tradeWeatherGuidance({...clear,condition_coverage:'unavailable'}).concrete.level).toBe('unknown');
  expect(tradeWeatherGuidance({...clear,condition_coverage:'partial'}).concrete.level).toBe('review');
});
test('legacy numerical risk summaries handle null measurements honestly',()=>{
  const {assessConstructionWeather}=require('../src/services/weatherIntelligence');
  const forecast=assessConstructionWeather([{...clear,low_f:null,rain_chance:80,precip_inches:null,wind_mph:null,gust_mph:40}],'87106');
  expect(forecast.risks.some(risk=>risk.type==='freeze')).toBe(false);
  expect(forecast.risks.map(risk=>risk.note).join(' ')).not.toMatch(/null|undefined/);
  expect(forecast.risks.map(risk=>risk.note).join(' ')).toContain('unavailable');
});
