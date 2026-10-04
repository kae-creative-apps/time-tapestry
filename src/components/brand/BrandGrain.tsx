import styles from "./brand-motion.module.css";

/**
 * Static CSS adaptation of the 21st.dev Almoayyed Gradient Builder recipe.
 * Source: https://21st.dev/community/gradients/editor?from=dc893a4f-0b29-4732-9b29-d4de9c0b70ee
 * One tiled SVG texture, no canvas, animation loop or duplicate grain pass.
 */
export function BrandGrain({
  tone = "paper",
  className = "",
}: {
  tone?: "paper" | "espresso" | "sage" | "clay";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.grain} ${className}`}
      data-tone={tone}
    />
  );
}
