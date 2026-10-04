import CollectionScreen from "@/components/CollectionScreen";

export const metadata = { title: "Your collection — Curio" };

/** Favourites live in the browser (synced to the account when signed in),
 * so this page needs no session and prerenders as static. */
export default function CollectionPage() {
  return <CollectionScreen />;
}
