import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { PersonForm } from "./person-form";

export default function NewPersonPage() {
  return (
    <>
      <PageHeader eyebrow="People" title="Add someone" description="Start with a name. Everything else can come later." />
      <Card className="max-w-2xl">
        <CardContent>
          <PersonForm />
        </CardContent>
      </Card>
    </>
  );
}
