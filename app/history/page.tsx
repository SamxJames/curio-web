import HistoryList from "@/components/HistoryList";
import { getHistory } from "@/lib/words";

export const metadata = { title: "History — Curio" };

export default function HistoryPage() {
  const entries = getHistory();
  return <HistoryList entries={entries} />;
}
