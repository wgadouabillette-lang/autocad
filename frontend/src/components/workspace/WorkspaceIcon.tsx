import clsx from "clsx";
import { workspaceInitials, type Workspace } from "../../lib/workspaces";

interface WorkspaceIconProps {
  workspace: Pick<Workspace, "name" | "accent" | "iconURL">;
  className?: string;
}

export default function WorkspaceIcon({ workspace, className }: WorkspaceIconProps) {
  const iconURL = workspace.iconURL?.trim();

  if (iconURL) {
    return (
      <span className={clsx(className, "overflow-hidden")} aria-hidden>
        <img src={iconURL} alt="" className="h-full w-full object-cover" />
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{ backgroundColor: workspace.accent }}
      aria-hidden
    >
      {workspaceInitials(workspace.name)}
    </span>
  );
}
