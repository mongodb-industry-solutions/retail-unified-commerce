import React from 'react'
import { useRouter } from 'next/navigation';
import Card from '@leafygreen-ui/card';
import './moduleCard.css';
import Button from '@leafygreen-ui/button';

const ModuleCard = (props) => {
    const { 
        moduleName, 
        description,
        url,
        disabled = false
    } = props;
    const router = useRouter();

    const handleClick = () => {
        if (!disabled) {
            router.push(url);
        }
    }    

    return (
        <Card className={`module-card m-3 p-3 ${disabled ? 'disabled' : ''}`} style={{ width: '100%' }} >
            <h3>{moduleName}</h3>
            <p>{description}</p>
            <Button onClick={handleClick}>
                Visit Module
            </Button>
        </Card>
    )
}

export default ModuleCard