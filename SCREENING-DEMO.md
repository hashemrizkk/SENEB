# Screening funnel demo script

**Persona 1 — anonymous participant:** “I’m an adult who wants to understand whether I should ask about a diabetes blood test. I open the screening page and read that it estimates risk but cannot diagnose. I agree to anonymous screening after seeing what the demo stores. Before any risk questions, I answer the safety gate. If I feel very unwell, the persistent link stops the flow and shows the fixed urgent-care guidance.”

“I answer the symptom questions and the FINDRISC items one at a time. My height, weight, and waist are used to calculate categories on the server and are not saved as measurements. The result page shows a band, not a probability, and explains that a blood test is the next step. I can view clearly labeled demo testing locations, print a referral summary, or enter a test result for clinician review. Any result I enter myself is marked unverified. If I want clinic staff to contact me, I give separate consent and share contact details.”

**Persona 2 — clinician:** “I sign in with a seeded demo account, open the clinical review queue, see the test value and unit as entered, its category, risk band, and whether it is unverified, then record a review outcome and note. With consented contact details, I can enter age and clinician-recorded diabetes type to create a new patient and blank intake in the existing doctor queue. These are synthetic records only. The funnel page shows completed assessments, self-reported tests, results routed for review, and entered-care totals.”

**Safety path:** “On a second run, I select a safety item at the first gate. The questionnaire stops, the escalation is recorded, and the fixed guidance asks me to seek urgent care and call my local emergency number. The only available next action is a logged start-over action.”

**Judge note:** all clinical content and configurations are placeholders. This is a workflow prototype, not a clinical service.
