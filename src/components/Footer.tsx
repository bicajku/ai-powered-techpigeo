import { MapPin, Phone, EnvelopeSimple, Globe } from "@phosphor-icons/react"
import techpigeonLogo from "@/assets/images/techpigeon-logo.png"

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border/50 bg-gradient-to-b from-card/30 to-card/60 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-12">
        <div className="flex flex-col items-center mb-8">
          <a 
            href="https://www.techpigeon.org" 
            target="_blank" 
            rel="noopener noreferrer"
            className="transition-transform hover:scale-105 duration-300"
          >
            <img 
              src={techpigeonLogo} 
              alt="Techpigeon Logo" 
              className="h-16 md:h-20 w-auto mb-4"
            />
          </a>
          <h3 className="text-lg font-semibold text-foreground mb-1">Techpigeon</h3>
          <p className="text-sm text-muted-foreground max-w-md text-center">
            AI-Powered Marketing Intelligence Platform
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <MapPin size={22} weight="duotone" className="text-primary mt-1 flex-shrink-0" />
              <div>
                <p className="font-semibold text-foreground mb-2">Techpigeon Pakistan</p>
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
                <p className="font-semibold text-foreground mb-2">Techpigeon Spark LLC 🇴🇲</p>
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
            href="https://www.techpigeon.org" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
          >
            <Globe size={18} weight="duotone" className="group-hover:rotate-12 transition-transform" />
            <span>www.techpigeon.org</span>
          </a>
          <a 
            href="mailto:info@techpigeon.org" 
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors group"
          >
            <EnvelopeSimple size={18} weight="duotone" className="group-hover:scale-110 transition-transform" />
            <span>info@techpigeon.org</span>
          </a>
        </div>
        
        <div className="text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Techpigeon. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
