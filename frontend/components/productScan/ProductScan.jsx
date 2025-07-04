import { Description } from '@leafygreen-ui/typography';
import Image from 'next/image';
import React, { useEffect, useState } from 'react'
import { Modal } from 'react-bootstrap'

const ProductScan = (props) => {
    const { show, setShow } = props;
    const [isScanning, setIsScanning] = useState(false)
    const handleClose = () => setShow(false);

    useEffect(() => {
        if (show) {
            setIsScanning(true)
            // Auto-close after animation completes (2.5 seconds)
            const timer = setTimeout(() => {
                // Generate a mock barcode result
                const mockBarcode = `${Math.floor(Math.random() * 1000000000000)}`
                //onScanSuccess(mockBarcode)
                setShow(false)
                setIsScanning(false)
            }, 2500)

            return () => clearTimeout(timer)
        }
    }, [show]) //onScanSuccess
    return (
        <Modal show={show} onHide={handleClose}>
            <Modal.Header closeButton>
                <Modal.Title>Scan Product Tag</Modal.Title>
            </Modal.Header>
            <Modal.Body>
                <Description>Position the barcode or QR code within the scanner frame.</Description>
                <div className="w-100 relative overflow-hidden rounded-md bg-gray-100 p-8">
                    {/* Barcode Pattern */}
                    <div className="flex justify-center items-center h-32">
                        <div className="flex items-end gap-1">
                            {
                                <Image
                                    src="/icons/Search.png"
                                    alt="Search Icon"
                                    width={300}
                                    height={300}
                                    style={{ width: '350px', height: 'auto' }}
                                    priority
                                />

                            }
                        </div>
                    </div>

                    {/* Scanning Line Animation */}
                    {isScanning && (
                        <div className="absolute inset-0 flex items-center">
                            <div
                                className="w-full h-0.5 bg-red-500 shadow-lg animate-pulse"
                                style={{
                                    animation: "scan 2s ease-in-out infinite",
                                    boxShadow: "0 0 10px rgba(239, 68, 68, 0.8)",
                                }}
                            />
                        </div>
                    )}

                    {/* Success Checkmark */}
                    {isScanning && (
                        <div
                            className="absolute inset-0 flex items-center justify-center"
                            style={{
                                animation: "fadeIn 0.5s ease-in-out 2s forwards",
                                opacity: 0,
                            }}
                        >
                            <div className="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                            </div>
                        </div>
                    )}
                </div>


            </Modal.Body>
            <Modal.Footer></Modal.Footer>
        </Modal>
    )
}

export default ProductScan