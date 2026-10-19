import { PersonForm } from "./person-form";

export default function NewPersonPage() {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Add a person</h1>
      <PersonForm />
    </div>
  );
}
