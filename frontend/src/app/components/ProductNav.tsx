import { BookOpen, ClipboardList, Workflow } from "lucide-react";
import { NavLink } from "react-router";

export function ProductNav() {
  return (
    <nav className="product-nav" aria-label="Product areas">
      <NavLink to="/pipeline">
        <Workflow size={15} aria-hidden="true" />
        Pipeline
      </NavLink>
      <NavLink to="/course-planner">
        <BookOpen size={15} aria-hidden="true" />
        Course Planner
      </NavLink>
      <NavLink to="/lesson-plan">
        <ClipboardList size={15} aria-hidden="true" />
        Lesson Plan
      </NavLink>
    </nav>
  );
}
