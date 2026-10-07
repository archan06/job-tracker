import { auth } from "@/server/auth";
import { suggestCompanies } from "@/server/services/suggestions";
import { companyDirectory } from "@/server/suggest/directories";
import { handleSuggest } from "@/server/suggest/handler";

export function GET(request: Request) {
  return handleSuggest(
    request,
    async () => (await auth())?.user?.id ?? null,
    (userId, query) => suggestCompanies(userId, query, companyDirectory()),
  );
}
