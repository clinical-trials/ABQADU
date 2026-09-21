const { createRemoteOnce, readRemoteInvoiceStatus } = require('../src/services/invoiceShelfCreation');

test('remote status must come from a recognized provider value',()=>{
  expect(()=>readRemoteInvoiceStatus({data:{}})).toThrow();
  expect(()=>readRemoteInvoiceStatus({data:{status:'invalid'}})).toThrow();
  expect(readRemoteInvoiceStatus({data:{status:'SENT',paid_status:'PAID'}})).toBe('paid');
});

test('an existing mapping never creates a second remote record', async()=>{
  const create = jest.fn();
  const db = {query:jest.fn(async()=>({rows:[]}))};
  const result = await createRemoteOnce({db,table:'clients',idColumn:'invoiceshelf_customer_id',record:{id:1,invoiceshelf_customer_id:'remote-1'},create,save:jest.fn()});
  expect(result).toMatchObject({id:'remote-1',existing:true});
  expect(create).not.toHaveBeenCalled();
});

test('an uncertain previous creation cannot be blindly retried', async()=>{
  const create = jest.fn();
  await expect(createRemoteOnce({table:'clients',idColumn:'invoiceshelf_customer_id',record:{id:1,invoiceshelf_sync_error:'Provider timed out'},create})).rejects.toMatchObject({status:409});
  expect(create).not.toHaveBeenCalled();
});

test('concurrent requests allow one remote creation through the database reservation', async()=>{
  let reserved=false, mapping=null;
  const db={query:jest.fn(async sql=>{
    if(sql.startsWith('UPDATE') && sql.includes('RETURNING')) {
      if(reserved) return {rows:[]}; reserved=true; return {rows:[{id:1}]};
    }
    if(sql.startsWith('SELECT')) return {rows:[{id:1,invoiceshelf_customer_id:mapping,invoiceshelf_sync_error:reserved?'pending':null}]};
    return {rows:[]};
  })};
  let release;
  const create=jest.fn(()=>new Promise(resolve=>{release=()=>resolve({data:{id:'remote-1'}});}));
  const save=jest.fn(async()=>{mapping='remote-1'; return {rowCount:1};});
  const options={db,table:'clients',idColumn:'invoiceshelf_customer_id',record:{id:1,row_version:'1'},create,save};
  const first=createRemoteOnce(options);
  await new Promise(resolve=>setImmediate(resolve));
  await expect(createRemoteOnce(options)).rejects.toMatchObject({status:409});
  release(); await first;
  expect(create).toHaveBeenCalledTimes(1);
});

test('provider failures leave the durable reservation requiring reconciliation', async()=>{
  const db={query:jest.fn(async()=>({rows:[{id:1}]}))};
  const save=jest.fn();
  await expect(createRemoteOnce({db,table:'clients',idColumn:'invoiceshelf_customer_id',record:{id:1,row_version:'1'},create:async()=>{throw new Error('network timeout');},save})).rejects.toMatchObject({status:502});
  expect(save).not.toHaveBeenCalled();
  expect(db.query).toHaveBeenCalledTimes(1);
});

test('a provider success with no retained local mapping requires reconciliation',async()=>{
  const db={query:jest.fn(async()=>({rows:[{id:1}]}))};
  await expect(createRemoteOnce({db,table:'invoices',idColumn:'invoiceshelf_invoice_id',
    record:{id:1,row_version:'1'},create:async()=>({data:{id:42}}),save:async()=>({rowCount:0})
  })).rejects.toMatchObject({status:502});
});

test('an unversioned snapshot cannot create an external document',async()=>{
  const create=jest.fn();
  const db={query:jest.fn(async()=>({rows:[{id:1}]}))};
  await expect(createRemoteOnce({db,table:'invoices',idColumn:'invoiceshelf_invoice_id',
    record:{id:1},create,save:async()=>({rowCount:1})
  })).rejects.toMatchObject({status:409});
  expect(create).not.toHaveBeenCalled();
});
