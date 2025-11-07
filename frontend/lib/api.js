
import { pushLatestApiCallsDeployments, setDeployment, setStores } from "@/redux/slices/GlobalSlice";
import { setSearchResults } from "@/redux/slices/ProductInventorySlice";
import store from "@/redux/store";
import { PAGINATION_PER_PAGE, SEARCH_OPTIONS } from "./constant";
import { setBrandSelector, setMetaSearch } from "@/redux/slices/PromotionFormSlice";
import COLLECTIONS, { INDEXES } from "./collections-config";

export async function getProductsWithSearchInput(query = '', useBrandAmplification = false) {
  const searchType = store.getState('ProductInventory').ProductInventory.searchType;
  const storeObjectId = store.getState('Global').Global.selectedStore;
  console.log('getProductsWithSearch', searchType)
  const body = {
    query: query,
    storeObjectId: storeObjectId,
    option: searchType,
    page: store.getState('ProductInventory').ProductInventory.pagination_page + 1,
    page_size: PAGINATION_PER_PAGE,
  }
  if (searchType === SEARCH_OPTIONS.hybridSearch.id) {
    body.weightVector = Number(store.getState('ProductInventory').ProductInventory.vectorSearchWeight);
    body.weightText = Number(store.getState('ProductInventory').ProductInventory.searchWeight);
    body.fusionMode = store.getState('ProductInventory').ProductInventory.fusionMode;
  }
  if(useBrandAmplification == true && searchType !== SEARCH_OPTIONS.regex.id) {
    body.brandAmplification = store.getState('BrandAmplificationForm').BrandAmplificationForm.brandAmplificationList?.data?.map(ba => {
      let  orm = {
        name: ba.name,
        boostLevel: Number(ba.boostLevel) || 1
      }
      if(ba.categories)
        orm.categories = [...ba.categories]
      return orm
    }) || [];
    if(body.brandAmplification.length === 0) {
      console.log('No brand amplifications found in the state.');
      delete body.brandAmplification;
    }
  }
  console.log('Request body for search:', body);
  
  // Use Next.js API route proxy instead of direct backend call
  // Browser → Next.js proxy (/api/v1/search) → Backend sidecar (127.0.0.1:8000)
  const response = await fetch(`/api/v1/search`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.log(response)
    throw new Error(`Error fetching products: ${response.status}`);
  }
  const data = await response.json();
  console.log('data: ', Object.keys(data.products).length, data)
  setDeploymentToRedux(data.deployment, `${Object.values(SEARCH_OPTIONS).find(s => s.id === searchType)?.label} for product '${query}'`);
  return { products: data.products, totalItems: data.total_results };
}

export async function getProductWithScanner(_id) {

  const response = await fetch(`/api/findDocuments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: { 'inventorySummary.storeObjectId': store.getState().Global.selectedStore },
      projection: {
        _id: 1,
        productName: 1,
        imageUrlS3: 1,
        'inventorySummary.storeObjectId': 1,
        'inventorySummary.storeId': 1,
        'inventorySummary.sectionId': 1,
        'inventorySummary.aisleId': 1,
        'inventorySummary.shelfId': 1,
        'inventorySummary.inStock': 1,
        'inventorySummary.nearToReplenishmentInShelf': 1
      },
      options: { limit: 1 },
      collectionName: COLLECTIONS.PRODUCTS
    }),
  });
  if (!response.ok) {
    throw new Error(`Error fetching product details: ${response.status}`);
  }
  let data = await response.json();
  console.log('getProductWithScanner', data)
  store.dispatch(setSearchResults({
    results: [{ ...data.result[0] }] || [],
    totalItems: data.result ? 1 : 0,
    scanProductSearch: 1
  }));
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
      collectionName: COLLECTIONS.PRODUCTS
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
      collectionName: COLLECTIONS.INVENTORY,
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
  if (store.getState().Global.stores.length === 0) {
    console.log('No stores available in the state. Cannot fetch distances.');
    const stores = await getStores()
    if (stores) {
      store.dispatch(setStores({ stores }));
    }

  }
  if (!mainPoint) mainPoint = store.getState().Global.stores.find(store => store._id === selectedStoreId)?.location.coordinates;
  console.log('getDistancesForOtherStores', mainPoint)
  const response = await fetch(`/api/getDistances`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      collectionName: COLLECTIONS.STORES || process.env.STORES,
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
      collectionName: COLLECTIONS.STORES || process.env.STORES,
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

export async function getProduct(_id) {
  const response = await fetch(`/api/findDocuments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: { _id: _id },
      options: { limit: 1 },
      collectionName: COLLECTIONS.PRODUCTS
    }),
  });
  if (!response.ok) {
    throw new Error(`Error fetching product details: ${response.status}`);
  }
  let data = await response.json();
  return data.result[0]
}

export async function brandAmplificationGetSearchMeta() {
  const response = await fetch(`/api/searchMeta`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      collectionName: COLLECTIONS.PRODUCTS,
      indexName: INDEXES.SEARCH_META,
      brand: store.getState().BrandAmplificationForm.brandAmplification.brand,
      categories: store.getState().BrandAmplificationForm.brandAmplification.categories
    }),
  });
  if (!response.ok) {
    throw new Error(`Error fetching search meta details: ${response.status}`);
  }
  let data = await response.json();
  console.log('brandAmplificationGetSearchMeta searchMeta res', data)
  store.dispatch(setMetaSearch({ metaSearch: data }))
  return data.meta
}

export async function getAllBrands() {
  const response = await fetch(`/api/getDistinctBrands`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      collectionName: COLLECTIONS.PRODUCTS,
    }),
  });
  if (!response.ok) {
    throw new Error(`Error fetching search meta details: ${response.status}`);
  }
  let data = await response.json();
  console.log('getAllBrands res', data)
  store.dispatch(setBrandSelector({ brands: data.data || [] }));
  return data.meta
}

const setDeploymentToRedux = (deployment = null, latestApiCallsDeployments = null) => {
  if (deployment === 'atlas') {
    deployment = 'MongoDB Atlas'
  } else if (deployment === 'enterprise') {
    deployment = 'Enterprise Server'
  } else {
    deployment = 'MongoDB'
  }
  store.dispatch(pushLatestApiCallsDeployments({ deployment, latestApiCallsDeployments }));
};
