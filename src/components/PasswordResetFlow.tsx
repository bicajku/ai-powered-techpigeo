import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
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
  const [email, setEmail] = useState("")
  const [resetCode, setResetCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!email.trim()) {
      toast.error("Please enter your email")
      return
    }

    setIsLoading(true)
    try {
      const result = await authService.requestPasswordReset(email)
      if (result.success) {
        toast.success("Reset code sent to your email")
        setCurrentStep("verify")
      } else {
        toast.error(result.error || "Failed to send reset code")
      }
    } catch (error) {
      console.error("Password reset request failed:", error)
      toast.error("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!resetCode.trim()) {
      toast.error("Please enter the reset code")
      return
    }

    setIsLoading(true)
    try {
      const result = await authService.verifyResetCode(email, resetCode)
      if (result.success) {
        toast.success("Code verified successfully")
        setCurrentStep("reset")
      } else {
        toast.error(result.error || "Invalid reset code")
      }
    } catch (error) {
      console.error("Code verification failed:", error)
      toast.error("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!newPassword.trim() || !confirmPassword.trim()) {
      toast.error("Please fill in all fields")
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match")
      return
    }

    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters long")
      return
    }

    setIsLoading(true)
    try {
      const result = await authService.resetPassword(email, resetCode, newPassword)
      if (result.success) {
        toast.success("Password reset successfully")
        setCurrentStep("success")
      } else {
        toast.error(result.error || "Failed to reset password")
      }
    } catch (error) {
      console.error("Password reset failed:", error)
      toast.error("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendCode = async () => {
    setIsLoading(true)
    try {
      const result = await authService.requestPasswordReset(email)
      if (result.success) {
        toast.success("New code sent to your email")
      } else {
        toast.error(result.error || "Failed to resend code")
      }
    } catch (error) {
      console.error("Resend code failed:", error)
      toast.error("An error occurred. Please try again.")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-background flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md"
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
                <h1 className="text-3xl font-bold text-foreground mb-2">Reset Password</h1>
                <p className="text-muted-foreground">
                  Enter your email address and we'll send you a reset code
                </p>
              </div>

              <Card className="p-8 bg-card/80 backdrop-blur-sm border-border/50">
                <form onSubmit={handleRequestReset} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="reset-email">
                      Email Address
                    </Label>
                    <div className="relative">
                      <Envelope size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="reset-email"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        placeholder="you@example.com"
                        disabled={isLoading}
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={isLoading}
                  >
                    {isLoading ? "Sending..." : "Send Reset Code"}
                  </Button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full gap-2"
                    onClick={onBack}
                    disabled={isLoading}
                  >
                    <ArrowLeft size={16} />
                    Back to Login
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
                <h1 className="text-3xl font-bold text-foreground mb-2">Enter Reset Code</h1>
                <p className="text-muted-foreground">
                  We sent a 6-digit code to {email}
                </p>
              </div>

              <Card className="p-8 bg-card/80 backdrop-blur-sm border-border/50">
                <form onSubmit={handleVerifyCode} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="reset-code">
                      Reset Code
                    </Label>
                    <Input
                      id="reset-code"
                      type="text"
                      value={resetCode}
                      onChange={(e) => setResetCode(e.target.value)}
                      placeholder="Enter 6-digit code"
                      maxLength={6}
                      disabled={isLoading}
                      required
                    />
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={isLoading}
                  >
                    {isLoading ? "Verifying..." : "Verify Code"}
                  </Button>

                  <button
                    type="button"
                    onClick={handleResendCode}
                    disabled={isLoading}
                    className="w-full text-sm text-primary hover:underline"
                  >
                    Resend Code
                  </button>

                  <Button
                    type="button"
                    variant="ghost"
                    className="w-full gap-2"
                    onClick={() => setCurrentStep("request")}
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
                <h1 className="text-3xl font-bold text-foreground mb-2">Create New Password</h1>
                <p className="text-muted-foreground">
                  Create a strong password for your account
                </p>
              </div>

              <Card className="p-8 bg-card/80 backdrop-blur-sm border-border/50">
                <form onSubmit={handleResetPassword} className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">
                      New Password
                    </Label>
                    <div className="relative">
                      <LockKey size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="new-password"
                        type="password"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="pl-10"
                        placeholder="Enter new password"
                        disabled={isLoading}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">
                      Confirm Password
                    </Label>
                    <div className="relative">
                      <LockKey size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        id="confirm-password"
                        type="password"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        className="pl-10"
                        placeholder="Confirm new password"
                        disabled={isLoading}
                        required
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    className="w-full"
                    size="lg"
                    disabled={isLoading}
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
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring" }}
                className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-6"
              >
                <CheckCircle size={48} weight="duotone" className="text-primary" />
              </motion.div>

              <h1 className="text-3xl font-bold text-foreground mb-2">
                Password Reset Complete
              </h1>
              <p className="text-muted-foreground mb-8">
                Your password has been successfully reset. You can now log in with your new password.
              </p>

              <Button
                onClick={onBack}
                size="lg"
                className="min-w-48"
              >
                Back to Login
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
