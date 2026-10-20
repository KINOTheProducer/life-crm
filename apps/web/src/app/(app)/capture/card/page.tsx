import { CardScanner } from "@/components/capture/card-scanner";
import { PageHeader } from "@/components/page-header";

export default function CardScanPage() {
  return (
    <>
      <PageHeader
        title="Scan a card."
        aside="Front and back if there's anything on it."
        description="Take a photo, drop one in, or paste it. You'll check what was read before anything is saved. The photo itself isn't kept."
      />
      <CardScanner />
    </>
  );
}
