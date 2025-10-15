import React from 'react'
import Card from '@leafygreen-ui/card';
import Button from '@leafygreen-ui/button';
import { useDispatch, useSelector } from 'react-redux';
import { removeBrandAmplification } from '@/redux/slices/PromotionFormSlice';
const BrandAmplificationList = () => {
    const dispatch = useDispatch();

    const {
        data: brandAmplifications
    } = useSelector(state => state.BrandAmplificationForm.brandAmplificationList)
    
    const deleteBrandAmplification = (baToDelete) => {
        // Remove from localStorage
        let localBrandAmplifications = [];
        try {
            localBrandAmplifications = JSON.parse(localStorage.getItem('brandAmplifications')) || [];
        } catch {
            localBrandAmplifications = [];
        }
        localBrandAmplifications = localBrandAmplifications.filter(
            ba => ba._id !== baToDelete._id // or use ba._id if available
        );
        localStorage.setItem('brandAmplifications', JSON.stringify(localBrandAmplifications));
        // Remove from Redux
        dispatch(removeBrandAmplification({ _id: baToDelete._id }));
    }
    return (
        <div className='mt-4 mb-4'>
            {
                brandAmplifications?.map((ba, index) => (
                    <Card className='mt-3' key={index} onClick={() => console.log(ba)}>
                        <p><strong>Brand: </strong>{ba.name}</p>
                        <p><strong>Boost Level: </strong>{ba.boostLevel}</p>
                        <p><strong>Categories: </strong>{ba.categories ? ba.categories.join(", ") : "All"}</p>
                        {
                            ba.isLocal && <Button onClick={() => deleteBrandAmplification(ba)}>
                                Delete
                            </Button>
                        }
                    </Card>
                ))
            }
        </div>
    )
}

export default BrandAmplificationList