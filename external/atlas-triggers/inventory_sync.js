/******************************************************************************
 *  INVENTORY ➜ PRODUCT SYNC TRIGGER (COLLECTION LEVEL)                        *
 *  ========================================================================= *
 *  PURPOSE                                                                    *
 *  -------                                                                    *
 *  Whenever a document in the **inventory** collection changes, this trigger  *
 *  rewrites the lightweight `inventorySummary` array inside the matching      *
 *  product document.  Products therefore always expose fresh aisle / shelf /  *
 *  stock-status data without a runtime join.                                  *
 *                                                                            *
 *                                                                            *
 *  ATLAS COLLECTION-TRIGGER SETTINGS                                          *
 *  ----------------------------------                                        *
 *  • Trigger Type .......... Collection                                       *
 *  • Database .............. <your_db>        (e.g. retail-unified-commerce)  *
 *  • Collection ............ <inventory_coll> (e.g. inventory)             *
 *  • Operation Types ....... Insert, Update, Replace                          *
 *  • Full Document Lookup .. ON                                               *
 *                                                                            *
 *  Trigger Options                                                            *
 *  • Auto-Resume ........... ON                                               *
 *  • Event Ordering ........ ON (sequential)                                  *
 *  • Skip Events on Re-Enable  OFF                                            *
 *                                                                            *                                                                        *                                                                            *
 *  HOW TO DEPLOY                                                              *
 *  ----------------------------------                                        *
 *  1. Create a **Collection Trigger** in Atlas pointing to your inventory     *
 *     collection.                                                             *
 *  2. Select operation types → **Insert, Update, Replace**.                   *
 *  3. Turn **Full Document Lookup** **ON**.                                   *
 *  4. (Optional) add the Project Expression shown above.                      *
 *  5. Paste this file into the Function editor and save.                      *
 *                                                                            *
 *  Result: every inventory update automatically refreshes the product’s       *
 *  `inventorySummary`.                                                        *
 ******************************************************************************/

/* ✏️  CHANGE THIS ONLY IF YOUR PRODUCTS COLLECTION USES ANOTHER NAME */
const PRODUCTS_COLL = "products";

/* ─────────────────────────────────────────────────────────────────────────── */
exports = async function (changeEvent) {
  // Abort if delete (no fullDocument)
  const doc = changeEvent.fullDocument;
  if (!doc || !doc.productId) return;

  // Build condensed summary
  const inventorySummary = (doc.storeInventory || []).map((si) => ({
    storeObjectId:              si.storeObjectId,
    storeId:                    si.storeId,
    sectionId:                  si.sectionId,
    aisleId:                    si.aisleId,
    shelfId:                    si.shelfId,
    inStock:                    si.inStock,
    nearToReplenishmentInShelf: si.nearToReplenishmentInShelf
  }));

  // Write back to the product (same DB namespace as source event)
  const svc = context.services.get("mongodb-atlas");;// ← use your Linked-Data-Source name
  await svc
    .db(changeEvent.ns.db)
    .collection(PRODUCTS_COLL)
    .updateOne({ _id: doc.productId }, { $set: { inventorySummary } });

  console.log(`✔ inventorySummary synced → product ${doc.productId}`);
};

/*******************************************************************************
 *  MIT License                                                                *
 *  Copyright (c) 2025 IST - MongoBD                                           *
 *                                                                             *
 *  Permission is hereby granted, free of charge, to any person obtaining a    *
 *  copy of this software and associated documentation files (the “Software”), *
 *  to deal in the Software without restriction, including without limitation  *
 *  the rights to use, copy, modify, merge, publish, distribute, sublicense,   *
 *  and/or sell copies of the Software, and to permit persons to whom the      *
 *  Software is furnished to do so, subject to the following conditions:       *
 *                                                                             *
 *  THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR *
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,   *
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL    *
 *  THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER *
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING    *
 *  FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER        *
 *  DEALINGS IN THE SOFTWARE.                                                  *
 ******************************************************************************/