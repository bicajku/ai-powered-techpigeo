import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Envelope, LockKey, Sparkle, ShieldCheck, Lightning, Brain, ArrowRight } from "@phosphor-icons/react"
import { motion } from "framer-motion"
import { authService } from "@/lib/auth"
import { toast } from "sonner"
import { UserProfile } from "@/types"
import { PasswordResetFlow } from "@/components/PasswordResetFlow"
import novussparksIcon from "@/assets/images/novussparks-icon.svg"
import techpigeonLogo from "@/assets/images/techpigeon-logo.png"

interface LoginPageProps {
  onAuthSuccess: (user: UserProfile) => void
}

const VALUE_POINTS = [
  { icon: Sparkle, title: "Consensus AI Engine", desc: "Multiple AI models cross-validate every insight for accuracy you can trust" },
  { icon: Brain, title: "Neural Cortex & RAG", desc: "Ingest your own knowledge base and get contextual answers instantly" },
  { icon: ShieldCheck, title: "Integrity & Review", desc: "Built-in plagiarism detection and content quality validation" },
  { icon: Lightning, title: "Workflow Automations", desc: "Automate repetitive tasks with intelligent IF/THEN rule triggers" },
]

export function LoginPage({ onAuthSuccess }: LoginPageProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPasswordReset, setShowPasswordReset] = useState(false)

  // Show OAuth error if redirected back with ?error=oauth_failed
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get("error") === "oauth_failed") {
      const reason = params.get("reason")
      toast.error(reason ? `Sign-in failed: ${reason}` : "Sign-in failed. Please try again.")
      // Clean the URL
      window.history.replaceState({}, "", window.location.pathname)
    }
  }, [])

  const handleGoogleLogin = () => {
    setIsLoading(true)
    window.location.href = "/api/auth/google"
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !password) {
      toast.error("Please fill in all fields")
      return
    }
    setIsLoading(true)
    try {
      const result = await authService.login(email, password)
      if (result.success && result.user) {
        toast.success(`Welcome back, ${result.user.fullName}!`)
        onAuthSuccess(result.user)
      } else {
        toast.error(result.error || "Login failed")
      }
    } catch (error) {
      toast.error("An unexpected error occurred")
      console.error("Login error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Password reset flow — rendered in-place with dark theme wrapper
  if (showPasswordReset) {
    return (
      <div className="min-h-screen bg-[#0a0f18] flex items-center justify-center px-4">
        {/* Ambient background */}
        <div className="fixed inset-0 z-0 pointer-events-none">
          <div className="absolute top-[10%] left-[5%] w-72 md:w-96 h-72 md:h-96 bg-[#38bdf8]/8 rounded-full blur-[120px]" />
          <div className="absolute bottom-[10%] right-[10%] w-64 md:w-80 h-64 md:h-80 bg-[#6ee7a0]/8 rounded-full blur-[100px]" />
        </div>
        <div className="relative z-10">
          <PasswordResetFlow onBack={() => setShowPasswordReset(false)} initialEmail={email} />
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0a0f18] flex">
      {/* Ambient background */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[10%] left-[5%] w-72 md:w-96 h-72 md:h-96 bg-[#38bdf8]/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-[10%] right-[10%] w-64 md:w-80 h-64 md:h-80 bg-[#6ee7a0]/8 rounded-full blur-[100px]" />
        <div className="absolute top-[50%] left-[50%] w-80 h-80 bg-[#e5a932]/5 rounded-full blur-[140px]" />
      </div>

      {/* Left Panel — Value Proposition (hidden on mobile) */}
      <div className="hidden lg:flex lg:w-[45%] xl:w-[50%] relative z-10 flex-col justify-between p-10 xl:p-16">
        {/* Logo */}
        <a href="/" className="flex items-center gap-3 group">
          <img src={novussparksIcon} alt="NovusSparks" className="w-10 h-10 group-hover:scale-105 transition-transform" />
          <div className="flex flex-col">
            <span className="font-bold text-lg text-white tracking-tight leading-tight">NovusSparks AI</span>
            <span className="text-[10px] text-gray-500 font-medium tracking-wider">Enterprise AI Platform</span>
          </div>
        </a>

        {/* Main pitch */}
        <div className="flex-1 flex flex-col justify-center max-w-lg">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
          >
            <h1 className="text-3xl xl:text-4xl font-bold text-white mb-4 leading-tight">
              Welcome back to{" "}
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#38bdf8] to-[#6ee7a0]">NovusSparks</span>
            </h1>
            <p className="text-gray-400 text-base mb-10 leading-relaxed">
              Sign in to continue building, validating, and automating your marketing strategies with multi-engine AI intelligence.
            </p>
          </motion.div>

          <div className="space-y-5">
            {VALUE_POINTS.map((point, i) => (
              <motion.div
                key={point.title}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.4, delay: 0.2 + i * 0.1 }}
                className="flex items-start gap-4 group"
              >
                <div className="p-2.5 rounded-lg bg-white/5 border border-white/10 group-hover:border-[#38bdf8]/30 transition-colors shrink-0">
                  <point.icon size={22} weight="duotone" className="text-[#38bdf8]" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white mb-0.5">{point.title}</h3>
                  <p className="text-xs text-gray-500 leading-relaxed">{point.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Bottom attribution */}
        <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
          <img src={techpigeonLogo} alt="" className="w-3.5 h-3.5 opacity-50" />
          Powered by <a href="https://www.techpigeon.com.pk" target="_blank" rel="noopener noreferrer" className="hover:text-gray-400 transition-colors">Techpigeon</a>
        </div>
      </div>

      {/* Right Panel — Login Form */}
      <div className="flex-1 relative z-10 flex items-center justify-center px-4 sm:px-6 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="w-full max-w-md"
        >
          {/* Mobile logo (shown only on small screens) */}
          <div className="lg:hidden text-center mb-8">
            <a href="/" className="inline-flex items-center gap-3">
              <img src={novussparksIcon} alt="NovusSparks AI" className="w-10 h-10 object-contain" />
              <span className="font-bold text-xl text-white tracking-tight">NovusSparks AI</span>
            </a>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-white mb-2">Sign in to your account</h2>
            <p className="text-gray-400 text-sm">Pick up where you left off</p>
          </div>

          <Card className="p-7 bg-white/[0.03] backdrop-blur-md border-white/[0.08] shadow-2xl shadow-black/20">
            {/* OAuth buttons first (trending pattern) */}
            <div className="flex flex-col gap-3 mb-6">
              <Button
                type="button"
                onClick={handleGoogleLogin}
                variant="outline"
                className="w-full gap-2.5 bg-white/[0.04] border-white/10 text-white hover:bg-white/[0.08] hover:border-white/20"
                disabled={isLoading}
                size="lg"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Sign in with Google
              </Button>
            </div>

            <div className="relative my-5">
              <Separator className="bg-white/10" />
              <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0e1420] px-3 text-xs text-gray-500">
                or continue with email
              </span>
            </div>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="login-email" className="text-xs font-medium text-gray-300">Email</Label>
                <div className="relative">
                  <Envelope size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <Input
                    id="login-email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="pl-9 bg-white/[0.04] border-white/10 text-white placeholder:text-gray-600 focus:border-[#38bdf8]/50 focus:ring-[#38bdf8]/20"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="login-password" className="text-xs font-medium text-gray-300">Password</Label>
                  <button
                    type="button"
                    onClick={() => setShowPasswordReset(true)}
                    className="text-[11px] text-[#38bdf8]/80 hover:text-[#38bdf8] hover:underline transition-colors"
                    disabled={isLoading}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="relative">
                  <LockKey size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                  <Input
                    id="login-password"
                    type="password"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pl-9 bg-white/[0.04] border-white/10 text-white placeholder:text-gray-600 focus:border-[#38bdf8]/50 focus:ring-[#38bdf8]/20"
                    disabled={isLoading}
                    required
                  />
                </div>
              </div>

              <Button
                type="submit"
                className="w-full bg-gradient-to-r from-[#38bdf8] to-[#6ee7a0] hover:opacity-90 text-white font-semibold shadow-lg shadow-[#38bdf8]/20"
                disabled={isLoading}
                size="lg"
              >
                {isLoading ? "Signing in..." : "Sign In"}
                {!isLoading && <ArrowRight size={18} className="ml-1" />}
              </Button>
            </form>

            <div className="text-center mt-5">
              <span className="text-sm text-gray-500">
                Don't have an account?{" "}
                <a href="/signup" className="text-[#38bdf8] hover:underline font-medium">Create one</a>
              </span>
            </div>

            <div className="text-center text-[11px] text-gray-600 mt-4">
              By signing in, you agree to our <a href="/privacy" className="text-[#38bdf8]/70 hover:underline">Privacy & Data Policy</a>
            </div>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}
