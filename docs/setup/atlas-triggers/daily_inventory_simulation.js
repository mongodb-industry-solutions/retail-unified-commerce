/******************************************************************************
 *  12-HOURLY INVENTORY SIMULATION TRIGGER                                    *
 *  ========================================================================  *
 *  PURPOSE                                                                   *
 *  -------                                                                   *
 *  This script simulates **real store operations** by updating 500 random    *
 *  products every 12 hours. The idea is to keep the inventory data fresh,    *
 *  contemporary, and coherent for demos, reflecting how stock levels and     *
 *  store metrics naturally change over time.                                 *
 *                                                                            *
 *  - Shelf and backroom quantities are refreshed to mimic real movements.   *
 *  - Flags like `inStock` and `nearToReplenishmentInShelf` stay coherent.   *
 *  - Consumption metrics and restock dates are updated to remain realistic, *
 *     avoiding outdated timestamps that break demo immersion.                *
 *  - The `updatedAt` field is set to indicate the document was              *
 *     recently refreshed.                                                    *
 *                                                                            *
 *  In essence, this keeps your demo dataset **alive and business-realistic**,*
 *  so each time the data is viewed, it looks like a real store evolving day *
 *  by day.                                                                   *
 *                                                                            *
 *  SCHEDULE: create an **Atlas Scheduled Trigger** → “Every 12 hours”.       *
 ******************************************************************************/

const CLUSTER_SERVICE = "IST-Shared";     // Linked data source name
const DB_NAME         = "retail-unified-commerce";
const INVENTORY_COLL  = "inventory";
const BATCH_SIZE      = 500;

exports = async function () {
  /* ---------- helpers ---------------------------------------------------- */
  const rand  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const today = new Date();

  /* ---------- handles ---------------------------------------------------- */
  const svc = context.services.get(CLUSTER_SERVICE);
  const db  = svc.db(DB_NAME);
  const inv = db.collection(INVENTORY_COLL);

  /* 1 ▸ pick up to BATCH_SIZE random docs --------------------------------- */
  const batch = await inv.aggregate([
    { $sample: { size: BATCH_SIZE } }
  ]).toArray();

  if (batch.length === 0) {
    console.log(`ℹ️ No documents found to update.`);
    return;
  }

  /* 2 ▸ build bulk update operations ------------------------------------- */
  const ops = batch.map(doc => {
    const newStores = (doc.storeInventory || []).map(si => {
      const shelfQty = rand(0, 50);
      const backQty  = rand(0, 60);
      const lowThr   = rand(5, 12);
      const total    = shelfQty + backQty;

      const weekly   = rand(20, 120);
      const daysOut  = Math.max(1, Math.floor(total / (weekly / 7)));
      const deplete  = new Date(today);
      deplete.setDate(today.getDate() + daysOut);

      const lastRest = new Date(today);
      lastRest.setDate(today.getDate() - rand(1, 10));
      const nextRest = new Date(today);
      nextRest.setDate(today.getDate() + rand(1, 15));

      return {
        ...si,
        shelfQuantity: shelfQty,
        backroomQuantity: backQty,
        shelfLowThreshold: lowThr,
        inStock: total > 0,
        nearToReplenishmentInShelf: shelfQty < lowThr,
        predictedConsumptionPerWeek: weekly,
        predictedStockDepletion: deplete.toISOString().slice(0, 10),
        lastRestock:  lastRest.toISOString().slice(0, 10),
        nextRestock:  nextRest.toISOString().slice(0, 10)
      };
    });

    return {
      updateOne: {
        filter: { _id: doc._id },
        update: {
          $set: {
            storeInventory: newStores,
            updatedAt: new Date()  //ensures updatedAt reflects this run
          }
        }
      }
    };
  });

  /* 3 ▸ execute bulk write ------------------------------------------------ */
  if (ops.length) await inv.bulkWrite(ops);
  console.log(`✅ ${ops.length} inventory docs updated.`);
};

/*******************************************************************************
 *  MIT License – 2025 IST-MongoDB                                             *
 ******************************************************************************/
