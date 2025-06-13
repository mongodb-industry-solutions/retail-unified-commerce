import React, { useState } from 'react'
import Image from 'next/image'
import { Description } from '@leafygreen-ui/typography';



const ErrorSearchBanner = (props) => {
    const { error } = props;

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
                <Description style={{ fontSize: '1.2rem', marginBottom: '1rem' }}>
                    {'Error: ' + error.message}
                </Description>
                <Image
                    src="/icons/Alert.png"
                    alt="Search Icon"
                    width={200}
                    height={200}
                    priority
                />
            </div>

        </div>
    )
}

export default ErrorSearchBanner