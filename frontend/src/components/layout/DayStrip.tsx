import { useEffect, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const START = 6;
const END = 18.5;
const hourNow = () => { const d = new Date(); return d.getHours() + d.getMinutes() / 60; };
const fmt = (h: number) => `${String(Math.floor(h)).padStart(2, "0")}:${String(Math.floor((h % 1) * 60)).padStart(2, "0")}`;

/** The crew's working day with the sun at the local time: the same strip the landing page scrubs. */
export function DayStrip() {
  const [h, setH] = useState(hourNow);
  useEffect(() => {
    const id = setInterval(() => setH(hourNow()), 30_000);
    return () => clearInterval(id);
  }, []);
  const day = h >= START && h <= END;
  const t = Math.min(1, Math.max(0, (h - START) / (END - START)));
  const elev = day ? Math.sin((Math.PI * (h - START)) / 12.6) : 0;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="relative hidden h-7 w-32 items-center lg:flex" role="img" aria-label={`Local time ${fmt(h)}`}>
          <div className="h-1 w-full rounded-full bg-[linear-gradient(90deg,#1c2440_0%,#f08a4b_9%,#9cc8ec_34%,#bfe0f7_50%,#9cc8ec_70%,#f0b36a_88%,#3a2233_100%)] opacity-80" />
          <span
            className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-3"
            style={{
              left: `${t * 100}%`,
              background: day ? `oklch(${0.72 + elev * 0.2} ${0.19 - elev * 0.09} ${48 + elev * 30})` : "#c9d3e3",
              ["--tw-ring-color" as string]: day ? "rgb(255 138 61 / 0.25)" : "rgb(201 211 227 / 0.2)",
            }}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent>{day ? `${fmt(h)}: the crew is on shift` : `${fmt(h)}: night shift, scheduled jobs still run`}</TooltipContent>
    </Tooltip>
  );
}
