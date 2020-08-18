#!/usr/bin/env node
'use strict';

require('dotenv').config();
const { request } = require('@octokit/request');
const { userInfoFetcher, totalCommitsFetcher } = require('./fetch');

const gistId = process.env.GIST_ID;
const githubToken = process.env.GH_TOKEN;
const countAllCommits = process.env.ALL_COMMITS.toString() === 'true';

async function main() {
    const stats = await getStats();
    await updateGist(stats);
}

async function getStats() {
    const stats = {
        name: '',
        totalPRs: 0,
        totalCommits: 0,
        totalIssues: 0,
        totalStars: 0,
        contributedTo: 0,
    };

    const user = await userInfoFetcher(githubToken).then((res) => res.data.data.viewer);

    stats.name = user.name || user.login;
    stats.totalPRs = user.pullRequests.totalCount;
    stats.totalIssues = user.issues.totalCount;
    stats.contributedTo = user.repositoriesContributedTo.totalCount;
    stats.totalStars = user.repositories.nodes.reduce((prev, curr) => {
        return prev + curr.stargazers.totalCount;
    }, 0);

    stats.totalCommits = user.contributionsCollection.totalCommitContributions;
    if (countAllCommits) {
        stats.totalCommits = await totalCommitsFetcher(user.login, githubToken);
    }

    return stats;
}

async function updateGist(stats) {
    const humanize = (n) => (n > 999 ? (n / 1000).toFixed(1) + 'k' : n);

    const gistContent =
        [
            ['⭐', `Total Stars`, humanize(stats.totalStars)],
            ['➕', countAllCommits ? 'Total Commits' : 'Past Year Commits', humanize(stats.totalCommits)],
            ['🔀', `Total PRs`, humanize(stats.totalPRs)],
            ['🚩', `Total Issues`, humanize(stats.totalIssues)],
            ['📦', `Contributed to`, humanize(stats.contributedTo)],
        ]
            .map((content) => {
                let line = `${content[1]}:${content[2]}`;
                line = line.replace(':', ':' + ' '.repeat(45 - line.length));
                line = `${content[0]}    ${line}`;
                return line;
            })
            .join('\n') + '\n';

    const gist = await request('GET /gists/:gist_id', {
        gist_id: gistId,
        headers: { authorization: `token ${githubToken}` },
    });
    const filename = Object.keys(gist.data.files)[0];

    if (gist.data.files[filename].content === gistContent) {
        console.info('Nothing to update');
        return;
    }

    return request('PATCH /gists/:gist_id', {
        files: {
            [filename]: {
                filename: `${stats.name}'s GitHub Stats`,
                content: gistContent,
            },
        },
        gist_id: gistId,
        headers: { authorization: `token ${githubToken}` },
    }).then(() => {
        console.info(`Updated Gist ${gistId} with the following content:\n${gistContent}`);
    });
}

(async () => {
    await main().catch((err) => {
        console.error(err);
    });
})();
