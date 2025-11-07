/**
 * Collection names configuration
 * This file centralizes all collection names used in the application.
 */

// Collection names used throughout the application
export const COLLECTIONS = {
  BRAND_AMPLIFICATION: 'brand-amplification',
  PRODUCTS: 'products',
  INVENTORY: 'inventory',
  STORES: 'stores',
  ORDERS: 'orders',
  CUSTOMERS: 'customers',
  CATEGORIES: 'categories',
};

// Index names
export const INDEXES = {
  SEARCH_META: 'searchMeta'
};

// Helper function to validate if a collection name exists
export const isValidCollection = (collectionName) => {
  return Object.values(COLLECTIONS).includes(collectionName);
};

// Get collection name by key
export const getCollectionName = (key) => {
  return COLLECTIONS[key] || null;
};

export default COLLECTIONS;