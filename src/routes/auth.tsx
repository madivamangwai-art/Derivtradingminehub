import { createFileRoute, Link, useNavigate, redirect } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { createAccountWithoutConfirmation } from "@/lib/auth.functions";
import { isReferralRequired } from "@/lib/elevation.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coins, Loader2 } from "lucide-react";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional(),
  ref: z.string().optional(),
});

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
  const { mode: initialMode, ref } = Route.useSearch();
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">(initialMode ?? "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [refCode, setRefCode] = useState(ref ?? "");
  const [loading, setLoading] = useState(false);
  const refReqFn = useServerFn(isReferralRequired);
  const createAccountFn = useServerFn(createAccountWithoutConfirmation);
  const { data: refReqData } = useQuery({ queryKey: ["ref-required"], queryFn: () => refReqFn() });
  const refRequired = refReqData?.required ?? false;

  useEffect(() => { if (ref) setRefCode(ref); }, [ref]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === "signup" && refRequired && !refCode.trim()) {
      toast.error("A referral code is required to sign up.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "signup") {
        await createAccountFn({
          email,
          password,
          fullName,
          phone,
          refCode: refCode.trim(),
        });
        toast.success("Account created!");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Welcome back!");
      }
      navigate({ to: "/home" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Auth failed");
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
              <Input id="pw" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} maxLength={72} />
            </div>
            {mode === "signup" && (
              <div>
                <Label htmlFor="ref">Referral code {refRequired ? "(required)" : "(optional)"}</Label>
                <Input id="ref" value={refCode} onChange={(e) => setRefCode(e.target.value)} maxLength={20} placeholder="ABCD1234" required={refRequired} />
              </div>
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
