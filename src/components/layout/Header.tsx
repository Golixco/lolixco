import { Menu, Search, X, Plus, Bell } from "lucide-react";
import { BrandLogo } from "./BrandLogo";
export default function Header({
  expanded,
  toggle,
  query,
  setQuery,
  member,
  open,
  onHome,
}: {
  onHome: () => void;
  expanded: boolean;
  toggle: () => void;
  query: string;
  setQuery: (q: string) => void;
  member: boolean;
  open: (s: string) => void;
}) {
  return (
    <header>
      <div className="header-brand">
        <button
          id="nav-toggle"
          className={`icon-button hamburger ${expanded ? "expanded" : ""}`}
          onClick={toggle}
          aria-label="Toggle navigation"
          aria-expanded={expanded}
          aria-controls="sidebar"
        >
          <Menu />
        </button>
        <BrandLogo onHome={onHome} />
      </div>
      <label className="search">
        <Search size={19} />
        <input
          aria-label="Search"
          placeholder="Search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            aria-label="Clear search"
            className="icon-button"
            onClick={() => setQuery("")}
          >
            <X size={16} />
          </button>
        )}
      </label>
      <div className="header-actions">
        {member ? (
          <>
            <span className="preview-label">Member preview</span>
            <button onClick={() => open("Create")} className="create">
              <Plus /> <span>Create</span>
            </button>
            <button
              className="icon-button"
              aria-label="Notifications"
              onClick={() => open("Notifications")}
            >
              <Bell />
            </button>
            <button
              className="avatar"
              aria-label="Profile menu"
              onClick={() => open("Profile")}
            >
              L
            </button>
          </>
        ) : (
          <>
            <button onClick={() => open("Sign In")}>Sign In</button>
            <button className="primary" onClick={() => open("Sign Up")}>
              Sign Up
            </button>
          </>
        )}
      </div>
    </header>
  );
}
