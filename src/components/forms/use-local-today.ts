"use client";

import { useSyncExternalStore } from "react";
import { localDateString } from "@/lib/dates";

const subscribe = () => () => {};

/** Today in the viewer's time zone as "YYYY-MM-DD"; empty during server rendering. */
export function useLocalToday(): string {
  return useSyncExternalStore(subscribe, () => localDateString(), () => "");
}
