import { motion } from "framer-motion"
import { UserProfile } from "@/types"
import { Sparkle, Crown, User, Clock, Coins } from "@phosphor-icons/react"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { useState, useEffect, useRef, useMemo } from "react"

interface WelcomeBannerProps {
  user: UserProfile
}

interface SparkleParticle {
  id: number
  x: number
  y: number
  delay: number
  duration: number
  size: number
}

export function WelcomeBanner({ user }: WelcomeBannerProps) {
  const [sessionDuration, setSessionDuration] = useState(0)
  const [lastCreditSyncAt, setLastCreditSyncAt] = useState(Date.now())
  const [creditDelta, setCreditDelta] = useState(0)
  const sessionStartRef = useRef(Date.now())
  const previousCreditsRef = useRef<number>(Number(user.subscription?.proCredits || 0))

  const sparkleParticles = useMemo<SparkleParticle[]>(() => {
    const particles: SparkleParticle[] = []
    const particleCount = 20

    for (let i = 0; i < particleCount; i++) {
      const position = i / particleCount
      const isTopOrBottom = Math.random() > 0.5
      
      particles.push({
        id: i,
        x: isTopOrBottom ? position * 100 : (Math.random() > 0.5 ? 0 : 100),
        y: isTopOrBottom ? (Math.random() > 0.5 ? 0 : 100) : position * 100,
        delay: Math.random() * 2,
        duration: 2 + Math.random() * 2,
        size: 8 + Math.random() * 8,
      })
    }

    return particles
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      const elapsed = Math.floor((Date.now() - sessionStartRef.current) / 1000)
      setSessionDuration(elapsed)
    }, 5000)

    return () => clearInterval(interval)
  }, [])

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60

    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`
    } else if (minutes > 0) {
      return `${minutes}m ${secs}s`
    } else {
      return `${secs}s`
    }
  }

  const getGreeting = () => {
    const hour = new Date().getHours()
    if (hour < 12) return "Good Morning"
    if (hour < 18) return "Good Afternoon"
    return "Good Evening"
  }

  const isAdmin = user.role === "admin"
  const credits = Number(user.subscription?.proCredits || 0)
  const subscriptionPlan = String(user.subscription?.plan || "basic").toUpperCase()

  useEffect(() => {
    // INVARIANT[admin-credits-display]: admins/testers bypass credit deduction;
    // never compute or render a consumed delta for them. See /memories/repo/policies.md.
    if (isAdmin) return
    const previousCredits = previousCreditsRef.current
    if (previousCredits !== credits) {
      setCreditDelta(credits - previousCredits)
      setLastCreditSyncAt(Date.now())
      previousCreditsRef.current = credits
    }
  }, [credits, isAdmin])

  const creditSyncAge = Math.max(0, Math.floor((Date.now() - lastCreditSyncAt) / 1000))
  const creditSyncLabel = creditSyncAge < 6 ? "Live now" : `${creditSyncAge}s ago`

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -30, scale: 0.95 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
      className="relative overflow-hidden bg-gradient-to-r from-primary/10 via-accent/10 to-primary/10 border border-primary/20 rounded-2xl p-6 md:p-8 mb-8"
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,_oklch(0.65_0.22_240_/_0.15)_0%,_transparent_50%)] pointer-events-none" />
      
      {sparkleParticles.map((particle) => (
        <motion.div
          key={particle.id}
          className="absolute pointer-events-none"
          style={{
            left: `${particle.x}%`,
            top: `${particle.y}%`,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1, 0],
            rotate: [0, 180, 360],
          }}
          transition={{
            duration: particle.duration,
            delay: particle.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          <Sparkle
            size={particle.size}
            weight="fill"
            className="text-primary/60"
          />
        </motion.div>
      ))}
      
      <div className="relative flex items-center justify-between gap-6 flex-wrap">
        <div className="flex items-center gap-4">
          <Avatar className="h-16 w-16 border-2 border-primary/30 shadow-lg">
            <AvatarImage src={user.avatarUrl} alt={user.fullName} />
            <AvatarFallback className="bg-primary/20 text-primary text-xl font-bold">
              {user.fullName.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                {getGreeting()}, {user.fullName}!
              </h2>
              {isAdmin && (
                <Crown size={24} weight="fill" className="text-primary animate-pulse" />
              )}
            </div>
            
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant={isAdmin ? "default" : "secondary"} className="gap-1.5">
                {isAdmin ? <Crown size={14} weight="bold" /> : <User size={14} weight="bold" />}
                {isAdmin ? "Administrator" : "Client"}
              </Badge>
              
              <span className="text-sm text-muted-foreground">
                {user.email}
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Coins size={32} weight="duotone" className={isAdmin ? "text-primary" : creditDelta < 0 ? "text-amber-500" : "text-emerald-500"} />
            <div className="text-right">
              <p className="text-sm font-medium text-muted-foreground">{isAdmin ? "Credits" : `Credits (${subscriptionPlan})`}</p>
              <p className="text-lg font-bold text-foreground tabular-nums">{isAdmin ? "Unlimited" : credits}</p>
              {!isAdmin && (
                <p className="text-xs text-muted-foreground">
                  {creditDelta < 0 ? `${Math.abs(creditDelta)} consumed` : creditDelta > 0 ? `+${creditDelta} added` : "No recent change"} · {creditSyncLabel}
                </p>
              )}
              {isAdmin && (
                <p className="text-xs text-muted-foreground">Admin bypass active</p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Sparkle size={32} weight="duotone" className="text-primary animate-pulse" />
            <div className="text-right">
              <p className="text-sm font-medium text-muted-foreground">Authentication Status</p>
              <p className="text-lg font-bold text-primary">Connected</p>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Clock size={32} weight="duotone" className="text-accent" />
            <div className="text-right">
              <p className="text-sm font-medium text-muted-foreground">Session Duration</p>
              <p className="text-lg font-bold text-accent tabular-nums">{formatDuration(sessionDuration)}</p>
            </div>
          </div>
        </div>
      </div>
      
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8, delay: 0.2 }}
        className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-primary via-accent to-primary origin-left"
      />
    </motion.div>
  )
}
