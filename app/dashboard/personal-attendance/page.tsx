import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { PersonalAttendanceClient } from "@/components/employees/personal-attendance-client";

export default async function PersonalAttendancePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  return (
    <div className="max-w-3xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Personal Attendance</h1>
      <PersonalAttendanceClient />
    </div>
  );
}
