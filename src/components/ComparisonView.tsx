import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { X, ChatsCircle, Palette, Target } from "@phosphor-icons/react"
import { motion } from "framer-motion"
import { SavedStrategy } from "@/types"
import { ScrollArea } from "@/components/ui/scroll-area"

interface ComparisonViewProps {
  strategies: SavedStrategy[]
  onClose: () => void
}

export function ComparisonView({ strategies, onClose }: ComparisonViewProps) {
  if (strategies.length === 0) {
    return null
  }

  const sections = [
    { key: 'marketingCopy' as const, title: 'Marketing Copy', icon: <ChatsCircle size={20} weight="duotone" /> },
    { key: 'visualStrategy' as const, title: 'Visual Strategy', icon: <Palette size={20} weight="duotone" /> },
    { key: 'targetAudience' as const, title: 'Target Audience', icon: <Target size={20} weight="duotone" /> },
  ]

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 overflow-hidden"
    >
      <div className="h-full flex flex-col">
        <div className="border-b border-border/50 bg-card/50 backdrop-blur-sm">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-foreground">Strategy Comparison</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Comparing {strategies.length} {strategies.length === 1 ? 'strategy' : 'strategies'}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X size={24} weight="bold" />
            </Button>
          </div>
        </div>

        <ScrollArea className="flex-1">
          <div className="max-w-7xl mx-auto px-6 py-8">
            <div className="grid gap-8">
              {sections.map((section, sectionIdx) => (
                <div key={section.key} className="space-y-4">
                  <div className="flex items-center gap-2 sticky top-0 bg-background/80 backdrop-blur-sm py-2 z-10">
                    <div className="text-primary">{section.icon}</div>
                    <h3 className="text-lg font-semibold text-foreground">{section.title}</h3>
                  </div>
                  
                  <div className={`grid gap-4 ${strategies.length === 1 ? 'grid-cols-1' : strategies.length === 2 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'}`}>
                    {strategies.map((strategy, strategyIdx) => (
                      <motion.div
                        key={strategy.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: (sectionIdx * 0.1) + (strategyIdx * 0.05) }}
                      >
                        <Card className="p-5 h-full flex flex-col">
                          <div className="mb-3 pb-3 border-b border-border/30">
                            <h4 className="font-semibold text-foreground mb-2">{strategy.name}</h4>
                            <Badge variant="outline" className="text-xs mb-2">
                              {new Date(strategy.timestamp).toLocaleDateString(undefined, { 
                                month: 'short', 
                                day: 'numeric', 
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </Badge>
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {strategy.description}
                            </p>
                          </div>
                          <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap flex-1">
                            {strategy.result[section.key]}
                          </div>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </ScrollArea>
      </div>
    </motion.div>
  )
}
