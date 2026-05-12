/**
 * GitHub App auth + PR creation. Server-only — never import from a
 * client component or this will leak the App private key into the browser
 * bundle.
 *
 * The App needs `contents:write` and `pull_requests:write` permissions on
 * the target repo. Registration is a one-time manual step; see the plan's
 * "GitHub App setup" section for the checklist.
 */
import "server-only";
import { createAppAuth } from "@octokit/auth-app";
import { Octokit } from "octokit";
import { env } from "../env";

let cachedOctokit: Octokit | null = null;

/**
 * Returns an Octokit authenticated as the installation. The underlying
 * @octokit/auth-app strategy mints + caches short-lived installation tokens
 * automatically; one app-scoped Octokit per process is fine.
 */
export function getInstallationOctokit(): Octokit {
  if (cachedOctokit) return cachedOctokit;
  cachedOctokit = new Octokit({
    authStrategy: createAppAuth,
    auth: {
      appId: env.githubAppId(),
      privateKey: env.githubAppPrivateKey(),
      installationId: env.githubAppInstallationId(),
    },
  });
  return cachedOctokit;
}

export interface OpenPrInput {
  branch: string;
  baseBranch?: string;
  filePath: string;
  fileContent: string;
  commitMessage: string;
  prTitle: string;
  prBody: string;
}

export interface OpenPrResult {
  prNumber: number;
  prUrl: string;
  branch: string;
}

/**
 * Creates a new branch off the base, writes a single file, and opens a
 * draft PR. Throws if the file already exists at the target path (we
 * don't want to silently overwrite an existing flow / persona).
 */
export async function createSingleFilePr(input: OpenPrInput): Promise<OpenPrResult> {
  const owner = env.githubRepoOwner();
  const repo = env.githubRepoName();
  const baseBranch = input.baseBranch ?? env.githubBaseBranch();
  const octokit = getInstallationOctokit();

  // 1. Refuse if the file already exists on the base branch — the wizard
  //    is for new artifacts; updates should happen via direct edit + PR.
  try {
    await octokit.rest.repos.getContent({
      owner,
      repo,
      path: input.filePath,
      ref: baseBranch,
    });
    throw new Error(
      `${input.filePath} already exists on ${baseBranch}. Pick a different id or edit the existing file directly.`,
    );
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status !== 404) throw e;
  }

  // 2. Resolve base branch SHA
  const baseRef = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${baseBranch}`,
  });
  const baseSha = baseRef.data.object.sha;

  // 3. Create the new branch
  await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${input.branch}`,
    sha: baseSha,
  });

  // 4. Commit the single file onto the new branch
  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: input.filePath,
    message: input.commitMessage,
    content: Buffer.from(input.fileContent, "utf8").toString("base64"),
    branch: input.branch,
  });

  // 5. Open the draft PR
  const pr = await octokit.rest.pulls.create({
    owner,
    repo,
    head: input.branch,
    base: baseBranch,
    title: input.prTitle,
    body: input.prBody,
    draft: true,
  });

  return {
    prNumber: pr.data.number,
    prUrl: pr.data.html_url,
    branch: input.branch,
  };
}

/**
 * Short, URL-safe random suffix to make branch names unique per submission.
 */
export function randomBranchSuffix(): string {
  return Math.random().toString(36).slice(2, 8);
}
