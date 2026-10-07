import { z } from "zod";
import { USER_EVENT_TYPES } from "@/lib/status";
import { dateOnly, optionalText } from "./fields";

export const eventInputSchema = z
  .object({
    type: z.enum(USER_EVENT_TYPES, { error: "Choose an activity type" }),
    date: dateOnly,
    notes: optionalText("Notes", 5_000),
  })
  .refine((event) => event.type !== "NOTE" || !!event.notes, {
    message: "Write a note",
    path: ["notes"],
  });

export type EventInput = z.output<typeof eventInputSchema>;
