import { useState, type FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Mail, Monitor, Globe } from 'lucide-react'
import Reveal from '../components/ui/Reveal'
import Button from '../components/ui/Button'
import { SITE_LINKS } from '../lib/site'

const TOPICS = [
  'PROXY Web',
  'Windows app',
  'Billing',
  'Account help',
  'Something else',
] as const

const ease = [0.22, 1, 0.36, 1] as const

type FormState = {
  name: string
  email: string
  projectType: string
  message: string
}

const initial: FormState = {
  name: '',
  email: '',
  projectType: '',
  message: '',
}

type Status = 'idle' | 'submitting' | 'success' | 'error' | 'rate-limited'

const inputClass =
  'w-full min-h-11 rounded-[10px] border border-hairline bg-white px-4 py-3 text-base outline-none transition-colors duration-200 focus:border-ink'

export default function Contact() {
  const [form, setForm] = useState<FormState>(initial)
  const [status, setStatus] = useState<Status>('idle')

  const update = (field: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (status === 'submitting') return
    setStatus('submitting')

    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (res.status === 429) {
        setStatus('rate-limited')
        return
      }

      if (!res.ok) throw new Error('Send failed')

      setStatus('success')
      setForm(initial)
    } catch {
      setStatus('error')
    }
  }

  return (
    <>
      <section data-nav-tone="dark" className="bg-graphite pb-12 pt-28 text-white">
        <div className="page">
          <Reveal className="card max-w-2xl p-8 text-ink md:p-12">
            <p className="eyebrow">Contact</p>
            <h1 className="display mt-4 font-semibold">Contact PROXY</h1>
            <p className="mt-4 max-w-[42ch] text-lg text-ink/55">
              Questions about the Windows app, PROXY Web, or Pro and Yearly billing go here.
            </p>
          </Reveal>
        </div>
      </section>

      <section className="bg-canvas pb-20 pt-10 text-ink">
        <div className="page grid gap-10 lg:grid-cols-5 lg:gap-12">
          <Reveal className="lg:col-span-2">
            <div className="space-y-6">
              {[
                { icon: Globe, label: 'PROXY Web', value: 'Open chat at /app after you sign in' },
                { icon: Monitor, label: 'Windows app', value: 'Installer on GitHub Releases' },
                { icon: Mail, label: 'Email', value: SITE_LINKS.email },
              ].map(({ icon: Icon, label, value }) => (
                <div key={label} className="flex items-start gap-4">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[10px] border border-hairline bg-white">
                    <Icon className="h-5 w-5 text-signal" strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="text-base font-medium">{label}</p>
                    {label === 'Email' ? (
                      <a
                        href={`mailto:${SITE_LINKS.email}`}
                        className="text-base text-ink/55 underline-offset-2 hover:text-ink hover:underline"
                      >
                        {value}
                      </a>
                    ) : (
                      <p className="text-base text-ink/55">{value}</p>
                    )}
                  </div>
                </div>
              ))}
              <div className="flex flex-wrap gap-4 pt-2">
                <a
                  href={SITE_LINKS.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base text-ink/55 underline-offset-2 hover:text-ink hover:underline"
                >
                  GitHub ↗
                </a>
                <a
                  href={SITE_LINKS.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base text-ink/55 underline-offset-2 hover:text-ink hover:underline"
                >
                  LinkedIn ↗
                </a>
              </div>
            </div>
          </Reveal>

          <Reveal delay={100} className="lg:col-span-3">
            {status === 'success' ? (
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, ease }}
                className="card p-8 text-center md:p-10"
              >
                <p className="eyebrow">Sent</p>
                <h2 className="mt-3 text-xl font-semibold">Message sent.</h2>
                <p className="mt-2 text-base text-ink/55">I&apos;ll reply by email.</p>
                <button
                  type="button"
                  onClick={() => setStatus('idle')}
                  className="pressable mt-8 inline-flex min-h-11 items-center rounded-[10px] border border-hairline px-5 text-base font-medium text-ink/75 hover:border-ink/30 hover:text-ink"
                >
                  Send another message
                </button>
              </motion.div>
            ) : (
              <form onSubmit={(e) => void handleSubmit(e)} className="card p-6 md:p-8">
                <p className="mb-6 text-base text-ink/55">
                  Prefer email? Write to{' '}
                  <a
                    href={`mailto:${SITE_LINKS.email}`}
                    className="font-medium text-ink underline-offset-2 hover:underline"
                  >
                    {SITE_LINKS.email}
                  </a>
                  . It goes to the same inbox.
                </p>

                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label htmlFor="name" className="mb-1.5 block text-base font-medium">
                      Name
                    </label>
                    <input
                      id="name"
                      name="name"
                      required
                      autoComplete="name"
                      value={form.name}
                      onChange={(e) => update('name', e.target.value)}
                      className={inputClass}
                      placeholder="Your name"
                    />
                  </div>
                  <div>
                    <label htmlFor="email" className="mb-1.5 block text-base font-medium">
                      Email
                    </label>
                    <input
                      id="email"
                      name="email"
                      type="email"
                      required
                      autoComplete="email"
                      value={form.email}
                      onChange={(e) => update('email', e.target.value)}
                      className={inputClass}
                      placeholder="you@email.com"
                    />
                  </div>
                </div>

                <fieldset className="mt-5">
                  <legend className="mb-2 text-base font-medium">
                    Topic <span className="font-normal text-ink/40">optional</span>
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {TOPICS.map((type) => {
                      const active = form.projectType === type
                      return (
                        <button
                          key={type}
                          type="button"
                          aria-pressed={active}
                          onClick={() => update('projectType', active ? '' : type)}
                          className={`pressable rounded-[10px] border px-3 py-2 text-[14px] transition-colors ${
                            active
                              ? 'border-black bg-black text-white'
                              : 'border-hairline bg-white text-ink/70 hover:border-ink/30 hover:text-ink'
                          }`}
                        >
                          {type}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>

                <div className="mt-5">
                  <label htmlFor="message" className="mb-1.5 block text-base font-medium">
                    Message
                  </label>
                  <textarea
                    id="message"
                    name="message"
                    required
                    rows={6}
                    value={form.message}
                    onChange={(e) => update('message', e.target.value)}
                    className={`${inputClass} resize-y`}
                    placeholder="What you need help with, plus any account email or links."
                  />
                </div>

                <div className="mt-6">
                  <Button
                    type="submit"
                    icon
                    variant="primary"
                    className="w-full sm:w-auto disabled:opacity-60"
                  >
                    {status === 'submitting' ? 'Sending…' : 'Send message'}
                  </Button>
                </div>

                {status === 'error' && (
                  <p className="mt-4 text-base text-red-700" role="alert">
                    Something went wrong. Try again or email{' '}
                    <a href={`mailto:${SITE_LINKS.email}`} className="underline">
                      {SITE_LINKS.email}
                    </a>
                    .
                  </p>
                )}

                {status === 'rate-limited' && (
                  <p className="mt-4 text-base text-red-700" role="alert">
                    Too many messages sent recently. Wait an hour or email{' '}
                    <a href={`mailto:${SITE_LINKS.email}`} className="underline">
                      {SITE_LINKS.email}
                    </a>{' '}
                    directly.
                  </p>
                )}
              </form>
            )}
          </Reveal>
        </div>
      </section>
    </>
  )
}
