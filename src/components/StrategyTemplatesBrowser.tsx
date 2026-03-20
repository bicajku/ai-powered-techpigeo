import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { MagnifyingGlass, Sparkle, ArrowRight } from "@phosphor-icons/react"
import { 
  STRATEGY_TEMPLATES, 
  TEMPLATE_CATEGORIES, 
  getTemplatesByCategory, 
  searchTemplates,
  type StrategyTemplate 
} from "@/lib/strategy-templates"
import { ConceptMode } from "@/types"
import { motion, AnimatePresence } from "framer-motion"

interface StrategyTemplatesBrowserProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSelectTemplate: (description: string, conceptMode: ConceptMode) => void
}

export function StrategyTemplatesBrowser({ open, onOpenChange, onSelectTemplate }: StrategyTemplatesBrowserProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>("All Templates")
  const [searchQuery, setSearchQuery] = useState("")
  const [selectedTemplate, setSelectedTemplate] = useState<StrategyTemplate | null>(null)

  const displayedTemplates = searchQuery 
    ? searchTemplates(searchQuery)
    : getTemplatesByCategory(selectedCategory)

  const handleUseTemplate = (template: StrategyTemplate) => {
    onSelectTemplate(template.promptTemplate, template.conceptMode)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[85vh] p-0">
        <DialogHeader className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <Sparkle size={20} weight="fill" className="text-primary-foreground" />
            </div>
            <div>
              <DialogTitle className="text-2xl">Strategy Templates</DialogTitle>
              <DialogDescription>
                Choose from {STRATEGY_TEMPLATES.length} pre-built templates to accelerate your strategy generation
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="px-6 pb-4">
          <div className="relative">
            <MagnifyingGlass size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search templates by name, description, or tag..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <Tabs value={selectedCategory} onValueChange={setSelectedCategory} className="flex-1 flex flex-col min-h-0">
          <div className="px-6 border-b">
            <TabsList className="grid grid-cols-6 lg:grid-cols-7 w-full h-auto p-1">
              {TEMPLATE_CATEGORIES.map((category) => (
                <TabsTrigger 
                  key={category} 
                  value={category}
                  className="text-xs px-2 py-1.5 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground"
                >
                  {category === "All Templates" ? "All" : category.split(" ")[0]}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>

          <ScrollArea className="flex-1">
            <div className="px-6 py-4">
              <TabsContent value={selectedCategory} className="mt-0">
                <AnimatePresence mode="wait">
                  {displayedTemplates.length === 0 ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      className="text-center py-12"
                    >
                      <p className="text-muted-foreground">No templates found matching your search.</p>
                    </motion.div>
                  ) : (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                    >
                      {displayedTemplates.map((template) => (
                        <Card
                          key={template.id}
                          className="group hover:shadow-lg transition-all cursor-pointer hover:border-primary/50"
                          onClick={() => setSelectedTemplate(template)}
                        >
                          <CardHeader>
                            <div className="flex items-start justify-between gap-2">
                              <div className="text-3xl">{template.icon}</div>
                              <Badge variant="secondary" className="text-xs">
                                {template.conceptMode}
                              </Badge>
                            </div>
                            <CardTitle className="text-base group-hover:text-primary transition-colors">
                              {template.name}
                            </CardTitle>
                            <CardDescription className="text-xs line-clamp-2">
                              {template.description}
                            </CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="flex flex-wrap gap-1.5 mb-3">
                              {template.tags.slice(0, 3).map((tag) => (
                                <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                                  {tag}
                                </Badge>
                              ))}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full gap-2 group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleUseTemplate(template)
                              }}
                            >
                              Use Template
                              <ArrowRight size={14} weight="bold" />
                            </Button>
                          </CardContent>
                        </Card>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>

        <AnimatePresence>
          {selectedTemplate && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              className="border-t bg-muted/30 p-6"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 space-y-2">
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{selectedTemplate.icon}</span>
                    <div>
                      <h4 className="font-semibold">{selectedTemplate.name}</h4>
                      <p className="text-sm text-muted-foreground">{selectedTemplate.category}</p>
                    </div>
                  </div>
                  <p className="text-sm">{selectedTemplate.description}</p>
                  <div className="bg-card p-3 rounded-md border">
                    <p className="text-xs text-muted-foreground mb-1">Prompt Template:</p>
                    <p className="text-sm font-mono">{selectedTemplate.promptTemplate}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setSelectedTemplate(null)}
                  >
                    Close Preview
                  </Button>
                  <Button 
                    size="sm"
                    className="gap-2"
                    onClick={() => handleUseTemplate(selectedTemplate)}
                  >
                    Use This Template
                    <ArrowRight size={14} weight="bold" />
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
