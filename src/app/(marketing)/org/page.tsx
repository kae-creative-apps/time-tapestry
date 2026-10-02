'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';

const tiers = [
  { count: 10, total: 1300, each: 130 },
  { count: 25, total: 3000, each: 120 },
  { count: 50, total: 5500, each: 110 },
  { count: 100, total: 10000, each: 100 }
];

export default function OrgPage() {
  const [orgName, setOrgName] = useState('');
  const [code, setCode] = useState('');
  const [emails, setEmails] = useState('');
  const [generated, setGenerated] = useState(false);
  const [pilotSubmitted, setPilotSubmitted] = useState(false);
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [experienceCount, setExperienceCount] = useState('');
  const [donorProgram, setDonorProgram] = useState('');

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/org/codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orgName })
    });
    const data = await res.json();
    if (data.code) {
      setCode(data.code);
      setGenerated(true);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/org/codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, emails: emails.split(/\n|,/).map((e) => e.trim()).filter(Boolean) })
    });
    alert('Invitations prepared (mock mode logs to console).');
  };

  const handlePilot = async (e: React.FormEvent) => {
    e.preventDefault();
    await fetch('/api/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: contactEmail,
        subject: 'Pilot request',
        text: `${contactName} at ${orgName} is interested in ${experienceCount} experiences. ${donorProgram}`
      })
    });
    setPilotSubmitted(true);
  };

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">
      <Card className="mb-8">
          <h1 className="mb-4 font-serif text-3xl text-ink">For nonprofits and donor programs</h1>
          <p className="mb-4 text-ink-500">
            Help your donors preserve and pass on their legacy of faith, family, and generosity.
          </p>
          <p className="text-ink-500">
            A premium experience for the people who have given the most to your mission.
          </p>
        </Card>

        <Card className="mb-8">
          <h2 className="mb-6 font-serif text-2xl text-ink">How it works for your nonprofit</h2>
          <ol className="space-y-6">
            <li className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-oxblood font-serif text-paper">
                1
              </span>
              <div>
                <h3 className="font-serif text-xl text-ink">You purchase a pack</h3>
                <p className="text-ink-500">Choose how many donor experiences you need: 10, 25, 50, or 100.</p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-oxblood font-serif text-paper">
                2
              </span>
              <div>
                <h3 className="font-serif text-xl text-ink">You distribute invite links</h3>
                <p className="text-ink-500">Send them to your top donors, or include them in a stewardship packet.</p>
              </div>
            </li>
            <li className="flex gap-4">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-oxblood font-serif text-paper">
                3
              </span>
              <div>
                <h3 className="font-serif text-xl text-ink">You see the impact, not the stories</h3>
                <p className="text-ink-500">Aggregate engagement dashboard. Never personal data.</p>
              </div>
            </li>
          </ol>
        </Card>

        <Card className="mb-8">
          <h2 className="mb-6 font-serif text-2xl text-ink">Pricing</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left font-sans">
              <thead>
                <tr className="border-b border-warmgray-300">
                  <th className="pb-3 font-sans text-sm text-ink-500">Experiences</th>
                  <th className="pb-3 font-sans text-sm text-ink-500">Total</th>
                  <th className="pb-3 font-sans text-sm text-ink-500">Per experience</th>
                </tr>
              </thead>
              <tbody>
                {tiers.map((tier) => (
                  <tr key={tier.count} className="border-b border-warmgray-200 last:border-0">
                    <td className="py-4 text-ink">{tier.count}</td>
                    <td className="py-4 text-ink">${tier.total.toLocaleString()}</td>
                    <td className="py-4 text-ink">${tier.each}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-4 text-sm text-ink-400">
            Pricing is hypothetical. Actual pricing set after pilot.
          </p>
        </Card>

        <Card className="mb-8">
          <h2 className="mb-6 font-serif text-2xl text-ink">Request a pilot</h2>
          {pilotSubmitted ? (
            <p className="text-ink-500">Thank you. We will be in touch soon.</p>
          ) : (
            <form onSubmit={handlePilot} className="space-y-5">
              <div>
                <label htmlFor="orgName" className="mb-1 block font-sans text-sm text-ink-500">
                  Nonprofit name
                </label>
                <input
                  id="orgName"
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-2">
                <div>
                  <label htmlFor="contactName" className="mb-1 block font-sans text-sm text-ink-500">
                    Contact name
                  </label>
                  <input
                    id="contactName"
                    type="text"
                    required
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
                  />
                </div>
                <div>
                  <label htmlFor="contactEmail" className="mb-1 block font-sans text-sm text-ink-500">
                    Contact email
                  </label>
                  <input
                    id="contactEmail"
                    type="email"
                    required
                    value={contactEmail}
                    onChange={(e) => setContactEmail(e.target.value)}
                    className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="experienceCount" className="mb-1 block font-sans text-sm text-ink-500">
                  Number of experiences interested in
                </label>
                <select
                  id="experienceCount"
                  required
                  value={experienceCount}
                  onChange={(e) => setExperienceCount(e.target.value)}
                  className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
                >
                  <option value="">Select a pack size</option>
                  {tiers.map((tier) => (
                    <option key={tier.count} value={tier.count}>
                      {tier.count} experiences
                    </option>
                  ))}
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label htmlFor="donorProgram" className="mb-1 block font-sans text-sm text-ink-500">
                  Tell us about your donor program
                </label>
                <textarea
                  id="donorProgram"
                  rows={4}
                  value={donorProgram}
                  onChange={(e) => setDonorProgram(e.target.value)}
                  className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
                />
              </div>
              <Button type="submit" className="w-full">
                Request a pilot
              </Button>
            </form>
          )}
        </Card>

        <Card className="mb-8">
          <h2 className="mb-4 font-serif text-xl text-ink">Generate a sponsor code</h2>
          {!generated ? (
            <form onSubmit={handleGenerate} className="space-y-5">
              <div>
                <label htmlFor="codeOrgName" className="mb-1 block font-sans text-sm text-ink-500">
                  Organization name
                </label>
                <input
                  id="codeOrgName"
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
                />
              </div>
              <Button type="submit" className="w-full">
                Generate code
              </Button>
            </form>
          ) : (
            <div>
              <p className="mb-2 font-sans text-sm text-ink-500">Sponsor code</p>
              <p className="mb-6 rounded-sm bg-paper-200 p-4 font-serif text-2xl text-ink">
                {code}
              </p>
              <form onSubmit={handleUpload} className="space-y-5">
                <div>
                  <label htmlFor="emails" className="mb-1 block font-sans text-sm text-ink-500">
                    Participant emails (one per line or comma-separated)
                  </label>
                  <textarea
                    id="emails"
                    rows={5}
                    value={emails}
                    onChange={(e) => setEmails(e.target.value)}
                    className="w-full rounded-sm border border-warmgray-300 bg-paper-50 p-4 font-sans text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-oxblood"
                  />
                </div>
                <Button type="submit" className="w-full">
                  Prepare invitations
                </Button>
              </form>
            </div>
          )}
        </Card>

        <div className="text-center">
          <Link href="/privacy" className="font-sans text-sm text-oxblood hover:underline">
            Read our privacy promise
          </Link>
        </div>
      </main>
    );
  }
