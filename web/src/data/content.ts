/** Primary site nav. Keep short: one Product entry for home sections, then real pages. */
export const navLinks = [
  { label: 'Product', href: '/#features' },
  { label: 'Pricing', href: '/#pricing' },
  { label: 'States', href: '/states' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
] as const

/** In-page anchors for the home footer column (not duplicated in the top nav). */
export const homeAnchors = [
  { label: 'Features', href: '/#features' },
  { label: 'How it works', href: '/#process' },
  { label: 'States demo', href: '/#customize' },
  { label: 'Pricing', href: '/#pricing' },
] as const

/** Site pages for the footer. */
export const footerLinks = [
  { label: 'States', href: '/states' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Privacy', href: '/privacy' },
] as const

export const proofItems = [
  'Windows & Mac apps',
  'Web client',
  'Custom states',
  'Speech-to-text',
  'Streaming replies',
] as const

export const processSteps = [
  {
    step: '01',
    title: 'Open PROXY',
    description:
      'Install the Windows or Mac app from GitHub Releases, or open PROXY Web in your browser. Sign in with your PROXY account.',
  },
  {
    step: '02',
    title: 'Pick or build a state',
    description:
      'A state is a named trigger with instructions and options. Activate up to your plan’s slot limit, save gallery states, or create your own on Pro.',
  },
  {
    step: '03',
    title: 'Type or speak',
    description:
      'Message PROXY with the keyboard, or use the mic to dictate. Put a state name first when you want that setup for the reply.',
  },
] as const

/** Plans shown on the homepage. Prices match the Stripe checkout CTAs on /account/billing. */
export const pricingPlans = [
  {
    name: 'Free',
    price: '$0',
    period: '',
    description: 'Sign in and try PROXY with a small lifetime chat allowance and official states.',
    features: [
      'Up to about 30 requests (lifetime)',
      'Access official states (activate up to 3 at a time)',
      'Windows, Mac, and PROXY Web chat',
      'Speech-to-text dictation',
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
      'Unlimited active states',
      'States sync across web, Windows, and Mac',
      'Speech-to-text dictation',
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
    question: 'What is PROXY?',
    answer:
      'PROXY is a fast, customizable AI chat assistant for Windows, Mac, and the web. You shape replies with reusable “states”, named triggers that carry instructions, so you are not rewriting the same system prompt every time. You can type or dictate with speech-to-text.',
  },
  {
    question: 'What is a PROXY state?',
    answer:
      'A state is a named chat setup: a trigger word, instructions, and optional model settings. In chat, put the trigger first, such as Simplify draft this email, and PROXY applies that state’s instructions to the reply. Free accounts can activate up to three official states at a time; Pro unlocks creating custom states and unlimited actives.',
  },
  {
    question: 'What differentiates PROXY from other AI chatbots?',
    answer:
      'PROXY centers on reusable states you activate by name, so replies follow the instructions you need. One account works in the desktop apps and in the browser. You can use official or community states, or create and share your own with Pro.',
  },
  {
    question: 'Where can I use PROXY?',
    answer:
      'On the Windows and Mac desktop apps (including the global shortcut bubble) and in PROXY Web at getproxy.ca. Sign in with the same PROXY account so states and plan access stay in sync.',
  },
  {
    question: 'Can I speak instead of typing?',
    answer:
      'Yes. On desktop and PROXY Web, tap the microphone to record, then tap again to transcribe. Pick a mic in Settings (desktop) or the mic menu (web); that request is what prompts OS/browser permission. Audio is sent securely to PROXY’s speech provider (Whisper) for transcription and is not kept as a chat recording.',
  },
  {
    question: 'How do I get the desktop apps?',
    answer:
      'Use Download for Windows or Download for Mac on getproxy.ca. Windows installs from the latest PROXY-Windows-Setup.exe. Mac downloads the latest .dmg (or .zip) from GitHub Releases. You can also open the Releases page to pick an older build. On Mac, the first open may need Control-click → Open if the build is not yet notarized.',
  },
  {
    question: 'How much does PROXY cost?',
    answer:
      'Free accounts can chat with a small lifetime allowance (about 30 requests) and activate up to three official states at a time. Pro is $10 per month or $99 per year for a monthly chat allowance plus creating and publishing custom states with unlimited actives. Billing is managed on getproxy.ca.',
  },
  {
    question: 'Do I need a paid plan to chat?',
    answer:
      'No. Free accounts get up to about 30 requests (lifetime) and can use official states within the three-active-slot limit. Subscribe when you need more chat capacity or want to create and publish your own states.',
  },
  {
    question: 'Where do I change my plan or payment method?',
    answer:
      'Open Account → Billing on getproxy.ca. The desktop app links to the same billing page; it does not process cards itself.',
  },
  {
    question: 'Who makes PROXY?',
    answer:
      'PROXY is built by Sterben. Support and contact: sterben@sterben.dev. Desktop app source and releases live on GitHub at HSterben/Proxy.',
  },
]

export const socialLinks = [
  { label: 'GitHub', href: 'https://github.com/HSterben/Proxy' },
  { label: 'LinkedIn', href: 'https://www.linkedin.com/in/hsterben/' },
]

/** Public GitHub repo used for desktop installs + auto-updates. */
export const DESKTOP_GITHUB_REPO = 'HSterben/proxy'

/**
 * Exact installer filename attached to the latest GitHub release.
 * Update this when the published asset name changes (Forge includes the version).
 * Direct download URL pattern:
 *   https://github.com/<owner>/<repo>/releases/latest/download/<filename>
 */
export const DESKTOP_INSTALLER_FILENAME = 'PROXY-Windows-Setup.exe'

/** Prefer a stable DMG name when publishing Mac builds (rename in the release if Forge versions it). */
export const DESKTOP_MAC_INSTALLER_FILENAME = 'PROXY-macOS.dmg'

/** Starts a download of the newest Windows installer from GitHub Releases. */
export const DESKTOP_DOWNLOAD_URL =
  `https://github.com/${DESKTOP_GITHUB_REPO}/releases/latest/download/${DESKTOP_INSTALLER_FILENAME}`

/** Starts a download of the newest Mac DMG from GitHub Releases. */
export const DESKTOP_MAC_DOWNLOAD_URL =
  `https://github.com/${DESKTOP_GITHUB_REPO}/releases/latest/download/${DESKTOP_MAC_INSTALLER_FILENAME}`

/** Release notes / assets list (not a direct file download). */
export const DESKTOP_RELEASES_URL =
  `https://github.com/${DESKTOP_GITHUB_REPO}/releases/latest`
