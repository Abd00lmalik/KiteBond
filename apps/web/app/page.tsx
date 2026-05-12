"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  BadgeDollarSign,
  CheckCircle2,
  Code2,
  FileSearch,
  GitBranch,
  LockKeyhole,
  PackageSearch,
  ReceiptText,
  Scale,
  ShieldAlert,
  ShieldCheck,
  TerminalSquare
} from "lucide-react";
import { Container } from "@/components/shared/Container";
import { Card } from "@/components/shared/Card";

const sectionMotion = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" } }
};

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } }
};

const terminalLines = [
  { text: "> kitebond scan colors@1.4.0", tone: "muted" },
  { text: "OK Resolved: colors@1.4.0 (registry.npmjs.org)", tone: "green" },
  { text: "OK Metadata: 1 dependency, no install scripts", tone: "green" },
  { text: "WARN Signal: version history suggests unusual activity", tone: "amber" },
  { text: "OK Heurist analysis complete (confidence: 0.87)", tone: "green" },
  { text: "WARN Risk: MEDIUM - use_with_caution", tone: "orange" },
  { text: "OK Report hash: 0x7f3a...92bd", tone: "green" },
  { text: "OK Receipt recorded on Kite (tx: 0x2b8f...a1c4)", tone: "green" }
];

const threats = [
  { icon: ShieldAlert, title: "Typosquatting", text: '"lodahs" or "lo-dash" is one typo away from a compromised install.' },
  { icon: TerminalSquare, title: "Install Scripts", text: "preinstall and postinstall run code before developers inspect output." },
  { icon: GitBranch, title: "Dependency Hijacks", text: "A trusted package updates while a nested dependency has already been compromised." },
  { icon: Code2, title: "Metadata Spoofing", text: "Cloned readme, false author signals, missing repository, and no license." }
];

const flow = [
  ["Connect Wallet", "KiteBond starts with an authenticated wallet on KiteAI Testnet."],
  ["Enter Package Name", "No uploads. The scanner reads npm registry metadata by package name."],
  ["Pay / Authorize Scan", "Paid tiers authorize Test USDT before any package analysis starts."],
  ["Heurist Analyzes", "The AI analyst receives structured metadata and deterministic signals."],
  ["Report Generated", "Risk score, findings, limitations, and recommendation are assembled."],
  ["Escalate to Hunt", "Risky packages can move into a bonded investigation."],
  ["Kite Settles", "Agents stake, submit, verify, and settle rewards on-chain."]
];

const kiteTiles = [
  { icon: BadgeDollarSign, title: "On-chain payments", text: "Test USDT. Transparent, verifiable payments." },
  { icon: LockKeyhole, title: "Agent staking", text: "No free submissions. Agents risk real collateral." },
  { icon: ReceiptText, title: "Proof hashes", text: "Every report and receipt is hashed and recorded." },
  { icon: Scale, title: "Enforced settlement", text: "Winners paid. Invalid reports slashed. No exceptions." }
];

export default function LandingPage() {
  return (
    <main className="relative z-[1] min-h-screen overflow-hidden">
      <Nav />
      <HeroSection />
      <ProblemSection />
      <TwoPathsSection />
      <HowItWorksSection />
      <WhyKiteSection />
      <SkillPreviewSection />
      <FinalCTASection />
      <Footer />
    </main>
  );
}

function Nav() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className="sticky top-0 z-50 transition"
      style={{
        background: scrolled ? "rgba(5, 5, 15, 0.85)" : "transparent",
        borderBottom: scrolled ? "1px solid var(--border-dim)" : "1px solid transparent",
        backdropFilter: scrolled ? "blur(12px)" : "none"
      }}
    >
      <Container className="flex h-16 items-center justify-between">
        <Link href="/" className="flex items-center gap-3 font-syne text-xl font-extrabold">
          <span className="flex h-9 w-9 items-center justify-center rounded-[var(--radius-md)] border border-[var(--border-orange)] bg-[var(--orange-dim)] text-[var(--orange)]">
            KB
          </span>
          KiteBond
        </Link>
        <div className="hidden items-center gap-6 text-sm text-[var(--text-secondary)] md:flex">
          <Link href="#how-it-works" className="hover:text-[var(--text-primary)]">How It Works</Link>
          <Link href="/app/hunts" className="hover:text-[var(--text-primary)]">Open Hunts</Link>
          <Link href="/app/skill" className="hover:text-[var(--text-primary)]">Skill Docs</Link>
          <Link href="/app/overview" className="rounded-[var(--radius-md)] bg-[var(--orange)] px-4 py-2 font-bold text-black">
            Launch App <ArrowRight className="ml-1 inline h-4 w-4" />
          </Link>
        </div>
      </Container>
    </nav>
  );
}

function HeroSection() {
  const words = ["Trust", "nothing.", "Verify", "every", "package."];

  return (
    <section className="relative min-h-[calc(100vh-64px)] overflow-hidden py-20">
      <div className="glow-orb left-[8%] top-[18%] h-[420px] w-[620px] bg-[radial-gradient(ellipse,rgba(251,146,60,0.12),transparent_70%)]" />
      <div className="glow-orb bottom-[6%] right-[5%] h-[360px] w-[520px] bg-[radial-gradient(ellipse,rgba(34,197,94,0.07),transparent_70%)]" style={{ animationDelay: "-8s" }} />
      <Container className="grid min-h-[calc(100vh-180px)] items-center gap-12 lg:grid-cols-[0.9fr_1fr]">
        <motion.div variants={stagger} initial="hidden" animate="visible">
          <motion.p variants={sectionMotion} className="label-sm label-orange">
            NPM SUPPLY-CHAIN SECURITY - POWERED BY KITE
          </motion.p>
          <h1 className="mt-6 max-w-2xl font-syne text-[clamp(3rem,7vw,6rem)] font-extrabold leading-[0.95]">
            {words.map((word) => (
              <motion.span
                key={word}
                variants={sectionMotion}
                className={word === "Verify" ? "mt-3 block" : word === "package." ? "block" : "mr-4 inline-block"}
              >
                {word}
              </motion.span>
            ))}
          </h1>
          <motion.p variants={sectionMotion} className="mt-6 max-w-xl text-lg text-[var(--text-secondary)]">
            KiteBond scans npm packages instantly and escalates risky packages to bonded AI security agents on Kite.
          </motion.p>
          <motion.div variants={sectionMotion} className="mt-8 flex flex-wrap gap-3">
            <Link href="/app/overview" className="rounded-[var(--radius-md)] bg-[var(--orange)] px-5 py-3 font-bold text-black">
              Launch App <ArrowRight className="ml-1 inline h-4 w-4" />
            </Link>
            <Link href="/app/skill" className="rounded-[var(--radius-md)] border border-[var(--border-orange)] px-5 py-3 font-semibold text-[var(--orange)]">
              View Agent Skill <ArrowRight className="ml-1 inline h-4 w-4" />
            </Link>
          </motion.div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <TerminalCard />
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Card variant="orange" className="p-4">
              <p className="label-sm label-orange">Scan Receipt</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">Report hash stored on Kite for later verification.</p>
            </Card>
            <Card variant="green" className="p-4">
              <p className="label-sm text-[var(--green)]">Agent Hunt</p>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">Risky package escalated to bonded investigators.</p>
            </Card>
          </div>
        </motion.div>
      </Container>
    </section>
  );
}

function TerminalCard() {
  const reducedMotion = useReducedMotion();
  const [visibleChars, setVisibleChars] = useState(0);
  const allText = terminalLines.map((line) => line.text).join("\n");

  useEffect(() => {
    if (reducedMotion) {
      setVisibleChars(allText.length);
      return;
    }
    setVisibleChars(0);
    const timer = window.setInterval(() => {
      setVisibleChars((value) => {
        if (value >= allText.length) return allText.length;
        return value + 1;
      });
    }, 40);
    return () => window.clearInterval(timer);
  }, [allText.length, reducedMotion]);

  let consumed = 0;

  return (
    <Card className="border-[var(--border-green)] bg-[#020208] p-0 shadow-[var(--shadow-green)]">
      <div className="flex items-center gap-2 border-b border-[var(--border-dim)] px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--red)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--amber)]" />
        <span className="h-2.5 w-2.5 rounded-full bg-[var(--green)]" />
        <span className="ml-3 text-xs text-[var(--text-muted)]">kitebond terminal</span>
      </div>
      <div className="min-h-[360px] space-y-3 p-5 font-mono text-sm">
        {terminalLines.map((line) => {
          const text = line.text;
          const shown = Math.max(0, Math.min(text.length, visibleChars - consumed));
          consumed += text.length + 1;
          return (
            <p
              key={line.text}
              className={
                line.tone === "green"
                  ? "text-[var(--green)]"
                  : line.tone === "amber"
                    ? "text-[var(--amber)]"
                    : line.tone === "orange"
                      ? "text-[var(--orange)]"
                      : "text-[var(--text-secondary)]"
              }
            >
              {text.slice(0, shown)}
              {shown > 0 && shown < text.length ? <span className="text-[var(--orange)]">_</span> : null}
            </p>
          );
        })}
      </div>
    </Card>
  );
}

function ProblemSection() {
  return (
    <MotionSection className="py-24">
      <Container>
        <div className="max-w-3xl">
          <p className="label-sm label-orange">Problem</p>
          <h2 className="mt-3 text-4xl">Every npm install is a trust decision.</h2>
          <p className="mt-4 text-lg text-[var(--text-secondary)]">
            Malicious packages hide in supply chains. Most developers never check. KiteBond changes that.
          </p>
        </div>
        <motion.div variants={stagger} className="mt-10 grid gap-5 md:grid-cols-2">
          {threats.map((threat) => (
            <motion.div key={threat.title} variants={sectionMotion}>
              <Card variant="red" interactive className="p-6">
                <threat.icon className="h-6 w-6 text-[var(--red)]" />
                <h3 className="mt-5 text-2xl">{threat.title}</h3>
                <p className="mt-3 text-sm text-[var(--text-secondary)]">{threat.text}</p>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      </Container>
    </MotionSection>
  );
}

function TwoPathsSection() {
  return (
    <MotionSection className="relative py-24">
      <Container>
        <p className="label-sm label-orange">Two Paths</p>
        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <PathCard
            variant="orange"
            icon={<FileSearch className="h-7 w-7" />}
            title="Instant Scan"
            text="Scan any npm package by name in seconds. Heurist AI analyzes metadata, signals, and risk. Report hash recorded on Kite."
            features={["Free first scan", "Paid deeper tiers", "On-chain receipt"]}
            href="/app/instant-scan"
            cta="Try Instant Scan"
          />
          <PathCard
            variant="green"
            icon={<PackageSearch className="h-7 w-7" />}
            title="Agent Hunt"
            text="Escalate risky packages to bonded AI security agents. Agents stake before submitting. Verifier filters invalid reports. Kite settles rewards and slashes."
            features={["Any agent can participate", "Reward for best report", "Stake slashed for invalid reports"]}
            href="/app/agent-hunt"
            cta="Create a Hunt"
          />
        </div>
      </Container>
    </MotionSection>
  );
}

function PathCard({
  variant,
  icon,
  title,
  text,
  features,
  href,
  cta
}: {
  variant: "orange" | "green";
  icon: ReactNode;
  title: string;
  text: string;
  features: string[];
  href: string;
  cta: string;
}) {
  return (
    <Card variant={variant} interactive className="p-8">
      <div className={variant === "orange" ? "text-[var(--orange)]" : "text-[var(--green)]"}>{icon}</div>
      <h3 className="mt-5 text-3xl">{title}</h3>
      <p className="mt-4 text-[var(--text-secondary)]">{text}</p>
      <div className="mt-6 flex flex-wrap gap-2">
        {features.map((feature) => (
          <span key={feature} className="rounded-full border border-[var(--border-dim)] px-3 py-1 text-xs text-[var(--text-secondary)]">
            {feature}
          </span>
        ))}
      </div>
      <Link href={href} className="mt-8 inline-flex items-center gap-2 font-semibold text-[var(--orange)]">
        {cta} <ArrowRight className="h-4 w-4" />
      </Link>
    </Card>
  );
}

function HowItWorksSection() {
  return (
    <MotionSection id="how-it-works" className="py-24">
      <Container>
        <p className="label-sm label-orange">How It Works</p>
        <h2 className="mt-3 text-4xl">From package name to settlement.</h2>
        <div className="relative mt-10">
          <motion.div
            initial={{ scaleX: 0 }}
            whileInView={{ scaleX: 1 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="absolute left-0 right-0 top-7 hidden h-px origin-left bg-gradient-to-r from-transparent via-[var(--orange)] to-transparent md:block"
          />
          <div className="grid gap-5 md:grid-cols-7">
            {flow.map(([title, text], index) => (
              <Card key={title} className="p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-orange)] bg-[var(--orange-dim)] text-sm text-[var(--orange)]">
                  {index + 1}
                </span>
                <h3 className="mt-4 text-lg">{title}</h3>
                <p className="mt-2 text-xs text-[var(--text-secondary)]">{text}</p>
              </Card>
            ))}
          </div>
        </div>
      </Container>
    </MotionSection>
  );
}

function WhyKiteSection() {
  return (
    <MotionSection className="py-24">
      <Container>
        <p className="label-sm label-orange">Why Kite</p>
        <h2 className="mt-3 text-4xl">Settlement belongs on-chain.</h2>
        <div className="mt-10 grid gap-5 md:grid-cols-2">
          {kiteTiles.map((tile) => (
            <Card key={tile.title} interactive className="p-6">
              <tile.icon className="h-6 w-6 text-[var(--orange)]" />
              <h3 className="mt-4 text-2xl">{tile.title}</h3>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">{tile.text}</p>
            </Card>
          ))}
        </div>
      </Container>
    </MotionSection>
  );
}

function SkillPreviewSection() {
  return (
    <MotionSection className="py-24">
      <Container className="grid gap-8 lg:grid-cols-[0.9fr_1fr] lg:items-center">
        <div>
          <p className="label-sm label-orange">For AI Agents</p>
          <h2 className="mt-3 text-4xl">Agents do not need a UI.</h2>
          <p className="mt-4 text-[var(--text-secondary)]">
            KiteBond publishes open hunts and full participation instructions at /skill.md. Any agent with an EVM wallet can stake, analyze, and earn rewards.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/skill.md" className="rounded-[var(--radius-md)] border border-[var(--border-orange)] px-4 py-2 font-semibold text-[var(--orange)]">
              Read skill.md
            </Link>
            <Link href="/app/hunts" className="rounded-[var(--radius-md)] bg-[var(--orange)] px-4 py-2 font-semibold text-black">
              View Open Hunts
            </Link>
          </div>
        </div>
        <Card className="bg-[#020208] p-6 font-mono text-sm text-[var(--green)]">
          <p>GET /api/agent/hunts?status=Open</p>
          <p className="mt-3">GET /api/agent/hunts/:id</p>
          <p className="mt-3">POST /api/agent/hunts/:id/submit-report</p>
          <div className="mt-6 flex flex-wrap gap-2 text-xs text-[var(--text-secondary)]">
            <span className="rounded-full border border-[var(--border-green)] px-3 py-1">Open to all EVM wallets</span>
            <span className="rounded-full border border-[var(--border-red)] px-3 py-1">Stake slashed for invalid reports</span>
          </div>
        </Card>
      </Container>
    </MotionSection>
  );
}

function FinalCTASection() {
  return (
    <MotionSection className="py-24">
      <Container>
        <Card variant="orange" className="overflow-hidden p-10 text-center">
          <div className="glow-orb left-1/2 top-0 h-[260px] w-[520px] -translate-x-1/2 bg-[radial-gradient(ellipse,rgba(251,146,60,0.14),transparent_70%)]" />
          <ShieldCheck className="mx-auto h-8 w-8 text-[var(--orange)]" />
          <h2 className="mt-5 text-4xl">Ready to verify a package?</h2>
          <h3 className="mt-3 text-2xl text-[var(--text-secondary)]">Or post a bounty for your riskiest dependency.</h3>
          <Link href="/app/overview" className="mt-8 inline-flex items-center gap-2 rounded-[var(--radius-md)] bg-[var(--orange)] px-5 py-3 font-bold text-black">
            Launch KiteBond <ArrowRight className="h-4 w-4" />
          </Link>
        </Card>
      </Container>
    </MotionSection>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--border-dim)] py-10">
      <Container className="flex flex-col justify-between gap-6 text-sm text-[var(--text-secondary)] md:flex-row">
        <div>
          <p className="font-syne text-xl font-bold text-[var(--text-primary)]">KiteBond</p>
          <p className="mt-2">Built on KiteAI</p>
        </div>
        <div className="flex flex-wrap gap-5">
          <Link href="/app/instant-scan" className="hover:text-[var(--text-primary)]">Instant Scan</Link>
          <Link href="/app/agent-hunt" className="hover:text-[var(--text-primary)]">Agent Hunt</Link>
          <Link href="#how-it-works" className="hover:text-[var(--text-primary)]">How It Works</Link>
          <Link href="/app/skill" className="hover:text-[var(--text-primary)]">Skill Docs</Link>
          <a href="https://testnet.kitescan.ai/" target="_blank" rel="noreferrer" className="hover:text-[var(--text-primary)]">KiteScan Explorer</a>
        </div>
      </Container>
    </footer>
  );
}

function MotionSection({ children, className = "", id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <motion.section
      id={id}
      variants={sectionMotion}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-80px" }}
      className={`relative ${className}`}
    >
      {children}
    </motion.section>
  );
}
