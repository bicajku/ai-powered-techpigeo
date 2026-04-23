import { MapPin, Phone, EnvelopeSimple, Globe, FilePdf } from "@phosphor-icons/react"
import novussparksLogo from "@/assets/images/novussparks-icon.svg"
import techpigeonLogo from "@/assets/images/techpigeon-logo.png"

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border/50 bg-gradient-to-b from-card/30 to-card/60 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-12">
        <div className="flex flex-col items-center mb-8">
          <a 
            href="https://novussparks.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="transition-transform hover:scale-105 duration-300"
          >
            <img 
              src={novussparksLogo} 
              alt="NovusSparks Logo" 
              className="h-16 md:h-20 w-auto mb-4"
            />
          </a>
          <h3 className="text-lg font-semibold text-foreground mb-1">NovusSparks</h3>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            NovusSparks AI — Enterprise AI Platform
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <MapPin size={22} weight="duotone" className="text-primary mt-1 flex-shrink-0" />
              <div>
                <p className="font-semibold text-foreground mb-2">NovusSparks Pakistan</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  G-7/4, Islamabad 44000, Pakistan
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Phone size={18} weight="duotone" className="text-primary" />
                  <a 
                    href="tel:+17868226386" 
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    +1 (786) 822-6386
                  </a>
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <MapPin size={22} weight="duotone" className="text-primary mt-1 flex-shrink-0" />
              <div>
                <p className="font-semibold text-foreground mb-2">NovusSparks LLC</p>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  Dohat al adab st, Alkhuwair, 133, Muscat, Oman
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <Phone size={18} weight="duotone" className="text-primary" />
                  <a 
                    href="tel:+96876786324" 
                    className="text-sm text-muted-foreground hover:text-primary transition-colors"
                  >
                    +968 767 86324
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col md:flex-row items-center justify-center gap-6 mb-6 pb-6 border-b border-border/30">
          <a 
            href="https://novussparks.com" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
          >
            <Globe size={18} weight="duotone" className="group-hover:rotate-12 transition-transform" />
            <span>novussparks.com</span>
          </a>
          <a 
            href="mailto:info@novussparks.com" 
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
          >
            <EnvelopeSimple size={18} weight="duotone" className="group-hover:scale-110 transition-transform" />
            <span>info@novussparks.com</span>
          </a>
          <a
            href="/NovusSparks-AI-Slide-Deck.pdf"
            target="_blank"
            rel="noopener noreferrer"
            download
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
          >
            <FilePdf size={18} weight="duotone" className="group-hover:scale-110 transition-transform" />
            <span>Open / View / Download, NovusSparks-AI Slide Deck</span>
          </a>
        </div>
        
        <div className="text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} NovusSparks. All rights reserved.
          </p>
          <p className="text-sm">
            <a href="/privacy" className="text-muted-foreground hover:text-primary transition-colors">Privacy & Data Policy</a>
          </p>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <img src={techpigeonLogo} alt="" className="w-4 h-4 inline-block" />
            Powered by <a href="https://www.techpigeon.com.pk" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Techpigeon</a>
          </p>
        </div>
      </div>
    </footer>
  )
}
