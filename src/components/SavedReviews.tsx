import { useState, useMemo } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { 
  FileText, 
  Trash, 
  Eye, 
  DownloadSimple,
  CheckCircle,
  WarningCircle,
  Robot,
  ShieldCheck,
  Archive,
  ArrowCounterClockwise
} from "@phosphor-icons/react"
import { motion, AnimatePresence } from "framer-motion"
import { SavedReviewDocument } from "@/types"
import { format } from "date-fns"

interface SavedReviewsProps {
  reviews: SavedReviewDocument[]
  onDelete: (id: string) => void
  onArchive?: (id: string) => void
  onUnarchive?: (id: string) => void
  onView: (review: SavedReviewDocument) => void
  onExport: (review: SavedReviewDocument) => void
}

export function SavedReviews({ reviews, onDelete, onArchive, onUnarchive, onView, onExport }: SavedReviewsProps) {
  const activeReviews = useMemo(() => 
    reviews.filter(r => !r.archived), 
    [reviews]
  )

  const archivedReviews = useMemo(() => 
    reviews.filter(r => r.archived), 
    [reviews]
  )

  const getScoreBadge = (score: number) => {
    if (score >= 80) {
      return <Badge variant="default" className="gap-1 bg-green-600"><CheckCircle size={12} weight="fill" /> {score}%</Badge>
    }
    if (score >= 60) {
      return <Badge variant="secondary" className="gap-1"><WarningCircle size={12} weight="fill" /> {score}%</Badge>
    }
    return <Badge variant="destructive" className="gap-1">{score}%</Badge>
  }

  const renderReviewsList = (reviewsList: SavedReviewDocument[], emptyMessage: string, isArchivedView: boolean) => {
    if (reviewsList.length === 0) {
      return (
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center space-y-3">
              <FileText size={48} weight="duotone" className="text-muted-foreground mx-auto" />
              <div>
                <p className="text-lg font-medium text-foreground">{emptyMessage}</p>
                <p className="text-sm text-muted-foreground mt-1">
                  {isArchivedView 
                    ? "Archived reviews will appear here" 
                    : "Review documents will appear here once you save them"}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )
    }

    return (
      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
          {reviewsList.map((review, index) => {
            const isArchived = review.archived
            return (
              <motion.div
                key={review.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -100 }}
                transition={{ duration: 0.3, delay: index * 0.05 }}
              >
                <Card className={`border-primary/20 hover:border-primary/40 transition-colors ${isArchived ? 'opacity-75' : ''}`}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <FileText size={20} weight="duotone" className="text-primary flex-shrink-0" />
                          <CardTitle className="text-lg truncate">{review.name}</CardTitle>
                          {isArchived && (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <Archive size={12} weight="duotone" />
                              Archived
                            </Badge>
                          )}
                        </div>
                        <CardDescription className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs">{review.fileName}</span>
                          <span className="text-xs text-muted-foreground">•</span>
                          <span className="text-xs">{format(review.timestamp, "MMM d, yyyy 'at' h:mm a")}</span>
                        </CardDescription>
                      </div>
                      {review.plagiarismResult.turnitinReady && (
                        <Badge variant="default" className="gap-1 flex-shrink-0">
                          <CheckCircle size={14} weight="fill" />
                          Turnitin Ready
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      <div className="flex items-center gap-2">
                        <ShieldCheck size={18} weight="duotone" className="text-primary" />
                        <div>
                          <p className="text-xs text-muted-foreground">Originality</p>
                          {getScoreBadge(review.plagiarismResult.overallScore)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <WarningCircle size={18} weight="duotone" className="text-yellow-600" />
                        <div>
                          <p className="text-xs text-muted-foreground">Plagiarism</p>
                          <Badge variant="outline">{review.plagiarismResult.plagiarismPercentage}%</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Robot size={18} weight="duotone" className="text-primary" />
                        <div>
                          <p className="text-xs text-muted-foreground">AI Content</p>
                          <Badge variant="outline">{review.plagiarismResult.aiContentPercentage}%</Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <FileText size={18} weight="duotone" className="text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Issues</p>
                          <Badge variant="outline">
                            {review.plagiarismResult.highlights.length + review.plagiarismResult.aiHighlights.length}
                          </Badge>
                        </div>
                      </div>
                    </div>

                    <div className="bg-muted/50 rounded-lg p-3">
                      <p className="text-sm text-foreground line-clamp-3">{review.summary}</p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <Button
                        onClick={() => onView(review)}
                        variant="default"
                        size="sm"
                        className="gap-2"
                      >
                        <Eye size={16} weight="duotone" />
                        View Details
                      </Button>
                      <Button
                        onClick={() => onExport(review)}
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      >
                        <DownloadSimple size={16} weight="duotone" />
                        Export PDF
                      </Button>
                      {isArchived && onUnarchive ? (
                        <Button
                          onClick={() => onUnarchive(review.id)}
                          variant="outline"
                          size="sm"
                          className="gap-2"
                        >
                          <ArrowCounterClockwise size={16} weight="duotone" />
                          Unarchive
                        </Button>
                      ) : (
                        onArchive && (
                          <Button
                            onClick={() => onArchive(review.id)}
                            variant="outline"
                            size="sm"
                            className="gap-2"
                          >
                            <Archive size={16} weight="duotone" />
                            Archive
                          </Button>
                        )
                      )}
                      <Button
                        onClick={() => onDelete(review.id)}
                        variant="ghost"
                        size="sm"
                        className="gap-2 text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
                      >
                        <Trash size={16} weight="duotone" />
                        Delete
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    )
  }

  if (reviews.length === 0) {
    return renderReviewsList([], "No Saved Reviews", false)
  }

  return (
    <Tabs defaultValue="active" className="w-full">
      <TabsList className="grid w-full grid-cols-2 max-w-md">
        <TabsTrigger value="active" className="gap-2">
          <FileText size={16} weight="duotone" />
          Active ({activeReviews.length})
        </TabsTrigger>
        <TabsTrigger value="archived" className="gap-2">
          <Archive size={16} weight="duotone" />
          Archived ({archivedReviews.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="active" className="mt-6">
        {renderReviewsList(activeReviews, "No Active Reviews", false)}
      </TabsContent>

      <TabsContent value="archived" className="mt-6">
        {renderReviewsList(archivedReviews, "No Archived Reviews", true)}
      </TabsContent>
    </Tabs>
  )
}
