import { BrickWall, CalendarClock, IndianRupee, Ruler } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatINR, formatNumber } from "@/utils/formatters";

const statConfig = [
  {
    key: "project_area_sqft",
    label: "Project Area",
    formatter: (estimate) => `${formatNumber(estimate?.project_area_sqft || 0, 0)} sq.ft`,
    icon: Ruler,
    testId: "summary-project-area-card",
  },
  {
    key: "total_estimate",
    label: "Estimated Cost",
    formatter: (estimate) => formatINR(estimate?.cost_breakdown?.total_estimate || 0),
    icon: IndianRupee,
    testId: "summary-estimated-cost-card",
  },
  {
    key: "materials",
    label: "Materials Required",
    formatter: (estimate) => `${estimate?.materials?.length || 0} key materials`,
    icon: BrickWall,
    testId: "summary-materials-card",
  },
  {
    key: "duration_weeks",
    label: "Construction Duration",
    formatter: (estimate) => `${estimate?.duration_weeks || 0} weeks`,
    icon: CalendarClock,
    testId: "summary-duration-card",
  },
];

export const SummaryCards = ({ estimate }) => {
  return (
    <section className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4" data-testid="summary-cards-section">
      {statConfig.map((item) => {
        const Icon = item.icon;

        return (
          <Card
            key={item.key}
            className="border-slate-200 bg-white shadow-sm transition-shadow duration-200 hover:shadow-md"
            data-testid={item.testId}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-600" data-testid={`${item.key}-label`}>
                {item.label}
              </CardTitle>
              <Icon size={16} className="text-orange-500" />
            </CardHeader>
            <CardContent>
              <div className="font-mono text-xl text-slate-900" data-testid={`${item.key}-value`}>
                {item.formatter(estimate)}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </section>
  );
};