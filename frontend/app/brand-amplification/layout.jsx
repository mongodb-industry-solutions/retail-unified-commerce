import Navbar from "@/components/navbar/Navbar"

export const metadata = {
    title: 'Brand amplification',
    description: '',
  }

export default function BrandAmplificationLayout({children}) {
    return (
      <section>
        <Navbar/>
        {children}
      </section>
    )
  }