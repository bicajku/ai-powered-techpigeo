import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Envelope, LockKey, User, CheckCircle } from "@phosphor-icons/react"
import { motion } from "framer-motion"
import { authService } from "@/lib/auth"
import { inviteService } from "@/lib/invite-system"
import { toast } from "sonner"
import { UserProfile } from "@/types"
import { PasswordResetFlow } from "@/components/PasswordResetFlow"
import faviconImg from "@/assets/images/novussparks-icon.svg"

interface AuthFormProps {
  onAuthSuccess: (user: UserProfile) => void
  initialMode?: "login" | "signup"
}

export function AuthForm({ onAuthSuccess, initialMode }: AuthFormProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [isSignUp, setIsSignUp] = useState(initialMode === "signup")
  const [showPasswordReset, setShowPasswordReset] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [fullName, setFullName] = useState("")
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [inviteValid, setInviteValid] = useState(false)
  const [invitedBy, setInvitedBy] = useState<string | null>(null)

  // Check for invite link on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const code = params.get("invite")

    if (code) {
      setInviteCode(code)
      setIsSignUp(true)

      // Validate the invite
      const validateInvite = async () => {
        const result = await inviteService.validateInviteLink(code)
        if (result.valid && result.invite) {
          setInviteValid(true)
          setInvitedBy(result.invite.createdBy || null)
        } else {
          toast.error(result.error || "Invalid or expired invite link")
          setInviteCode(null)
        }
      }

      validateInvite()
    }
  }, [])

  if (showPasswordReset) {
    return <PasswordResetFlow onBack={() => setShowPasswordReset(false)} initialEmail={email} />
  }

  const handleGoogleLogin = () => {
    setIsLoading(true)
    window.location.href = "/api/auth/google"
  }

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (!email || !password || (isSignUp && !fullName)) {
      toast.error("Please fill in all fields")
      return
    }

    setIsLoading(true)

    try {
      let result
      if (isSignUp) {
        result = await authService.signUp(email, password, fullName)
      } else {
        result = await authService.login(email, password)
      }

      if (result.success && result.user) {
        // Mark invite as used if present
        if (inviteCode && result.user.id) {
          await inviteService.useInviteLink(inviteCode, result.user.id)
        }

        toast.success(`Welcome, ${result.user.fullName}!`)
        onAuthSuccess(result.user)
      } else if (
        isSignUp &&
        result.error &&
        result.error.toLowerCase().includes("already exists")
      ) {
        // Account already exists — redirect to password reset flow
        toast.info(
          "An account with this email already exists. Please reset your password to sign in."
        )
        setShowPasswordReset(true)
      } else {
        toast.error(result.error || "Authentication failed")
      }
    } catch (error) {
      toast.error("An unexpected error occurred")
      console.error("Auth error:", error)
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
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-3 mb-4">
            <img src={faviconImg} alt="NovusSparks AI" className="w-12 h-12 object-contain" />
            <h1 className="text-3xl font-bold tracking-tight text-foreground">
              NovusSparks AI
            </h1>
          </div>
          <p className="text-muted-foreground">
            {isSignUp ? "Create your account" : "Sign in to your account"}
          </p>
        </div>

        {inviteCode && inviteValid && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 p-4 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg flex items-center gap-3"
          >
            <CheckCircle size={20} className="text-green-600 dark:text-green-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-green-900 dark:text-green-200">
                Invited Registration
              </p>
              <p className="text-xs text-green-700 dark:text-green-300">
                {invitedBy ? `You've been invited by ${invitedBy}` : "Complete your registration to get started"}
              </p>
            </div>
          </motion.div>
        )}

        <Card className="p-8 bg-card/80 backdrop-blur-sm border-border/50">
          <form onSubmit={handleEmailAuth} className="space-y-6">
            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-sm font-medium">
                  Full Name
                </Label>
                <div className="relative">
                  <User size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="fullName"
                    type="text"
                    placeholder="Enter your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="pl-10"
                    disabled={isLoading}
                    required={isSignUp}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-sm font-medium">
                Email
              </Label>
              <div className="relative">
                <Envelope size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
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

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password" className="text-sm font-medium">
                  Password
                </Label>
                {!isSignUp && (
                  <button
                    type="button"
                    onClick={() => setShowPasswordReset(true)}
                    className="text-xs text-primary hover:underline"
                    disabled={isLoading}
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <LockKey size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10"
                  disabled={isLoading}
                  required
                />
              </div>
              {isSignUp && (
                <p className="text-xs text-muted-foreground">
                  Password must be at least 8 characters
                </p>
              )}
            </div>

            <Button
              type="submit"
              className="w-full bg-gradient-to-r from-primary to-primary/90 hover:from-primary/90 hover:to-primary"
              disabled={isLoading}
              size="lg"
            >
              {isLoading ? "Processing..." : isSignUp ? "Sign Up" : "Sign In"}
            </Button>

            <div className="text-center">
              <a
                href={isSignUp ? "/login" : "/signup"}
                className="text-sm text-primary hover:underline"
              >
                {isSignUp
                  ? "Already have an account? Sign in"
                  : "Don't have an account? Sign up"}
              </a>
            </div>
          </form>

          <div className="relative my-6">
            <Separator />
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-3 text-xs text-muted-foreground">
              OR
            </span>
          </div>

          <div className="flex flex-col gap-3">
            <Button
              type="button"
              onClick={handleGoogleLogin}
              variant="outline"
              className="w-full gap-2"
              disabled={isLoading}
              size="lg"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Continue with Google
            </Button>
          </div>

          <div className="text-center text-xs text-muted-foreground mt-6">
            <p>By signing in, you agree to our <a href="/privacy" className="text-primary hover:underline">Privacy & Data Policy</a></p>
          </div>
        </Card>
      </motion.div>
    </div>
  )
}
