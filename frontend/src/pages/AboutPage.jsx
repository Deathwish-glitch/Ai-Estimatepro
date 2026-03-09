import { Card, CardContent } from "@/components/ui/card";

const aboutImage =
  "https://images.unsplash.com/photo-1758876734777-dcc6981f3671?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NDQ2NDJ8MHwxfHNlYXJjaHw0fHxtb2Rlcm4lMjBjb25zdHJ1Y3Rpb24lMjBzaXRlJTIwYmx1ZXByaW50cyUyMGNpdmlsJTIwZW5naW5lZXIlMjBwb3J0cmFpdHxlbnwwfHx8fDE3NzMwNDM5NDJ8MA&ixlib=rb-4.1.0&q=85";

export default function AboutPage() {
  return (
    <div className="space-y-8 reveal-up" data-testid="about-page">
      <section className="grid grid-cols-1 gap-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm lg:grid-cols-[1.3fr_1fr]" data-testid="about-main-section">
        <div className="space-y-4">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl text-slate-900" data-testid="about-page-heading">
            About AI Estimate Pro
          </h1>
          <p className="text-sm text-slate-600 md:text-base" data-testid="about-page-description">
            AI Estimate Pro helps beginners understand approximate construction costs without complex software.
            It combines project input, cost breakdown, materials quantity and schedule planning in one simple
            web app.
          </p>
          <ul className="space-y-2 text-sm text-slate-700 md:text-base" data-testid="about-audience-list">
            <li data-testid="about-audience-students">• Civil engineering students learning estimation basics</li>
            <li data-testid="about-audience-contractors">• Small contractors preparing quick client budgets</li>
            <li data-testid="about-audience-homeowners">• Homeowners planning house and villa construction</li>
            <li data-testid="about-audience-beginners">• Beginners who need easy, practical cost guidance</li>
          </ul>
        </div>
        <div className="overflow-hidden rounded-xl" data-testid="about-image-wrapper">
          <img
            src={aboutImage}
            alt="Engineer checking blueprint"
            className="h-full w-full object-cover object-center"
            data-testid="about-page-image"
          />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2" data-testid="about-goals-section">
        <Card className="border-slate-200 bg-white shadow-sm" data-testid="about-goal-card-clarity">
          <CardContent className="space-y-2 p-6">
            <h2 className="text-base md:text-lg text-slate-900" data-testid="about-goal-clarity-title">
              Goal 1: Better project clarity
            </h2>
            <p className="text-sm text-slate-600" data-testid="about-goal-clarity-description">
              Understand likely costs before starting construction and avoid under-budgeting surprises.
            </p>
          </CardContent>
        </Card>

        <Card className="border-slate-200 bg-white shadow-sm" data-testid="about-goal-card-planning">
          <CardContent className="space-y-2 p-6">
            <h2 className="text-base md:text-lg text-slate-900" data-testid="about-goal-planning-title">
              Goal 2: Better execution planning
            </h2>
            <p className="text-sm text-slate-600" data-testid="about-goal-planning-description">
              Use material and timeline outputs to plan procurement and construction phases more confidently.
            </p>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}