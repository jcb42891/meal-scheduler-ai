import Link from "next/link"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import heroImage from './hero-bg.jpg'  // Place image in app directory

export default function HomePage() {
  return (
    <div className="min-h-screen relative">
      <Image
        src={heroImage}
        alt="Fresh vegetables and ingredients"
        fill
        priority
        className="object-cover"
      />
      
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40 z-10" />
      
      {/* Content */}
      <div className="relative z-20 container mx-auto px-4 py-32 flex flex-col items-center justify-center text-center text-white space-y-8">
        <h1 className="text-5xl font-bold tracking-tight">
          Plan Your Meals Together
        </h1>
        <p className="text-xl max-w-2xl mx-auto text-gray-200">
          Simplify your meal planning, coordinate with family and friends, and generate grocery lists automatically.
        </p>
        <Link href="/auth">
          <Button className="bg-[#FF9B76] hover:bg-[#FF9B76]/90 text-white font-medium px-8 py-6 text-lg rounded-full shadow-lg hover:shadow-xl transition-all duration-200">
            Get Started
          </Button>
        </Link>
      </div>
    </div>
  )
}
