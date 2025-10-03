import React from 'react'
import Icon from '@leafygreen-ui/icon';
import { Disclaimer } from '@leafygreen-ui/typography';

export const CardHeader = (props) => {
    const { glyphIcon = 'Pin', title = 'Title', subtitle, rightElement = null } = props;
    return (
        <div>
            <div className='d-flex flex-row align-items-center'>
                <p className='medium-text text-dark mb-1 me-1'>
                    <Icon glyph={glyphIcon} size="large" /> {/* Aisle icon */}
                    <strong>{title}</strong>
                </p>
                { rightElement }
            </div>
            {
                subtitle && <Disclaimer style={{ fontSize: '14px' }}>{subtitle}</Disclaimer>
            }
        </div>
    )
}
