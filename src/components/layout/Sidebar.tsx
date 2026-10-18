import {
  Home,
  Clapperboard,
  Compass,
  ChartNoAxesColumn,
  Monitor,
  Settings,
  CircleHelp,
} from "lucide-react";

const items = [
  ["Home", Home],
  ["Shorts", Clapperboard],
  ["Explore", Compass],
  ["Creator Studio", ChartNoAxesColumn],
  ["Immersion", Monitor],
  ["Settings", Settings],
  ["Help", CircleHelp],
] as const;

export default function Sidebar({
  active,
  onSelect,
}: {
  active: string;
  onSelect: (s: string) => void;
}) {
  return (
    <nav aria-label="Main navigation" className="nav-items">
      {items.map(([name, Icon], i) => (
        <button
          key={name}
          type="button"
          title={name}
          aria-label={name}
          aria-current={active === name ? "page" : undefined}
          className={`${active === name ? "selected" : ""} ${i === 2 ? "divider" : ""} ${i === 5 ? "bottom-item" : ""}`}
          onClick={() => onSelect(name)}
        >
          <Icon size={22} />
          <span>{name}</span>
        </button>
      ))}
    </nav>
  );
}
