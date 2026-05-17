"use client";

import { InstallPicker } from "./BacklogPanel.picker";
import { ConnectedShowpiece, type ActiveConnection } from "./BacklogPanel.connected";

interface Props {
  projectId: string;
  connection: ActiveConnection | null;
}

export function BacklogPanel({ projectId, connection }: Props) {
  if (connection) {
    return <ConnectedShowpiece projectId={projectId} connection={connection} />;
  }
  return <InstallPicker projectId={projectId} />;
}
