'use client'

import React, { useRef, useEffect } from 'react'
import { GoogleMap, LoadScript, Marker } from '@react-google-maps/api';
import Code from '@leafygreen-ui/code';


const containerStyle = {
    width: '100%',
    height: '400px',
};

const LocationInMap = (props) => {
    const { marker } = props


    return (
        <div id="myMap" style={{ position: 'absolute', width: '100%', height: '100%', position: 'relative', backgroundColor: '#f0f0f0' }}>
            <Code language="javascript" >
                {`${marker ? `Marker at: ${marker.lat}, ${marker.lng}` : 'No marker provided'}`}
            </Code>
            <GoogleMap mapContainerStyle={containerStyle} center={marker} zoom={20}>
                <Marker position={marker} />
            </GoogleMap>
        </div>
    )
}

export default LocationInMap