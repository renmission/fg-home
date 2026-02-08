import { auth } from "@/lib/auth";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const isAuthRoute = pathname.startsWith("/login");
  const isApiAuth = pathname.startsWith("/api/auth");
  const isDashboard = pathname.startsWith("/dashboard");

  if (isApiAuth) return;
  if (isAuthRoute && isLoggedIn) {
    return Response.redirect(new URL("/dashboard", req.url));
  }
  if (isDashboard && !isLoggedIn) {
    return Response.redirect(new URL("/login", req.url));
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
