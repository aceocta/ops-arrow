import { CalendarClock, Mail } from "lucide-react";
import { HELLO_EMAIL } from "../lib/links";
import Reveal from "./Reveal";

export default function Contact() {
  return (
    <section
      id="contact"
      aria-labelledby="contact-heading"
      className="relative overflow-hidden border-y border-slate-200/60 bg-slate-50/70 py-16 sm:py-24"
    >
      <div className="pointer-events-none absolute inset-0 bg-dots" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(40rem 26rem at 50% -10%, rgba(51,102,255,0.07), transparent 60%)",
        }}
        aria-hidden="true"
      />
      <div className="container-page relative">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="section-eyebrow justify-center">
            <span className="h-1 w-1 rounded-full bg-brand-500" aria-hidden="true" />
            Contact
          </p>
          <h2 id="contact-heading" className="section-title">
            Talk to a <span className="text-gradient">real person</span>
          </h2>
          <p className="section-subtitle">
            No call centres, no chatbots. Email us and you'll hear back from someone who actually built the
            product.
          </p>
        </Reveal>

        <div className="mx-auto mt-14 grid max-w-3xl gap-6 sm:grid-cols-2">
          <Reveal className="h-full">
            <div className="card card-hover flex h-full flex-col rounded-3xl p-7">
              <span className="icon-tile bg-gradient-to-br from-brand-500 to-brand-700">
                <Mail className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-bold tracking-tight text-slate-900">Talk to us</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Questions about modules, pricing or moving off paper? Drop us a line — we aim to reply within
                one working day.
              </p>
              <div className="mt-auto pt-6">
                <a href={`mailto:${HELLO_EMAIL}`} className="btn-ghost w-full">
                  Email {HELLO_EMAIL}
                </a>
              </div>
            </div>
          </Reveal>

          <Reveal delay={100} className="h-full">
            <div className="card card-hover flex h-full flex-col rounded-3xl p-7">
              <span className="icon-tile bg-gradient-to-br from-sky-500 to-brand-700">
                <CalendarClock className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-4 text-base font-bold tracking-tight text-slate-900">Book a walkthrough</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                Want to see it before you try it? Tell us a couple of times that suit you and we'll walk you
                through Ops Arrow on a call.
              </p>
              <div className="mt-auto pt-6">
                <a
                  href={`mailto:${HELLO_EMAIL}?subject=${encodeURIComponent("Walkthrough request")}`}
                  className="btn-primary w-full"
                >
                  Request a walkthrough
                </a>
              </div>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
