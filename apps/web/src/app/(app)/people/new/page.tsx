import { Card, CardContent } from "@/components/ui/card";
import { PageHeader } from "@/components/page-header";
import { PersonForm } from "./person-form";

export default function NewPersonPage() {
  return (
    <>
      <PageHeader title="Add someone." aside="Start with a name, the rest can come later." />
      <Card className="max-w-2xl">
        <CardContent>
          <PersonForm />
        </CardContent>
      </Card>
    </>
  );
}
