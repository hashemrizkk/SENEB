import { NextResponse } from "next/server";
import { z } from "zod";
import instrument from "@/data/screening/findrisc-0.2.json";
import symptomConfig from "@/data/screening/symptom-modifier.json";
import { getScreeningResponses, recordScreeningEvent, saveScreeningAnswers, scoringVersionById } from "@/lib/db";
import { deriveOptionId } from "@/lib/screening/score";
import { getSessionFromRequest } from "@/lib/screening/session-auth";
import { hasSameOrigin } from "@/lib/requestGuards";
const schema=z.object({question_id:z.string().min(1).max(80),option_id:z.string().min(1).max(80).optional(),height_cm:z.number().finite().optional(),weight_kg:z.number().finite().optional(),waist_cm:z.number().finite().optional()}).strict();
export async function POST(request:Request):Promise<Response>{
  if(!hasSameOrigin(request))return NextResponse.json({error:"Request origin was not accepted."},{status:403});const session=getSessionFromRequest(request);if(!session||session.status!=="in_progress")return NextResponse.json({error:"Complete the safety gate before answering screening questions."},{status:409});
  const parsed=schema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Answer is invalid. Please try again."},{status:400});const {question_id,option_id}=parsed.data;let optionId=option_id;let points=0;
  const version=typeof session.scoring_version_id==="string"?scoringVersionById(session.scoring_version_id):undefined;const config=version?JSON.parse(version.config_json) as typeof instrument:instrument;const item=config.items.find((candidate)=>candidate.id===question_id);
  if(item){
    if(question_id==="bmi"&&parsed.data.option_id){const saved=getScreeningResponses(String(session.id)).find((answer)=>answer.question_id==="bmi");if(saved?.option_id!==parsed.data.option_id)return NextResponse.json({error:"Re-enter height and weight to calculate the BMI category."},{status:400});}
    else if(question_id==="bmi"){try{optionId=deriveOptionId(item,{height_cm:parsed.data.height_cm,weight_kg:parsed.data.weight_kg});}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Height and weight are required."},{status:400});}}
    if(question_id==="waist"&&parsed.data.option_id){const saved=getScreeningResponses(String(session.id)).find((answer)=>answer.question_id==="waist");if(saved?.option_id!==parsed.data.option_id)return NextResponse.json({error:"Re-enter waist circumference to calculate its category."},{status:400});}
    else if(question_id==="waist"){const sex=getScreeningResponses(String(session.id)).find((answer)=>answer.question_id==="sex")?.option_id;try{optionId=deriveOptionId(item,{waist_cm:parsed.data.waist_cm},sex);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Waist measurement is required."},{status:400});}}
    const option=item.options.find((candidate)=>candidate.id===optionId);if(!option)return NextResponse.json({error:"Choose one of the listed answers."},{status:400});points=option.points;
  }else if(symptomConfig.items.some((candidate)=>candidate.id===question_id)){
    if(optionId!=="yes"&&optionId!=="no")return NextResponse.json({error:"Choose yes or no."},{status:400});
  }else return NextResponse.json({error:"Unknown screening question."},{status:400});
  if(!optionId)return NextResponse.json({error:"An answer is required."},{status:400});saveScreeningAnswers(String(session.id),[{questionId:question_id,optionId,points}],question_id);recordScreeningEvent({sessionId:String(session.id),event:"question_answered",step:question_id});return NextResponse.json({ok:true});
}
