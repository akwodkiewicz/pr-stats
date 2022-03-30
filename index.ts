import * as core from '@actions/core';
import * as github from '@actions/github';

type Pull = Awaited<ReturnType<ReturnType<typeof github['getOctokit']>['rest']['pulls']['list']>>['data'][number];

async function main() {
    const token = core.getInput('token');
    const overrideOwner = core.getInput('override_owner');
    const overrideRepo = core.getInput('override_repo');

    const octokit = github.getOctokit(token);

    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    const thresholdDate = new Date(Date.now() - THIRTY_DAYS);
    const pulls: Pull[] = [];

    for await (const response of octokit.paginate.iterator(octokit.rest.pulls.list, {
        owner: overrideOwner || github.context.repo.owner,
        repo: overrideRepo || github.context.repo.repo,
        state: 'all',
        sort: 'created',
        direction: 'desc'
    })) {
        const pullsAboveThreshold = response.data.filter((d: Pull) => new Date(d.created_at) >= thresholdDate);
        pulls.push(...pullsAboveThreshold);
        if (pullsAboveThreshold.length < response.data.length) {
            break;
        }
    }


    const pullsWithDurations = pulls.map(attachPullDurationMs).sort((p1, p2) => p1[1] - p2[1]);

    const avgMs = pullsWithDurations.map(([p, d]) => d).slice(1).reduce((prev, curr, idx) => {
        return (prev * idx + curr) / (idx + 1);
    }, pullsWithDurations[0][1]);
    core.info(`Found ${pulls.length} pull request created after ${thresholdDate}`);

    const messages = [
        `Average active time: ${msToDays(avgMs)} d`,
        `Minimum active time: ${msToDays(pullsWithDurations[0][1])} d (${pullsWithDurations[0][0].html_url})`,
        `Maximum active time: ${msToDays(pullsWithDurations[pullsWithDurations.length - 1][1])} d (${pullsWithDurations[pullsWithDurations.length - 1][0].html_url})`
    ];
    for (const m of messages) {
        core.info(m);
        core.notice(m);
    }
}

function attachPullDurationMs(pull: Pull): [Pull, number] {
    return [
        pull,
        new Date(pull.closed_at ?? pull.merged_at ?? Date.now()).valueOf() - new Date(pull.created_at).valueOf()
    ];
}

function msToDays(ms: number): number {
    return Math.round((ms / (1000 * 60 * 60 * 24)) * 100) / 100;
}

main();