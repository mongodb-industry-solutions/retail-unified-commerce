/******************************************************************************
 *  12-HOURLY INVENTORY SIMULATION TRIGGER                                     *
 *  ========================================================================  *
 *  WHAT IT DOES                                                              *
 *  ------------                                                              *
 *  • Every 12 hours it randomly selects up to BATCH_SIZE documents from the  *
 *    `inventory` collection that have NOT been processed in the current      *
 *    “simulation cycle” (or that have never been processed at all).          *
 *  • For each selected document it regenerates the volatile fields inside    *
 *    every entry of `storeInventory` (stock levels, flags, restock dates,    *
 *    consumption metrics, etc.).                                             *
 *  • It marks the doc with `lastSimulationCycle = currentCycle` so the same  *
 *    document is not touched again until the next cycle.                     *
 *  • When no documents remain, it increments `currentCycle` (stored in a     *
 *    tiny meta collection) so the next run starts a fresh sweep.             *
 *                                                                            *
 *  SCHEDULE: create an **Atlas Scheduled Trigger** → “Every 12 hours”.       *
 ******************************************************************************/

const CLUSTER_SERVICE = "IST-Shared";     // Linked-data-source name in Atlas
const DB_NAME         = "retail-unified-commerce";
const INVENTORY_COLL  = "inventory";      // renamed collection
const META_COLL       = "inventory-sim-meta"; // holds { _id:"cycle", currentCycle }
const BATCH_SIZE      = 500;

exports = async function () {
  /* ---------- helpers ---------------------------------------------------- */
  const rand  = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const today = new Date();

  /* ---------- handles ---------------------------------------------------- */
  const svc  = context.services.get(CLUSTER_SERVICE);
  const db   = svc.db(DB_NAME);
  const inv  = db.collection(INVENTORY_COLL);
  const meta = db.collection(META_COLL);

  /* 1 ▸ read or create the cycle counter ---------------------------------- */
  const { currentCycle } = await meta.findOneAndUpdate(
    { _id: "cycle" },
    { $setOnInsert: { currentCycle: 1 } },
    { upsert: true, returnNewDocument: true }
  );

  /* 2 ▸ pull up to BATCH_SIZE docs not yet processed this cycle ----------- */
  const batch = await inv.aggregate([
    {
      $match: {
        $or: [
          { lastSimulationCycle: { $lt: currentCycle } },  // already tagged but < cycle
          { lastSimulationCycle: { $exists: false } }      // never processed
        ]
      }
    },
    { $sample: { size: BATCH_SIZE } }
  ]).toArray();

  /* 2b ▸ if no docs left, bump the cycle counter and exit ----------------- */
  if (batch.length === 0) {
    await meta.updateOne({ _id: "cycle" }, { $inc: { currentCycle: 1 } });
    console.log(`🌀 Cycle ${currentCycle} finished. Next cycle = ${currentCycle + 1}`);
    return;
  }

  /* 3 ▸ build bulk update operations ------------------------------------- */
  const ops = batch.map(doc => {
    const newStores = (doc.storeInventory || []).map(si => {
      /* random stock + thresholds */
      const shelfQty = rand(0, 50);
      const backQty  = rand(0, 60);
      const lowThr   = rand(5, 12);
      const total    = shelfQty + backQty;

      /* random consumption → depletion date */
      const weekly   = rand(20, 120);
      const daysOut  = Math.max(1, Math.floor(total / (weekly / 7)));
      const deplete  = new Date(today);
      deplete.setDate(today.getDate() + daysOut);

      /* restock dates around “today” */
      const lastRest = new Date(today);
      lastRest.setDate(today.getDate() - rand(1, 10));
      const nextRest = new Date(today);
      nextRest.setDate(today.getDate() + rand(1, 15));

      return {
        ...si,                                 // keep IDs/layout
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
            lastSimulationCycle: currentCycle,
            updatedAt: new Date()
          }
        }
      }
    };
  });

  /* 4 ▸ execute bulk write ------------------------------------------------ */
  if (ops.length) await inv.bulkWrite(ops);
  console.log(`✅ ${ops.length} docs updated (cycle ${currentCycle}).`);
};

/*******************************************************************************
 *  MIT License                                                                *
 *  Copyright (c) 2025 IST-MongoDB                                             *
 ******************************************************************************/
