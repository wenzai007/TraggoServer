import {Stats_stats_entries} from '../../gql/__generated__/Stats';

export const groupEntriesByPrefix = (entries: Stats_stats_entries[]): Stats_stats_entries[] => {
    const grouped: Record<string, number> = {};

    entries.forEach((entry) => {
        const prefix = entry.key;
        grouped[prefix] = (grouped[prefix] || 0) + entry.timeSpendInSeconds;
    });

    return Object.entries(grouped)
        .map(([key, timeSpendInSeconds]) => ({
            key,
            value: '',
            timeSpendInSeconds,
            __typename: 'StatisticsEntry' as const,
        }))
        .sort((a, b) => b.timeSpendInSeconds - a.timeSpendInSeconds); // Sort by time descending
};
