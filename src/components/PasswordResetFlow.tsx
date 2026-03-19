import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Envelope, LockKey, ArrowLeft, CheckCircle } from "@phosphor-icons/react"
import { motion, AnimatePresence } from "framer-motion"
import { authService } from "@/lib/auth"
import { toast } from "sonner"

interface PasswordResetFlowProps {
  onBack: () => void
}

type ResetStep = "request" | "verify" | "reset" | "success"

export function PasswordResetFlow({ onBack }: PasswordResetFlowProps) {
  const [currentStep, setCurrentStep] = useState<ResetStep>("request")
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [resetCode, setResetCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email) {
      toast.error("Please enter your email address")
      return
    }

    setIsLoading(true)

    try {
      const result = await authService.requestPasswordReset(email)

      if (result.success) {
        toast.success("Reset code sent! Check your email.")
        setCurrentStep("verify")
      } else {
        toast.error(result.error || "Failed to send reset code")
      }
    } catch (error) {
      toast.error("An unexpected error occurred")
      console.error("Reset request error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!resetCode || resetCode.length !== 6) {
      toast.error("Please enter the 6-digit code")
      return
    }

    setIsLoading(true)

    try {
      const result = await authService.verifyResetCode(email, resetCode)

      if (result.success) {
        toast.success("Code verified! Set your new password")
        setCurrentStep("reset")
      } else {
        toast.error(result.error || "Invalid or expired code")
      }
    } catch (error) {
      toast.error("An unexpected error occurred")
      console.error("Code verification error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newPassword || !confirmPassword) {
      toast.error("Please fill in all fields")
      return
    }

    if (newPassword.length < 6) {
      toast.error("Password must be at least 6 characters")
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }

    setIsLoading(true)

    try {
      const result = await authService.resetPassword(email, resetCode, newPassword)

      if (result.success) {
        toast.success("Password reset successfully!")
        setCurrentStep("success")
      } else {
        toast.error(result.error || "Failed to reset password")
      }
    } catch (error) {
      toast.error("An unexpected error occurred")
      console.error("Password reset error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendCode = async () => {
    setIsLoading(true)

    try {
      const result = await authService.requestPasswordReset(email)

      if (result.success) {
        toast.success("New code sent!")
      } else {
        toast.error(result.error || "Failed to resend code")
      }
    } catch (error) {
      toast.error("An unexpected error occurred")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,_oklch(0.65_0.22_240_/_0.08)_0%,_transparent_50%),radial-gradient(circle_at_70%_80%,_oklch(0.48_0.18_240_/_0.1)_0%,_transparent_50%)] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative w-full max-w-md"
      >
        <AnimatePresence mode="wait">
          {currentStep === "request" && (
            <motion.div
              key="request"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
                  Reset Password
                </h1>
                <p className="text-muted-foreground">
                  Enter your email to receive a reset code
                </p>
              </div>

              <Card className="p-8 bg-card/80 backdrop-blur-sm border-border/50">
                <form onSubmit={handleRequestReset} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email" className="text-sm font-medium">
                      Email Address
                    </Label>
                    <div className="relative">
                      <Envelope size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="Enter your email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        disabled={isLoading}
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
                    disabled={isLoading}
                    size="lg"
                  >
                    {isLoading ? "Sending..." : "Send Reset Code"}
                  </Button>

                  <Button
                    type="button"
                    onClick={onBack}
                    variant="ghost"
                    className="w-full gap-2"
                    disabled={isLoading}
                  >
                    <ArrowLeft size={16} />
                    Back to Sign In
                  </Button>
                </form>
              </Card>
            </motion.div>
          )}

          {currentStep === "verify" && (
            <motion.div
              key="verify"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
                  Enter Reset Code
                </h1>
                <p className="text-muted-foreground">
                  We sent a 6-digit code to <strong>{email}</strong>
                </p>
              </div>

              <Card className="p-8 bg-card/80 backdrop-blur-sm border-border/50">
                <form onSubmit={handleVerifyCode} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="reset-code" className="text-sm font-medium">
                      Reset Code
                    </Label>
                    <Input
                      id="reset-code"
                      type="text"
                      placeholder="Enter 6-digit code"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="text-center text-2xl tracking-widest font-mono"
                      disabled={isLoading}
                      maxLength={6}
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
                    disabled={isLoading || resetCode.length !== 6}
                    size="lg"
                  >
                    {isLoading ? "Verifying..." : "Verify Code"}
                  </Button>

                  <div className="text-center text-sm">
                    <button
                      type="button"
                      onClick={handleResendCode}
                      className="text-primary hover:underline"
                      disabled={isLoading}
                    >
                      Didn't receive the code? Resend
                    </button>
                  </div>

                  <Button
                    type="button"
                    onClick={() => setCurrentStep("request")}
                    variant="ghost"
                    className="w-full gap-2"
                    disabled={isLoading}
                  >
                    <ArrowLeft size={16} />
                    Change Email
                  </Button>
                </form>
              </Card>
            </motion.div>
          )}

          {currentStep === "reset" && (
            <motion.div
              key="reset"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
                  Set New Password
                </h1>
                <p className="text-muted-foreground">
                  Create a strong password for your account
                </p>
              </div>

              <Card className="p-8 bg-card/80 backdrop-blur-sm border-border/50">
                <form onSubmit={handleResetPassword} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="new-password" className="text-sm font-medium">
                      New Password
                    </Label>
                    <div className="relative">
                      <LockKey size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="new-password"
                        type="password"
                        placeholder="Enter new password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pl-10"
                        disabled={isLoading}
                        required
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Password must be at least 6 characters
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password" className="text-sm font-medium">
                      Confirm Password
                    </Label>
                    <div className="relative">
                      <LockKey size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="confirm-password"
                        type="password"
                        placeholder="Confirm new password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10"
                        disabled={isLoading}
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
                    disabled={isLoading}
                    size="lg"
                  >
                    {isLoading ? "Resetting..." : "Reset Password"}
                  </Button>
                </form>
              </Card>
            </motion.div>
          )}

          {currentStep === "success" && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.4 }}
            >
              <Card className="p-8 bg-card/80 backdrop-blur-sm border-border/50 text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-6"
                >
                  <CheckCircle size={48} weight="duotone" className="text-primary" />
                </motion.div>

                <h1 className="text-3xl font-bold tracking-tight text-foreground mb-2">
                  Password Reset!
                </h1>
                <p className="text-muted-foreground mb-8">
                  Your password has been successfully reset. You can now sign in with your new password.
                </p>

                <Button
                  onClick={onBack}
                  className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
                  size="lg"
                >
                  Sign In Now
                </Button>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
