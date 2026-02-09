import { signIn } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-muted/30 via-background to-muted/20 p-4 sm:p-6">
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="p-4 sm:p-6">
          <CardTitle className="text-xl sm:text-2xl">FG Homes</CardTitle>
          <CardDescription className="text-sm">
            Sign in to the internal management platform
          </CardDescription>
        </CardHeader>
        <CardContent className="p-4 pt-0 sm:p-6 sm:pt-0">
          <form
            className="flex flex-col gap-4"
            action={async (formData: FormData) => {
              "use server";
              await signIn("credentials", {
                email: formData.get("email") as string,
                password: formData.get("password") as string,
                redirectTo: "/dashboard",
              });
            }}
          >
            <div className="grid gap-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="you@example.com"
                required
                autoComplete="email"
                className="min-h-11 touch-manipulation sm:min-h-0"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                className="min-h-11 touch-manipulation sm:min-h-0"
              />
            </div>
            <Button type="submit" className="w-full min-h-11 touch-manipulation sm:min-h-0">
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
