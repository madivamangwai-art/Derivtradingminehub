import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createAccountWithoutConfirmation, getFriendlyAuthMessage } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coins, Loader2, Eye, EyeOff } from "lucide-react";

const searchSchema = z
  .object({
    mode: z.enum(["signin", "signup"]).optional(),
    ref: z.string().optional(),
  })
  .optional();

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  component: AuthPage,
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/home" });
  },
});

function AuthPage() {
  const search = Route.useSearch();
  const initialMode = search?.mode ?? "signin";
  const ref = search?.ref ?? "";
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [refCode, setRefCode] = useState(ref ?? "");
  const [loading, setLoading] = useState(false);
  const [refRequired, setRefRequired] = useState(false);
  const createAccountFn = useServerFn(createAccountWithoutConfirmation);

  useEffect(() => { if (ref) setRefCode(ref); }, [ref]);

  useEffect(() => {
    let active = true;
    const checkReferralRequirement = async () => {
      try {
        const { count, error } = await supabase.from("profiles").select("id", { count: "exact", head: true });
        if (!active) return;
        if (!error) {
          setRefRequired((count ?? 0) > 0);
          return;
        }
      } catch {
        // Fall back to optional referral codes if the check cannot be performed.
      }
      if (active) setRefRequired(false);
    };

    void checkReferralRequirement();
    return () => {
      active = false;
    };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && refRequired && !refCode.trim()) {
      toast.error("A referral code is required to sign up.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        if (password !== confirmPassword) {
          toast.error("Passwords do not match.");
          setLoading(false);
          return;
        }

        const result = await createAccountFn({
          email,
          password,
          fullName,
          phone,
          refCode: refCode.trim(),
        });

        if (result?.ok) {
          const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
          if (signInError) throw signInError;
          toast.success("Account created successfully.");
          navigate({ to: "/home" });
          return;
        }

        throw new Error("Account creation failed.");
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      toast.success("Welcome back!");
      navigate({ to: "/home" });
    } catch (err) {
      console.error("Authentication failed", err);
      toast.error(getFriendlyAuthMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center gradient-hero px-4">
      <div className="w-full max-w-md">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-xl gradient-gold"><Coins className="h-5 w-5" /></div>
          <span className="text-xl font-bold">MineHub</span>
        </Link>
        <div className="glass-card rounded-2xl p-6">
          <div className="mb-6 flex rounded-lg bg-muted/40 p-1">
            <button onClick={() => setMode("signin")} className={`flex-1 rounded-md py-2 text-sm font-medium transition ${mode === "signin" ? "bg-card text-foreground" : "text-muted-foreground"}`}>Sign in</button>
            <button onClick={() => setMode("signup")} className={`flex-1 rounded-md py-2 text-sm font-medium transition ${mode === "signup" ? "bg-card text-foreground" : "text-muted-foreground"}`}>Sign up</button>
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <>
                <div>
                  <Label htmlFor="name">Full name</Label>
                  <Input id="name" value={fullName} onChange={(e) => setFullName(e.target.value)} required maxLength={80} />
                </div>
                <div>
                  <Label htmlFor="phone">Phone (M-Pesa)</Label>
                  <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="2547XXXXXXXX" required maxLength={15} />
                </div>
              </>
            )}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required maxLength={255} />
            </div>
            <div>
              <Label htmlFor="pw">Password</Label>
              <div className="flex items-center gap-2">
                <Input id="pw" type={showPassword ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} maxLength={72} />
                <button type="button" aria-label="Toggle password visibility" onClick={() => setShowPassword((s) => !s)} className="text-muted-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            {mode === "signup" && (
              <>
                <div>
                  <Label htmlFor="pw2">Confirm password</Label>
                  <Input id="pw2" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6} maxLength={72} />
                </div>
                <div>
                  <Label htmlFor="ref">Referral code {refRequired ? "(required)" : "(optional)"}</Label>
                  <Input id="ref" value={refCode} onChange={(e) => setRefCode(e.target.value)} maxLength={20} placeholder="ABCD1234" required={refRequired} />
                </div>
              </>
            )}
            <Button type="submit" disabled={loading} className="w-full gradient-gold">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signup" ? "Create account" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
