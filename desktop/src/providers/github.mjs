// `github` kind: contribution calendar, open PRs with check state, and PRs
// waiting for your review — one GraphQL query, every 15 minutes, only while a
// GitHub widget is shown. Auth: a token in the secret store ("github:token"),
// else the signed-in `gh` CLI. The token never leaves this computer.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

export const QUERY = `query {
  viewer {
    login
    contributionsCollection {
      totalCommitContributions totalPullRequestContributions totalIssueContributions totalPullRequestReviewContributions
      contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
      commitContributionsByRepository(maxRepositories: 6) { repository { nameWithOwner } contributions { totalCount } }
    }
    pullRequests(first: 10, states: OPEN, orderBy: {field: UPDATED_AT, direction: DESC}) {
      nodes { number title url isDraft repository { nameWithOwner } commits(last: 1) { nodes { commit { statusCheckRollup { state } } } } }
    }
  }
  reviews: search(query: "is:pr is:open review-requested:@me archived:false", type: ISSUE, first: 10) {
    issueCount
    nodes { ... on PullRequest { number title url repository { nameWithOwner } author { login } } }
  }
}`;

const CHECK = { SUCCESS: "passing", FAILURE: "failing", ERROR: "failing", PENDING: "running", EXPECTED: "running" };

/** Shape a GraphQL answer into what the widgets show. Pure. */
export function shapeGithub(data, now = Date.now()) {
  const v = data?.viewer;
  if (!v) return null;
  const cc = v.contributionsCollection ?? {};
  const days = (cc.contributionCalendar?.weeks ?? []).flatMap((w) => w.contributionDays ?? []).map((d) => ({ date: d.date, count: d.contributionCount }));
  // Current streak: consecutive days with contributions, ending today or yesterday.
  let streak = 0;
  const today = new Date(now).toISOString().slice(0, 10);
  const list = [...days].reverse();
  if (list[0]?.date === today && list[0].count === 0) list.shift();
  for (const d of list) {
    if (d.count > 0) streak++;
    else break;
  }
  return {
    login: v.login,
    total: cc.contributionCalendar?.totalContributions ?? 0,
    streak,
    days: days.slice(-371),
    kinds: { commits: cc.totalCommitContributions ?? 0, prs: cc.totalPullRequestContributions ?? 0, issues: cc.totalIssueContributions ?? 0, reviews: cc.totalPullRequestReviewContributions ?? 0 },
    repos: (cc.commitContributionsByRepository ?? []).map((r) => ({ repo: r.repository?.nameWithOwner ?? "", commits: r.contributions?.totalCount ?? 0 })),
    prs: (v.pullRequests?.nodes ?? []).map((p) => ({ number: p.number, title: p.title, url: p.url, repo: p.repository?.nameWithOwner ?? "", draft: !!p.isDraft, checks: CHECK[p.commits?.nodes?.[0]?.commit?.statusCheckRollup?.state] ?? "none" })),
    reviews: { count: data.reviews?.issueCount ?? 0, items: (data.reviews?.nodes ?? []).filter((n) => n?.number).map((p) => ({ number: p.number, title: p.title, url: p.url, repo: p.repository?.nameWithOwner ?? "", author: p.author?.login ?? "" })) },
    at: now,
  };
}

export function createGithub({ secrets, getWidgets = () => [], fetchImpl = fetch, runImpl = run } = {}) {
  let cache = null;
  let cacheAt = 0;
  let lastError = null;

  async function query() {
    const token = secrets?.get?.("github:token");
    if (token) {
      const r = await fetchImpl("https://api.github.com/graphql", { method: "POST", headers: { authorization: `bearer ${token}`, "content-type": "application/json", "user-agent": "DeskAssist" }, body: JSON.stringify({ query: QUERY }), signal: AbortSignal.timeout(15000) });
      const j = await r.json();
      if (!r.ok || j.errors) throw new Error(j.message ?? j.errors?.[0]?.message ?? `GitHub answered ${r.status}`);
      return j.data;
    }
    const { stdout } = await runImpl("gh", ["api", "graphql", "-f", `query=${QUERY}`], { timeout: 20000, maxBuffer: 4 * 1024 * 1024 });
    return JSON.parse(stdout).data;
  }

  return {
    periodMs: 60_000,
    async sample() {
      if (!getWidgets("github").length && !getWidgets("contributions").length && !getWidgets("prs").length) return cache;
      if (cache && Date.now() - cacheAt < 15 * 60_000) return cache;
      try {
        cache = shapeGithub(await query());
        cacheAt = Date.now();
        lastError = null;
      } catch (err) {
        lastError = /ENOENT/.test(err.message) ? "Sign in with the gh command-line tool, or add a GitHub token in the editor." : err.message;
        cacheAt = Date.now() - 10 * 60_000; // retry in ~5 minutes
        return cache ? { ...cache, error: lastError } : { error: lastError, at: Date.now() };
      }
      return cache;
    },
  };
}
