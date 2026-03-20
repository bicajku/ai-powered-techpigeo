import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

import { cn } from "@/lib/utils"
import { motion, AnimatePresence, PanInfo, useMotionValue, useTransform } from "framer-motion"

interface MobileNavProps {
}
  onTabChange: (tab: string) => void
  const [open, set
  savedCount: number
}

export function MobileNav({ activeTab, onTabChange, isAdmin, savedCount }: MobileNavProps) {
  const [open, setOpen] = useState(false)
  const [showSwipeIndicator, setShowSwipeIndicator] = useState(false)
  const edgeDetectorRef = useRef<HTMLDivElement>(null)
        setShowSwipeIndicator(true
  const indicatorOpacity = useTransform(swipeX, [0, 50], [0, 1])

  useEffect(() => {
    const handleTouchStart = (e: TouchEvent) => {
      if (open) return
      
      const touch = e.touches[0]
      if (touch.clientX < 20) {
        setShowSwipeIndicator(true)
    con
     

    const handleTouchMove = (e: TouchEvent) => {
    }

    onTabChange(tab)
    window.scrollTo({ top: 0, behavior: 

    if (info.offset.x < -100) {
    }

    }

    { value: "saved", label: `Saved (${savedCou

    na

    <>
      
            className="md:hidd
            animate={
       
      
          />
      </AnimatePres
     

            whileHover={{ scale: 1.05 }}
          >
              variant="outline"

              <Ani
                  <motion.div
                    initial={{ rotate: -90, opacity: 0 }}
                    exit={{ rotate: 90, opacity: 0 }}
     
  }, [open, showSwipeIndicator, swipeX])

  const handleTabSelect = (tab: string) => {
    onTabChange(tab)
    setOpen(false)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (info.offset.x < -100) {
      setOpen(false)
    }
  }

  const navItems = [
    { value: "generate", label: "Strategy", icon: Lightbulb },
    { value: "ideas", label: "Ideas", icon: Sparkle },
    { value: "plagiarism", label: "Review", icon: MagnifyingGlass },
    { value: "dashboard", label: "Dashboard", icon: ChartBar },
    { value: "saved", label: `Saved (${savedCount})`, icon: FolderOpen },
  ]

  if (isAdmin) {
    navItems.push({ value: "admin", label: "Admin", icon: ShieldCheck })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <motion.div
          className="md:hidden fixed bottom-6 right-6 z-50"
                      )}
                    >
         
                 
                      </div>
                    </B
                )
           
            <div className="p-6 pt-4">
                <p clas
              </div>
          </motion.div>
      </Sheet>
  )




































































