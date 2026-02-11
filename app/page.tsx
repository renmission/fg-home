import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme/theme-toggle";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-background p-8 relative">
      {/* Theme Toggle - Top Right */}
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      {/* Hero Content */}
      <section className="hero-section w-full max-w-4xl mx-auto text-center space-y-8">
        {/* Logo */}
        <div className="flex justify-center mb-4">
          <Image
            src="/logo.png"
            alt="FG Home Builders and Construction Supply Logo"
            width={400}
            height={200}
            priority
            className="h-auto w-auto max-w-full"
          />
        </div>

        <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto">
          Streamline your operations with our comprehensive internal management platform designed
          for construction supply businesses.
        </p>
        <div className="pt-4">
          <Button asChild size="lg" className="text-base px-8 py-6">
            <Link href="/login">Get Started</Link>
          </Button>
        </div>
      </section>
    </main>
  );
}
