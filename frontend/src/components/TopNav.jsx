import { HardHat } from "lucide-react";
import { NavLink } from "react-router-dom";

const navItems = [
  { label: "Home", path: "/", testId: "nav-home-link", end: true },
  { label: "Estimate", path: "/estimate", testId: "nav-estimate-link", end: false },
  { label: "Materials", path: "/materials", testId: "nav-materials-link", end: false },
  { label: "Schedule", path: "/schedule", testId: "nav-schedule-link", end: false },
  { label: "About", path: "/about", testId: "nav-about-link", end: false },
];

export const TopNav = () => {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 glass-nav" data-testid="top-navigation-bar">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 lg:px-8">
        <NavLink className="flex items-center gap-2" to="/" data-testid="app-logo-link">
          <span className="rounded-lg bg-slate-900 p-2 text-white" data-testid="app-logo-icon">
            <HardHat size={18} />
          </span>
          <div>
            <p className="text-2xl font-semibold leading-none text-slate-900" data-testid="app-name-title">
              AI Estimate Pro
            </p>
            <p className="text-xs text-slate-500" data-testid="app-name-subtitle">
              Smart Construction Planning Assistant
            </p>
          </div>
        </NavLink>

        <nav className="flex max-w-full items-center gap-2 overflow-x-auto pb-1" data-testid="top-navigation-links">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              end={item.end}
              data-testid={item.testId}
              className={({ isActive }) =>
                `rounded-full px-4 py-2 text-sm font-medium transition-colors duration-200 ${
                  isActive ? "bg-slate-900 text-white" : "bg-white text-slate-700 hover:bg-slate-100"
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </header>
  );
};