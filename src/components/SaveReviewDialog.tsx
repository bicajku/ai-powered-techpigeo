import { useState } from "react"
  Dialog
  DialogD
  DialogHeader,
} from "@/components
import { Label 
import { Checkb
import { Flopp
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { FloppyDisk, Info } from "@phosphor-icons/react"

    }

    onDiscard()
    setConsentGiven(false)

 

          <DialogDescription>
          </DialogDescription>
        <div className="space-y-4 py-4">

              id="review-nam
              onChange={(e) => setName
              className="w-full"
            <p cl
            </p>

   

                <li>All data is
               
            </A

   

          
              htmlFor="consent"
            >
            </Label>
        </div>
          <Button
            variant="outline"
          >
          </Button>
            onClick={handleSave}
            className="gap-2"
            <FloppyDisk size={18} weight="bold" />
          </Button
      </DialogContent>
  )









          <Alert>
            <Info size={18} weight="bold" className="text-muted-foreground" />
            <AlertDescription className="text-xs space-y-2">
              <p className="font-medium">Important Information:</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>All data is stored locally in your browser</li>
                <li>Reviews are private and only visible to you</li>
                <li>Your content is never sent to external servers</li>
              </ul>
            </AlertDescription>
          </Alert>

          <div className="flex items-start gap-2 pt-2">
            <Checkbox
              id="consent"
              checked={consentGiven}
              onCheckedChange={(checked) => setConsentGiven(checked === true)}
            />
            <Label
              htmlFor="consent"
              className="text-sm font-normal leading-relaxed cursor-pointer"
            >
              I understand that this review will be stored locally in my browser and can be deleted at any time.
            </Label>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleDiscard}
          >
            Discard Review
          </Button>
          <Button
            onClick={handleSave}
            disabled={!name.trim() || !consentGiven}
            className="gap-2"
          >
            <FloppyDisk size={18} weight="bold" />
            Save Review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
