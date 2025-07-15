# ADR: Implementing Geospatial Query for Store Proximity

Our demo enhances the user experience by showing **how close other stores are** to the one currently selected.  
This is achieved using MongoDB’s **geospatial querying capabilities**, powered by the `$geoNear` aggregation stage.

---

## 🧭 Use Case

We want to show customers a list of **other stores that carry the same product**, ordered by **distance** from the store they initially selected.

The table of “Other Store Availability” includes:

- Store name  
- Distance from selected store (in kilometers)  
- A flag indicating if it’s within a 15 km radius  

---

## 💡 Decision

We use MongoDB’s **`$geoNear`** aggregation stage to dynamically calculate and sort store distances without persisting this data.

---

## 🌍 Why `$geoNear`?

`$geoNear` is a **geospatial stage** in the MongoDB aggregation pipeline that:

- **Sorts documents by proximity** to a reference point  
- **Calculates distance** from that point and attaches it as a new field  
- Supports **spherical calculations** to reflect real-world geography  

---

## 🧪 Our Aggregation Pipeline

```js
const distances = await collection.aggregate([
  {
    $geoNear: {
      near: { type: "Point", coordinates: mainPoint },  // Selected store's coordinates
      distanceField: "distance",                        // Adds computed distance (in meters)
      spherical: true                                   // Use Earth's curvature
    }
  },
  {
    $project: {
      _id: 1,
      storeName: 1,
      location: 1,
      distanceInKM: { $divide: ["$distance", 1000] },   // Convert to kilometers
      isNearby: { $lt: [{ $divide: ["$distance", 1000] }, 15] } // <15 km flag
    }
  }
]).toArray();

```

## 📦 Store Document Structure

Each store has a `location` field defined as a **GeoJSON Point**:

```json
{
  "_id": "store123",
  "storeName": "Downtown Market",
  "location": {
    "type": "Point",
    "coordinates": [100.5018, 13.7563]  // [longitude, latitude]
  }
}
```

> ⚠️ **GeoJSON requires** `[longitude, latitude]` order – not the reverse.

---

## 🔧 Required Index

To enable `$geoNear`, MongoDB requires a **`2dsphere`** index on the `location` field:

```js
db.stores.createIndex({ location: "2dsphere" })
```

✅ This tells MongoDB to treat the data as points on a globe, unlocking accurate geospatial math.  
❌ Without this index, `$geoNear` will fail with an error.

---

## 🧠 Why This Approach?

✅ **Dynamic calculation** – No need to store or manually update distances.  
✅ **Real-time insights** – Results are always based on the most recent store selection.  
✅ **Operational simplicity** – No need to denormalize distances or maintain sync logic between stores.

---

## 🎯 Summary

MongoDB’s geospatial capabilities let us:

- **Calculate store distances dynamically**  
- **Sort by proximity using real geography**  
- **Flag nearby stores** with flexible business logic (e.g., within 15 km)

The `$geoNear` stage, combined with a `2dsphere` index and GeoJSON `Point` fields, gives us a **simple yet powerful** way to enhance location-based product discovery.
