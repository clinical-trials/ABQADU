const {Pool}=require('pg');
const crypto=require('crypto');
const {createRemoteOnce}=require('../src/services/invoiceShelfCreation');
const database=process.env.BILLING_TEST_DATABASE_URL;
(database ? describe : describe.skip)('InvoiceShelf reservations with PostgreSQL',()=>{
  const schema=`shelf_test_${process.pid}_${crypto.randomBytes(6).toString('hex')}`;
  let admin,db;
  beforeAll(async()=>{
    admin=new Pool({connectionString:database});
    await admin.query(`CREATE SCHEMA ${schema}`);
    db=new Pool({connectionString:database,options:`-c search_path=${schema}`});
    await db.query('CREATE TABLE invoices(id SERIAL PRIMARY KEY, amount NUMERIC, invoiceshelf_invoice_id TEXT, invoiceshelf_sync_error TEXT)');
  });
  afterAll(async()=>{
    if(db) await db.end();
    if(admin) {await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); await admin.end();}
  });
  test('an edit after reading a snapshot stops export before the provider call',async()=>{
    const {rows:[record]}=await db.query('INSERT INTO invoices(amount) VALUES(100) RETURNING *,xmin::text AS row_version');
    await db.query('UPDATE invoices SET amount=200 WHERE id=$1',[record.id]);
    const create=jest.fn(async()=>({data:{id:42}}));
    await expect(createRemoteOnce({db,table:'invoices',idColumn:'invoiceshelf_invoice_id',record,create,save:async()=>({rowCount:1})})).rejects.toMatchObject({status:409});
    expect(create).not.toHaveBeenCalled();
    const {rows:[current]}=await db.query('SELECT * FROM invoices WHERE id=$1',[record.id]);
    expect(Number(current.amount)).toBe(200);
    expect(current.invoiceshelf_sync_error).toBeNull();
  });
  test('an unchanged snapshot can be reserved and mapped once',async()=>{
    const {rows:[record]}=await db.query('INSERT INTO invoices(amount) VALUES(100) RETURNING *,xmin::text AS row_version');
    const create=jest.fn(async()=>({data:{id:43}}));
    const options={db,table:'invoices',idColumn:'invoiceshelf_invoice_id',record,create,
      save:id=>db.query('UPDATE invoices SET invoiceshelf_invoice_id=$1,invoiceshelf_sync_error=NULL WHERE id=$2',[id,record.id])};
    expect(await createRemoteOnce(options)).toMatchObject({id:'43',existing:false});
    expect(await createRemoteOnce(options)).toMatchObject({id:'43',existing:true});
    expect(create).toHaveBeenCalledTimes(1);
  });
});
