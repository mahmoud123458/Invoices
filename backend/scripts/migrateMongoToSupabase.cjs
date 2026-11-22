const {
  TABLES,
  mapUser,
  mapClient,
  mapProduct,
  mapShippingCompany,
  mapInvoice,
  mapPurchaseOrder,
  mapExpense,
} = require('./mongoImportMapping.cjs');

const DEFAULT_BATCH_SIZE = 500;
const SOURCES = {
  users: ['users', mapUser],
  clients: ['clients', mapClient],
  products: ['products', mapProduct],
  shipping_companies: ['shippingcompanies', mapShippingCompany],
  expenses: ['expenses', mapExpense],
};

function chunks(values, size) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function redact(message, secrets) {
  let safeMessage = String(message);
  for (const secret of secrets || []) {
    if (typeof secret === 'string' && secret.length > 0) {
      safeMessage = safeMessage.split(secret).join('[REDACTED]');
    }
  }
  return safeMessage.replace(/\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}/g, '[REDACTED_HASH]');
}

function log(logger, level, message, secrets) {
  if (logger && typeof logger[level] === 'function') {
    logger[level](redact(message, secrets));
  }
}

function createStats() {
  return Object.fromEntries(TABLES.map((table) => [
    table,
    { source: 0, imported: 0, skipped: 0, failed: 0 },
  ]));
}

async function* readBatches(db, collectionName, batchSize) {
  const cursor = db.collection(collectionName).find({}).batchSize(batchSize);
  let batch = [];
  try {
    while (await cursor.hasNext()) {
      batch.push(await cursor.next());
      if (batch.length === batchSize) {
        yield batch;
        batch = [];
      }
    }
    if (batch.length > 0) yield batch;
  } finally {
    if (typeof cursor.close === 'function') await cursor.close();
  }
}

async function selectExistingIds(supabase, table, values, batchSize) {
  const ids = [...new Set(values.filter(Boolean))];
  const existing = new Set();
  for (const batch of chunks(ids, batchSize)) {
    const { data, error } = await supabase
      .from(table)
      .select('external_id')
      .in('external_id', batch);
    if (error) throw new Error(error.message || `Unable to validate ${table} references`);
    for (const row of data || []) existing.add(row.external_id);
  }
  return existing;
}

async function upsertRows(supabase, table, rows, stats, batchSize, logger, secrets) {
  const importedIds = new Set();
  for (const batch of chunks(rows, batchSize)) {
    try {
      const { error } = await supabase
        .from(table)
        .upsert(batch, { onConflict: 'external_id', ignoreDuplicates: false });
      if (error) throw new Error(error.message || `Unable to import ${table}`);
      stats[table].imported += batch.length;
      for (const row of batch) importedIds.add(row.external_id);
    } catch (error) {
      stats[table].failed += batch.length;
      log(logger, 'error', `${table} batch failed: ${error.message || error}`, secrets);
    }
  }
  return importedIds;
}

async function insertRows(supabase, table, rows, stats, batchSize, logger, secrets) {
  for (const batch of chunks(rows, batchSize)) {
    try {
      const { error } = await supabase.from(table).insert(batch);
      if (error) throw new Error(error.message || `Unable to import ${table}`);
      stats[table].imported += batch.length;
    } catch (error) {
      stats[table].failed += batch.length;
      log(logger, 'error', `${table} batch failed: ${error.message || error}`, secrets);
    }
  }
}

async function replaceChildren(supabase, table, parentColumn, parentIds, rows, stats, batchSize, logger, secrets) {
  if (parentIds.length === 0) return;
  try {
    for (const batch of chunks(parentIds, batchSize)) {
      const { error } = await supabase
        .from(table)
        .delete()
        .in(parentColumn, batch);
      if (error) throw new Error(error.message || `Unable to replace ${table}`);
    }
  } catch (error) {
    stats[table].failed += rows.length;
    log(logger, 'error', `${table} replacement failed: ${error.message || error}`, secrets);
    return;
  }
  await insertRows(supabase, table, rows, stats, batchSize, logger, secrets);
}

async function importSimpleSource(db, supabase, sourceName, table, map, stats, options) {
  const { batchSize, logger, secrets } = options;
  for await (const sourceBatch of readBatches(db, sourceName, batchSize)) {
    stats[table].source += sourceBatch.length;
    const rows = [];
    for (const document of sourceBatch) {
      try {
        rows.push(map(document));
      } catch (error) {
        stats[table].failed++;
        log(logger, 'error', `${table} mapping failed: ${error.message || error}`, secrets);
      }
    }
    await upsertRows(supabase, table, rows, stats, batchSize, logger, secrets);
  }
}

async function importInvoices(db, supabase, stats, options) {
  const { batchSize, logger, secrets } = options;
  for await (const sourceBatch of readBatches(db, 'invoices', batchSize)) {
    stats.invoices.source += sourceBatch.length;
    stats.invoice_items.source += sourceBatch.reduce((count, row) => count + (row.items || []).length, 0);
    stats.invoice_payments.source += sourceBatch.reduce((count, row) => count + (row.payments || []).length, 0);
    const mapped = [];
    for (const document of sourceBatch) {
      try {
        mapped.push(mapInvoice(document));
      } catch (error) {
        stats.invoices.failed++;
        stats.invoice_items.failed += (document.items || []).length;
        stats.invoice_payments.failed += (document.payments || []).length;
        log(logger, 'error', `invoices mapping failed: ${error.message || error}`, secrets);
      }
    }

    try {
      const [clients, users, shippingCompanies, products] = await Promise.all([
        selectExistingIds(supabase, 'clients', mapped.map(({ record }) => record.client_id), batchSize),
        selectExistingIds(supabase, 'users', mapped.flatMap(({ record, payments }) =>
          [record.created_by, ...payments.map((payment) => payment.recorded_by)]
        ), batchSize),
        selectExistingIds(supabase, 'shipping_companies', mapped.map(({ record }) =>
          record.shipping_company_id
        ), batchSize),
        selectExistingIds(supabase, 'products', mapped.flatMap(({ items }) =>
          items.map((item) => item.product_id)
        ), batchSize),
      ]);
      const valid = [];
      for (const entry of mapped) {
        const { record, items, payments } = entry;
        if (!record.client_id || !clients.has(record.client_id)) {
          stats.invoices.skipped++;
          stats.invoice_items.skipped += items.length;
          stats.invoice_payments.skipped += payments.length;
          log(logger, 'error', `Invoice skipped because its required client reference is missing`, secrets);
          continue;
        }
        if (record.created_by && !users.has(record.created_by)) {
          log(logger, 'error', 'Invoice creator reference is missing; importing with no creator', secrets);
          record.created_by = null;
        }
        if (record.shipping_company_id && !shippingCompanies.has(record.shipping_company_id)) {
          log(logger, 'error', 'Invoice shipping reference is missing; importing with no shipping company', secrets);
          record.shipping_company_id = null;
        }
        for (const item of items) {
          if (item.product_id && !products.has(item.product_id)) {
            log(logger, 'error', 'Invoice product reference is missing; importing item without a product', secrets);
            item.product_id = null;
          }
        }
        for (const payment of payments) {
          if (payment.recorded_by && !users.has(payment.recorded_by)) {
            log(logger, 'error', 'Payment recorder reference is missing; importing with no recorder', secrets);
            payment.recorded_by = null;
          }
        }
        valid.push(entry);
      }

      const importedIds = await upsertRows(
        supabase,
        'invoices',
        valid.map(({ record }) => record),
        stats,
        batchSize,
        logger,
        secrets
      );
      const successful = valid.filter(({ record }) => importedIds.has(record.external_id));
      const ids = successful.map(({ record }) => record.external_id);
      await replaceChildren(
        supabase,
        'invoice_items',
        'invoice_id',
        ids,
        successful.flatMap(({ items }) => items),
        stats,
        batchSize,
        logger,
        secrets
      );
      await replaceChildren(
        supabase,
        'invoice_payments',
        'invoice_id',
        ids,
        successful.flatMap(({ payments }) => payments),
        stats,
        batchSize,
        logger,
        secrets
      );
      const failedIds = valid
        .filter(({ record }) => !importedIds.has(record.external_id))
        .map(({ record }) => record.external_id);
      const failed = mapped.filter(({ record }) => failedIds.includes(record.external_id));
      stats.invoice_items.failed += failed.reduce((sum, { items }) => sum + items.length, 0);
      stats.invoice_payments.failed += failed.reduce((sum, { payments }) => sum + payments.length, 0);
    } catch (error) {
      stats.invoices.failed += mapped.length;
      stats.invoice_items.failed += mapped.reduce((sum, { items }) => sum + items.length, 0);
      stats.invoice_payments.failed += mapped.reduce((sum, { payments }) => sum + payments.length, 0);
      log(logger, 'error', `Invoice batch failed: ${error.message || error}`, secrets);
    }
  }
}

async function importPurchaseOrders(db, supabase, stats, options) {
  const { batchSize, logger, secrets } = options;
  for await (const sourceBatch of readBatches(db, 'purchaseorders', batchSize)) {
    stats.purchase_orders.source += sourceBatch.length;
    stats.purchase_order_items.source += sourceBatch.reduce((count, row) => count + (row.items || []).length, 0);
    const mapped = [];
    for (const document of sourceBatch) {
      try {
        mapped.push(mapPurchaseOrder(document));
      } catch (error) {
        stats.purchase_orders.failed++;
        stats.purchase_order_items.failed += (document.items || []).length;
        log(logger, 'error', `purchase_orders mapping failed: ${error.message || error}`, secrets);
      }
    }
    try {
      const users = await selectExistingIds(supabase, 'users', mapped.flatMap(({ record }) =>
        [record.created_by, record.approved_by]
      ), batchSize);
      const products = await selectExistingIds(supabase, 'products', mapped.flatMap(({ items }) =>
        items.map((item) => item.product_id)
      ), batchSize);
      for (const { record, items } of mapped) {
        if (record.created_by && !users.has(record.created_by)) {
          log(logger, 'error', 'Purchase-order creator reference is missing; importing with no creator', secrets);
          record.created_by = null;
        }
        if (record.approved_by && !users.has(record.approved_by)) {
          log(logger, 'error', 'Purchase-order approver reference is missing; importing with no approver', secrets);
          record.approved_by = null;
        }
        for (const item of items) {
          if (item.product_id && !products.has(item.product_id)) {
            log(logger, 'error', 'Purchase-order product reference is missing; importing item without a product', secrets);
            item.product_id = null;
          }
        }
      }
      const importedIds = await upsertRows(
        supabase,
        'purchase_orders',
        mapped.map(({ record }) => record),
        stats,
        batchSize,
        logger,
        secrets
      );
      const successful = mapped.filter(({ record }) => importedIds.has(record.external_id));
      const ids = successful.map(({ record }) => record.external_id);
      await replaceChildren(
        supabase,
        'purchase_order_items',
        'order_id',
        ids,
        successful.flatMap(({ items }) => items),
        stats,
        batchSize,
        logger,
        secrets
      );
      const failedIds = mapped
        .filter(({ record }) => !importedIds.has(record.external_id))
        .map(({ record }) => record.external_id);
      stats.purchase_order_items.failed += mapped
        .filter(({ record }) => failedIds.includes(record.external_id))
        .reduce((sum, { items }) => sum + items.length, 0);
    } catch (error) {
      stats.purchase_orders.failed += mapped.length;
      stats.purchase_order_items.failed += mapped.reduce((sum, { items }) => sum + items.length, 0);
      log(logger, 'error', `Purchase-order batch failed: ${error.message || error}`, secrets);
    }
  }
}

async function importExpenses(db, supabase, stats, options) {
  const { batchSize, logger, secrets } = options;
  for await (const sourceBatch of readBatches(db, 'expenses', batchSize)) {
    stats.expenses.source += sourceBatch.length;
    const rows = [];
    for (const document of sourceBatch) {
      try {
        rows.push(mapExpense(document));
      } catch (error) {
        stats.expenses.failed++;
        log(logger, 'error', `expenses mapping failed: ${error.message || error}`, secrets);
      }
    }
    try {
      const users = await selectExistingIds(
        supabase,
        'users',
        rows.map((row) => row.created_by),
        batchSize
      );
      for (const row of rows) {
        if (row.created_by && !users.has(row.created_by)) {
          log(logger, 'error', 'Expense creator reference is missing; importing with no creator', secrets);
          row.created_by = null;
        }
      }
      await upsertRows(supabase, 'expenses', rows, stats, batchSize, logger, secrets);
    } catch (error) {
      stats.expenses.failed += rows.length;
      log(logger, 'error', `expenses batch failed: ${error.message || error}`, secrets);
    }
  }
}

function writeSummary(stats, logger, secrets) {
  for (const [table, counts] of Object.entries(stats)) {
    log(logger, 'log', `${table}: source=${counts.source} imported=${counts.imported} skipped=${counts.skipped} failed=${counts.failed}`, secrets);
  }
}

async function importMongoData({ db, supabase, batchSize = DEFAULT_BATCH_SIZE, logger = console, secrets = [] }) {
  if (!db || !supabase) throw new TypeError('MongoDB and Supabase clients are required');
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new RangeError('batchSize must be a positive integer');

  const stats = createStats();
  const options = { batchSize, logger, secrets };
  for (const [table, [sourceName, map]] of Object.entries(SOURCES).filter(([table]) => table !== 'expenses')) {
    await importSimpleSource(db, supabase, sourceName, table, map, stats, options);
  }
  await importInvoices(db, supabase, stats, options);
  await importPurchaseOrders(db, supabase, stats, options);
  await importExpenses(db, supabase, stats, options);

  const { error } = await supabase.rpc('align_imported_number_sequences');
  if (error) throw new Error(redact(error.message || 'Unable to align imported number sequences', secrets));
  writeSummary(stats, logger, secrets);
  return { tables: stats, sequencesAligned: true };
}

async function main({ env = process.env, dependencies = {}, logger = console } = {}) {
  const required = ['MONGODB_URI', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  if (required.some((key) => !env[key])) {
    throw new Error(`${required.join(', ')} are required`);
  }
  const MongoClient = dependencies.MongoClient || require('mongodb').MongoClient;
  const createSupabaseClient = dependencies.createSupabaseClient
    || require('@supabase/supabase-js').createClient;
  const mongo = new MongoClient(env.MONGODB_URI);
  const secrets = [env.MONGODB_URI, env.SUPABASE_SERVICE_ROLE_KEY];
  try {
    await mongo.connect();
    const supabase = createSupabaseClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
    return await importMongoData({
      db: mongo.db(),
      supabase,
      logger,
      secrets,
    });
  } finally {
    if (typeof mongo.close === 'function') await mongo.close();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(redact(error.message || error, [
      process.env.MONGODB_URI,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ]));
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_BATCH_SIZE,
  importMongoData,
  main,
  redact,
};
