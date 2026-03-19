import { useState } from "react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card } from "@/components/ui/card"
import { Envelope, LockKey, ArrowLeft, CheckCircle } from "@phosphor-icons/react"
import { motion, AnimatePresence } from "framer-motion"
import { authService } from "@/lib/auth"
import { toast } from "sonner"

interface PasswordResetFlowProps {

}

type ResetStep = "request" | "verify" | "reset" | "success"

export function PasswordResetFlow({ onBack }: PasswordResetFlowProps) {
  const [currentStep, setCurrentStep] = useState<ResetStep>("request")
  const [email, setEmail] = useState("")
  const [resetCode, setResetCode] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault()

      if (result.
      toast.error("Please enter your email")
      } else
    }



      con
      if (result.success) {

        toast.error(result.
    } catch (error) {
      console.error("Code verifi
      setIsLoa
  }
  const

      toast.error("Please fill in all fields")
    }
    if (newPass
      return

   

    setIsLoading(true)
    try {

        toast.success("Password reset successfu
      } else {
      }
     

    }

    setIs
    try {

        toast.success("New 
        toast.error(result.error || "Failed to resend code")
    } catch (error) {
    } finally 
    }

    <div className="m

        initial={{ opacity: 0, y: 20 }}
        transit
      >
     
   

              transition={{ duration: 0.3 }}
              <div cla

                <p className="text-muted-fo
                </p>

     

                    </Label>
                      <Envelope size={18} className="absolu
            
     

                        disabled={isLoadin
                      />
            
     

                    si


                    type="button"

                    disable
                    <ArrowLeft size={16} />
                  </Button>
              
          )}
       
              key="ve
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              <
                  Enter R
     
   

                <form onSubmit={handleVe
                    <L

         
                      placeholder="Enter 6-digit code"

                      disab
                      required
              
                  <Button
       
                    s
                    {isLoading ? "Verifying..." :

                    <butt
     
   

          
                  <Button
                    onClick={() => setCurrentStep("request")}

                 
                    Change Email
                </form>
            </motion.div>

       
              initial={{ opacity: 0, 
              exit={{ opacity: 0, x: 20 }
            >
                <h1 classNa
                </h1>
                  Create a strong password f
              </div>
              <Card className="p-8 bg-card/8
             
                      New Password
                    <div className="relative">
                      <Input
                     
                        value={newPassword}
                        className="pl-10"
                    
                    

                  </div>
                  <div className="space-y-2">
                      Confirm Password
                    <div className="relative">
                      <Input
                        type
                        value={confirmPassword
                        className="pl-10"
                        requ
                    </div>

                    type="submit"
                    disabled={isLoadi
                  >
                  </Button>
              </Card>
          )}
          {currentStep =
              key="success
              animate={{

                <motion.d
                  animate={{ scal
                  className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-primary/10 mb-6"
                  <CheckCircle size={48}

                  P
                <p className="text-muted-foreground mb-8">
                </p>

                  classNa
                >
                </Button>
            </motion.div>
        </AnimatePresence>
    </div>
}


























































































































































































        </AnimatePresence>
      </motion.div>
    </div>
  )
}
