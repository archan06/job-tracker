/**
 * Accuracy check for the email classifier against real Claude Haiku 4.5.
 * Costs real money (about $0.08 a run): `npm run eval:email`. Needs ANTHROPIC_API_KEY in .env.local.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "dotenv";
import { normalizeCompany } from "@/lib/inbound/companies";
import { haikuClassifier } from "@/server/inbound/classifier";
import { SAMPLES } from "./email-samples";

config({ path: ".env.local", quiet: true });

async function main() {
  const classifier = haikuClassifier(new Anthropic());
  let kindsRight = 0;
  let companiesRight = 0;
  let companiesExpected = 0;
  for (const sample of SAMPLES) {
    const result = await classifier.classify({ ...sample, date: new Date() });
    const kindOk = result.kind === sample.kind;
    const companyOk = !sample.company || normalizeCompany(result.company ?? "") === normalizeCompany(sample.company);
    kindsRight += Number(kindOk);
    if (sample.company) {
      companiesExpected++;
      companiesRight += Number(companyOk);
    }
    console.log(`${kindOk && companyOk ? "ok  " : "MISS"} ${sample.subject.slice(0, 50).padEnd(50)} → ${result.kind} ${result.company ?? "-"} (${result.confidence.toFixed(2)})`);
  }
  console.log(`\nKind: ${kindsRight}/${SAMPLES.length}   Company: ${companiesRight}/${companiesExpected}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
