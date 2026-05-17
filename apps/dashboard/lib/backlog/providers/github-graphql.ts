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

const FETCH_PROJECT_QUERY = /* GraphQL */ `
  query GetProjectV2($login: String!, $number: Int!) {
    organization(login: $login) {
      projectV2(number: $number) {
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
    }
    user(login: $login) {
      projectV2(number: $number) {
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
    }
  }
`;

interface FetchProjectResponse {
  organization?: { projectV2?: RawProject | null } | null;
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
  const data = await octokit.graphql<FetchProjectResponse>(FETCH_PROJECT_QUERY, {
    login: input.owner,
    number: input.number,
  });
  const project =
    input.ownerType === "organization"
      ? data.organization?.projectV2
      : data.user?.projectV2;
  if (!project) {
    // Cross-check the other owner type — the user-pasted URL might have
    // disagreed with the actual GitHub entity (org vs user account).
    const fallback =
      input.ownerType === "organization" ? data.user?.projectV2 : data.organization?.projectV2;
    if (!fallback) {
      throw new Error(
        `Could not resolve Project v2 #${input.number} for ${input.owner}.`,
      );
    }
    return normalizeProject(fallback);
  }
  return normalizeProject(project);
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
