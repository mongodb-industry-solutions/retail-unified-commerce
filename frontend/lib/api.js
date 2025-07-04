
import { setStores } from "@/redux/slices/GlobalSlice";
import { setSearchResults } from "@/redux/slices/ProductInventorySlice";
import store from "@/redux/store";

export async function getProductsWithSearch(query = '', filters = {}) {
  console.log('getProductsWithSearch')
  const response = await fetch(`/api/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      collectionName: process.env.NEXT_PUBLIC_COLLECTION_PRODUCTS,
      storeObjectId: store.getState('Global').Global.selectedStore,
      query,
      facets: filters,
      pagination_page: store.getState('ProductInventory').ProductInventory.pagination_page
    }),
  });
  if (!response.ok) {
    console.log(response)
    throw new Error(`Error fetching products: ${response.status}`);
  }
  const data = await response.json();
  console.log('data: ', Object.keys(data.products).length, data)
  return { products: data.products, totalItems: data.totalItems };
}

export async function getProductsWithVectorSearch(query, filters = {}) {
  console.log('getProductsWithVectorSearch')
  const response = await fetch(`/api/vectorSearch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      facets: filters,
      pagination_page: store.getState('ProductInventory').ProductInventory.pagination_page
    }),
  });
  if (!response.ok) {
    throw new Error(`Error fetching cart: ${response.status}`);
  }
  const data = await response.json();
  console.log('data: ', Object.keys(data.products).length, data)
  return { products: data.products, totalItems: data.totalItems };
}

export async function getProductWithScanner(_id) {

  const response = await fetch(`/api/findDocuments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: { _id: _id },
      // projection: {
      //   _id: 1,
      //   productName: 1,
      //   brand: 1,
      //   price: 1,
      //   imageUrlS3: 1,
      //   aboutTheProduct: 1,
      //   category: 1,
      //   subCategory: 1
      // },
      collectionName: process.env.NEXT_PUBLIC_COLLECTION_PRODUCTS
    }),
  });
  if (!response.ok) {
    throw new Error(`Error fetching product details: ${response.status}`);
  }
  let data = await response.json();
  store.dispatch(setSearchResults({ results: data.result || [], totalItems: data.result?.length || 0 }));
  
}

export async function getProductDetails(_id) {

  const response = await fetch(`/api/findDocuments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: { _id: _id },
      projection: {
        _id: 1,
        productName: 1,
        brand: 1,
        price: 1,
        imageUrlS3: 1,
        aboutTheProduct: 1,
        category: 1,
        subCategory: 1
      },
      collectionName: process.env.NEXT_PUBLIC_COLLECTION_PRODUCTS
    }),
  });
  if (!response.ok) {
    throw new Error(`Error fetching product details: ${response.status}`);
  }
  const data = await response.json();
  return data.result[0] || null;
}

export async function getProductInventory(_id, storeObjectId) {
  const response = await fetch(`/api/findDocuments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: { productId: _id },
      collectionName: process.env.NEXT_PUBLIC_COLLECTION_INVENTORY,
      projection: {
        productId: 1,
        updatedAt: 1,
        selectedStoreInventory: {
          $filter: {
            input: "$storeInventory",
            as: "item",
            cond: { $eq: ["$$item.storeObjectId", storeObjectId] }
          }
        },
        // All inventory objects NOT for the selected store
        otherStoreInventory: {
          $filter: {
            input: "$storeInventory",
            as: "item",
            cond: { $ne: ["$$item.storeObjectId", storeObjectId] }
          }
        },
      },
      //objectIdFields: ['projection.storeInventory.$elemMatch.storeObjectId']
    }),
  });
  if (!response.ok) {
    throw new Error(`Error fetching product details: ${response.status}`);
  }
  let data = await response.json();
  data = data.result[0] || null
  // If storeInventory is an array with one object, return just the object
  if (data && Array.isArray(data.storeInventory) && data.storeInventory.length === 1) {
    data.storeInventory = data.storeInventory[0];
  }
  return data;
}

export async function getDistancesForOtherStores(mainPoint = null) {
  let selectedStoreId = store.getState().Global.selectedStore;
  if(store.getState().Global.stores.length === 0) {
    console.log('No stores available in the state. Cannot fetch distances.');
    const stores = await getStores()
      if (stores) {
        store.dispatch(setStores({ stores }));
      }

  }
  if (!mainPoint) mainPoint = store.getState().Global.stores.find(store => store._id === selectedStoreId )?.location.coordinates;
  console.log('getDistancesForOtherStores', mainPoint)
  const response = await fetch(`/api/getDistances`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      collectionName: process.env.NEXT_PUBLIC_COLLECTION_STORES,
      mainPoint: mainPoint
    }),
  });
  if (!response.ok) {
    throw new Error(`Error fetching distances: ${response.status}`);
  }
  const data = await response.json();
  console.log('Distances:', data.distances);
  return data.distances || null;
}

export async function getStores() {
  const response = await fetch(`/api/findDocuments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: {},
      collectionName: process.env.NEXT_PUBLIC_COLLECTION_STORES,
      projection: {
        _id: 1,
        storeName: 1,
        location: 1,
      }
    }),
  });
  if (!response.ok) {
    throw new Error(`Error fetching product details: ${response.status}`);
  }
  const data = await response.json();
  return data.result || null;
}