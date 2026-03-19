import { useState } from "react"
  Dialog
  DialogD
  DialogHeader,
} from "@/components
import { Input 
import { Checkb
import { Flopp
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FloppyDisk, Info } from "@phosphor-icons/react"

interface SaveReviewDialogProps {
  open: boolean
  const handleSave = () => {
  onSave: (name: string, consentGiven: boolean) => void
      setName("")
}

export function SaveReviewDialog({ open, onOpenChange, onSave, onDiscard }: SaveReviewDialogProps) {
  const handleDiscard = () => {
  const [consentGiven, setConsentGiven] = useState(false)

  const handleSave = () => {

      onSave(name.trim(), consentGiven)
      setName("")
      setConsentGiven(false)
            <Label htmlFo
     
   

            <p className="text-
            </p

            <Info size={18
              <div clas
   

                  <li>All dat
              <
          </Alert>
          <div classNam
   

          
                htmlFor="consent"
              >
              </Label>
                I understand that this review will be store
            </div>
        </div>
        <DialogFooter cl
            type="button"
            onClick={handleDiscard}
            Discard Review
          <Button

            className="gap-2"
            <FloppyDisk size={18} wei
          </Button>
      </DialogCont
  )




















































          </Button>









        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
