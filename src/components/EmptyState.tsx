import { Lightbulb } from "@phosphor-icons/react"
import { motion } from "framer-motion"

const examplePrompts = [
  "A sustainable water bottle made from recycled ocean plastic",
  "An AI-powered meal planning app for busy professionals",
  "Handcrafted leather laptop bags with lifetime warranty",
]

export function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="text-center py-16 px-6"
    >
      <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full mb-6">
        <Lightbulb size={40} weight="duotone" className="text-primary" />
      </div>
      <h3 className="text-2xl font-bold mb-3 text-foreground">
        Ready to create amazing marketing?
      </h3>
      <p className="text-muted-foreground mb-8 max-w-md mx-auto leading-relaxed">
        Describe your product or service above and let AI craft compelling marketing copy,
        visual strategies, audience insights, and full-stack implementation workflows.
      </p>
      <div className="space-y-3 max-w-lg mx-auto">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Try these examples:
        </p>
        {examplePrompts.map((prompt, i) => (
          <div
            key={i}
            className="text-sm text-foreground/70 bg-secondary/50 rounded-lg px-4 py-3 border border-border/30"
          >
            {prompt}
          </div>
        ))}
      </div>
    </motion.div>
  )
}
