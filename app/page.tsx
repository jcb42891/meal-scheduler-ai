import Link from "next/link"
import { Button } from "@/components/ui/button"
import Image from "next/image"
import heroImage from './hero-bg.jpg'  // Place image in app directory

export default function HomePage() {
  return (
    <div className="relative min-h-[calc(100vh-4rem)] overflow-hidden rounded-xl border border-border/60">
      <Image
        src={heroImage}
        alt="Fresh vegetables and ingredients"
        fill
        priority
        className="object-cover"
      />
      
      {/* Overlay */}
      <div className="absolute inset-0 z-10 bg-foreground/45" />
      <div className="absolute inset-0 z-10 bg-gradient-to-b from-foreground/20 via-transparent to-foreground/50" />
      
      {/* Content */}
      <div className="relative z-20 mx-auto flex min-h-[calc(100vh-4rem)] max-w-4xl flex-col items-center justify-center space-y-8 px-4 py-20 text-center text-white sm:px-6">
        <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl">
          Plan Your Meals Together
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-white/90 sm:text-xl">
          Simplify your meal planning, coordinate with family and friends, and generate grocery lists automatically.
        </p>
        <Link href="/auth">
          <Button size="lg" className="px-8 text-base shadow-lg">
            Get Started
          </Button>
        </Link>
      </div>
    </div>
  )
}
