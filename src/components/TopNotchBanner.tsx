import { motion, AnimatePresence } from "framer-motion"
import { UserProfile } from "@/types"
import { Sparkle, X, CaretDown } from "@phosphor-icons/react"
import { useState, useMemo } from "react"
import { Button } from "@/components/ui/button"

interface TopNotchBannerProps {
  user: UserProfile
  onExpand: () => void
  onDismiss: () => void
  isVisible: boolean
  notchDismissedAt: number
}

interface SparkleParticle {
  id: number
  x: number
  y: number
  delay: number
  duration: number
  size: number
}

export function TopNotchBanner({ user, onExpand, onDismiss, isVisible, notchDismissedAt }: TopNotchBannerProps) {
  // Don't show if dismissed in this session
  const [isDismissed, setIsDismissed] = useState(notchDismissedAt > 0)

  const sparkleParticles = useMemo<SparkleParticle[]>(() => {
    const particles: SparkleParticle[] = []
    const particleCount = 15

    for (let i = 0; i < particleCount; i++) {
      const position = i / particleCount
      const isTopOrBottom = Math.random() > 0.5
      
      particles.push({
        id: i,
        x: isTopOrBottom ? position * 100 : (Math.random() > 0.5 ? 0 : 100),
        y: isTopOrBottom ? (Math.random() > 0.5 ? 0 : 100) : position * 100,
        delay: Math.random() * 2,
        duration: 2 + Math.random() * 2,
        size: 6 + Math.random() * 6,
      })
    }

    return particles
  }, [])

  const handleExpand = () => {
    setIsDismissed(true)
    onExpand()
  }

  const handleDismiss = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsDismissed(true)
    onDismiss()
  }

  return (
    <AnimatePresence>
      {isVisible && !isDismissed && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed top-0 left-0 right-0 z-50 pointer-events-none"
        >
          <motion.div
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 0.2, duration: 0.3 }}
            className="origin-top"
          >
            <motion.div
              animate={{
                boxShadow: [
                  "0 0 20px 0px oklch(0.48 0.12 75 / 0.3), 0 0 40px 0px oklch(0.72 0.08 110 / 0.2)",
                  "0 0 30px 5px oklch(0.48 0.12 75 / 0.5), 0 0 60px 10px oklch(0.72 0.08 110 / 0.3)",
                  "0 0 20px 0px oklch(0.48 0.12 75 / 0.3), 0 0 40px 0px oklch(0.72 0.08 110 / 0.2)",
                ]
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut"
              }}
              onClick={handleExpand}
              className="mx-auto max-w-4xl mt-4 cursor-pointer pointer-events-auto group relative"
            >
              <motion.div
                animate={{
                  opacity: [0.4, 0.8, 0.4],
                }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute -inset-[2px] bg-gradient-to-r from-primary via-accent to-primary rounded-2xl blur-sm"
              />
              
              <div className="relative bg-gradient-to-r from-primary via-accent to-primary p-[2px] rounded-2xl overflow-hidden">
                {sparkleParticles.map((particle) => (
                  <motion.div
                    key={particle.id}
                    className="absolute pointer-events-none z-10"
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
                      className="text-accent/70"
                    />
                  </motion.div>
                ))}
                
                <div className="relative bg-card rounded-2xl px-6 py-3 flex items-center justify-between gap-4 backdrop-blur-xl">
                  <div className="flex items-center gap-3">
                    <motion.div
                      animate={{ 
                        rotate: [0, 360],
                        scale: [1, 1.2, 1]
                      }}
                      transition={{ 
                        duration: 2,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    >
                      <Sparkle size={24} weight="duotone" className="text-primary" />
                    </motion.div>
                    
                    <div className="flex flex-col">
                      <p className="text-sm font-bold text-foreground">
                        Welcome back, {user.fullName}!
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Click to view your dashboard summary
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <motion.div
                      animate={{ y: [0, 3, 0] }}
                      transition={{ 
                        duration: 1.5,
                        repeat: Infinity,
                        ease: "easeInOut"
                      }}
                    >
                      <CaretDown 
                        size={20} 
                        weight="bold" 
                        className="text-primary group-hover:text-accent transition-colors"
                      />
                    </motion.div>
                    
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-full hover:bg-destructive/10"
                      onClick={handleDismiss}
                    >
                      <X size={16} weight="bold" className="text-muted-foreground hover:text-destructive" />
                    </Button>
                  </div>
                </div>
              </div>
            </motion.div>

            <motion.div
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.5, duration: 1.5 }}
              className="mx-auto max-w-4xl h-1 bg-gradient-to-r from-transparent via-primary to-transparent mt-2 origin-center"
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
