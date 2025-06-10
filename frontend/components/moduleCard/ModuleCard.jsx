import React from 'react'
import Card from '@leafygreen-ui/card';

const ModuleCard = (props) => {
    const { 
        moduleName, 
        description,
        url
    } = props;

    return (
        <Card className='m-3 p-3' style={{ width: '100%' }}>
            <h3>{moduleName}</h3>
            <p>{description}</p>
            <p>{url}</p>
        </Card>
    )
}

export default ModuleCard