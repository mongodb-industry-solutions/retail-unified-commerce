import React from 'react'

import './brandAmplificationMeta.css'
import { useSelector } from 'react-redux';
import {Callout} from '@leafygreen-ui/callout';

const BrandAmplificationMeta = () => {
  const { metaSearch } = useSelector(state => state.BrandAmplificationForm)
  return (
    <div className='brand-amplification-meta'>
      <div className='color-card card-lavender'>
        <h4>Products Matching the Amplification Summary </h4>
          <div className='text-center color-card card-lime lead'>
                <p className='m-0'><strong>Matching products count</strong></p>
                <p className='bucket-count'>{metaSearch?.meta?.meta?.count?.lowerBound}</p>
          </div>
        <div className='bucket-grid'>
          {
            metaSearch?.meta?.meta?.facet?.categoriesFacet?.buckets
            .map(bucket => (
              <div key={bucket._id} className='bucket color-card card-mist'>
                <p className='m-0'><strong>{bucket._id}</strong></p>
                <p className='bucket-count'>{bucket.count}</p>
              </div>
            ))
          }
        </div>
      </div>
      <Callout>
          Dynamic queries to retrieve the count of products matching the brand amplification criteria using <a href='https://www.mongodb.com/docs/atlas/atlas-search/aggregation-stages/searchMeta/' target='_blank'>$searchMeta</a>. This helps in understanding the impact of the amplification settings before applying them.
      </Callout>
    </div>
  )
}

export default BrandAmplificationMeta