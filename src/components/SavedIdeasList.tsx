import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Eye, Trash, Lightbulb, ChartDonut, PresentationChart } from "@phosphor-icons/react"
import { motion } from "framer-motion"
import { SavedIdea } from "@/types"
import { format } from "date-fns"

interface SavedIdeasListProps {
  ideas: SavedIdea[]
  onDelete: (id: string) => void
  onView: (idea: SavedIdea) => void
}

export function SavedIdeasList({ ideas, onDelete, onView }: SavedIdeasListProps) {
  if (ideas.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Lightbulb size={48} weight="duotone" className="text-muted-foreground mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-foreground mb-2">No Saved Ideas Yet</h3>
        <p className="text-muted-foreground">
          Start cooking your ideas and save them here for future reference
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-semibold text-foreground">Your Saved Ideas</h3>
        <Badge variant="secondary">{ideas.length} {ideas.length === 1 ? 'idea' : 'ideas'}</Badge>
      </div>

      <div className="grid gap-4">
        {ideas.map((idea, index) => (
          <motion.div
            key={idea.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
          >
            <Card className="p-6 hover:shadow-lg transition-all">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-2">
                    <Lightbulb size={24} weight="duotone" className="text-primary flex-shrink-0" />
                    <h4 className="text-lg font-semibold text-foreground truncate">{idea.name}</h4>
                  </div>
                  
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">
                    {idea.originalIdea}
                  </p>

                  <div className="flex items-center gap-2 flex-wrap mb-3">
                    <Badge variant="outline" className="text-xs">
                      Refined Idea
                    </Badge>
                    {idea.businessCanvas && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <ChartDonut size={12} weight="bold" />
                        Business Canvas
                      </Badge>
                    )}
                    {idea.pitchDeck && (
                      <Badge variant="outline" className="text-xs gap-1">
                        <PresentationChart size={12} weight="bold" />
                        Pitch Deck
                      </Badge>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Saved on {format(new Date(idea.timestamp), 'MMM dd, yyyy')} at {format(new Date(idea.timestamp), 'hh:mm a')}
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Button
                    onClick={() => onView(idea)}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <Eye weight="bold" size={16} />
                    View
                  </Button>
                  <Button
                    onClick={() => onDelete(idea.id)}
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash weight="bold" size={16} />
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
