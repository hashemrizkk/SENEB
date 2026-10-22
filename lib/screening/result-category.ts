export type TestType="hba1c"|"fasting_glucose";
export type TestUnit="percent"|"mg_dl"|"mmol_l";
type Ranges={within_expected_range:{max_exclusive:number};prediabetes_range:{min_inclusive:number;max_inclusive:number};diabetes_range:{min_inclusive:number;max:number}};
type Bounds={min:number;max:number;confirm_below:number;confirm_above:number};
export type ResultConfig={hba1c:{percent:Ranges};fasting_glucose:{mg_dl:Ranges;mmol_l:Ranges};entry_validation:{hba1c:{percent:Bounds};fasting_glucose:{mg_dl:Bounds;mmol_l:Bounds}}};
export type CategorizedResult={category:"within_expected_range"|"prediabetes_range"|"diabetes_range";requiresConfirmation:boolean};
export function categorizeLabResult(input:{testType:TestType;value:number;unit:TestUnit},config:ResultConfig):CategorizedResult{
  if(!Number.isFinite(input.value))throw new RangeError("Result value must be a finite number.");
  if((input.testType==="hba1c"&&input.unit!=="percent")||(input.testType==="fasting_glucose"&&input.unit==="percent"))throw new RangeError("Unit does not match the selected test; conversion is not automatic.");
  const validation=input.testType==="hba1c"?config.entry_validation.hba1c.percent:config.entry_validation.fasting_glucose[input.unit as "mg_dl"|"mmol_l"];
  if(input.value<validation.min||input.value>validation.max)throw new RangeError("Result is outside the supported entry bounds.");
  const ranges=input.testType==="hba1c"?config.hba1c.percent:config.fasting_glucose[input.unit as "mg_dl"|"mmol_l"];
  const category=input.value<ranges.within_expected_range.max_exclusive?"within_expected_range":input.value<=ranges.prediabetes_range.max_inclusive?"prediabetes_range":"diabetes_range";
  return {category,requiresConfirmation:input.value<validation.confirm_below||input.value>validation.confirm_above};
}
