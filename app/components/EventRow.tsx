"use client";

import { GoogleEvent, eventDurationMinutes, formatEventTime, isAllDay } from "../lib/google-client";
import Icon from "./Icon";

type Props = {
  event: GoogleEvent;
  compact?: boolean;
};

export default function EventRow({ event, compact }: Props) {
  const allDay = isAllDay(event);
  const duration = !allDay ? eventDurationMinutes(event) : 0;
  const color = event.__calendarColor ?? "var(--accent)";

  return (
    <a
      href={event.htmlLink}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--bg-hover)]/40 sm:py-2.5"
    >
      {/* Vertical accent bar — calendar color */}
      <div className="mt-0.5 flex flex-col items-center self-stretch">
        <span
          className="block h-full w-[3px] rounded-full"
          style={{ background: color, minHeight: 22, opacity: 0.8 }}
        />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <span className="mt-[3px] inline-block" style={{ color }}>
            <Icon name="calendar" size={11} />
          </span>
          <div className="min-w-0 flex-1">
            <div className={`break-words ${compact ? "text-[13.5px]" : "text-[14.5px]"} font-medium leading-snug text-[var(--text-strong)]`}>
              {event.summary || "(Sans titre)"}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-[var(--text-muted)]">
              <span className="font-medium">{formatEventTime(event)}</span>
              {!allDay && duration > 0 && (
                <span>{duration < 60 ? `${duration} min` : `${Math.round(duration / 60 * 10) / 10} h`}</span>
              )}
              {event.location && (
                <span className="truncate">📍 {event.location}</span>
              )}
              {event.__calendarName && (
                <span className="truncate text-[var(--text-subtle)]">{event.__calendarName}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </a>
  );
}
