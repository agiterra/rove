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
