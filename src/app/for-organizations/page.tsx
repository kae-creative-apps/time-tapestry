import type { Metadata } from "next";
import { BrandArtwork } from "@/components/BrandArtwork";
import { BrandPattern } from "@/components/BrandPattern";
import { AppIcon } from "@/components/icons";
import { OrganizationSetup } from "@/components/organizations/OrganizationSetup";
import { OrganizationShell } from "@/components/organizations/shared";

export const metadata: Metadata = {
  title: "Free group gifting | Time Tapestry",
  description:
    "Invite people in your church or organization to share their stories with someone they love. Create a free group in the Time Tapestry pilot.",
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
                For churches and organizations
              </p>
              <h1 className="max-w-xl font-display text-4xl font-medium leading-[1.12] tracking-[-.035em] sm:text-5xl">
                Give your community a reason to share their stories.
              </h1>
              <p className="mt-6 text-lg leading-8 text-paper">
                Invite members, donors and neighbors to pass on the faith,
                generosity and everyday moments that shaped their lives.
              </p>
              <p className="mt-6 text-base font-medium">
                Free during the pilot. No checkout.
              </p>
            </div>
            <ol className="mt-7 space-y-6 px-2">
              {[
                {
                  title: "Make room for your group.",
                  text: "Choose up to 100 free gifts and save your private management link.",
                  icon: "handHeart" as const,
                },
                {
                  title: "Share a personal invitation.",
                  text: "Add each storyteller’s name and email, then copy their gift link and send it yourself.",
                  icon: "postcard" as const,
                },
                {
                  title: "Let each person make it theirs.",
                  text: "They choose a recipient and begin collecting their stories and videos. You can see which gifts have been started.",
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
