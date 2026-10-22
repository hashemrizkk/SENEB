import type Database from "better-sqlite3";

export const narrativeDemoStories = {
  urgentText: "أنا عندي ألم في الصدر من الصبح وعايز أراجع الفريق الطبي.",
  surveyEmail: "demo-survey@example.invalid",
  followupPlan: "خطة متابعة تجريبية راجعها فريق العيادة مع المريض.",
} as const;

const patients = [
  { name: "أحمد تجريبي", age: 42, diabetesType: "type2", hba1cDaysAgo: 60, footDaysAgo: 100, bpDaysAgo: null, nextVisitDaysFromNow: -10 },
  { name: "منى تجريبية", age: 55, diabetesType: "type2", hba1cDaysAgo: 90, footDaysAgo: 120, bpDaysAgo: 30, nextVisitDaysFromNow: -20 },
  { name: "محمود تجريبي", age: 37, diabetesType: "type1", hba1cDaysAgo: 120, footDaysAgo: 180, bpDaysAgo: 30, nextVisitDaysFromNow: -5 },
  { name: "سارة تجريبية", age: 63, diabetesType: "type2", hba1cDaysAgo: 60, footDaysAgo: 200, bpDaysAgo: 45, nextVisitDaysFromNow: -1 },
  { name: "يوسف تجريبي", age: 48, diabetesType: "type2", hba1cDaysAgo: 220, footDaysAgo: 200, bpDaysAgo: null, nextVisitDaysFromNow: 7 },
  { name: "نور تجريبية", age: 71, diabetesType: "type2", hba1cDaysAgo: 210, footDaysAgo: 180, bpDaysAgo: 60, nextVisitDaysFromNow: 14 },
  { name: "عمر تجريبي", age: 39, diabetesType: "type1", hba1cDaysAgo: 240, footDaysAgo: 250, bpDaysAgo: 20, nextVisitDaysFromNow: 21 },
  { name: "هدى تجريبية", age: 58, diabetesType: "type2", hba1cDaysAgo: 190, footDaysAgo: 100, bpDaysAgo: 90, nextVisitDaysFromNow: 30 },
  { name: "كريم تجريبي", age: 45, diabetesType: "type2", hba1cDaysAgo: 150, footDaysAgo: 400, bpDaysAgo: null, nextVisitDaysFromNow: 12 },
  { name: "ليلى تجريبية", age: 67, diabetesType: "type1", hba1cDaysAgo: 75, footDaysAgo: 500, bpDaysAgo: 15, nextVisitDaysFromNow: 18 },
  { name: "حسن تجريبي", age: 52, diabetesType: "type2", hba1cDaysAgo: 30, footDaysAgo: null, bpDaysAgo: 35, nextVisitDaysFromNow: 9 },
  { name: "ريم تجريبية", age: 74, diabetesType: "type2", hba1cDaysAgo: 100, footDaysAgo: 380, bpDaysAgo: 25, nextVisitDaysFromNow: 25 },
  { name: "زياد تجريبي", age: 35, diabetesType: "type2", hba1cDaysAgo: 60, footDaysAgo: 120, bpDaysAgo: 10, nextVisitDaysFromNow: 30 },
  { name: "داليا تجريبية", age: 60, diabetesType: "type2", hba1cDaysAgo: 45, footDaysAgo: 90, bpDaysAgo: 12, nextVisitDaysFromNow: 45 },
  { name: "إياد تجريبي", age: 43, diabetesType: "type2", hba1cDaysAgo: 70, footDaysAgo: 150, bpDaysAgo: 18, nextVisitDaysFromNow: 60 },
] as const;

function dateRelativeToToday(daysFromToday: number): string {
  const today = new Date();
  return new Date(
    Date.UTC(
      today.getUTCFullYear(),
      today.getUTCMonth(),
      today.getUTCDate() + daysFromToday,
    ),
  )
    .toISOString()
    .slice(0, 10);
}

export function seedPatients(db: Database.Database): void {
  const insertPatient = db.prepare(
    `INSERT INTO patients (
      name, age, phone, diabetes_type, last_hba1c_date,
      last_foot_exam_date, last_bp_date, next_visit_date
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  const insertPatients = db.transaction(() => {
    patients.forEach((patient, index) => {
      insertPatient.run(
        patient.name,
        patient.age,
        `01000000${String(index + 1).padStart(2, "0")}`,
        patient.diabetesType,
        dateRelativeToToday(-patient.hba1cDaysAgo),
        patient.footDaysAgo === null
          ? null
          : dateRelativeToToday(-patient.footDaysAgo),
        patient.bpDaysAgo === null
          ? null
          : dateRelativeToToday(-patient.bpDaysAgo),
        dateRelativeToToday(patient.nextVisitDaysFromNow),
      );
    });
  });

  insertPatients();
}
