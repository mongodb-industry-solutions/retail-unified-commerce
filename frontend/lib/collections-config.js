/**
 * Collection names configuration
 * This file centralizes all collection and index names used in the application.
 * It helps maintain consistency and makes it easier to update collection names in the future.
 */

// Collection names used throughout the application
export const COLLECTIONS = {
  PRODUCTS: process.env.NEXT_PUBLIC_COLLECTION_PRODUCTS || 'products',
  INVENTORY: process.env.NEXT_PUBLIC_COLLECTION_INVENTORY || 'inventory',
  STORES: process.env.NEXT_PUBLIC_COLLECTION_STORES || 'stores',
};

// Index names
export const INDEXES = {
  SEARCH_META:  process.env.NEXT_PUBLIC_INDEX_SEARCH_META || 'product_atlas_search_meta',
};
