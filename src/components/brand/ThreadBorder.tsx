import styles from "./brand-motion.module.css";

/**
 * Adapted from MagicUI Shine Border, supplied through 21st.dev.
 * Keeps its masked border technique, with a single brand-color pass.
 * Source: https://magicui.design/docs/components/shine-border
 */
export const threadBorderClassName = styles.threadBorderHost;

/** Add only to the interview preview button. The host keeps its own focus ring. */
export function ThreadBorder() {
  return <span aria-hidden="true" className={styles.threadBorder} />;
}
