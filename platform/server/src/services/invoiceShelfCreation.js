const { pool } = require('../db');

const REVIEW = 'A creation attempt is pending or needs reconciliation. Check InvoiceShelf before retrying to avoid a duplicate.';
const columns = {clients:'invoiceshelf_customer_id',bids:'invoiceshelf_estimate_id',invoices:'invoiceshelf_invoice_id'};
const failure = (message,status) => Object.assign(new Error(message),{status});

// Commit the reservation before contacting the provider. An uncertain response
// deliberately stays reserved until an operator reconciles the remote record.
async function createRemoteOnce({db=pool,table,idColumn,record,create,save}) {
  if (columns[table] !== idColumn) throw new Error('Invalid InvoiceShelf mapping');
  if (record[idColumn]) return {id:String(record[idColumn]),existing:true};
  if (record.invoiceshelf_sync_error) throw failure(REVIEW,409);
  if (!/^\d+$/.test(String(record.row_version || ''))) throw failure('Refresh this record before exporting it.',409);
  const reserved = await db.query(
    `UPDATE ${table} SET invoiceshelf_sync_error=$1 WHERE id=$2 AND ${idColumn} IS NULL AND invoiceshelf_sync_error IS NULL AND xmin::text=$3 RETURNING id`,
    [REVIEW,record.id,record.row_version]
  );
  if (!reserved.rows.length) {
    const current = await db.query(`SELECT ${idColumn} FROM ${table} WHERE id=$1`,[record.id]);
    if (current.rows[0]?.[idColumn]) return {id:String(current.rows[0][idColumn]),existing:true};
    throw failure('This record changed or another export is pending. Refresh it and review InvoiceShelf before retrying.',409);
  }
  try {
    const result = await create();
    const id = String(result?.data?.id || result?.id || '');
    if (!id) throw new Error('InvoiceShelf did not return an identifier');
    const saved = await save(id,result);
    if (saved?.rowCount !== 1) throw new Error('The remote mapping was not retained');
    return {id,result,existing:false};
  } catch {
    throw failure(REVIEW,502);
  }
}

function readRemoteInvoiceStatus(result) {
  const data = result?.data || result;
  const status = typeof data?.status === 'string' ? data.status.toLowerCase() : '';
  if (!['draft','sent','viewed','completed','unpaid','partially_paid','paid','overdue'].includes(status)) {
    throw failure('InvoiceShelf returned an unrecognized invoice status. The last verified status was preserved.',502);
  }
  if (data.paid_status != null) {
    const paid = String(data.paid_status).toLowerCase();
    if (!['unpaid','partially_paid','paid'].includes(paid)) throw failure('InvoiceShelf returned an unrecognized payment status.',502);
    return paid;
  }
  return status;
}

module.exports = {createRemoteOnce,readRemoteInvoiceStatus};
