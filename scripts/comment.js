import { readFileSync } from "node:fs";
import { join } from "node:path";

export const MARKER_PREFIX = "better-email:diff";
export const MAX_COMMENT_BODY_LENGTH = 65_536;
export const TRUNCATION_FOOTER = "…diff truncated, run better ds diff locally";

function encodeMarkerComponent(value) {
  return encodeURIComponent(value).replaceAll("-", "%2D");
}

export function scopedMarker(designSystemId, channel) {
  return `<!-- ${MARKER_PREFIX}:${encodeMarkerComponent(designSystemId)}:${encodeMarkerComponent(channel)} -->`;
}

export function readDesignSystemId(workingDirectory) {
  const bindingPath = join(workingDirectory, ".better", "config.json");
  const binding = JSON.parse(readFileSync(bindingPath, "utf8"));

  if (
    typeof binding.designSystemId !== "string" ||
    binding.designSystemId.length === 0
  ) {
    throw new Error(`${bindingPath} does not contain a Design System id.`);
  }

  return binding.designSystemId;
}

export function isForkPullRequest(pullRequest) {
  const headRepository = pullRequest?.head?.repo?.full_name;
  const baseRepository = pullRequest?.base?.repo?.full_name;

  return Boolean(
    headRepository && baseRepository && headRepository !== baseRepository,
  );
}

function getErrorHeader(error, name) {
  const headerSources = [error?.response?.headers, error?.headers];

  for (const headers of headerSources) {
    if (!headers) continue;

    if (typeof headers.get === "function") {
      const value = headers.get(name);
      if (value !== null && value !== undefined) return value;
    }

    const matchingHeader = Object.entries(headers).find(
      ([headerName]) => headerName.toLowerCase() === name.toLowerCase(),
    );
    if (matchingHeader?.[1] !== null && matchingHeader?.[1] !== undefined) {
      return matchingHeader[1];
    }
  }

  return undefined;
}

function isRateLimitError(error) {
  const status = error?.status ?? error?.response?.status;

  if (status === 429) return true;
  if (status !== 403) return false;

  const remaining = getErrorHeader(error, "x-ratelimit-remaining");
  const retryAfter = getErrorHeader(error, "retry-after");
  const message = typeof error?.message === "string" ? error.message : "";

  return (
    String(remaining).trim() === "0" ||
    retryAfter !== undefined ||
    /(?:secondary[\s_-]*)?rate[\s_-]*limit/i.test(message)
  );
}

export function isPermissionError(error) {
  const status = error?.status ?? error?.response?.status;
  return (status === 401 || status === 403) && !isRateLimitError(error);
}

export function isActionOwnedComment(comment, marker) {
  return (
    comment.body?.includes(marker) &&
    comment.user?.type === "Bot" &&
    comment.user?.login === "github-actions[bot]"
  );
}

function compareCommentsByAge(left, right) {
  const leftCreatedAt = Date.parse(left.created_at);
  const rightCreatedAt = Date.parse(right.created_at);

  if (
    Number.isFinite(leftCreatedAt) &&
    Number.isFinite(rightCreatedAt) &&
    leftCreatedAt !== rightCreatedAt
  ) {
    return leftCreatedAt - rightCreatedAt;
  }

  return left.id - right.id;
}

export function buildCommentBody(marker, diff) {
  const body = `${marker}\n${diff}`;

  if (body.length <= MAX_COMMENT_BODY_LENGTH) {
    return body;
  }

  const suffix = `\n\n${TRUNCATION_FOOTER}`;
  const availableDiffLength =
    MAX_COMMENT_BODY_LENGTH - marker.length - 1 - suffix.length;
  const truncatedDiff = diff.slice(0, availableDiffLength).trimEnd();

  return `${marker}\n${truncatedDiff}${suffix}`;
}

export default async function upsertComment({
  github,
  context,
  core,
  diffPath,
  workingDirectory,
  channel,
  token = process.env.GITHUB_TOKEN,
}) {
  const pullRequest = context.payload?.pull_request;

  if (!pullRequest) {
    core.notice(
      "Skipping the Design System diff comment outside a pull request.",
    );
    return { action: "skipped", reason: "not-pull-request" };
  }

  if (isForkPullRequest(pullRequest)) {
    core.notice(
      "Skipping the Design System diff comment for a fork pull request because github.token is read-only.",
    );
    return { action: "skipped", reason: "fork" };
  }

  if (!token) {
    core.notice(
      "Skipping the Design System diff comment because github.token is unavailable.",
    );
    return { action: "skipped", reason: "missing-token" };
  }

  const owner = context.repo.owner;
  const repo = context.repo.repo;
  const issueNumber = pullRequest.number;
  const marker = scopedMarker(readDesignSystemId(workingDirectory), channel);
  const diff = readFileSync(diffPath, "utf8").trim();
  const body = buildCommentBody(marker, diff);
  const runHeadSha = pullRequest.head?.sha;

  const isStaleRun = async () => {
    const currentPullRequest = await github.rest.pulls.get({
      owner,
      repo,
      pull_number: issueNumber,
    });

    return runHeadSha !== currentPullRequest.data.head.sha;
  };

  const skipStaleRun = () => {
    core.notice(
      "Skipping the Design System diff comment because the pull request has moved to a newer commit.",
    );
    return { action: "skipped", reason: "stale-run" };
  };

  const listOwnedComments = async () => {
    const comments = await github.paginate(github.rest.issues.listComments, {
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    });

    return comments.filter((comment) => isActionOwnedComment(comment, marker));
  };

  const deduplicateComments = async (createdCommentId) => {
    const comments = (await listOwnedComments()).sort(compareCommentsByAge);
    const [oldestComment, ...duplicates] = comments;

    for (const duplicate of duplicates) {
      try {
        await github.rest.issues.deleteComment({
          owner,
          repo,
          comment_id: duplicate.id,
        });
      } catch (error) {
        if (error?.status !== 404) {
          throw error;
        }
      }
    }

    if (duplicates.length > 0) {
      core.info("Removed duplicate Better Email Design System diff comments.");
    }

    return oldestComment?.id ?? createdCommentId;
  };

  try {
    if (await isStaleRun()) {
      return skipStaleRun();
    }

    const [existingComment] = await listOwnedComments();

    if (await isStaleRun()) {
      return skipStaleRun();
    }

    if (existingComment) {
      await github.rest.issues.updateComment({
        owner,
        repo,
        comment_id: existingComment.id,
        body,
      });
      core.info("Updated the Better Email Design System diff comment.");
      return { action: "updated", commentId: existingComment.id };
    }

    const response = await github.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });
    const commentId = await deduplicateComments(response.data.id);
    core.info("Created the Better Email Design System diff comment.");
    return { action: "created", commentId };
  } catch (error) {
    if (isPermissionError(error)) {
      core.notice(
        "Skipping the Design System diff comment because github.token cannot write pull request comments.",
      );
      return { action: "skipped", reason: "read-only-token" };
    }

    throw error;
  }
}
