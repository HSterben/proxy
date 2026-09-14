import { Check } from 'lucide-react'
import { pricingPlans } from '../../data/content'
import Button from '../ui/Button'
import Reveal from '../ui/Reveal'

export default function Pricing() {
  const [free, pro, yearly] = pricingPlans

  return (
    <section id="pricing" className="bg-canvas py-20 text-ink md:py-24">
      <div className="page">
        <Reveal className="mb-10 max-w-xl">
          <p className="eyebrow">Pricing</p>
          <h2 className="display mt-3 font-semibold">Plans for web and Windows chat</h2>
        </Reveal>

        <div className="grid gap-4 lg:grid-cols-3">
          <Reveal>
            <PlanCard plan={free} />
          </Reveal>
          <Reveal delay={50}>
            <PlanCard plan={pro} featured />
          </Reveal>
          <Reveal delay={90}>
            <PlanCard plan={yearly} />
          </Reveal>
        </div>
      </div>
    </section>
  )
}

function PlanCard({
  plan,
  featured = false,
}: {
  plan: (typeof pricingPlans)[number]
  featured?: boolean
}) {
  return (
    <div
      className={`flex h-full flex-col rounded-[16px] p-7 md:p-8 ${
        featured
          ? 'card-dark ring-1 ring-white/10'
          : 'card'
      }`}
    >
      {plan.badge && (
        <span
          className={`mb-4 w-fit rounded-[8px] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] ${
            featured ? 'bg-signal text-white' : 'bg-brand-surface text-ink'
          }`}
        >
          {plan.badge}
        </span>
      )}
      <h3 className="text-xl font-semibold tracking-[-0.02em] md:text-[22px]">{plan.name}</h3>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="display text-[2rem] font-semibold leading-none tracking-[-0.03em]">{plan.price}</span>
        {plan.period && (
          <span className={`text-base ${featured ? 'text-white/48' : 'text-ink/42'}`}>
            {plan.period}
          </span>
        )}
      </div>
      <p className={`mt-3 text-base leading-relaxed ${featured ? 'text-white/58' : 'text-ink/55'}`}>
        {plan.description}
      </p>
      <div className="mt-6">
        <Button
          href={plan.href}
          variant={featured ? 'primary-light' : 'outline-dark'}
          className="w-full justify-center"
        >
          {plan.cta}
        </Button>
      </div>
      <ul className={`mt-8 space-y-3 border-t pt-6 ${featured ? 'border-white/10' : 'border-hairline'}`}>
        {plan.features.map((feature) => (
          <li
            key={feature}
            className={`flex items-start gap-3 text-base ${
              featured ? 'text-white/78' : 'text-ink/58'
            }`}
          >
            <Check className={`mt-1 h-4 w-4 shrink-0 ${featured ? 'text-signal' : 'text-ink'}`} strokeWidth={1.5} />
            {feature}
          </li>
        ))}
      </ul>
    </div>
  )
}
