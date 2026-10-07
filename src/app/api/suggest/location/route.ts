import { auth } from "@/server/auth";
import { suggestLocations } from "@/server/services/suggestions";
import { placeDirectory } from "@/server/suggest/directories";
import { handleSuggest } from "@/server/suggest/handler";

export function GET(request: Request) {
  return handleSuggest(
    request,
    async () => (await auth())?.user?.id ?? null,
    (_userId, query) => suggestLocations(query, placeDirectory()),
  );
}
