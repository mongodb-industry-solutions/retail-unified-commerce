'use client'
import Card from '@leafygreen-ui/card'
import React from 'react'
import Icon from '@leafygreen-ui/icon';
import { useSelector } from 'react-redux';

import './FloatingCard.css'
import Badge from '@leafygreen-ui/badge';
import ExpandableCard from '@leafygreen-ui/expandable-card';

const FloatingCard = () => {
    const { deployment, latestApiCallsDeployments } = useSelector(state => state.Global);


    return (
        <ExpandableCard 
            className='FloatingCard'
            defaultOpen={true}
            title={
                <div className='d-flex align-items-center'>
                <Icon glyph="Connect" fill='green' size="large" />
                <Badge variant={'green'} className="my-badge-floating ms-2">
                    <Icon glyph="Database" fill='white' size="default" className='me-2' /> 
                    {deployment || 'MongoDB'}
                </Badge>
            </div>
            }
        >
            <p className={'text-start m-0 mt-2'}>Recent Activity:</p>
            {
                latestApiCallsDeployments.length > 0 && (
                    <div>
                        <ul className='m-0 ps-3'>
                            {latestApiCallsDeployments.map((call, index) => (
                                <li className='ms-0 ps-0' key={index}>{call}</li>
                            ))}
                        </ul>
                    </div>
                )
            }
        </ExpandableCard>
    )
}

export default FloatingCard