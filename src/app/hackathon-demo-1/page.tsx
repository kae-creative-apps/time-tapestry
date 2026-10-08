import {
  HackathonDemoPage,
  hackathonDemoMetadata,
} from "@/components/hackathon/HackathonDemoPage";

export const metadata = hackathonDemoMetadata(1);

export default function Page() {
  return <HackathonDemoPage number={1} />;
}
