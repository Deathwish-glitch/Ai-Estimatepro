import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export const ScheduleTimeline = ({ schedule }) => {
  if (!schedule?.length) return null;

  return (
    <Card className="border-slate-200 bg-white shadow-sm" data-testid="schedule-timeline-card">
      <CardHeader>
        <CardTitle className="text-lg" data-testid="schedule-timeline-title">
          Construction Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4" data-testid="schedule-timeline-list">
          {schedule.map((phase, index) => (
            <div
              key={phase.phase}
              className="grid grid-cols-[20px_1fr] gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3"
              data-testid={`schedule-phase-${index}`}
            >
              <div className="relative pt-1">
                <span className="block h-3 w-3 rounded-full bg-orange-500" />
                {index < schedule.length - 1 ? (
                  <span className="absolute left-[5px] top-5 h-[calc(100%-0.25rem)] w-[1.5px] bg-slate-300" />
                ) : null}
              </div>
              <div>
                <p className="text-base font-semibold text-slate-900" data-testid={`schedule-phase-name-${index}`}>
                  {phase.phase}
                </p>
                <p className="font-mono text-sm text-slate-600" data-testid={`schedule-phase-week-range-${index}`}>
                  Week {phase.start_week} – {phase.end_week}
                </p>
                <p className="mt-1 text-xs text-slate-500" data-testid={`schedule-phase-milestone-${index}`}>
                  Milestone: {phase.milestone || "Planned milestone"}
                </p>
                <p className="text-xs text-slate-500" data-testid={`schedule-phase-crew-${index}`}>
                  Crew: {phase.expected_crew_size || "-"} workers
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
};