import * as React from 'react';
import {Tracker} from './Tracker';
import {ActiveTrackers} from './ActiveTrackers';
import {DoneTrackers} from './DoneTrackers';
import {TagSelectorEntry} from '../tag/tagSelectorEntry';
import {RefreshTimeSpans} from './RefreshTimespans';
import {Paper, Button, Grid} from '@material-ui/core';
import {DateTimeSelector} from '../common/DateTimeSelector';
import moment from 'moment';

export const DailyPage = () => {
    const [selectedEntries, setSelectedEntries] = React.useState<TagSelectorEntry[]>([]);
    const [dateRangeEnabled, setDateRangeEnabled] = React.useState(false);
    const [startDate, setStartDate] = React.useState<moment.Moment>(moment().subtract(7, 'days').startOf('day'));
    const [endDate, setEndDate] = React.useState<moment.Moment>(moment().endOf('day'));

    return (
        <div style={{margin: '1px auto', maxWidth: 1000}}>
            <Tracker selectedEntries={selectedEntries} onSelectedEntriesChanged={setSelectedEntries} />

            <Paper style={{padding: 10, marginTop: 10, marginBottom: 10}}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item>
                        <Button
                            variant={dateRangeEnabled ? 'contained' : 'outlined'}
                            color="primary"
                            onClick={() => setDateRangeEnabled(!dateRangeEnabled)}
                        >
                            {dateRangeEnabled ? 'Clear Filter' : 'Filter by Date Range'}
                        </Button>
                    </Grid>
                    {dateRangeEnabled && (
                        <>
                            <Grid item>
                                <DateTimeSelector
                                    label="From"
                                    selectedDate={startDate}
                                    onSelectDate={setStartDate}
                                    showDate={true}
                                />
                            </Grid>
                            <Grid item>
                                <DateTimeSelector
                                    label="To"
                                    selectedDate={endDate}
                                    onSelectDate={setEndDate}
                                    showDate={true}
                                />
                            </Grid>
                        </>
                    )}
                </Grid>
            </Paper>

            <ActiveTrackers />
            <DoneTrackers
                addTagsToTracker={
                    selectedEntries.length === 0 ? (entries) => setSelectedEntries(selectedEntries.concat(entries)) : undefined
                }
                startDate={dateRangeEnabled ? startDate.format() : undefined}
                endDate={dateRangeEnabled ? endDate.format() : undefined}
            />
            <RefreshTimeSpans />
        </div>
    );
};
