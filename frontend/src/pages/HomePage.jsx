import { ArrowRight, BookOpen, Calculator, Save } from "lucide-react";
import { Link } from "react-router-dom";
import { SummaryCards } from "@/components/SummaryCards";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useBuildCalc } from "@/context/BuildCalcContext";

const heroImage =
  "https://images.unsplash.com/photo-1763281486056-9fd34c978a7d?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHwxfHxtb2Rlcm4lMjBjb25zdHJ1Y3Rpb24lMjBzaXRlJTIwYmx1ZXByaW50cyUyMGNpdmlsJTIwZW5naW5lZXIlMjBwb3J0cmFpdHxlbnwwfHx8fDE3NzMwNDM5NDJ8MA&ixlib=rb-4.1.0&q=85";

const quickTools = [
  {
    icon: Calculator,
    title: "Smart Estimation",
    description: "Instant cost estimate with material, labour, profit and GST split.",
  },
  {
    icon: Save,
    title: "Save Projects",
    description: "Store project estimates in database and load them anytime.",
  },
  {
    icon: BookOpen,
    title: "Beginner Friendly",
    description: "Made for students, house owners, and first-time contractors.",
  },
];

export default function HomePage() {
  const { latestEstimate } = useBuildCalc();

  return (
    <div className="space-y-10" data-testid="home-page">
      <section
        className="grid grid-cols-1 gap-6 overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:grid-cols-[1.2fr_1fr]"
        data-testid="home-hero-section"
      >
        <div className="space-y-4">
          <p className="inline-flex rounded-full bg-orange-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-orange-600" data-testid="hero-badge">
            Beginner-Friendly Construction Planner
          </p>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl text-slate-900" data-testid="hero-heading">
            Estimate your building cost in minutes with AI Estimate Pro.
          </h1>
          <p className="max-w-xl text-sm text-slate-600 md:text-base" data-testid="hero-description">
            AI Estimate Pro gives quick and practical construction estimates for houses, villas, and G+1 structures,
            including materials, schedule, and report-ready summaries.
          </p>
          <div className="flex flex-wrap gap-3" data-testid="hero-actions">
            <Link to="/estimate" data-testid="hero-start-estimate-link">
              <Button className="rounded-full bg-slate-900 px-6 transition-colors duration-200 hover:bg-slate-800" data-testid="hero-start-estimate-button">
                Start Estimate <ArrowRight size={16} />
              </Button>
            </Link>
            <Link to="/boq" data-testid="hero-view-materials-link">
              <Button variant="outline" className="rounded-full border-slate-300 px-6 transition-colors duration-200" data-testid="hero-view-materials-button">
                View BOQ
              </Button>
            </Link>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl" data-testid="hero-image-wrapper">
          <img
            src={heroImage}
            alt="Construction planning"
            className="h-full w-full object-cover object-center"
            data-testid="hero-image"
          />
        </div>
      </section>

      <SummaryCards estimate={latestEstimate} />

      <section className="grid grid-cols-1 gap-4 md:grid-cols-3" data-testid="quick-tools-section">
        {quickTools.map((tool) => (
          <Card key={tool.title} className="border-slate-200 bg-white shadow-sm" data-testid={`tool-card-${tool.title.toLowerCase().replace(/\s+/g, "-")}`}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl text-slate-900" data-testid={`tool-title-${tool.title.toLowerCase().replace(/\s+/g, "-")}`}>
                <tool.icon size={18} className="text-orange-500" /> {tool.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-slate-600" data-testid={`tool-description-${tool.title.toLowerCase().replace(/\s+/g, "-")}`}>
                {tool.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </section>
    </div>
  );
}