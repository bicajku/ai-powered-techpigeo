import { Lightbulb, Sparkle, MagnifyingGlass, PencilLine, Rocket, ChartBar, Target, CheckCircle, Crown, Lightning } from "@phosphor-icons/react"
import { motion } from "framer-motion"
import faviconImg from "@/assets/images/favicon.png"

const modules = [
  { icon: Target, label: "Strategy Engine", color: "text-primary", tab: "generate" },
  { icon: Sparkle, label: "Idea Generation", color: "text-accent", tab: "ideas" },
  { icon: MagnifyingGlass, label: "Integrity Checker", color: "text-emerald-500", tab: "plagiarism" },
  { icon: PencilLine, label: "Humanizer", color: "text-violet-500", tab: "plagiarism" },
  { icon: Rocket, label: "Pitch Deck & Canvas", color: "text-rose-500", tab: "ideas" },
  { icon: ChartBar, label: "Analytics Dashboard", color: "text-sky-500", tab: "dashboard" },
]

const examplePrompts = [
  "Launch strategy for an AI-powered SaaS product targeting healthcare",
  "Business canvas for a sustainable fashion e-commerce startup",
  "Go-to-market plan for a fintech mobile app in emerging markets",
  "Growth strategy for an EdTech platform offering coding bootcamps",
]

const plans = [
  {
    name: "Basic",
    price: "Free",
    icon: Lightbulb,
    color: "text-muted-foreground",
    border: "border-border/40",
    features: ["AI Strategy Generation", "Idea Cooking & Canvas", "Pitch Deck Generation", "3 exports/month"],
  },
  {
    name: "Pro",
    price: "$5/mo",
    icon: Lightning,
    color: "text-primary",
    border: "border-primary/50",
    popular: true,
    features: ["Everything in Basic", "Document Review & Plagiarism", "AI Humanize Module", "25 review credits/month"],
  },
  {
    name: "Team",
    price: "$25/mo",
    icon: Crown,
    color: "text-accent",
    border: "border-accent/50",
    features: ["Everything in Pro", "100 review credits/month", "Unlimited exports", "Priority AI processing"],
  },
]

interface EmptyStateProps {
  onNavigate?: (tab: string) => void
}

export function EmptyState({ onNavigate }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
      className="text-center py-12 px-6"
    >
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5, type: "spring" }}
        className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-primary/20 to-accent/20 rounded-full mb-6"
      >
        <img src={faviconImg} alt="NovusSparks AI" className="w-10 h-10 object-contain" />
      </motion.div>

      <h3 className="text-2xl font-bold mb-3 text-foreground">
        Ready to power your next big idea?
      </h3>
      <p className="text-muted-foreground mb-8 max-w-lg mx-auto leading-relaxed">
        Describe your product, service, or business concept above — NovusSparks AI will generate strategies,
        business models, pitch decks, integrity-checked content, and actionable implementation workflows.
      </p>

      {/* Animated modules showcase */}
      <div className="flex flex-wrap justify-center gap-3 mb-10 max-w-xl mx-auto">
        {modules.map((mod, i) => {
          const Icon = mod.icon
          return (
            <motion.button
              key={mod.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.15 + i * 0.1 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => onNavigate?.(mod.tab)}
              className="flex items-center gap-1.5 bg-card/80 border border-border/40 rounded-full px-3 py-1.5 text-xs font-medium shadow-sm hover:border-primary/40 hover:bg-card transition-colors cursor-pointer"
            >
              <Icon size={16} weight="duotone" className={mod.color} />
              <span className="text-foreground/80">{mod.label}</span>
            </motion.button>
          )
        })}
      </div>

      <div className="space-y-3 max-w-lg mx-auto mb-12">
        <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          Try these examples:
        </p>
        {examplePrompts.map((prompt, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.6 + i * 0.1 }}
            className="text-sm text-foreground/70 bg-secondary/50 rounded-lg px-4 py-3 border border-border/30 text-left"
          >
            <Lightbulb size={14} weight="duotone" className="text-accent inline mr-2 -mt-0.5" />
            {prompt}
          </motion.div>
        ))}
      </div>

      {/* Pricing Section */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.8 }}
        className="max-w-3xl mx-auto"
      >
        <h4 className="text-lg font-bold text-foreground mb-2">Choose Your Plan</h4>
        <p className="text-sm text-muted-foreground mb-6">Start free, upgrade when you need more power</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plans.map((plan, i) => {
            const Icon = plan.icon
            return (
              <motion.div
                key={plan.name}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 1 + i * 0.12 }}
                className={`relative bg-card/80 backdrop-blur-sm rounded-xl p-5 border ${plan.border} text-left ${plan.popular ? "ring-1 ring-primary/30" : ""}`}
              >
                {plan.popular && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wider">
                    Popular
                  </span>
                )}
                <div className="flex items-center gap-2 mb-3">
                  <Icon size={20} weight="duotone" className={plan.color} />
                  <span className="font-semibold text-foreground">{plan.name}</span>
                </div>
                <div className="text-2xl font-bold text-foreground mb-4">{plan.price}</div>
                <ul className="space-y-2">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs text-muted-foreground">
                      <CheckCircle size={14} weight="fill" className="text-primary mt-0.5 shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </motion.div>
            )
          })}
        </div>
      </motion.div>
    </motion.div>
  )
}
