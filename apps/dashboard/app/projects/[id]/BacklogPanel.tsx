"use client";

import { InstallPicker } from "./BacklogPanel.picker";
import { ConnectedShowpiece, type ActiveConnection } from "./BacklogPanel.connected";

interface Props {
  projectId: string;
  connection: ActiveConnection | null;
  /** Default org slug used to prefill the managed-board install form. */
  defaultOwner: string;
}

export function BacklogPanel({ projectId, connection, defaultOwner }: Props) {
  if (connection) {
    return <ConnectedShowpiece projectId={projectId} connection={connection} />;
  }
  return <InstallPicker projectId={projectId} defaultOwner={defaultOwner} />;
}
