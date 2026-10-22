export type ScreeningBand = "low" | "elevated" | "high";
type Option = { id: string; points: number };
type Item = { id: string; options: Option[]; raw_inputs?: string[]; derived_input?: Record<string, unknown> };
export type InstrumentConfig = {
  items: Item[];
  bands: { id: string; min: number; max: number }[];
  product_band_map: Record<ScreeningBand, string[]>;
  total_min: number;
  total_max: number;
};
export type ScreeningAnswers = Record<string, unknown>;
export type Assessment = {
  total: number;
  band: ScreeningBand;
  breakdown: { item_id: string; option_id: string; points: number }[];
  symptom_modifier_triggered: boolean;
};

function optionFor(item: Item, optionId: string): Option {
  const option = item.options.find((candidate) => candidate.id === optionId);
  if (!option) throw new RangeError(`Invalid answer for ${item.id}.`);
  return option;
}

export function deriveOptionId(item:Item,input:Record<string,unknown>,sex?:unknown):string {
  const derivation=item.derived_input as {kind?:string;height_cm?:{min:number;max:number};weight_kg?:{min:number;max:number};waist_cm?:{min:number;max:number};categories?:unknown} | undefined;
  if(!derivation)throw new RangeError(`No derivation is configured for ${item.id}.`);
  if(derivation.kind==="bmi"){
    const height=input.height_cm,weight=input.weight_kg;
    if(typeof height!=="number"||!Number.isFinite(height)||height<Number(derivation.height_cm?.min)||height>Number(derivation.height_cm?.max)||typeof weight!=="number"||!Number.isFinite(weight)||weight<Number(derivation.weight_kg?.min)||weight>Number(derivation.weight_kg?.max))throw new RangeError("Enter a valid height and weight.");
    const bmi=weight/((height/100)**2);const groups=derivation.categories as {id:string;min_inclusive?:number;max_exclusive?:number}[];
    const group=groups.find((candidate)=>(candidate.min_inclusive===undefined||bmi>=candidate.min_inclusive)&&(candidate.max_exclusive===undefined||bmi<candidate.max_exclusive));if(!group)throw new RangeError("BMI could not be categorized from these measurements.");return group.id;
  }
  if(derivation.kind==="waist"){
    const waist=input.waist_cm;if(typeof waist!=="number"||!Number.isFinite(waist)||waist<Number(derivation.waist_cm?.min)||waist>Number(derivation.waist_cm?.max))throw new RangeError("Enter a valid waist measurement.");
    if(sex!=="male"&&sex!=="female")throw new RangeError("Choose a sex category before entering waist circumference.");
    const groups=(derivation.categories as Record<string,{id:string;min_inclusive?:number;max_inclusive?:number;min_exclusive?:number;max_exclusive?:number}[]>)[sex];
    const group=groups.find((candidate)=>(candidate.min_inclusive===undefined||waist>=candidate.min_inclusive)&&(candidate.max_inclusive===undefined||waist<=candidate.max_inclusive)&&(candidate.min_exclusive===undefined||waist>candidate.min_exclusive)&&(candidate.max_exclusive===undefined||waist<candidate.max_exclusive));if(!group)throw new RangeError("Waist measurement could not be categorized.");return group.id;
  }
  throw new RangeError(`Unsupported derivation for ${item.id}.`);
}

export function scoreAssessment(
  answers: ScreeningAnswers,
  config: InstrumentConfig,
  symptomModifierTriggered: boolean,
): Assessment {
  if (!answers || typeof answers !== "object" || Array.isArray(answers)) throw new TypeError("Answers must be an object.");
  const expected = new Set(config.items.map((item) => item.id));
  const allowedAnswers = new Set([...expected, "height_cm", "weight_kg", "waist_cm"]);
  for (const key of Object.keys(answers)) if (!allowedAnswers.has(key)) throw new RangeError(`Unexpected answer: ${key}.`);
  const breakdown: Assessment["breakdown"] = [];
  for (const item of config.items) {
    let optionId: unknown = answers[item.id];
    if ((item.id === "bmi" || item.id === "waist") && typeof optionId !== "string") optionId=deriveOptionId(item,answers,answers.sex);
    if (typeof optionId !== "string") throw new RangeError(`An answer is required for ${item.id}.`);
    const option = optionFor(item, optionId);
    breakdown.push({ item_id: item.id, option_id: option.id, points: option.points });
  }
  const total = breakdown.reduce((sum, item) => sum + item.points, 0);
  if (total < config.total_min || total > config.total_max) throw new RangeError("Assessment total is outside the instrument range.");
  const sourceBand = config.bands.find((band) => total >= band.min && total <= band.max);
  if (!sourceBand) throw new RangeError("No risk band matches this assessment.");
  const band = (Object.entries(config.product_band_map).find(([, sourceIds]) => sourceIds.includes(sourceBand.id))?.[0]) as ScreeningBand | undefined;
  if (!band) throw new RangeError("No product band maps to this score.");
  return { total, band, breakdown, symptom_modifier_triggered: symptomModifierTriggered };
}

export function minimumAndMaximumPossible(config: InstrumentConfig): { min: number; max: number } {
  const points = config.items.filter((item) => item.id !== "sex").map((item) => item.options.map((option) => option.points));
  return { min: points.reduce((sum, values) => sum + Math.min(...values), 0), max: points.reduce((sum, values) => sum + Math.max(...values), 0) };
}
