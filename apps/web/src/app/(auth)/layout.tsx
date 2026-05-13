export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-background flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="font-mono text-2xl font-medium tracking-tight">Lince</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Captación inmobiliaria automatizada para Catalunya
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}
