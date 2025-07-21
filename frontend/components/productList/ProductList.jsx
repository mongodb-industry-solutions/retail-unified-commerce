"use client";

import React from "react";
import { useSelector, useDispatch } from 'react-redux';
import styles from "./productList.module.css";
import Pagination from "@leafygreen-ui/pagination";
import { PAGINATION_PER_PAGE } from "@/lib/constant";
import { setCurrentPage } from "@/redux/slices/ProductInventorySlice";
import ProductCard from "../productCard/ProductCard";

const itemsPerPage = PAGINATION_PER_PAGE;

const ProductList = (props) => {
  const { onCurrentPageChange } = props;
  const dispatch = useDispatch();
    const { 
      loading, 
      error, 
      searchResults,
      query,
      searchType, // 'search' or 'vector-search'
      pagination_page: currentPage,
      totalItems
    } = useSelector(state => state.ProductInventory);  

  return (
    <div>
      <div className={styles.productContainer}>
        {
          searchResults.length > 0  &&
          searchResults.map((product, index) => (
                <ProductCard
                  key={index}
                  product={product}
                />
            ))
        }
      </div>
      <br></br>
      <hr className={styles.hr}></hr>
      <Pagination
        currentPage={currentPage + 1}
        itemsPerPage={itemsPerPage}
        itemsPerPageOptions={[8, 16, itemsPerPage]}
        numTotalItems={totalItems}
        onForwardArrowClick={() => {
          dispatch(setCurrentPage(currentPage + 1));
          if (onCurrentPageChange) onCurrentPageChange(currentPage + 1);
        }}
        onBackArrowClick={() => {
          dispatch(setCurrentPage(currentPage - 1));
          if (onCurrentPageChange) onCurrentPageChange(currentPage - 1);
        }}
      ></Pagination>
    </div>
  );
};
export default ProductList;
