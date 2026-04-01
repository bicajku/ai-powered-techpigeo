import { ArrowLeft, ShieldCheck, Eye, Database, LockKey, UserCircle, Envelope, Globe, Trash, ArrowsClockwise } from "@phosphor-icons/react"
import novussparksIcon from "@/assets/images/novussparks-icon.svg"
import techpigeonLogo from "@/assets/images/techpigeon-logo.png"

interface PrivacyPolicyProps {
  onBack?: () => void
}

export function PrivacyPolicy({ onBack }: PrivacyPolicyProps) {
  const handleBack = () => {
    if (onBack) {
      onBack()
    } else {
      window.location.href = "/"
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-card/30">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-md">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={18} />
            Back to NovusSparks
          </button>
          <a href="/" className="flex items-center gap-2">
            <img src={novussparksIcon} alt="NovusSparks" className="w-8 h-8" />
            <span className="font-semibold text-foreground hidden sm:inline">NovusSparks AI</span>
          </a>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12 md:py-16">
        {/* Title */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <ShieldCheck size={18} weight="duotone" />
            Transparency & Data Integrity
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Privacy & Data Policy
          </h1>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            At NovusSparks, we believe in full transparency about how we handle your data.
            This policy explains what we collect, why, and what control you have.
          </p>
          <p className="text-xs text-muted-foreground mt-4">
            Last updated: March 28, 2026
          </p>
        </div>

        {/* Sections */}
        <div className="space-y-10">

          {/* 1. Our Commitment */}
          <section className="bg-card/50 border border-border/40 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
                <Eye size={24} weight="duotone" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-1">1. Our Commitment to Transparency</h2>
                <p className="text-muted-foreground text-sm">What you should know up front</p>
              </div>
            </div>
            <div className="text-foreground/80 space-y-3 text-[15px] leading-relaxed pl-0 md:pl-14">
              <p>
                NovusSparks AI is an enterprise AI platform operated by <strong>NovusSparks</strong>,
                with technology powered by <strong>Techpigeon</strong>. We are committed to:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>No hidden data collection</strong> &mdash; We only collect what is necessary for the service to function.</li>
                <li><strong>No selling of data</strong> &mdash; Your data is never sold, rented, or traded to third parties for advertising or profiling.</li>
                <li><strong>No AI training on your content</strong> &mdash; Your strategies, documents, and chat conversations are not used to train any AI models.</li>
                <li><strong>Your data, your control</strong> &mdash; You can export, modify, or delete your data at any time.</li>
              </ul>
            </div>
          </section>

          {/* 2. Data We Collect */}
          <section className="bg-card/50 border border-border/40 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
                <Database size={24} weight="duotone" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-1">2. Data We Collect</h2>
                <p className="text-muted-foreground text-sm">And exactly why we collect it</p>
              </div>
            </div>
            <div className="text-foreground/80 space-y-4 text-[15px] leading-relaxed pl-0 md:pl-14">
              <div className="overflow-x-auto">
                <table className="w-full text-sm border-collapse">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="text-left py-2 pr-4 font-semibold text-foreground">Data Type</th>
                      <th className="text-left py-2 pr-4 font-semibold text-foreground">Purpose</th>
                      <th className="text-left py-2 font-semibold text-foreground">Retention</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/30">
                    <tr>
                      <td className="py-2.5 pr-4">Email & Name</td>
                      <td className="py-2.5 pr-4">Account identification & login</td>
                      <td className="py-2.5">Until account deletion</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4">Password (hashed)</td>
                      <td className="py-2.5 pr-4">Authentication</td>
                      <td className="py-2.5">Until account deletion</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4">Strategies & Outputs</td>
                      <td className="py-2.5 pr-4">Core service functionality</td>
                      <td className="py-2.5">Until you delete them</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4">Chat Conversations</td>
                      <td className="py-2.5 pr-4">AI chat feature (stored in browser)</td>
                      <td className="py-2.5">Browser localStorage only</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4">Integration Configs</td>
                      <td className="py-2.5 pr-4">Third-party connections (e.g., Airtable)</td>
                      <td className="py-2.5">Browser localStorage only</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4">Audit Logs</td>
                      <td className="py-2.5 pr-4">Security & compliance tracking</td>
                      <td className="py-2.5">Rolling 90-day window</td>
                    </tr>
                    <tr>
                      <td className="py-2.5 pr-4">IP Address</td>
                      <td className="py-2.5 pr-4">Rate limiting & abuse prevention</td>
                      <td className="py-2.5">Not stored persistently</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          {/* 3. How We Protect Your Data */}
          <section className="bg-card/50 border border-border/40 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
                <LockKey size={24} weight="duotone" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-1">3. How We Protect Your Data</h2>
                <p className="text-muted-foreground text-sm">Security measures and data integrity</p>
              </div>
            </div>
            <div className="text-foreground/80 space-y-3 text-[15px] leading-relaxed pl-0 md:pl-14">
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Encryption in transit</strong> &mdash; All connections use TLS/HTTPS. No data is transmitted in plain text.</li>
                <li><strong>Password security</strong> &mdash; Passwords are hashed server-side using industry-standard algorithms. We never store plaintext passwords.</li>
                <li><strong>JWT authentication</strong> &mdash; Session tokens are cryptographically signed with short expiration windows and revocation support.</li>
                <li><strong>CSRF protection</strong> &mdash; Double-submit cookie pattern prevents cross-site request forgery attacks.</li>
                <li><strong>Rate limiting</strong> &mdash; API endpoints are rate-limited to prevent brute-force and denial-of-service attacks.</li>
                <li><strong>CORS policy</strong> &mdash; Strict origin validation ensures only authorized domains can access the API.</li>
                <li><strong>Content Security Policy</strong> &mdash; CSP headers prevent XSS and code injection attacks.</li>
                <li><strong>Audit logging</strong> &mdash; All sensitive operations (login, access changes, report signing) are logged with tamper-evident trails for organizational accountability.</li>
              </ul>
            </div>
          </section>

          {/* 4. Third-Party Services */}
          <section className="bg-card/50 border border-border/40 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
                <Globe size={24} weight="duotone" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-1">4. Third-Party Services</h2>
                <p className="text-muted-foreground text-sm">External providers we interact with</p>
              </div>
            </div>
            <div className="text-foreground/80 space-y-3 text-[15px] leading-relaxed pl-0 md:pl-14">
              <p>NovusSparks AI uses the following third-party services to deliver its functionality:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>AI Language Models</strong> (GitHub Copilot, Google Gemini, Groq) &mdash; Your prompts are sent to these providers to generate responses. Each provider has their own data processing policies. We do not send your personal account information to these providers; only the content of your queries.</li>
                <li><strong>Neon (PostgreSQL)</strong> &mdash; Serverless database hosting for user accounts, organizational data, and audit logs.</li>
                <li><strong>Heroku</strong> &mdash; Application hosting platform.</li>
                <li><strong>Airtable</strong> (optional) &mdash; Only connected if you explicitly configure it. Credentials are stored in your browser&rsquo;s localStorage, not on our servers.</li>
                <li><strong>OAuth Providers</strong> (Google, GitHub) &mdash; If you choose to sign in via OAuth, we receive your name and email from the provider. We do not access any other data from your Google or GitHub account.</li>
              </ul>
              <p className="mt-2">
                We do not use any analytics or tracking services (no Google Analytics, no Meta Pixel, no advertising SDKs).
              </p>
            </div>
          </section>

          {/* 5. Your Rights & Controls */}
          <section className="bg-card/50 border border-border/40 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
                <UserCircle size={24} weight="duotone" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-1">5. Your Rights & Controls</h2>
                <p className="text-muted-foreground text-sm">What you can do with your data</p>
              </div>
            </div>
            <div className="text-foreground/80 space-y-3 text-[15px] leading-relaxed pl-0 md:pl-14">
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Access</strong> &mdash; You can view all your stored data through the application dashboard at any time.</li>
                <li><strong>Export</strong> &mdash; Strategies and reports can be exported to PDF, Word, or plain text.</li>
                <li><strong>Deletion</strong> &mdash; You can delete individual strategies, chat threads, and integration configurations. To request full account deletion, contact us at <a href="mailto:privacy@novussparks.com" className="text-primary hover:underline">privacy@novussparks.com</a>.</li>
                <li><strong>Correction</strong> &mdash; You can update your profile information through the application settings.</li>
                <li><strong>Portability</strong> &mdash; Upon request, we will provide a complete export of your data in a machine-readable format (JSON).</li>
              </ul>
            </div>
          </section>

          {/* 6. Data Integrity */}
          <section className="bg-card/50 border border-border/40 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
                <ArrowsClockwise size={24} weight="duotone" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-1">6. Data Integrity & Accuracy</h2>
                <p className="text-muted-foreground text-sm">How we ensure your data remains accurate and unaltered</p>
              </div>
            </div>
            <div className="text-foreground/80 space-y-3 text-[15px] leading-relaxed pl-0 md:pl-14">
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Cryptographic report signing</strong> &mdash; Reports can be digitally signed with server-generated cryptographic hashes, providing tamper-evident proof that content has not been altered after approval.</li>
                <li><strong>Version history</strong> &mdash; Strategy versions are preserved, allowing you to track changes and restore previous versions.</li>
                <li><strong>Audit trails</strong> &mdash; Every significant action (creation, modification, deletion, access grants) is logged with timestamps, user identity, and IP address for full organizational accountability.</li>
                <li><strong>No silent modifications</strong> &mdash; We do not modify, filter, or alter your stored content after creation. What you save is what you get back.</li>
              </ul>
            </div>
          </section>

          {/* 7. Data Deletion */}
          <section className="bg-card/50 border border-border/40 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
                <Trash size={24} weight="duotone" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-1">7. Data Deletion & Account Closure</h2>
                <p className="text-muted-foreground text-sm">How to remove your data permanently</p>
              </div>
            </div>
            <div className="text-foreground/80 space-y-3 text-[15px] leading-relaxed pl-0 md:pl-14">
              <p>You may request complete deletion of your account and all associated data by:</p>
              <ul className="list-disc pl-6 space-y-2">
                <li>Emailing <a href="mailto:privacy@novussparks.com" className="text-primary hover:underline">privacy@novussparks.com</a> from the email address associated with your account.</li>
                <li>Including the subject line: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">Account Deletion Request</code></li>
              </ul>
              <p className="mt-2">
                Upon receiving a verified deletion request, we will permanently remove your account, profile, strategies,
                reports, and all associated data within <strong>30 calendar days</strong>. Audit logs related to your actions
                may be retained in anonymized form for compliance purposes.
              </p>
            </div>
          </section>

          {/* 8. Contact */}
          <section className="bg-card/50 border border-border/40 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
                <Envelope size={24} weight="duotone" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-1">8. Contact & Questions</h2>
                <p className="text-muted-foreground text-sm">Reach us about anything privacy-related</p>
              </div>
            </div>
            <div className="text-foreground/80 space-y-3 text-[15px] leading-relaxed pl-0 md:pl-14">
              <p>If you have any questions, concerns, or requests regarding this policy or your data, please contact:</p>
              <div className="bg-muted/40 rounded-lg p-4 space-y-1.5 text-sm">
                <p><strong>NovusSparks Data Privacy</strong></p>
                <p>Email: <a href="mailto:privacy@novussparks.com" className="text-primary hover:underline">privacy@novussparks.com</a></p>
                <p>General: <a href="mailto:info@novussparks.com" className="text-primary hover:underline">info@novussparks.com</a></p>
                <p>Web: <a href="https://novussparks.com" className="text-primary hover:underline" target="_blank" rel="noopener noreferrer">novussparks.com</a></p>
              </div>
              <p className="text-sm text-muted-foreground mt-4">
                We aim to respond to all privacy-related inquiries within 5 business days.
              </p>
            </div>
          </section>

          {/* 9. Policy Updates */}
          <section className="bg-card/50 border border-border/40 rounded-xl p-6 md:p-8">
            <div className="flex items-start gap-4 mb-4">
              <div className="p-2.5 rounded-lg bg-primary/10 text-primary shrink-0">
                <ArrowsClockwise size={24} weight="duotone" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-foreground mb-1">9. Policy Updates</h2>
                <p className="text-muted-foreground text-sm">How we communicate changes</p>
              </div>
            </div>
            <div className="text-foreground/80 space-y-3 text-[15px] leading-relaxed pl-0 md:pl-14">
              <p>
                We may update this policy from time to time to reflect changes in our practices or for legal,
                operational, or regulatory reasons. When we make material changes:
              </p>
              <ul className="list-disc pl-6 space-y-2">
                <li>The &ldquo;Last updated&rdquo; date at the top of this page will be revised.</li>
                <li>For significant changes, we will notify users via email or an in-app notification.</li>
                <li>Continued use of NovusSparks AI after changes take effect constitutes acceptance of the revised policy.</li>
              </ul>
            </div>
          </section>

        </div>

        {/* Footer attribution */}
        <div className="mt-16 pt-8 border-t border-border/30 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} NovusSparks. All rights reserved.
          </p>
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <img src={techpigeonLogo} alt="" className="w-4 h-4 inline-block" />
            Powered by <a href="https://www.techpigeon.com.pk" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">Techpigeon</a>
          </p>
        </div>
      </main>
    </div>
  )
}
