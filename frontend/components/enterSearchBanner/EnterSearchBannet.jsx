import React, { useState } from 'react'
import Image from 'next/image'
import { Description } from '@leafygreen-ui/typography';



const EnterSearchBanner = () => {

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
                    Enter a search term
                </Description>
                <Image
                    src="/icons/Search.png"
                    alt="Search Icon"
                    width={300}
                    height={300}
                    style={{ width: '350px', height: 'auto' }}
                    priority
                />
            </div>

        </div>
    )
}

export default EnterSearchBanner