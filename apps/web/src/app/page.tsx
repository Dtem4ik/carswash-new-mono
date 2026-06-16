import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-semibold tracking-tight">CarsWash</h1>
      <p className="text-muted-foreground max-w-md text-balance">
        Multi-tenant SaaS for car-wash networks. Phase 0 foundations — the app
        is up and running.
      </p>
      <Button>Get started</Button>
    </main>
  );
}
