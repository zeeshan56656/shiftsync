"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, Loader2, AlertCircle, Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password.");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      {/* Logo */}
      <div className="flex items-center justify-center gap-3 mb-8">
        <div className="bg-blue-600 rounded-xl p-2.5">
          <CalendarDays className="h-7 w-7 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">ShiftSync</h1>
          <p className="text-slate-400 text-sm">Coastal Eats Scheduling</p>
        </div>
      </div>

      <Card className="border-slate-700 bg-slate-800/50 backdrop-blur shadow-2xl">
        <CardHeader className="space-y-1 pb-4">
          <CardTitle className="text-xl text-white">Sign in</CardTitle>
          <CardDescription className="text-slate-400">
            Enter your credentials to access the platform
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-300">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@coastaleats.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-300">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 focus:border-blue-500 pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-200"
                  tabIndex={-1}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-400 bg-red-400/10 border border-red-400/20 rounded-lg px-3 py-2 text-sm">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <Button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign in"
              )}
            </Button>
          </form>

          {/* Demo credentials hint */}
          <div className="mt-6 pt-4 border-t border-slate-700">
            <p className="text-slate-500 text-xs text-center mb-2">Demo accounts</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              {[
                { role: "Admin", email: "admin@coastaleats.com" },
                { role: "Manager", email: "mgr.marina@coastaleats.com" },
                { role: "Staff", email: "sarah@coastaleats.com" },
              ].map(({ role, email: demoEmail }) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => {
                    setEmail(demoEmail);
                    setPassword("password123");
                  }}
                  className="text-slate-400 hover:text-blue-400 bg-slate-700/50 rounded px-2 py-1.5 text-center transition-colors"
                >
                  <span className="block font-medium">{role}</span>
                  <span className="block text-slate-500 truncate">{demoEmail.split("@")[0]}</span>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
