import { Bot, Check, LockKeyhole, MessageCircle, Scale, ShieldCheck, SunMoon, UserCheck, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from 'react-i18next';
import { useEffect, useState } from 'react';

interface LandingPageProps { onConsole: () => void; }
interface LandingContentItem { title: string; description: string; }
function Badge({ children }: { children: React.ReactNode }) { return <span className="icon-badge">{children}</span>; }

export default function LandingPage({ onConsole }: LandingPageProps) {
  const { t } = useTranslation();

  const howItWorksItems = t('landingPage.howItWorks.process', { returnObjects: true }) as unknown as LandingContentItem[];
  const valueSectionItems = t('landingPage.valueSection.values', { returnObjects: true }) as unknown as LandingContentItem[];
  const foundationItems = t('landingPage.foundations.items', { returnObjects: true }) as unknown as LandingContentItem[];
  const [selectedProcess, setSelectedProcess] = useState<number | null>(null);
  const processIcons = [MessageCircle, ShieldCheck, UserCheck];
  const processDetails = [
    'The LLM parses free-text intent and can phrase replies. It never sets a price, discount, or payment amount.',
    'Deterministic rules apply discount caps, margin floors, quantity limits, stock, and risk thresholds before an offer is created.',
    'High-value or high-risk requests pause for explicit merchant approval. Approved offers are signed, time-bound, and replay-safe.',
  ];
  const [offerSeconds, setOfferSeconds] = useState(10);
  const [proofStep, setProofStep] = useState(0);
  const offerExpired = offerSeconds <= 0;

  useEffect(() => {
    const timer = window.setInterval(() => setOfferSeconds((seconds) => seconds > -4 ? seconds - 1 : 10), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setProofStep((step) => (step + 1) % 3), 1800);
    return () => window.clearInterval(timer);
  }, []);

  return <div className="landing min-h-screen bg-background text-ink">
    <header className="site-header border-b border-line/70 bg-surface"><div className="page-container flex min-h-[76px] items-center justify-between gap-6"><div className="flex items-center gap-3"><Badge><ShieldCheck size={20} strokeWidth={2.25} aria-hidden="true" /></Badge><div><h2 className="text-lg font-semibold">{t('landingPage.header.title')}</h2><p className="text-sm text-ink-2">{t('landingPage.header.tagline')}</p></div></div><div className="flex items-center gap-2"><button type="button" aria-label="Toggle theme" title="Toggle theme" onClick={() => window.dispatchEvent(new CustomEvent("aegis-theme", { detail: "toggle" }))} className="flex h-9 w-9 items-center justify-center rounded-md text-ink-2 hover:bg-brand/10 hover:text-brand"><SunMoon size={17} /></button><Button onClick={onConsole} size="sm">{t('landingPage.header.cta')}</Button></div></div></header>
    <main>
      <section className="hero-section"><div className="hero-grid page-container"><div className="hero-copy"><div className="mb-5 flex items-center gap-3"><Badge><Bot size={19} /></Badge><span className="eyebrow">{t('landingPage.hero.eyebrow')}</span></div><h1>{t('landingPage.hero.titleBefore')} <span>{t('landingPage.hero.titleHighlight')}</span></h1><p>{t('landingPage.hero.description')}</p><div className="mt-7 flex flex-wrap gap-3"><Button onClick={onConsole}>{t('landingPage.hero.buttons.demo')}</Button><a href="#foundations" className="btn-outline">{t('landingPage.hero.buttons.docs')}</a></div><div className="trust-list"><span><Check size={16} />{t('landingPage.hero.trustList.deterministicPricing')}</span><span><LockKeyhole size={16} />{t('landingPage.hero.trustList.cryptographicallySecure')}</span><span><Users size={16} />{t('landingPage.hero.trustList.humanInTheLoop')}</span></div></div><div className="hero-visual"><div className="hero-visual-chrome"><span><i className={`status-dot ${offerExpired ? 'bg-bad' : 'bg-ok'}`} />{offerExpired ? 'OFFER EXPIRED' : 'PROTECTED CHECKOUT'}</span><span>Sample order</span></div><p className="hero-visual-explainer">{offerExpired ? 'This offer is no longer available.' : 'A verified offer, ready for a policy-safe payment.'}</p><div className={`offer-panel ${offerExpired ? 'offer-panel-expired' : ''}`}><div className="flex items-center justify-center gap-2 text-sm"><i className={`status-dot ${offerExpired ? 'bg-bad' : 'bg-ok'}`} />{offerExpired ? 'Offer expired' : 'Offer verified'}</div><div className="mt-5 text-xs font-semibold uppercase tracking-wider text-ink-3">{offerExpired ? 'Price locked' : 'Ready to review'}</div><strong className="mt-2 block">5× Mechanical Keyboard</strong><span className="mt-1 block text-xs text-ink-2">{offerExpired ? 'Request a new offer in the console.' : `₹35,996 · 20% discount · expires in ${Math.floor(offerSeconds / 60)}:${String(offerSeconds % 60).padStart(2, '0')}`}</span></div></div></div></section>
      <section id="how-it-works" className="section section-muted">
        <div className="page-container">
          <h2>{t('landingPage.howItWorks.title')}</h2>
          <p className="section-intro">{t('landingPage.howItWorks.description', { defaultValue: 'AegisCart keeps conversation flexible while every money decision stays deterministic: intent, policy, approval, offer, payment, and ledger.' })}</p>
          {Array.isArray(howItWorksItems) ? (
            <div className="process-grid">
              {howItWorksItems.map((item: { title: string; description: string }, index: number) => {
                const ProcessIcon = processIcons[index] ?? Bot;
                const isSelected = selectedProcess === index;
                return (
                  <button
                    type="button"
                    className={`feature-card process-window ${isSelected ? 'process-window-active' : ''}`}
                    key={index.toString()}
                    aria-pressed={isSelected}
                    onClick={() => setSelectedProcess(index)}
                  >
                    <span className="window-controls" aria-hidden="true"><i /><i /><i /></span>
                    <span className="process-logo"><ProcessIcon size={22} strokeWidth={2} /></span>
                    <span className="process-window-title">{item.title}</span>
                    <span className="process-window-copy">{item.description}</span>
                    <span className="process-window-detail">{processDetails[index]}</span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </section>
      <section className="section">
        <div className="value-grid page-container">
          <div>
            <h2 className="text-left">{t('landingPage.valueSection.title')}</h2>
            {Array.isArray(valueSectionItems) ? (
              <div className="value-list">
                {valueSectionItems.map((value: { title: string; description: string }, index: number) => (
                  <article className="value-card" key={index.toString()}>
                    <Badge><Check size={18} /></Badge>
                    <div>
                      <h3>{value.title}</h3>
                      <p>{value.description}</p>
                    </div>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
          <div className="proof-column">
            <div className="audit-preview">
              <div className="audit-inner">
                <div className="proof-heading"><span className="proof-live-dot" />Live verification</div>
                <div className="proof-status-list">
                  <p className={proofStep === 0 ? 'proof-active' : ''}><i className="status-dot bg-ok" />Policy Check: PASSED</p>
                  <p className={proofStep === 1 ? 'proof-active' : ''}><i className="status-dot bg-brand" />Offer Signed: HMAC-SHA256</p>
                  <p className={proofStep === 2 ? 'proof-active' : ''}><i className="status-dot bg-brand" />Ledger Entry: APPENDED</p>
                </div>
                <div className="proof-progress" aria-label="Verification progress"><span style={{ width: `${((proofStep + 1) / 3) * 100}%` }} /></div>
                <hr />
                <small>14:23:04 · Event ID: ledger_7a3f9c21e</small>
              </div>
            </div>
          </div>
        </div>
      </section>
      <section id="foundations" className="section section-muted">
        <div className="page-container">
          <h2>{t('landingPage.foundations.title')}</h2>
          <p className="section-intro">{t('landingPage.foundations.description', { defaultValue: 'The money core is built from plain, testable rules, so the LLM can improve the conversation without deciding anything that touches money.' })}</p>
          {Array.isArray(foundationItems) ? (
            <div className="foundation-grid">
              {foundationItems.map((item: { title: string; description: string }, index: number) => (
                <article className="foundation-card" key={index.toString()}>
                  <Badge><Scale size={20} /></Badge>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          ) : null}
        </div>
      </section>
      <section id="cta" className="section cta-section">
        <div className="narrow-container text-center">
          <h2>{t('landingPage.cta.title')}</h2>
          <p>{t('landingPage.cta.description')}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Button onClick={onConsole}>{t('landingPage.cta.buttons.trial')}</Button>
            <a href="#foundations" className="btn-outline">{t('landingPage.cta.buttons.sales')}</a>
          </div>
        </div>
      </section>
    </main>
    <footer id="footer" className="site-footer border-t border-line/70 bg-surface">
      <div className="page-container footer-grid">
        <div>
          <div className="flex items-center gap-3">
            <Badge><ShieldCheck size={20} strokeWidth={2.25} aria-hidden="true" /></Badge>
            <div>
              <h2 className="footer-wordmark font-semibold">{t('landingPage.footer.company.name')}</h2>
              <p className="text-sm text-ink-2">{t('landingPage.footer.company.tagline')}</p>
            </div>
          </div>
          <div className="mt-4 flex gap-4 text-sm text-ink-2">
            <a href="#">Terms</a>
            <a href="#">Privacy</a>
            <a href="#">Security</a>
            <a href="#">Docs</a>
          </div>
        </div>
        <div className="footer-links">
          <div>
            <strong>Product</strong>
            <a href="#foundations">Features</a>
            <a href="#cta">Pricing</a>
            <a href="#how-it-works">Demo</a>
          </div>
          <div>
            <strong>Company</strong>
            <a href="#footer">About</a>
            <a href="#footer">Team</a>
            <a href="#footer">Careers</a>
          </div>
          <div>
            <strong>Resources</strong>
            <a href="#footer">Documentation</a>
            <a href="#footer">API Reference</a>
            <a href="#footer">Guides</a>
          </div>
          <div>
            <strong>Legal</strong>
            <a href="#footer">Terms of Service</a>
            <a href="#footer">Privacy Policy</a>
            <a href="#footer">Compliance</a>
          </div>
        </div>
      </div>
    </footer>
  </div>;
}