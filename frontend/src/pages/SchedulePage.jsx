import { Link } from "react-router-dom";
import { ScheduleTimeline } from "@/components/ScheduleTimeline";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useBuildCalc } from "@/context/BuildCalcContext";

export default function SchedulePage() {
  const { latestEstimate } = useBuildCalc();

  if (!latestEstimate) {
    return (
      <Card className="border-slate-200 bg-white shadow-sm" data-testid="schedule-empty-state-card">
        <CardHeader>
          <CardTitle data-testid="schedule-empty-state-title">No schedule available yet</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600" data-testid="schedule-empty-state-description">
            Generate an estimate first to unlock the construction timeline.
          </p>
          <Link to="/estimate" data-testid="schedule-empty-state-link">
            <Button className="rounded-full" data-testid="schedule-go-to-estimate-button">Go to Estimate</Button>
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 reveal-up" data-testid="schedule-page">
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" data-testid="schedule-summary-banner">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl text-slate-900" data-testid="schedule-page-heading">
          Construction Schedule
        </h1>
        <p className="mt-1 text-sm text-slate-600 md:text-base" data-testid="schedule-page-description">
          Estimated project duration: <span className="font-mono" data-testid="schedule-duration-value">{latestEstimate.duration_weeks} weeks</span>
        </p>
      </section>

      <ScheduleTimeline schedule={latestEstimate.schedule} />

      <Card className="border-slate-200 bg-white shadow-sm" data-testid="schedule-detailed-table-card">
        <CardHeader>
          <CardTitle className="text-2xl" data-testid="schedule-detailed-table-title">
            Detailed Phase Plan
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table data-testid="schedule-detailed-table">
            <TableHeader>
              <TableRow>
                <TableHead data-testid="schedule-table-header-phase">Phase</TableHead>
                <TableHead data-testid="schedule-table-header-weeks">Weeks</TableHead>
                <TableHead data-testid="schedule-table-header-crew">Expected Crew</TableHead>
                <TableHead data-testid="schedule-table-header-milestone">Milestone</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {latestEstimate.schedule.map((phase, index) => (
                <TableRow key={phase.phase} data-testid={`schedule-detailed-row-${index}`}>
                  <TableCell data-testid={`schedule-detailed-phase-${index}`}>{phase.phase}</TableCell>
                  <TableCell className="font-mono" data-testid={`schedule-detailed-weeks-${index}`}>
                    {phase.start_week} - {phase.end_week}
                  </TableCell>
                  <TableCell className="font-mono" data-testid={`schedule-detailed-crew-${index}`}>
                    {phase.expected_crew_size || "-"} workers
                  </TableCell>
                  <TableCell data-testid={`schedule-detailed-milestone-${index}`}>{phase.milestone || "Planned milestone"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="schedule-phase-task-grid">
        {latestEstimate.schedule.map((phase, index) => (
          <Card key={`${phase.phase}-tasks`} className="border-slate-200 bg-white shadow-sm" data-testid={`schedule-phase-task-card-${index}`}>
            <CardHeader>
              <CardTitle className="text-xl" data-testid={`schedule-phase-task-title-${index}`}>
                {phase.phase}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2" data-testid={`schedule-phase-task-list-${index}`}>
                {(phase.tasks || []).map((task, taskIndex) => (
                  <li
                    key={`${phase.phase}-${task}`}
                    className="rounded-lg bg-slate-50 p-3 text-sm text-slate-700"
                    data-testid={`schedule-phase-task-item-${index}-${taskIndex}`}
                  >
                    {task}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}