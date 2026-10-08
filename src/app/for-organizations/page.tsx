import type { Metadata } from "next";
import { BrandArtwork } from "@/components/BrandArtwork";
import { BrandPattern } from "@/components/BrandPattern";
import { AppIcon } from "@/components/icons";
import { OrganizationSetup } from "@/components/organizations/OrganizationSetup";
import { OrganizationShell } from "@/components/organizations/shared";

const title = "Start a donor legacy pilot | Time Tapestry";
const description =
  "Bring Time Tapestry to your major donors. Ministries, nonprofits, foundations, and advancement teams can invite donors to pass the story of their generosity to their children and grandchildren.";

export const metadata: Metadata = {
  title,
  description,
  openGraph: {
    title,
    description,
    url: "https://timetapestry.app/for-organizations",
  },
};

export default function ForOrganizations() {
  return (
    <OrganizationShell>
      <main className="mx-auto max-w-6xl px-5 pb-8 pt-5 sm:px-8 sm:pt-10">
        <div className="grid items-start gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:gap-12">
          <div>
            <div className="brand-gradient-chocolate relative isolate overflow-hidden rounded-[28px] px-7 py-9 text-white sm:px-9 sm:py-11">
              <BrandPattern
                variant="ribbon"
                className="absolute -bottom-8 -right-32 -z-10 w-[560px] max-w-none text-white opacity-[0.07]"
              />
              <BrandArtwork
                variant="mark"
                className="mb-10 h-16 w-16 text-white"
              />
              <p className="brand-eyebrow mb-5 text-paper">
                For organizations
              </p>
              <h1 className="max-w-xl font-display text-4xl font-medium leading-[1.12] tracking-[-.035em] sm:text-5xl">
                Offer your donors a way to pass their generosity on.
              </h1>
              <p className="mt-6 text-lg leading-8 text-paper">
                Ministries, nonprofits, foundations, and advancement teams
                invite major donors to tell why they give — the joy, the faith,
                the lives changed — for their children and grandchildren.
              </p>
              <p className="mt-6 text-base font-medium">
                Free during the pilot. Donors are never asked about gift size.
              </p>
            </div>
            <ol className="mt-7 space-y-6 px-2">
              {[
                {
                  title: "Open a pilot for your donors.",
                  text: "Choose up to 100 invitations and save your private management link.",
                  icon: "handHeart" as const,
                },
                {
                  title: "Invite each donor by name.",
                  text: "Add their name and email, then copy their invitation and send it yourself.",
                  icon: "postcard" as const,
                },
                {
                  title: "They record it for their family.",
                  text: "A donor chooses a child or grandchild and tells the story of their generosity. You can follow progress. The recordings stay private.",
                  icon: "collection" as const,
                },
              ].map((step, index) => (
                <li key={step.title} className="flex gap-4">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-sage-100 text-sage-700">
                    <AppIcon name={step.icon} size={22} />
                  </span>
                  <div>
                    <h2 className="text-lg font-semibold">
                      <span className="sr-only">Step {index + 1}. </span>
                      {step.title}
                    </h2>
                    <p className="mt-1 text-base leading-7 text-ink-500">
                      {step.text}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <OrganizationSetup />
        </div>
      </main>
    </OrganizationShell>
  );
}
