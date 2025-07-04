'use client'

import React, { useRef, useEffect } from 'react'
import { GoogleMap, LoadScript, Marker } from '@react-google-maps/api';



const center = {
    lat: 51.505,
    lng: -0.09,
};
const containerStyle = {
  width: '100%',
  height: '300px',
};

const LocationInMap = (props) => {
    const {marker} = props
    console.log('marker', marker)   


    return (
        <div id="myMap" style={{ position: 'absolute', width: '100%', height: '100%', position: 'relative', backgroundColor: '#f0f0f0' }}>
            <LoadScript googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}>
                <GoogleMap mapContainerStyle={containerStyle} center={marker} zoom={13}>
                    <Marker position={marker} />
                </GoogleMap>
            </LoadScript>
        </div>
    )
}

export default LocationInMap