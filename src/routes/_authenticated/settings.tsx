import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Download,
  Eye,
  EyeOff,
  IdCard,
  ImageUp,
  LockKeyhole,
  RefreshCcw,
  ShieldAlert,
  Smartphone,
  User,
} from "lucide-react";
import { ClientShell } from "@/components/layout/client-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getMyProfile, submitKycVerification, updateProfile } from "@/lib/app.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/settings")({ component: SettingsPage });

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function SettingsPage() {
  const profileFn = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateProfile);
  const submitKycFn = useServerFn(submitKycVerification);
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["profile"], queryFn: () => profileFn() });
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [frontFile, setFrontFile] = useState<File | null>(null);
  const [backFile, setBackFile] = useState<File | null>(null);
  const [selfieFile, setSelfieFile] = useState<File | null>(null);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);

  useEffect(() => {
    const handler = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const refreshProfile = () => {
    qc.invalidateQueries({ queryKey: ["profile"] });
    qc.invalidateQueries({ queryKey: ["profile-shell"] });
    qc.invalidateQueries({ queryKey: ["copy-trading"] });
  };

  const saveAvatar = useMutation({
    mutationFn: async () => {
      if (!avatarFile) throw new Error("Choose a profile picture first.");
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Session expired.");
      const ext = avatarFile.name.split(".").pop() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("profile-avatars")
        .upload(path, avatarFile, { upsert: true });
      if (uploadError) throw uploadError;
      const { data: publicUrl } = supabase.storage.from("profile-avatars").getPublicUrl(path);
      await updateFn({ data: { avatar_url: publicUrl.publicUrl } });
    },
    onSuccess: () => {
      toast.success("Profile picture updated");
      setAvatarFile(null);
      refreshProfile();
    },
    onError: (e: any) => toast.error(e.message ?? "Upload failed"),
  });

  const submitKyc = useMutation({
    mutationFn: async () => {
      if (!frontFile || !backFile || !selfieFile) {
        throw new Error("Upload ID front, ID back, and selfie holding ID.");
      }
      const user = (await supabase.auth.getUser()).data.user;
      if (!user) throw new Error("Session expired.");
      const uploadOne = async (file: File, name: string) => {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${user.id}/${name}-${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from("kyc-documents").upload(path, file);
        if (error) throw error;
        return path;
      };
      const [id_front_path, id_back_path, selfie_path] = await Promise.all([
        uploadOne(frontFile, "id-front"),
        uploadOne(backFile, "id-back"),
        uploadOne(selfieFile, "selfie-holding-id"),
      ]);
      await submitKycFn({ data: { id_front_path, id_back_path, selfie_path } });
    },
    onSuccess: () => {
      toast.success("KYC submitted for approval");
      setFrontFile(null);
      setBackFile(null);
      setSelfieFile(null);
      refreshProfile();
    },
    onError: (e: any) => toast.error(e.message ?? "KYC submission failed"),
  });

  const changePassword = useMutation({
    mutationFn: async () => {
      const email = data?.profile?.email;
      if (!email) throw new Error("Your account email is missing.");
      if (newPassword.length < 6) throw new Error("New password must be at least 6 characters.");
      if (newPassword !== confirmPassword) throw new Error("New passwords do not match.");
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password: oldPassword,
      });
      if (signInError) throw new Error("Old password is not correct.");
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Password changed");
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
    },
    onError: (e: any) => toast.error(e.message ?? "Password change failed"),
  });

  const kyc = data?.kyc;
  const kycStatus = kyc?.status ?? "not submitted";
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  const isIos = /iphone|ipad|ipod/i.test(userAgent);
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as any).standalone === true);

  const installApp = async () => {
    if (isStandalone) {
      toast.success("MineHub is already installed.");
      return;
    }
    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") toast.success("App install started");
      else toast.info("Install was cancelled.");
      setInstallPrompt(null);
      return;
    }
    if (isIos) {
      toast.info("Open Safari, tap Share, then Add to Home Screen.");
      return;
    }
    toast.info("Use your browser menu and choose Install app or Add to Home screen.");
  };

  return (
    <ClientShell title="Settings">
      <div className="space-y-4">
        <section className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-full border border-border bg-card">
              {data?.profile?.avatar_url ? (
                <img
                  src={data.profile.avatar_url}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                <User className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-semibold">
                {data?.profile?.full_name || "Your profile"}
              </div>
              <div className="truncate text-xs text-muted-foreground">{data?.profile?.email}</div>
              <KycBadge status={kycStatus} />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Input
              type="file"
              accept="image/*"
              onChange={(e) => setAvatarFile(e.target.files?.[0] ?? null)}
            />
            <Button
              onClick={() => saveAvatar.mutate()}
              disabled={saveAvatar.isPending || !avatarFile}
              size="icon"
              aria-label="Upload profile picture"
            >
              <ImageUp className="h-4 w-4" />
            </Button>
          </div>
        </section>

        <section className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
              <LockKeyhole className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Change password</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Enter your old password and your new password twice.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowPasswords((value) => !value)}
              className="ml-auto rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={showPasswords ? "Hide passwords" : "Show passwords"}
            >
              {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="mt-4 space-y-3">
            <PasswordField
              label="Old password"
              value={oldPassword}
              visible={showPasswords}
              onChange={setOldPassword}
            />
            <PasswordField
              label="New password"
              value={newPassword}
              visible={showPasswords}
              onChange={setNewPassword}
            />
            <PasswordField
              label="Confirm new password"
              value={confirmPassword}
              visible={showPasswords}
              onChange={setConfirmPassword}
            />
            <Button
              onClick={() => changePassword.mutate()}
              disabled={
                changePassword.isPending || !oldPassword || !newPassword || !confirmPassword
              }
              className="w-full"
              variant="secondary"
            >
              {changePassword.isPending ? "Changing..." : "Change password"}
            </Button>
          </div>
        </section>

        <section className="glass-card rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-primary/15 text-primary">
              <IdCard className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">KYC verification</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Trading unlocks after admin approval. Submit clear photos of your ID front, ID back,
                and a selfie holding the ID.
              </p>
            </div>
          </div>
          {kyc?.status === "rejected" && (
            <div className="mt-4 rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              Rejected: {kyc.rejection_reason || "Please upload clearer documents and try again."}
            </div>
          )}
          {kyc?.status === "approved" ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl bg-success/15 p-3 text-sm font-semibold text-success">
              <CheckCircle2 className="h-4 w-4" /> Approved. Trading is enabled.
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <FileField label="ID front" onChange={setFrontFile} />
              <FileField label="ID back" onChange={setBackFile} />
              <FileField label="Selfie holding ID" onChange={setSelfieFile} />
              <Button
                onClick={() => submitKyc.mutate()}
                disabled={submitKyc.isPending || kyc?.status === "pending"}
                className="w-full gradient-gold"
              >
                {kyc?.status === "pending"
                  ? "Pending admin review"
                  : submitKyc.isPending
                    ? "Submitting..."
                    : "Submit KYC"}
              </Button>
            </div>
          )}
        </section>

        <section className="glass-card rounded-2xl p-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-accent/20 text-foreground">
              <Smartphone className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-sm font-semibold">Download app</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Install MineHub on Android or iPhone from your browser.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button onClick={installApp} className="gap-2">
              <Download className="h-4 w-4" /> Android
            </Button>
            <Button onClick={installApp} variant="secondary" className="gap-2">
              <Download className="h-4 w-4" /> iPhone
            </Button>
          </div>
        </section>
      </div>
    </ClientShell>
  );
}

function FileField({ label, onChange }: { label: string; onChange: (file: File | null) => void }) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="file"
        accept="image/*,application/pdf"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
    </div>
  );
}

function PasswordField({
  label,
  value,
  visible,
  onChange,
}: {
  label: string;
  value: string;
  visible: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="current-password"
      />
    </div>
  );
}

function KycBadge({ status }: { status: string }) {
  const approved = status === "approved";
  const rejected = status === "rejected";
  const pending = status === "pending";
  return (
    <span
      className={`mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
        approved
          ? "bg-success/15 text-success"
          : rejected
            ? "bg-destructive/15 text-destructive"
            : pending
              ? "bg-warning/20 text-foreground"
              : "bg-muted text-muted-foreground"
      }`}
    >
      {approved ? (
        <CheckCircle2 className="h-3 w-3" />
      ) : rejected ? (
        <ShieldAlert className="h-3 w-3" />
      ) : (
        <RefreshCcw className="h-3 w-3" />
      )}
      KYC {status}
    </span>
  );
}
