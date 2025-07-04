'use client'
import Code from '@leafygreen-ui/code'
import Icon from '@leafygreen-ui/icon'
import React from 'react'
import { Container } from 'react-bootstrap'

const querySnippet = `const distances = await collection.aggregate([
            {
                $geoNear: {
                    near: { type: "Point", coordinates: mainPoint }, // Reference point of the current selected store
                    distanceField: "distance", 
                    spherical: true,                                // Use spherical calculations for Earth  
                }
            },
            {
                $project: {
                    _id: 1,
                    storeName: 1,
                    location: 1,
                    distanceInKM: { $divide: ["$distance", 1000] }, // Convert distance from meters to kilometers
                    isNearby: { $lt: [{ $divide: ["$distance", 1000] }, 15] } // Check if distance is less than 15 km
                }
            }
        ])
        .toArray();`

const document = `{
  "_id": "store123",
  "storeName": "Downtown Market",
  "location": {
    "type": "Point",
    "coordinates": [100.5018, 13.7563] // [longitude, latitude]
  }
}`
const indexCreationSnippet = `db.stores.createIndex({ location: "2dsphere" })`

const LocationLearnMore = () => {
    return (
        <Container className='mt-3'>
            <>
                <h3>How We Calculate Store Distances</h3>
                <p>
                    The <strong> <Icon glyph="Building" size="small" /> Other Store Availability</strong> table shows how far each store is from the store you have selected at the start of your experience. This distance is calculated using <a href='https://www.mongodb.com/docs/manual/geospatial-queries/' target='_blank'>MongoDB's geospatial capabilities</a>, specifically the <code>$geoNear</code> aggregation stage.
                </p>

                <h4>How It Works</h4>
                <ul>
                    <li>
                        When you select a store, the app triggers a <a href='https://www.mongodb.com/docs/manual/reference/operator/aggregation/geoNear/#mongodb-pipeline-pipe.-geoNear' target='_blank'>$geoNear query to MongoDB</a>.
                    </li>
                    <li>
                        This query computes the distance from your selected store to every other store in our database.
                    </li>
                    <li>
                        The calculated distances are then displayed in the table, so you can easily see which stores are nearby.
                    </li>
                    <li>
                        The stores collection in the database only stores each store’s location as a <strong>GeoJSON Point</strong>; the distances are computed dynamically.
                    </li>
                </ul>

                <h4>What is <code>$geoNear</code>?</h4>
                <p>
                    <code>$geoNear</code> is a special stage in MongoDB’s aggregation pipeline that returns documents in order of proximity to a specified point. It also adds a <code>distance</code> field to each result, representing the calculated distance from the reference point.
                </p>

                <h4>Our <code>$geoNear</code> Query</h4>
                <Code language="javascript" showLineNumbers>
                    {querySnippet}
                </Code>

                <h4>Store Document Structure</h4>
                <p>
                    Each store document in the database contains a <code>location</code> field with a GeoJSON <code>Point</code> specifying its coordinates:
                </p>
                <Code language="json" showLineNumbers>
                    {document}
                </Code>
                <p>
                    <strong>Note:</strong> The <code>coordinates</code> array must always be in <code>[longitude, latitude]</code> order, as required by the <a href="https://www.mongodb.com/docs/manual/reference/geojson/" target="_blank">GeoJSON specification.</a>
                </p>

                <h4>Why Do We Need a <code>2dsphere</code> Index?</h4>
                <p>
                    MongoDB requires a <code>2dsphere</code> index on the <code>location</code> field to efficiently perform geospatial queries like <code>$geoNear</code>. This index enables MongoDB to calculate distances and proximity on a spherical surface (the Earth).
                </p>
                <p>
                    Here’s how you create a <code>2dsphere</code> index:
                </p>
                <Code language="javascript" showLineNumbers>
                    {indexCreationSnippet}
                </Code>
                <p>
                    Without this index, geospatial queries will not work and MongoDB will return an error.
                </p>
            </>
        </Container>
    )
}

export default LocationLearnMore