import { redirect } from "next/navigation";

// Keep the public demonstration aligned with the current four-card collection.
// The legacy demo showed five weekly cards and linked to a retired keepsake route.
export default function PostcardsDemoPage() {
  redirect("/#postcards");
}
