import React, { useState } from "react";
import { motion } from "framer-motion";
import { BookOpen, KeyRound, BarChart3, Sparkles, GraduationCap, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const { login, isLoading } = useAuth();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      const user = await login({ username, password });
      window.location.href = `/${user.role}/dashboard`;
    } catch {
      setError("Invalid credentials. Please try the demo accounts.");
    }
  };

  const prefill = (u: string, p: string) => {
    setUsername(u);
    setPassword(p);
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-academic-cream font-academic-sans text-academic-ink">
      {/* Decorative background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-32 h-[28rem] w-[28rem] rounded-full bg-academic-gold/20 blur-3xl" />
        <div className="absolute -bottom-40 -right-24 h-[32rem] w-[32rem] rounded-full bg-academic-navy/15 blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "radial-gradient(circle at 1px 1px, var(--academic-ink) 1px, transparent 0)",
            backgroundSize: "28px 28px",
          }}
        />
      </div>

      <div className="relative mx-auto grid min-h-screen w-full max-w-7xl grid-cols-1 items-center gap-12 px-6 py-12 lg:grid-cols-2 lg:px-12">
        {/* Left — Brand panel */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="hidden flex-col justify-between lg:flex"
        >
          <div className="flex items-center justify-center w-full">
            <div className="flex h-70 w-70 items-center justify-center rounded-xl bg-academic-navy text-academic-cream shadow-academic-soft">
              <img src="/skypt_logo.png" alt="Skrypt Logo" className="size-70 object-contain" />
            </div>
          </div>

          <div className="space-y-5">
            <div className="space-y-4 text-center">
              <h1 className="font-academic-serif text-5xl leading-[1.05] tracking-tight text-academic-navy xl:text-6xl">
                Welcome to{" "}
                <span className="relative inline-block">
                  <span className="relative z-10">Skrypt</span>
                  <span className="absolute bottom-1 left-0 z-0 h-3 w-full bg-academic-gold/40" />
                </span>
                <br />
                <span className="text-academic-ink">Writing Coach</span>
              </h1>
              <p className=" text-base leading-relaxed text-academic-ink/70">
                A thoughtful platform to track student progress, administer assessments, and
                generate AI-powered syllabi — designed for the way teachers actually teach.
              </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <FeaturePill icon={<Sparkles className="h-4 w-4" />} label="AI Generation" />
              <FeaturePill icon={<BarChart3 className="h-4 w-4" />} label="Real-time Analytics" />
              <FeaturePill icon={<BookOpen className="h-4 w-4" />} label="Standards-aligned" />
              <FeaturePill icon={<ShieldCheck className="h-4 w-4" />} label="FERPA-compliant" />
            </div>
          </div>
        </motion.div>

        {/* Right — Auth card */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
          className="mx-auto w-full max-w-md"
        >
          {/* Mobile-only brand */}
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-academic-navy text-academic-cream shadow-academic-soft">
              <GraduationCap className="h-5 w-5" />
            </div>
            <span className="font-academic-serif text-xl font-semibold text-academic-navy">
              Skrypt
            </span>
          </div>

          <Card className="border-academic-navy/10 bg-academic-paper/90 shadow-academic-card backdrop-blur-sm">
            <CardContent className="p-8 sm:p-10">
              <div className="mb-8 space-y-2">
                <h2 className="font-academic-serif text-3xl tracking-tight text-academic-navy">
                  Sign in
                </h2>
                <p className="text-sm text-academic-ink/60">
                  Enter your credentials to access your portal.
                </p>
              </div>

              <form onSubmit={handleLogin} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="username" className="text-academic-ink/80">
                    Username
                  </Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    placeholder="e.g. teacher1"
                    className="h-11 border-academic-navy/15 bg-academic-cream/40 focus-visible:ring-academic-gold/60"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-academic-ink/80">
                    Password
                  </Label>
                  <Input
                    id="password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="h-11 border-academic-navy/15 bg-academic-cream/40 focus-visible:ring-academic-gold/60"
                  />
                </div>

                {error && (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isLoading}
                  className="h-11 w-full bg-academic-navy text-academic-cream shadow-academic-soft transition-all hover:bg-academic-navy/90 hover:shadow-md"
                >
                  {isLoading ? "Signing in…" : "Sign in"}
                </Button>
              </form>

              <div className="my-7 flex items-center gap-3 text-xs uppercase tracking-wider text-academic-ink/40">
                <span className="h-px flex-1 bg-academic-navy/10" />
                <span>Demo accounts</span>
                <span className="h-px flex-1 bg-academic-navy/10" />
              </div>

              <div className="flex items-center gap-2 text-xs text-academic-ink/60 mb-3">
                <KeyRound className="h-3.5 w-3.5 text-academic-gold" />
                <span>Click to prefill credentials</span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <DemoBtn label="Student" onClick={() => prefill("student1", "demo123")} />
                <DemoBtn label="Teacher" onClick={() => prefill("teacher1", "demo123")} />
                <DemoBtn label="Admin" onClick={() => prefill("admin1", "demo123")} />
              </div>
            </CardContent>
          </Card>

          <p className="mt-6 text-center text-xs text-academic-ink/50">
            Need help? Contact your school administrator.
          </p>
        </motion.div>
      </div>
    </div>
  );
}

function FeaturePill({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-academic-navy/10 bg-academic-paper/70 px-3.5 py-2.5 text-sm text-academic-ink/80 backdrop-blur-sm">
      <span className="text-academic-gold">{icon}</span>
      <span className="font-medium">{label}</span>
    </div>
  );
}

function DemoBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="outline"
      onClick={onClick}
      className="h-10 border-academic-navy/15 bg-transparent text-academic-ink/80 hover:border-academic-gold/50 hover:bg-academic-gold/10 hover:text-academic-navy"
    >
      {label}
    </Button>
  );
}

