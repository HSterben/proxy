/** Primary site nav. Keep short: one Product entry for home sections, then real pages. */
export const navLinks = [
  { label: 'Product', href: '/#features' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'States', href: '/states' },
  { label: 'About', href: '/about' },
] as const

/** In-page anchors for the home footer column (not duplicated in the top nav). */
export const homeAnchors = [
  { label: 'Features', href: '/#features' },
  { label: 'How it works', href: '/#process' },
  { label: 'States demo', href: '/#customize' },
  { label: 'Pricing', href: '/#pricing' },
] as const

/** Site pages for the footer (Contact lives here, not in the top nav). */
export const footerLinks = [
  { label: 'States', href: '/states' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
] as const

export const proofItems = [
  'Windows app',
  'Web client',
  'Custom states',
  'Streaming replies',
  'Small install',
] as const

export const processSteps = [
  {
    step: '01',
    title: 'Open PROXY',
    description:
      'Install the Windows app from GitHub Releases, or open PROXY Web in your browser. Sign in with your PROXY account.',
  },
  {
    step: '02',
    title: 'Pick or build a state',
    description:
      'A state is a named trigger with instructions and options. Start with a built-in one, save a public state from the gallery, or write your own.',
  },
  {
    step: '03',
    title: 'Chat with that setup',
    description:
      'Type a message, or put the state name first (for example Simplify hello). PROXY uses that state’s instructions for the reply.',
  },
] as const

/** Plans shown on the homepage. Prices match the Stripe checkout CTAs on /account/billing. */
export const pricingPlans = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    description: 'Sign in and try PROXY with a small lifetime chat allowance and three built-in states.',
    features: [
      'Up to about 30 requests (lifetime)',
      'Three states: Simplify, List, and Critique',
      'Windows app and PROXY Web chat',
      'Browse the states gallery',
    ],
    popular: false,
    icon: 'rocket' as const,
    cta: 'Open PROXY Web',
    href: '/app',
    badge: null as string | null,
  },
  {
    name: 'Pro',
    price: '$10',
    period: '/month',
    description: 'Full chat quota plus custom states you can publish.',
    features: [
      'Monthly chat allowance',
      'Create and publish custom states',
      'States sync across web and Windows',
      'Billing and invoices on this site',
    ],
    popular: true,
    icon: 'zap' as const,
    cta: 'Choose monthly',
    href: '/account/billing',
    badge: 'Most used' as string | null,
  },
  {
    name: 'Yearly',
    price: '$99',
    period: '/year',
    description: 'Same Pro access, billed once per year.',
    features: [
      'Everything in Pro',
      'One yearly charge instead of twelve',
      'Create and publish custom states',
      'Manage billing on this site',
    ],
    popular: false,
    icon: 'crown' as const,
    cta: 'Choose yearly',
    href: '/account/billing',
    badge: 'Yearly billing' as string | null,
  },
]

export const faqs = [
  {
    question: 'What is a PROXY state?',
    answer:
      'A state is a named chat setup: trigger word, instructions, and optional model settings. In chat, put the trigger first, such as Simplify draft this email.',
  },
  {
    question: 'What differentiates PROXY from other AI chatbots?',
    answer:
      'Usefulness. PROXY is built around states—reusable setups you trigger by name—so every reply can follow the instructions you care about instead of a one-size-fits-all chat. Accessibility means the same account works on a lightweight Windows app and in the browser. Customizability means you can start with official states, save gallery ones, or (on Pro) write and publish your own so the product bends to how you actually work.',
  },
  {
    question: 'Where can I use PROXY?',
    answer:
      'On the Windows desktop app and in PROXY Web. Sign in with the same PROXY account on both.',
  },
  {
    question: 'How do I get the Windows app?',
    answer:
      'Use any Download for Windows button on this site. It fetches the latest PROXY-Setup installer from GitHub Releases. You can also open the Releases page and pick an older build.',
  },
  {
    question: 'Do I need a paid plan to chat?',
    answer:
      'No. Free accounts get up to about 30 requests (lifetime) and three states (Simplify, List, Critique). Subscribe when you need more chat capacity or want to create and publish your own states.',
  },
  {
    question: 'Where do I change my plan or payment method?',
    answer:
      'Open Account → Billing on this website. The desktop app links to the same billing page; it does not process cards itself.',
  },
]

export const socialLinks = [
  { label: 'Twitter', href: 'https://x.com' },
  { label: 'GitHub', href: 'https://github.com/HSterben/Proxy' },
  { label: 'Discord', href: 'https://discord.com' },
]

/** Public GitHub repo used for Windows installs + desktop auto-updates. */
export const DESKTOP_GITHUB_REPO = 'HSterben/proxy'

/**
 * Exact installer filename attached to the latest GitHub release.
 * Update this when the published asset name changes (Forge includes the version).
 * Direct download URL pattern:
 *   https://github.com/<owner>/<repo>/releases/latest/download/<filename>
 */
export const DESKTOP_INSTALLER_FILENAME = 'PROXY-Windows-Setup.exe'

/** Starts a download of the newest Windows installer from GitHub Releases. */
export const DESKTOP_DOWNLOAD_URL =
  `https://github.com/${DESKTOP_GITHUB_REPO}/releases/latest/download/${DESKTOP_INSTALLER_FILENAME}`

/** Release notes / assets list (not a direct file download). */
export const DESKTOP_RELEASES_URL =
  `https://github.com/${DESKTOP_GITHUB_REPO}/releases/latest`
