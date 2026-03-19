import { MapPin, Phone } from "@phosphor-icons/react"

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border/50 bg-card/30 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto px-6 md:px-8 py-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <MapPin size={20} weight="duotone" className="text-primary mt-1 flex-shrink-0" />
              <div>
                <p className="font-semibold text-foreground mb-1">Techpigeon Pakistan</p>
                <p className="text-sm text-muted-foreground">G-7/4, Islamabad 44000, Pakistan</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <Phone size={16} weight="duotone" className="text-primary" />
                  <a href="tel:+17868226386" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    +1 (786) 822-6386
                  </a>
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <MapPin size={20} weight="duotone" className="text-primary mt-1 flex-shrink-0" />
              <div>
                <p className="font-semibold text-foreground mb-1">Techpigeon Spark LLC 🇴🇲</p>
                <p className="text-sm text-muted-foreground">Dohat al adab st, Alkhuwair, 133, Muscat, Oman</p>
                <div className="flex items-center gap-1.5 mt-1">
                  <Phone size={16} weight="duotone" className="text-primary" />
                  <a href="tel:+96876786324" className="text-sm text-muted-foreground hover:text-primary transition-colors">
                    +968 767 86324
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <div className="pt-6 border-t border-border/30 text-center">
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Techpigeon. AI-Powered Marketing Intelligence Platform.
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Visit us at{" "}
            <a 
              href="https://www.techpigeon.org" 
              target="_blank" 
              rel="noopener noreferrer" 
              className="text-primary hover:underline font-medium"
            >
              www.techpigeon.org
            </a>
          </p>
        </div>
      </div>
    </footer>
  )
}
