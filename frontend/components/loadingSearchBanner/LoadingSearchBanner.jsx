import React, { useState } from 'react'
import Image from 'next/image'
import { Description } from '@leafygreen-ui/typography';
import { Spinner } from '@leafygreen-ui/loading-indicator';



const LoadingSearchBanner = (props) => {
    let {title } = props

    return (
        <div
            style={{
                width: '100%',
                minHeight: '30vh',
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                marginTop: '3rem',
            }}
        >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Spinner
                    variant="x-large"
                    description={title || "Loading..."}
                />
            </div>

        </div>
    )
}

export default LoadingSearchBanner