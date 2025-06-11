import Navbar from "@/components/navbar/Navbar"

export const metadata = {
    title: 'Product Inventory',
    description: '',
  }

export default function ProductInventoryLayout({children}) {
    return (
      <section>
        <Navbar/>
        {children}
      </section>
    )
  }