import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  Download,
  HandHeart,
  Heart,
  Mail,
  MapPin,
  Mic,
  Pause,
  PencilLine,
  Play,
  ShieldCheck,
  Sprout,
  Video,
  type LucideProps,
} from "lucide-react";

// Keep imports explicit so the rest of the Lucide catalog stays out of the app.
const iconComponents = {
  conversation: Mic,
  collection: BookOpen,
  postcard: Mail,
  video: Video,
  pause: Pause,
  play: Play,
  check: Check,
  arrowRight: ArrowRight,
  arrowUpRight: ArrowUpRight,
  shield: ShieldCheck,
  edit: PencilLine,
  download: Download,
  heart: Heart,
  handHeart: HandHeart,
  sprout: Sprout,
  address: MapPin,
} as const;

export type AppIconName = keyof typeof iconComponents;

export type AppIconProps = Omit<
  LucideProps,
  | "name"
  | "children"
  | "role"
  | "aria-hidden"
  | "aria-label"
  | "aria-labelledby"
> & {
  name: AppIconName;
  /** Name a meaningful standalone icon. Label the button for icon-only actions. */
  label?: string;
  title?: string;
};

/** Shared interface icons. The Time Tapestry brand mark remains separate. */
export function AppIcon({
  name,
  label,
  title,
  size = 24,
  strokeWidth = 1.75,
  className = "",
  ...props
}: AppIconProps) {
  const Icon = iconComponents[name];
  const accessibleLabel = label || title;

  return (
    <Icon
      {...props}
      size={size}
      strokeWidth={strokeWidth}
      className={`shrink-0 ${className}`}
      focusable="false"
      role={accessibleLabel ? "img" : undefined}
      aria-label={accessibleLabel}
      aria-hidden={accessibleLabel ? undefined : true}
    >
      {title ? <title>{title}</title> : undefined}
    </Icon>
  );
}
