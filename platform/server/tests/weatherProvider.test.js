jest.mock('../src/services/nwsWeather',()=>({fetchNwsForecast:jest.fn(async()=>({provider:'nws',source:'National Weather Service'})),getNwsStatus:jest.fn(()=>({configured:true,missing:[],required_env:[]}))}));
jest.mock('../src/services/weatherKit',()=>({fetchWeatherKitForecast:jest.fn(async()=>({provider:'weatherkit',source:'Apple Weather'})),getWeatherKitStatus:jest.fn(()=>({configured:false,missing:['WEATHERKIT_PRIVATE_KEY'],required_env:['WEATHERKIT_PRIVATE_KEY']}))}));
const {fetchForecast,getWeatherStatus}=require('../src/services/weatherProvider');
const nws=require('../src/services/nwsWeather');
const apple=require('../src/services/weatherKit');
beforeEach(()=>jest.clearAllMocks());
test('uses NWS by default without Apple credentials',async()=>{
  const options={env:{}};
  expect(await fetchForecast('87106',options)).toMatchObject({provider:'nws'});
  expect(nws.fetchNwsForecast).toHaveBeenCalledWith('87106',options);
  expect(apple.fetchWeatherKitForecast).not.toHaveBeenCalled();
  expect(getWeatherStatus({})).toMatchObject({configured:true,provider:'nws',source:'National Weather Service'});
});
test('Apple remains an explicit provider with its own configuration status',async()=>{
  const options={env:{WEATHER_PROVIDER:'weatherkit'}};
  expect(await fetchForecast('87106',options)).toMatchObject({provider:'weatherkit'});
  expect(nws.fetchNwsForecast).not.toHaveBeenCalled();
  expect(getWeatherStatus(options.env)).toMatchObject({configured:false,provider:'weatherkit',missing:['WEATHERKIT_PRIVATE_KEY']});
});
test('provider failures never silently switch sources',async()=>{
  nws.fetchNwsForecast.mockRejectedValueOnce(Object.assign(new Error('NWS unavailable'),{status:502}));
  await expect(fetchForecast('87106',{env:{}})).rejects.toMatchObject({status:502});
  expect(apple.fetchWeatherKitForecast).not.toHaveBeenCalled();
});
test('invalid provider configuration rejects without a network call',async()=>{
  await expect(fetchForecast('87106',{env:{WEATHER_PROVIDER:'unknown'}})).rejects.toMatchObject({status:503});
  expect(getWeatherStatus({WEATHER_PROVIDER:'unknown'})).toMatchObject({configured:false,missing:['WEATHER_PROVIDER']});
  expect(nws.fetchNwsForecast).not.toHaveBeenCalled();
});
