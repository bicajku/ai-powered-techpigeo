import { motion } from "framer-motion"
import { Progress } from "@/components/ui/progress"

interface LoadingStateProps {
  progress?: number
}

export function LoadingState({ progress = 0 }: LoadingStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6"
    >
      {progress > 0 && (
        <div className="bg-card/80 backdrop-blur-sm rounded-xl p-6 border border-border/50">
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Generating strategy...</span>
              <span className="text-primary font-medium">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <p className="text-xs text-muted-foreground">
              {progress < 30 && "Analyzing your input..."}
              {progress >= 30 && progress < 60 && "Crafting marketing strategy..."}
              {progress >= 60 && progress < 90 && "Building implementation workflows..."}
              {progress >= 90 && "Finalizing results..."}
            </p>
          </div>
        </div>
      )}
      
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="bg-card rounded-xl p-6 border border-border/50 overflow-hidden relative"
        >
          <div className="space-y-3">
            <div className="h-6 bg-secondary rounded w-1/3 animate-pulse" />
            <div className="h-4 bg-secondary rounded w-full animate-pulse" />
            <div className="h-4 bg-secondary rounded w-5/6 animate-pulse" />
            <div className="h-4 bg-secondary rounded w-4/6 animate-pulse" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent animate-shimmer" />
        </div>
      ))}
    </motion.div>
  )
}
