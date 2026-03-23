import { useState, useEffect, useCallback } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { AuthForm } from "@/components/AuthForm"
import { Sparkle, Target, Lightbulb, ShieldCheck, Quotes, Brain, ChartBar, Presentation, Rocket, Users, Lightning, ArrowRight, CheckCircle, ArrowLeft, UserCircle, CursorClick } from "@phosphor-icons/react"
import { cn } from "@/lib/utils"
import faviconImg from "@/assets/images/favicon.png"

import { UserProfile } from "@/types"

interface LandingPageProps {
  onLogin: () => void
  onSignup: () => void
  onAuthSuccess?: (user: UserProfile) => void
  user?: { fullName: string; email: string; role: string; avatarUrl?: string } | null
  onBackToDashboard?: () => void
  onNavigate?: (tab: string) => void
}

interface QuoteNode {
  id: number
  x: number
  y: number
  size: number
  delay: number
  quote: string
  author: string
}

// More dots spread across the globe
const QUOTE_NODES: QuoteNode[] = [
  { id: 1, x: 18, y: 22, size: 1.8, delay: 0.2, quote: "Innovation distinguishes between a leader and a follower.", author: "Sentinel Brain" },
  { id: 2, x: 72, y: 18, size: 2, delay: 0.5, quote: "The best way to predict the future is to invent it.", author: "Sentinel Analyzer" },
  { id: 3, x: 82, y: 65, size: 1.4, delay: 0.8, quote: "AI is the new electricity, powering the next tier of human evolution.", author: "Sentinel Core" },
  { id: 4, x: 25, y: 75, size: 2.2, delay: 1.1, quote: "Intelligence is the ability to adapt to change.", author: "Sentinel Logic" },
  { id: 5, x: 50, y: 45, size: 3, delay: 0, quote: "Empowering your business with universal intelligence.", author: "Sentinel Nexus" },
  { id: 6, x: 60, y: 28, size: 1.2, delay: 1.4, quote: "Every dataset tells a story waiting to be heard.", author: "Sentinel Muse" },
  { id: 7, x: 38, y: 58, size: 1.6, delay: 0.9, quote: "Decisions fueled by data outperform intuition alone.", author: "Sentinel Oracle" },
  { id: 8, x: 15, y: 50, size: 1, delay: 1.6, quote: "Automation is liberation for creative minds.", author: "Sentinel Forge" },
  { id: 9, x: 85, y: 40, size: 1.3, delay: 0.3, quote: "Scale intelligence, not headcount.", author: "Sentinel Prism" },
  { id: 10, x: 55, y: 78, size: 1.1, delay: 1.8, quote: "The future belongs to those who prepare for it today.", author: "Sentinel Vanguard" },
  { id: 11, x: 42, y: 15, size: 0.9, delay: 2.0, quote: "Complexity simplified is strategy amplified.", author: "Sentinel Flux" },
  { id: 12, x: 68, y: 52, size: 1.5, delay: 0.7, quote: "Build once, iterate forever.", author: "Sentinel Craft" },
]

// Pill data for circular orbit — tab maps to App.tsx tab values
const ORBIT_PILLS = [
  { id: "idea", tab: "ideas", label: "Idea Generation", icon: Lightbulb, color: "sky", desc: "AI-powered brainstorming and concept expansion" },
  { id: "strategy", tab: "generate", label: "Strategy Engine", icon: Target, color: "sage", desc: "Multi-engine market analysis and planning" },
  { id: "integrity", tab: "plagiarism", label: "Integrity Check", icon: ShieldCheck, color: "gold", desc: "Plagiarism detection and quality validation" },
  { id: "consensus", tab: "generate", label: "Consensus AI", icon: Sparkle, color: "sky", desc: "All engines vote, synthesize, and humanize" },
  { id: "brain", tab: "sentinel-brain", label: "Sentinel Cortex", icon: Brain, color: "sage", desc: "Knowledge base ingestion and RAG queries" },
  { id: "canvas", tab: "generate", label: "Business Canvas", icon: Presentation, color: "gold", desc: "Auto-generated business model canvas" },
]

// Techpigeon brand palette: primary #5cc3eb, secondary #8cb499, accent #bca444
const COLOR_MAP: Record<string, { bg: string; text: string; glow: string }> = {
  sky: { bg: "bg-[#5cc3eb]/20", text: "text-[#5cc3eb]", glow: "shadow-[#5cc3eb]/30" },
  sage: { bg: "bg-[#8cb499]/20", text: "text-[#8cb499]", glow: "shadow-[#8cb499]/30" },
  gold: { bg: "bg-[#bca444]/20", text: "text-[#bca444]", glow: "shadow-[#bca444]/30" },
}

export function LandingPage({ onAuthSuccess, user, onBackToDashboard, onNavigate }: LandingPageProps) {
  const [activeQuote, setActiveQuote] = useState<QuoteNode | null>(null)
  const [authModal, setAuthModal] = useState<"login" | "signup" | null>(null)
  const [hoveredPill, setHoveredPill] = useState<string | null>(null)
  const [hasClickedDot, setHasClickedDot] = useState(false)
  const [showDotHint, setShowDotHint] = useState(false)

  // Show "click the dots" hint after 6 seconds IF user hasn't clicked any dot
  useEffect(() => {
    if (hasClickedDot) return
    const timer = setTimeout(() => setShowDotHint(true), 6000)
    return () => clearTimeout(timer)
  }, [hasClickedDot])

  const handleDotClick = useCallback((node: QuoteNode) => {
    setHasClickedDot(true)
    setShowDotHint(false)
    setActiveQuote((prev) => prev?.id === node.id ? null : node)
  }, [])

  const openAuth = useCallback((mode: "login" | "signup") => {
    // If user is already logged in, go to dashboard instead of opening auth modal
    if (user && onBackToDashboard) {
      onBackToDashboard()
      return
    }
    setAuthModal(mode)
  }, [user, onBackToDashboard])

  return (
    <div className="min-h-screen bg-[#0a0f18] text-white overflow-x-hidden relative font-sans selection:bg-[#5cc3eb]/30">
      {/* === Ambient Background — Techpigeon brand tones === */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-[15%] left-[5%] w-72 md:w-96 h-72 md:h-96 bg-[#5cc3eb]/8 rounded-full blur-[120px]" />
        <div className="absolute top-[50%] right-[5%] w-64 md:w-80 h-64 md:h-80 bg-[#8cb499]/8 rounded-full blur-[100px]" />
        <div className="absolute bottom-[10%] left-[40%] w-80 h-80 bg-[#bca444]/6 rounded-full blur-[140px]" />
      </div>
      {/* === Header === */}
      <header className="relative z-50 flex items-center justify-between px-4 sm:px-6 md:px-12 py-4 md:py-6">
        <div className="flex items-center gap-2.5">
          <img src={faviconImg} alt="Sentinel AI Suite" className="w-8 h-8 md:w-10 md:h-10 object-contain" />
          <div className="flex flex-col">
            <span className="font-bold text-lg md:text-xl tracking-tight text-white leading-tight">Sentinel AI Suite</span>
            <span className="text-[9px] sm:text-[10px] text-gray-500 font-medium tracking-wider">by Techpigeon</span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-4">
          {user ? (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm">
                {user.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                ) : (
                  <UserCircle weight="fill" className="w-6 h-6 text-[#5cc3eb]" />
                )}
                <span className="text-xs sm:text-sm text-gray-300 font-medium max-w-[120px] truncate">{user.fullName}</span>
                {user.role === "admin" && (
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#bca444]/20 text-[#bca444] uppercase">Admin</span>
                )}
              </div>
              <Button size="sm" onClick={onBackToDashboard} className="bg-gradient-to-r from-[#5cc3eb] to-[#8cb499] hover:opacity-90 text-white shadow-lg shadow-[#5cc3eb]/20 text-sm gap-1.5">
                <ArrowLeft weight="bold" className="w-4 h-4" />
                Dashboard
              </Button>
            </>
          ) : (
            <>
              <Button variant="ghost" size="sm" onClick={() => openAuth("login")} className="text-gray-300 hover:text-white hover:bg-white/10 text-sm">
                Login
              </Button>
              <Button size="sm" onClick={() => openAuth("signup")} className="bg-gradient-to-r from-[#5cc3eb] to-[#8cb499] hover:opacity-90 text-white shadow-lg shadow-[#5cc3eb]/20 text-sm">
                Get Started Free
              </Button>
            </>
          )}
        </div>
      </header>
      {/* === Hero Section with Globe + Orbiting Pills === */}
      <section className="relative z-10 flex flex-col items-center pt-4 md:pt-8 px-4 sm:px-6">

        {/* Hero Copy - Above globe on mobile, inline on desktop */}
        <motion.div
          className="text-center max-w-3xl mb-6 md:mb-10"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <motion.div
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 text-[#5cc3eb] text-xs sm:text-sm font-medium mb-4 md:mb-6 backdrop-blur-sm"
            animate={{ boxShadow: ["0 0 0px rgba(92,195,235,0)", "0 0 20px rgba(92,195,235,0.15)", "0 0 0px rgba(92,195,235,0)"] }}
            transition={{ duration: 3, repeat: Infinity }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#5cc3eb] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#5cc3eb]"></span>
            </span>
            Consensus Mode — Proprietary Multi-Engine Intelligence
          </motion.div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold tracking-tight mb-4 md:mb-6 leading-[1.1]">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white via-gray-100 to-gray-400">The Ultimate AI</span>
            <br />
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#5cc3eb] via-[#8cb499] to-[#bca444]">Business Intelligence Suite</span>
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-gray-400 leading-relaxed max-w-2xl mx-auto">
            Stop guessing, start knowing. Sentinel's proprietary <strong className="text-gray-200">RGS Engine, MCP Protocol, and Sentinel Cortex</strong> work in parallel — cross-validating every insight so you get answers you can actually trust.
          </p>
        </motion.div>

        {/* Globe + Orbiting Pills Container */}
        <div className="relative w-full max-w-[340px] sm:max-w-[420px] md:max-w-[520px] lg:max-w-[600px] aspect-square mx-auto mb-8 md:mb-12">

          {/* Outer orbit ring */}
          <motion.div
            className="absolute inset-0 rounded-full border border-dashed border-white/[0.06]"
            animate={{ rotateZ: 360 }}
            transition={{ duration: 120, repeat: Infinity, ease: "linear" }}
          />

          {/* Orbiting Pills — positioned in a circle around the globe */}
          {ORBIT_PILLS.map((pill, i) => {
            const angle = (i / ORBIT_PILLS.length) * 360
            const colors = COLOR_MAP[pill.color]
            return (
              <motion.div
                key={pill.id}
                className="absolute z-30"
                style={{
                  top: `${50 + 48 * Math.sin((angle * Math.PI) / 180)}%`,
                  left: `${50 + 48 * Math.cos((angle * Math.PI) / 180)}%`,
                  transform: "translate(-50%, -50%)",
                }}
                initial={{ opacity: 0, scale: 0 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.8 + i * 0.15, type: "spring", stiffness: 200 }}
              >
                <motion.button
                  className={cn(
                    "flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-full border backdrop-blur-md cursor-pointer transition-all whitespace-nowrap",
                    "bg-black/40 border-white/10 hover:border-white/25",
                    `hover:shadow-lg ${colors.glow}`
                  )}
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 3 + i * 0.5, repeat: Infinity, ease: "easeInOut" }}
                  onClick={() => {
                    if (user && onNavigate) {
                      onNavigate(pill.tab)
                      onBackToDashboard?.()
                    } else {
                      openAuth("signup")
                    }
                  }}
                  onMouseEnter={() => setHoveredPill(pill.id)}
                  onMouseLeave={() => setHoveredPill(null)}
                >
                  <div className={cn("w-5 h-5 sm:w-6 sm:h-6 rounded-full flex items-center justify-center shrink-0", colors.bg)}>
                    <pill.icon weight="duotone" className={cn("w-3 h-3 sm:w-3.5 sm:h-3.5", colors.text)} />
                  </div>
                  <span className="text-[10px] sm:text-xs font-semibold text-white/80">{pill.label}</span>
                </motion.button>
                {/* Hover tooltip */}
                <AnimatePresence>
                  {hoveredPill === pill.id && (
                    <motion.div
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 5 }}
                      className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-black/80 backdrop-blur-xl border border-white/10 rounded-lg px-3 py-2 z-50 whitespace-nowrap"
                    >
                      <p className="text-[10px] sm:text-xs text-gray-300">{pill.desc}</p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}

          {/* Globe itself — inner area */}
          <motion.div
            className="absolute inset-[15%] rounded-full"
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          >
            {/* Globe shell */}
            <div className="w-full h-full rounded-full border-2 border-[#5cc3eb]/20 relative overflow-hidden shadow-[inset_0_0_80px_rgba(92,195,235,0.1),0_0_120px_rgba(92,195,235,0.12)]">

              {/* Orbit Ring 1 — full rotation */}
              <motion.div
                animate={{ rotateZ: 360 }}
                transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
                className="absolute inset-0 rounded-full border border-dashed border-[#5cc3eb]/25"
              />
              {/* Orbit Ring 2 — counter-rotation, elliptical */}
              <motion.div
                animate={{ rotateZ: -360 }}
                transition={{ duration: 35, repeat: Infinity, ease: "linear" }}
                className="absolute inset-[8%] rounded-full border border-dashed border-primary/25"
              />
              {/* Orbit Ring 3 — tilted illusion */}
              <motion.div
                animate={{ rotateZ: 360 }}
                transition={{ duration: 55, repeat: Infinity, ease: "linear" }}
                className="absolute inset-[18%] rounded-full border border-dashed border-blue-400/15"
                style={{ transform: "rotateX(60deg)" }}
              />
              {/* Orbit Ring 4 — fast inner */}
              <motion.div
                animate={{ rotateZ: -360 }}
                transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
                className="absolute inset-[30%] rounded-full border border-dashed border-cyan-400/15"
              />
              {/* Orbit Ring 5 — horizontal equator */}
              <motion.div
                animate={{ rotateZ: 360 }}
                transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
                className="absolute top-[48%] left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#5cc3eb]/30 to-transparent"
              />

              {/* Globe ambient glow */}
              <div className="absolute inset-0 bg-gradient-to-br from-[#5cc3eb]/10 via-transparent to-[#8cb499]/10 rounded-full" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent rounded-full" />

              {/* Interactive Green Dots */}
              {QUOTE_NODES.map((node) => (
                <motion.button
                  key={node.id}
                  className="absolute z-20 group outline-none"
                  style={{ top: `${node.y}%`, left: `${node.x}%` }}
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{
                    opacity: [0.6, 1, 0.6],
                    scale: [1, 1.2, 1],
                  }}
                  transition={{
                    delay: 1 + node.delay,
                    duration: 2 + node.delay,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                  onClick={() => handleDotClick(node)}
                >
                  <span className="relative flex items-center justify-center">
                    <span className="animate-ping absolute rounded-full bg-[#8cb499] opacity-30" style={{ width: `${node.size * 8}px`, height: `${node.size * 8}px` }}></span>
                    <span className={cn(
                      "relative inline-flex rounded-full bg-[#8cb499] shadow-[0_0_8px_rgba(140,180,153,0.9)] transition-all duration-300 group-hover:scale-[2] group-hover:bg-[#5cc3eb]",
                      activeQuote?.id === node.id ? "scale-[2] bg-white shadow-[0_0_15px_rgba(255,255,255,0.8)]" : ""
                    )} style={{ width: `${node.size * 4}px`, height: `${node.size * 4}px` }}></span>
                  </span>
                </motion.button>
              ))}

              {/* Central favicon */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <motion.img
                  src={faviconImg}
                  alt=""
                  className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 object-contain opacity-30"
                  animate={{ opacity: [0.2, 0.4, 0.2] }}
                  transition={{ duration: 4, repeat: Infinity }}
                />
              </div>
            </div>
          </motion.div>

          {/* Active Quote Popup — only shows on explicit dot click */}
          <AnimatePresence>
            {activeQuote && (
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.9 }}
                className="absolute z-50 bottom-0 left-1/2 -translate-x-1/2 translate-y-2 bg-black/70 backdrop-blur-2xl border border-[#5cc3eb]/20 rounded-2xl p-4 sm:p-5 shadow-2xl shadow-[#5cc3eb]/10 max-w-[280px] sm:max-w-sm w-full pointer-events-none"
              >
                <Quotes weight="fill" className="text-[#5cc3eb]/40 w-6 h-6 sm:w-8 sm:h-8 mb-2" />
                <p className="text-white/90 text-sm sm:text-base font-medium leading-relaxed mb-3">"{activeQuote.quote}"</p>
                <p className="text-[#5cc3eb] text-[10px] sm:text-xs font-semibold tracking-wider uppercase">— {activeQuote.author}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* "Click the dots" hint — appears if user hasn't clicked any dot */}
          <AnimatePresence>
            {showDotHint && !activeQuote && (
              <motion.div
                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 5, scale: 0.95 }}
                className="absolute z-50 bottom-0 left-1/2 -translate-x-1/2 translate-y-2 bg-black/70 backdrop-blur-2xl border border-[#bca444]/30 rounded-2xl px-5 py-4 shadow-2xl shadow-[#bca444]/10 max-w-[300px] sm:max-w-sm w-full text-center"
              >
                <CursorClick weight="duotone" className="text-[#bca444] w-8 h-8 mx-auto mb-2" />
                <p className="text-white/90 text-sm sm:text-base font-semibold leading-relaxed">
                  Click the dots to know about what suits you best!
                </p>
                <p className="text-[#8cb499] text-[10px] sm:text-xs mt-1.5">Each dot reveals an insight</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* CTA Buttons */}
        <motion.div
          className="flex flex-col sm:flex-row items-center gap-3 sm:gap-4 mb-16 md:mb-20"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.2, duration: 0.6 }}
        >
          {user ? (
            <Button
              size="lg"
              onClick={onBackToDashboard}
              className="bg-gradient-to-r from-[#5cc3eb] to-[#8cb499] hover:from-[#5cc3eb]/90 hover:to-[#8cb499]/90 text-white shadow-xl shadow-[#5cc3eb]/25 text-sm sm:text-base px-6 sm:px-8 h-11 sm:h-12 w-full sm:w-auto"
            >
              <Rocket weight="fill" className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
              Go to Dashboard
            </Button>
          ) : (
            <>
              <Button
                size="lg"
                onClick={() => openAuth("signup")}
                className="bg-gradient-to-r from-[#5cc3eb] to-[#8cb499] hover:from-[#5cc3eb]/90 hover:to-[#8cb499]/90 text-white shadow-xl shadow-[#5cc3eb]/25 text-sm sm:text-base px-6 sm:px-8 h-11 sm:h-12 w-full sm:w-auto"
              >
                <Rocket weight="fill" className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                Start Building for Free
              </Button>
              <Button
                variant="outline"
                size="lg"
                onClick={() => openAuth("login")}
                className="border-white/15 text-gray-300 hover:bg-white/5 hover:text-white text-sm sm:text-base px-6 sm:px-8 h-11 sm:h-12 bg-transparent w-full sm:w-auto"
              >
                Sign In to Dashboard
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </>
          )}
        </motion.div>
      </section>
      {/* === Social Proof / Stats Bar === */}
      <motion.section
        className="relative z-10 border-y border-white/[0.06] bg-white/[0.02] backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
      >
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 text-center">
          <div>
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-white">3+</div>
            <div className="text-[10px] sm:text-xs text-gray-500 mt-1">Proprietary AI Engines</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-white">100%</div>
            <div className="text-[10px] sm:text-xs text-gray-500 mt-1">Cross-Validated Results</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-white">6+</div>
            <div className="text-[10px] sm:text-xs text-gray-500 mt-1">Enterprise AI Tools</div>
          </div>
          <div>
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-[#5cc3eb]">Free</div>
            <div className="text-[10px] sm:text-xs text-gray-500 mt-1">To Get Started</div>
          </div>
        </div>
      </motion.section>
      {/* === Why Sentinel — Compelling Features === */}
      <section className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
        <motion.div
          className="text-center mb-12 md:mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4">
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-400">Why Teams Choose </span>
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-[#5cc3eb] to-[#8cb499]">Sentinel</span>
          </h2>
          <p className="text-sm sm:text-base text-gray-500 max-w-2xl mx-auto">
            Most AI tools give you one engine's opinion. Sentinel gives you the consensus of multiple proprietary engines — so every decision is backed by multi-layered intelligence.
          </p>
        </motion.div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {[
            {
              icon: Brain, color: "sky",
              title: "Consensus Intelligence",
              desc: "Every query runs through our proprietary RGS Engine, MCP Protocol, and Sentinel Cortex simultaneously. Results are synthesized and humanized into one authoritative answer."
            },
            {
              icon: Lightbulb, color: "gold",
              title: "Idea-to-Execution Pipeline",
              desc: "Go from a raw concept to a validated business canvas, pitch deck, and go-to-market strategy — all generated and cross-checked by AI in minutes."
            },
            {
              icon: ShieldCheck, color: "sage",
              title: "Integrity & Originality Engine",
              desc: "Built-in plagiarism detection, source verification, and quality scoring. Know your content is original before you publish or pitch."
            },
            {
              icon: ChartBar, color: "sky",
              title: "Real-Time Market Analysis",
              desc: "AI-driven competitive landscape mapping, pricing strategy, and trend forecasting pulled from live data and structured models."
            },
            {
              icon: Users, color: "sage",
              title: "Team Collaboration Built In",
              desc: "Invite team members, share strategies, and collaborate on business plans. Role-based access keeps everyone aligned."
            },
            {
              icon: Lightning, color: "gold",
              title: "Enterprise-Grade Governance",
              desc: "Budget limits, token tracking, export controls, and audit logs. Scale AI usage across your organization with full visibility."
            },
          ].map((feature, i) => {
            const colors = COLOR_MAP[feature.color]
            return (
              <motion.div
                key={feature.title}
                className="p-5 sm:p-6 rounded-2xl bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12] transition-all group"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <div className={cn("w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110", colors.bg)}>
                  <feature.icon weight="duotone" className={cn("w-5 h-5 sm:w-6 sm:h-6", colors.text)} />
                </div>
                <h3 className="text-white font-semibold text-sm sm:text-base mb-2">{feature.title}</h3>
                <p className="text-gray-500 text-xs sm:text-sm leading-relaxed">{feature.desc}</p>
              </motion.div>
            )
          })}
        </div>
      </section>
      {/* === How It Works === */}
      <section className="relative z-10 border-t border-white/[0.06] bg-white/[0.01]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-16 md:py-24">
          <motion.div
            className="text-center mb-10 md:mb-14"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 text-sky-400">How Sentinel Works</h2>
            <p className="text-sm sm:text-base text-gray-500">Three steps to decisions you can trust.</p>
          </motion.div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-8">
            {[
              { step: "01", title: "Describe Your Goal", desc: "Enter your business idea, strategy question, or content to validate. No templates needed — just speak naturally." },
              { step: "02", title: "AI Engines Collaborate", desc: "Our RGS Engine, MCP Protocol, and Sentinel Cortex analyze your input in parallel. Each engine brings unique strengths to the table." },
              { step: "03", title: "Get Consensus Results", desc: "Receive a synthesized, humanized response backed by multiple AI perspectives. Export as PDF, Word, or share with your team." },
            ].map((item, i) => (
              <motion.div
                key={item.step}
                className="text-center md:text-left"
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.15 }}
              >
                <div className="text-3xl sm:text-4xl font-black mb-3 text-gray-50">{item.step}</div>
                <h3 className="text-white text-sm sm:text-base font-semibold mb-2">{item.title}</h3>
                <p className="text-gray-500 text-xs sm:text-sm leading-relaxed">{item.desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>
      {/* === Final CTA === */}
      <section className="relative z-10 border-t border-white/[0.06]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 md:py-24 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <img src={faviconImg} alt="" className="w-12 h-12 mx-auto mb-6 opacity-60" />
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold mb-4 text-white">
              Ready to Make Smarter Decisions?
            </h2>
            <p className="text-sm sm:text-base mb-8 max-w-lg mx-auto text-cyan-500">Join forward-thinking teams using multi-engine AI consensus to validate ideas, build strategies, and ship with confidence.</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                size="lg"
                onClick={() => user ? onBackToDashboard?.() : openAuth("signup")}
                className="bg-gradient-to-r from-[#5cc3eb] to-[#8cb499] hover:from-[#5cc3eb]/90 hover:to-[#8cb499]/90 text-white shadow-xl shadow-[#5cc3eb]/25 px-8 h-12 w-full sm:w-auto"
              >
                {user ? "Go to Dashboard" : "Get Started — It's Free"}
              </Button>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-4 sm:gap-x-6 gap-y-2 mt-6 text-[10px] sm:text-xs text-gray-600">
              <span className="flex items-center gap-1 text-yellow-600"><CheckCircle weight="fill" className="text-[#8cb499] w-3.5 h-3.5" /> No credit card required</span>
              <span className="flex items-center gap-1 text-amber-600"><CheckCircle weight="fill" className="text-[#8cb499] w-3.5 h-3.5" /> Free tier included</span>
              <span className="flex items-center gap-1"><CheckCircle weight="fill" className="text-[#8cb499] w-3.5 h-3.5" /> Enterprise-ready</span>
            </div>
          </motion.div>
        </div>
      </section>
      {/* === Footer === */}
      <footer className="relative z-10 border-t border-white/[0.06] py-6 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-[10px] sm:text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <img src={faviconImg} alt="" className="w-4 h-4 opacity-40" />
            <span className="text-slate-50">&copy; {new Date().getFullYear()} Techpigeon — Sentinel AI Suite. All rights reserved.</span>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <button onClick={onBackToDashboard} className="hover:text-gray-400 transition-colors text-slate-50">Dashboard</button>
            ) : (
              <>
                <button onClick={() => openAuth("login")} className="hover:text-gray-400 transition-colors">Login</button>
                <button onClick={() => openAuth("signup")} className="hover:text-gray-400 transition-colors">Sign Up</button>
              </>
            )}
          </div>
        </div>
      </footer>
      {/* === Auth Modal — Properly wrapped === */}
      <Dialog open={authModal !== null} onOpenChange={(open) => { if (!open) setAuthModal(null) }}>
        <DialogContent className="max-w-md p-0 border-0 bg-transparent shadow-none [&>button]:hidden">
          <AuthForm
            onAuthSuccess={(u) => {
              setAuthModal(null)
              onAuthSuccess?.(u)
            }}
            initialMode={authModal ?? "login"}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
