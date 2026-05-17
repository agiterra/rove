/**
 * Thin typed GraphQL wrappers for the GitHub Project v2 calls the
 * backlog adapter uses. Kept separate from the adapter class so the
 * queries are co-located with their response shapes and easy to test
 * in isolation.
 */

import "server-only";
import type { Octokit } from "octokit";

export interface ProjectV2Field {
  id: string;
  name: string;
  dataType: string;
  options?: { id: string; name: string }[];
}

export interface ProjectV2Lookup {
  id: string;
  number: number;
  title: string;
  url: string;
  fields: ProjectV2Field[];
}

const PROJECT_FIELDS_FRAGMENT = /* GraphQL */ `
  fragment ProjectFields on ProjectV2 {
    id
    number
    title
    url
    fields(first: 50) {
      nodes {
        __typename
        ... on ProjectV2FieldCommon {
          id
          name
          dataType
        }
        ... on ProjectV2SingleSelectField {
          id
          name
          dataType
          options {
            id
            name
          }
        }
      }
    }
  }
`;

const ORG_PROJECT_QUERY = /* GraphQL */ `
  query GetOrgProjectV2($login: String!, $number: Int!) {
    organization(login: $login) {
      projectV2(number: $number) { ...ProjectFields }
    }
  }
  ${PROJECT_FIELDS_FRAGMENT}
`;

const USER_PROJECT_QUERY = /* GraphQL */ `
  query GetUserProjectV2($login: String!, $number: Int!) {
    user(login: $login) {
      projectV2(number: $number) { ...ProjectFields }
    }
  }
  ${PROJECT_FIELDS_FRAGMENT}
`;

interface OrgFetchResponse {
  organization?: { projectV2?: RawProject | null } | null;
}
interface UserFetchResponse {
  user?: { projectV2?: RawProject | null } | null;
}

interface RawProject {
  id: string;
  number: number;
  title: string;
  url: string;
  fields: { nodes: RawField[] };
}

interface RawField {
  __typename: string;
  id?: string;
  name?: string;
  dataType?: string;
  options?: { id: string; name: string }[];
}

export async function fetchProjectV2(
  octokit: Octokit,
  input: { ownerType: "organization" | "user"; owner: string; number: number },
): Promise<ProjectV2Lookup> {
  // Two sequential queries instead of one combined one. The combined
  // form (organization { ... } user { ... } in the same query) throws
  // when GitHub can't resolve the wrong-type branch — e.g. user(login:
  // "agiterra") errors because agiterra is an org. Octokit treats any
  // GraphQL error as a thrown exception, swallowing the successful
  // branch's data. Splitting lets us try the requested side, fall
  // back to the other, and report cleanly if neither matches.
  const primary = await tryFetchProject(octokit, input.ownerType, input);
  if (primary) return normalizeProject(primary);

  const otherType: "organization" | "user" =
    input.ownerType === "organization" ? "user" : "organization";
  const fallback = await tryFetchProject(octokit, otherType, input);
  if (fallback) return normalizeProject(fallback);

  throw new Error(
    `GraphQL resolved no Project v2 #${input.number} on ${input.owner} ` +
      `(checked both organization and user account types).`,
  );
}

async function tryFetchProject(
  octokit: Octokit,
  ownerType: "organization" | "user",
  input: { owner: string; number: number },
): Promise<RawProject | null> {
  try {
    if (ownerType === "organization") {
      const data = await octokit.graphql<OrgFetchResponse>(ORG_PROJECT_QUERY, {
        login: input.owner,
        number: input.number,
      });
      return data.organization?.projectV2 ?? null;
    }
    const data = await octokit.graphql<UserFetchResponse>(USER_PROJECT_QUERY, {
      login: input.owner,
      number: input.number,
    });
    return data.user?.projectV2 ?? null;
  } catch (err) {
    // "Could not resolve to a User/Organization" means the owner exists
    // but not at this type. Treat as null so the caller can try the
    // other type. Anything else propagates (permission errors, network).
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    if (msg.includes("could not resolve to a user") || msg.includes("could not resolve to an organization")) {
      return null;
    }
    throw err;
  }
}

function normalizeProject(raw: RawProject): ProjectV2Lookup {
  return {
    id: raw.id,
    number: raw.number,
    title: raw.title,
    url: raw.url,
    fields: raw.fields.nodes
      .filter((n): n is RawField & { id: string; name: string; dataType: string } =>
        Boolean(n.id && n.name && n.dataType),
      )
      .map((n) => ({
        id: n.id,
        name: n.name,
        dataType: n.dataType,
        options: n.options,
      })),
  };
}

const ADD_DRAFT_MUTATION = /* GraphQL */ `
  mutation AddRoveDraft($projectId: ID!, $title: String!, $body: String!) {
    addProjectV2DraftIssue(
      input: { projectId: $projectId, title: $title, body: $body }
    ) {
      projectItem {
        id
      }
    }
  }
`;

interface AddDraftResponse {
  addProjectV2DraftIssue: { projectItem: { id: string } };
}

export async function addProjectV2DraftIssue(
  octokit: Octokit,
  input: { projectNodeId: string; title: string; body: string },
): Promise<{ id: string }> {
  const data = await octokit.graphql<AddDraftResponse>(ADD_DRAFT_MUTATION, {
    projectId: input.projectNodeId,
    title: input.title,
    body: input.body,
  });
  return { id: data.addProjectV2DraftIssue.projectItem.id };
}

const UPDATE_SINGLE_SELECT_MUTATION = /* GraphQL */ `
  mutation UpdateRoveStatus(
    $projectId: ID!
    $itemId: ID!
    $fieldId: ID!
    $optionId: String!
  ) {
    updateProjectV2ItemFieldValue(
      input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: { singleSelectOptionId: $optionId }
      }
    ) {
      projectV2Item {
        id
      }
    }
  }
`;

export async function updateProjectV2SingleSelectField(
  octokit: Octokit,
  input: {
    projectNodeId: string;
    itemId: string;
    fieldId: string;
    singleSelectOptionId: string;
  },
): Promise<void> {
  await octokit.graphql(UPDATE_SINGLE_SELECT_MUTATION, {
    projectId: input.projectNodeId,
    itemId: input.itemId,
    fieldId: input.fieldId,
    optionId: input.singleSelectOptionId,
  });
}

/* ────────────────────────────────────────────────────────────────────
 *  Listing projects accessible to the App on a given owner
 * ──────────────────────────────────────────────────────────────────── */

export interface ProjectV2ListItem {
  nodeId: string;
  number: number;
  title: string;
  url: string;
  closed: boolean;
}

const ORG_PROJECTS_LIST_QUERY = /* GraphQL */ `
  query ListOrgProjectsV2($login: String!) {
    organization(login: $login) {
      projectsV2(first: 50, orderBy: { field: NUMBER, direction: DESC }) {
        nodes { id number title url closed }
      }
    }
  }
`;

const USER_PROJECTS_LIST_QUERY = /* GraphQL */ `
  query ListUserProjectsV2($login: String!) {
    user(login: $login) {
      projectsV2(first: 50, orderBy: { field: NUMBER, direction: DESC }) {
        nodes { id number title url closed }
      }
    }
  }
`;

/**
 * Returns the open Project v2 boards on the given owner that the App
 * installation can see. Tries the requested owner type first, falls
 * back to the other type if that branch errors with "could not
 * resolve" (same wrong-owner-type trick as fetchProjectV2). Returns an
 * empty array when neither type matches.
 */
export async function listAccessibleProjectsV2(
  octokit: Octokit,
  owner: string,
  ownerType: "organization" | "user",
): Promise<ProjectV2ListItem[]> {
  const primary = await tryListProjects(octokit, owner, ownerType);
  if (primary) return primary;
  const otherType: "organization" | "user" =
    ownerType === "organization" ? "user" : "organization";
  const fallback = await tryListProjects(octokit, owner, otherType);
  return fallback ?? [];
}

async function tryListProjects(
  octokit: Octokit,
  login: string,
  ownerType: "organization" | "user",
): Promise<ProjectV2ListItem[] | null> {
  const query = ownerType === "organization" ? ORG_PROJECTS_LIST_QUERY : USER_PROJECTS_LIST_QUERY;
  try {
    const data = await octokit.graphql<{
      organization?: { projectsV2?: { nodes: RawListNode[] } } | null;
      user?: { projectsV2?: { nodes: RawListNode[] } } | null;
    }>(query, { login });
    const nodes =
      ownerType === "organization"
        ? data.organization?.projectsV2?.nodes
        : data.user?.projectsV2?.nodes;
    if (!nodes) return null;
    return nodes
      .filter(
        (n): n is Required<RawListNode> =>
          typeof n.id === "string" &&
          typeof n.number === "number" &&
          typeof n.title === "string" &&
          typeof n.url === "string",
      )
      .filter((n) => n.closed !== true)
      .map((n) => ({
        nodeId: n.id,
        number: n.number,
        title: n.title,
        url: n.url,
        closed: n.closed,
      }));
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    if (msg.includes("could not resolve to a user") || msg.includes("could not resolve to an organization")) {
      return null;
    }
    throw err;
  }
}

interface RawListNode {
  id?: string;
  number?: number;
  title?: string;
  url?: string;
  closed?: boolean;
}

/* ────────────────────────────────────────────────────────────────────
 *  Owner resolution (managed-board install)
 * ──────────────────────────────────────────────────────────────────── */

const OWNER_LOOKUP_QUERY = /* GraphQL */ `
  query LookupOwner($login: String!) {
    organization(login: $login) { id login }
    user(login: $login) { id login }
  }
`;

interface OwnerLookupResponse {
  organization?: { id: string; login: string } | null;
  user?: { id: string; login: string } | null;
}

/**
 * Resolve a login string to its owner node id, trying organization
 * first. Splits org/user the same way fetchProjectV2 does so the
 * "not resolvable as user" GraphQL errors don't blow up the call.
 */
export async function resolveOwnerNodeId(
  octokit: Octokit,
  login: string,
): Promise<{ id: string; ownerType: "organization" | "user" }> {
  try {
    const data = await octokit.graphql<OwnerLookupResponse>(OWNER_LOOKUP_QUERY, { login });
    if (data.organization?.id) {
      return { id: data.organization.id, ownerType: "organization" };
    }
    if (data.user?.id) {
      return { id: data.user.id, ownerType: "user" };
    }
  } catch (err) {
    // Fall through to the split fallback below.
    const msg = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
    if (!msg.includes("could not resolve")) throw err;
  }
  // Split fallback (same trick as fetchProjectV2). One side may error;
  // the other might still resolve.
  const asOrg = await safeOwnerLookup(octokit, login, "organization");
  if (asOrg) return { id: asOrg, ownerType: "organization" };
  const asUser = await safeOwnerLookup(octokit, login, "user");
  if (asUser) return { id: asUser, ownerType: "user" };
  throw new Error(`Could not resolve GitHub owner: ${login}`);
}

async function safeOwnerLookup(
  octokit: Octokit,
  login: string,
  ownerType: "organization" | "user",
): Promise<string | null> {
  const q =
    ownerType === "organization"
      ? `query Q($login: String!) { organization(login: $login) { id } }`
      : `query Q($login: String!) { user(login: $login) { id } }`;
  try {
    const data = await octokit.graphql<{
      organization?: { id?: string } | null;
      user?: { id?: string } | null;
    }>(q, { login });
    return (ownerType === "organization" ? data.organization?.id : data.user?.id) ?? null;
  } catch {
    return null;
  }
}

/* ────────────────────────────────────────────────────────────────────
 *  Create / copy Project v2 (managed-board install)
 * ──────────────────────────────────────────────────────────────────── */

const CREATE_PROJECT_MUTATION = /* GraphQL */ `
  mutation CreateRoveProject($ownerId: ID!, $title: String!) {
    createProjectV2(input: { ownerId: $ownerId, title: $title }) {
      projectV2 { ...ProjectFields }
    }
  }
  ${PROJECT_FIELDS_FRAGMENT}
`;

export async function createProjectV2(
  octokit: Octokit,
  input: { ownerNodeId: string; title: string },
): Promise<ProjectV2Lookup> {
  const data = await octokit.graphql<{
    createProjectV2: { projectV2: RawProject };
  }>(CREATE_PROJECT_MUTATION, { ownerId: input.ownerNodeId, title: input.title });
  return normalizeProject(data.createProjectV2.projectV2);
}

const COPY_PROJECT_MUTATION = /* GraphQL */ `
  mutation CopyRoveProject(
    $projectId: ID!
    $ownerId: ID!
    $title: String!
    $includeDraftIssues: Boolean!
  ) {
    copyProjectV2(
      input: {
        projectId: $projectId
        ownerId: $ownerId
        title: $title
        includeDraftIssues: $includeDraftIssues
      }
    ) {
      projectV2 { ...ProjectFields }
    }
  }
  ${PROJECT_FIELDS_FRAGMENT}
`;

export async function copyProjectV2(
  octokit: Octokit,
  input: {
    sourceProjectNodeId: string;
    ownerNodeId: string;
    title: string;
    includeDraftIssues?: boolean;
  },
): Promise<ProjectV2Lookup> {
  const data = await octokit.graphql<{
    copyProjectV2: { projectV2: RawProject };
  }>(COPY_PROJECT_MUTATION, {
    projectId: input.sourceProjectNodeId,
    ownerId: input.ownerNodeId,
    title: input.title,
    includeDraftIssues: input.includeDraftIssues ?? false,
  });
  return normalizeProject(data.copyProjectV2.projectV2);
}

/* ────────────────────────────────────────────────────────────────────
 *  Create custom fields (managed-board fresh path)
 * ──────────────────────────────────────────────────────────────────── */

const CREATE_FIELD_MUTATION = /* GraphQL */ `
  mutation CreateRoveField(
    $projectId: ID!
    $name: String!
    $dataType: ProjectV2CustomFieldType!
    $singleSelectOptions: [ProjectV2SingleSelectFieldOptionInput!]
  ) {
    createProjectV2Field(
      input: {
        projectId: $projectId
        name: $name
        dataType: $dataType
        singleSelectOptions: $singleSelectOptions
      }
    ) {
      projectV2Field {
        __typename
        ... on ProjectV2FieldCommon { id name dataType }
        ... on ProjectV2SingleSelectField {
          id
          name
          dataType
          options { id name }
        }
      }
    }
  }
`;

export type CreateFieldInput =
  | { name: string; dataType: "TEXT" | "NUMBER" | "DATE" }
  | {
      name: string;
      dataType: "SINGLE_SELECT";
      options: { name: string; color: ProjectV2OptionColor; description?: string }[];
    };

/**
 * GitHub requires every single-select option to specify one of its
 * accepted colors. Eight rotation values keep the brand legible while
 * matching the dashboard's severity palette as closely as the API
 * permits (Critical → RED, Major → ORANGE, Minor → YELLOW, Nit → GRAY).
 */
export type ProjectV2OptionColor =
  | "GRAY"
  | "BLUE"
  | "GREEN"
  | "YELLOW"
  | "ORANGE"
  | "RED"
  | "PINK"
  | "PURPLE";

export async function createProjectV2Field(
  octokit: Octokit,
  projectNodeId: string,
  input: CreateFieldInput,
): Promise<ProjectV2Field> {
  const variables: Record<string, unknown> = {
    projectId: projectNodeId,
    name: input.name,
    dataType: input.dataType,
  };
  if (input.dataType === "SINGLE_SELECT") {
    variables.singleSelectOptions = input.options.map((o) => ({
      name: o.name,
      color: o.color,
      description: o.description ?? "",
    }));
  }
  const data = await octokit.graphql<{
    createProjectV2Field: { projectV2Field: RawField };
  }>(CREATE_FIELD_MUTATION, variables);
  const f = data.createProjectV2Field.projectV2Field;
  if (!f.id || !f.name || !f.dataType) {
    throw new Error(`createProjectV2Field: malformed response for ${input.name}`);
  }
  return { id: f.id, name: f.name, dataType: f.dataType, options: f.options };
}

/* ────────────────────────────────────────────────────────────────────
 *  Batched field-value updates (pushFinding fast path)
 * ──────────────────────────────────────────────────────────────────── */

export type FieldValueWrite =
  | { fieldId: string; kind: "text"; text: string }
  | { fieldId: string; kind: "number"; number: number }
  | { fieldId: string; kind: "date"; date: string }
  | { fieldId: string; kind: "single_select"; singleSelectOptionId: string };

/**
 * Issues N aliased updateProjectV2ItemFieldValue mutations in one GraphQL
 * document — one network round-trip regardless of how many fields are
 * being set. Caller is responsible for choosing the right `kind` per field.
 *
 * No-op when `writes` is empty.
 */
export async function updateProjectV2ItemFieldValues(
  octokit: Octokit,
  input: {
    projectNodeId: string;
    itemId: string;
    writes: FieldValueWrite[];
  },
): Promise<void> {
  if (input.writes.length === 0) return;

  const variableDecls: string[] = ["$projectId: ID!", "$itemId: ID!"];
  const variables: Record<string, unknown> = {
    projectId: input.projectNodeId,
    itemId: input.itemId,
  };
  const bodyChunks: string[] = [];

  input.writes.forEach((w, i) => {
    const alias = `u${i}`;
    const fieldVar = `field_${i}`;
    variableDecls.push(`$${fieldVar}: ID!`);
    variables[fieldVar] = w.fieldId;

    let valueClause = "";
    if (w.kind === "text") {
      const v = `text_${i}`;
      variableDecls.push(`$${v}: String!`);
      variables[v] = w.text;
      valueClause = `value: { text: $${v} }`;
    } else if (w.kind === "number") {
      const v = `num_${i}`;
      variableDecls.push(`$${v}: Float!`);
      variables[v] = w.number;
      valueClause = `value: { number: $${v} }`;
    } else if (w.kind === "date") {
      const v = `date_${i}`;
      variableDecls.push(`$${v}: Date!`);
      variables[v] = w.date;
      valueClause = `value: { date: $${v} }`;
    } else {
      const v = `opt_${i}`;
      variableDecls.push(`$${v}: String!`);
      variables[v] = w.singleSelectOptionId;
      valueClause = `value: { singleSelectOptionId: $${v} }`;
    }

    bodyChunks.push(
      `${alias}: updateProjectV2ItemFieldValue(input: { projectId: $projectId, itemId: $itemId, fieldId: $${fieldVar}, ${valueClause} }) { projectV2Item { id } }`,
    );
  });

  const query = `mutation BatchUpdateRoveFields(${variableDecls.join(", ")}) {\n  ${bodyChunks.join("\n  ")}\n}`;
  await octokit.graphql(query, variables);
}
