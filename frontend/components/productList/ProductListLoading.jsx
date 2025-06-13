"use client";

import React, { useState, useEffect, useCallback } from "react";
import styles from "./productList.module.css";
import { CardSkeleton, ParagraphSkeleton, Skeleton } from "@leafygreen-ui/skeleton-loader";
import Card from "@leafygreen-ui/card";

const ProductListLoading = () => {


  
  return (
    <div className={styles.productContainer}>
        {
            [0, 1, 2, 3, 4, 5, 6, 7, 8].map(index => (
                <Card className={styles.card} key={`loading-${index}`}>
                    <Skeleton ></Skeleton>
                    <ParagraphSkeleton ></ParagraphSkeleton>
                    <ParagraphSkeleton ></ParagraphSkeleton>
                </Card>
            ))
        }
    </div>
  );
};
export default ProductListLoading;
