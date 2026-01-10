import * as React from 'react';
import {Paper, useTheme, Button, Grid, TextField, IconButton, Select, MenuItem, Chip, Input, FormControl, InputLabel} from '@material-ui/core';
import {ZoomIn, ZoomOut, Clear} from '@material-ui/icons';
import moment from 'moment';
import {useApolloClient, useMutation, useQuery} from '@apollo/react-hooks';
import {TimeSpans_timeSpans_timeSpans} from '../../gql/__generated__/TimeSpans';
import * as gqlTimeSpan from '../../gql/timeSpan';
import {Trackers} from '../../gql/__generated__/Trackers';
import {Tags} from '../../gql/__generated__/Tags';
import * as gqlTag from '../../gql/tags';
import FullCalendar from '@fullcalendar/react';
import {calculateColor, ColorMode} from '../colorutils';
import '@fullcalendar/core/main.css';
import '@fullcalendar/daygrid/main.css';
import '@fullcalendar/timegrid/main.css';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import momentPlugin from '@fullcalendar/moment';
import interactionPlugin from '@fullcalendar/interaction';
import {OptionsInput} from '@fullcalendar/core';
import {UpdateTimeSpan, UpdateTimeSpanVariables} from '../../gql/__generated__/UpdateTimeSpan';
import Popper from '@material-ui/core/Popper';
import ClickAwayListener from '@material-ui/core/ClickAwayListener';
import {TimeSpan} from '../TimeSpan';
import {toTagSelectorEntry} from '../../tag/tagSelectorEntry';
import {AddTimeSpan, AddTimeSpanVariables} from '../../gql/__generated__/AddTimeSpan';
import {FullCalendarStyling} from './FullCalendarStyling';
import useInterval from '@rooks/use-interval';
import {EventApi} from '@fullcalendar/core/api/EventApi';
import {StopTimer, StopTimerVariables} from '../../gql/__generated__/StopTimer';
import {
    addTimeSpanInRangeToCache,
    addTimeSpanToCache,
    removeFromTimeSpanInRangeCache,
    removeFromTrackersCache,
} from '../../gql/utils';
import {StartTimer, StartTimerVariables} from '../../gql/__generated__/StartTimer';
import {timeRunningCalendar} from '../timeutils';
import {stripTypename} from '../../utils/strip';
import {TimeSpansInRange, TimeSpansInRangeVariables} from '../../gql/__generated__/TimeSpansInRange';
import {ExtendedEventSourceInput} from '@fullcalendar/core/structs/event-source';

const toMoment = (date: Date): moment.Moment => {
    return moment(date).tz('utc');
};

declare global {
    interface Window {
        // tslint:disable-next-line:no-any
        __TRAGGO_CALENDAR: any;
    }
}

const StartTimerId = '-1';

export const CalendarPage: React.FC = () => {
    const apollo = useApolloClient();
    const theme = useTheme();
    const calendarRef = React.useRef<FullCalendar>(null);
    const [selectedDate, setSelectedDate] = React.useState<string>(moment().format('YYYY-MM-DD'));
    const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
    const [zoomLevel, setZoomLevel] = React.useState<number>(1);

    const timeSpansResult = useQuery<TimeSpansInRange, TimeSpansInRangeVariables>(gqlTimeSpan.TimeSpansInRange, {
        variables: {
            start: moment()
                .startOf('week')
                .format(),
            end: moment()
                .endOf('week')
                .format(),
        },
        fetchPolicy: 'cache-and-network',
    });
    const trackersResult = useQuery<Trackers>(gqlTimeSpan.Trackers, {fetchPolicy: 'cache-and-network'});
    const tagsResult = useQuery<Tags>(gqlTag.Tags);
    const [startTimer] = useMutation<StartTimer, StartTimerVariables>(gqlTimeSpan.StartTimer, {
        refetchQueries: [{query: gqlTimeSpan.Trackers}],
    });
    const [updateTimeSpanMutation] = useMutation<UpdateTimeSpan, UpdateTimeSpanVariables>(gqlTimeSpan.UpdateTimeSpan);
    const [currentDate, setCurrentDate] = React.useState(moment());
    const [stopTimer] = useMutation<StopTimer, StopTimerVariables>(gqlTimeSpan.StopTimer, {
        update: (cache, {data}) => {
            if (!data || !data.stopTimeSpan) {
                return;
            }
            removeFromTrackersCache(cache, data);
            addTimeSpanInRangeToCache(cache, data.stopTimeSpan, timeSpansResult.variables);
        },
    });
    useInterval(
        () => {
            setCurrentDate(moment());
        },
        60000,
        true
    );
    React.useEffect(() => {
        window.__TRAGGO_CALENDAR = {};
        return () => (window.__TRAGGO_CALENDAR = undefined);
    });
    const [ignore, setIgnore] = React.useState<boolean>(false);
    const [selected, setSelected] = React.useState<{selected: HTMLElement | null; data: TimeSpans_timeSpans_timeSpans | null}>({
        selected: null,
        data: null,
    });
    const [addTimeSpan] = useMutation<AddTimeSpan, AddTimeSpanVariables>(gqlTimeSpan.AddTimeSpan, {
        update: (cache, {data}) => {
            if (!data || !data.createTimeSpan) {
                return;
            }
            addTimeSpanInRangeToCache(cache, data.createTimeSpan, timeSpansResult.variables);
            addTimeSpanToCache(cache, data.createTimeSpan);
        },
    });

    const values: ExtendedEventSourceInput[] = (() => {
        if (
            timeSpansResult.error ||
            timeSpansResult.loading ||
            !timeSpansResult.data ||
            timeSpansResult.data.timeSpans === null ||
            trackersResult.error ||
            trackersResult.loading ||
            !trackersResult.data ||
            trackersResult.data.timers === null ||
            tagsResult.error ||
            tagsResult.loading ||
            !tagsResult.data ||
            tagsResult.data.tags === null
        ) {
            return [];
        }

        // Create a map of tag keys to their colors from the database
        const tagColorMap = new Map<string, string>();
        tagsResult.data.tags.forEach(tag => {
            tagColorMap.set(tag.key, tag.color);
        });

        const allEvents = timeSpansResult.data.timeSpans.timeSpans
            .concat(trackersResult.data.timers)
            .sort((a, b) => a.start.toString().localeCompare(b.start.toString()));

        // Filter by selected tags if any
        const filteredEvents = selectedTags.length > 0
            ? allEvents.filter(ts =>
                ts.tags && ts.tags.some(tag => selectedTags.includes(tag.key + ':' + tag.value))
              )
            : allEvents;

        return filteredEvents.map((ts) => {
                // Use the first tag's color from the database, or fall back to calculated color
                let color: string;
                let borderColor: string;

                if (ts.tags && ts.tags.length > 0) {
                    const firstTagKey = ts.tags[0].key;
                    const dbColor = tagColorMap.get(firstTagKey);

                    if (dbColor) {
                        // Use database color for the first tag
                        color = dbColor;
                        borderColor = dbColor;
                    } else {
                        // Fall back to calculated color if tag not found
                        const colorKey = ts.tags.map((t) => t.key + ':' + t.value)
                            .sort((a, b) => a.localeCompare(b))
                            .join(' ');
                        color = calculateColor(colorKey, ColorMode.Bold, theme.palette.type);
                        borderColor = calculateColor(colorKey, ColorMode.None, theme.palette.type);
                    }
                } else {
                    // No tags, use default color
                    color = theme.palette.grey[500];
                    borderColor = theme.palette.grey[700];
                }

                const startMoment = moment(ts.start);
                const endMoment = moment(ts.end || currentDate);

                // Fix overlapping: if end time is within the same minute as start time,
                // add 1 minute to the end time for display purposes
                let displayEnd = endMoment;
                if (ts.end && startMoment.format('YYYY-MM-DD HH:mm') === endMoment.format('YYYY-MM-DD HH:mm')) {
                    displayEnd = moment(endMoment).add(1, 'minute');
                }

                return {
                    start: startMoment.toDate(),
                    end: displayEnd.toDate(),
                    hasEnd: !!ts.end,
                    editable: !!ts.end,
                    backgroundColor: color,
                    startEditable: true,
                    id: ts.id,
                    tags: ts.tags!.map(({value, key}) => ({key, value})),
                    title: ts.tags!.map((t) => t.key + ':' + t.value).join(' '),
                    extendedProps: {ts},
                    textColor: theme.palette.getContrastText(color),
                    borderColor,
                };
            });
    })();

    const onDrop: OptionsInput['eventDrop'] = (data) => {
        updateTimeSpanMutation({
            variables: {
                oldStart: moment(data.oldEvent.start!).format(),
                start: moment(data.event.start!).format(),
                end: moment(data.event.end!).format(),
                id: parseInt(data.event.id, 10),
                tags: stripTypename(data.event.extendedProps.ts.tags),
                note: data.event.extendedProps.ts.note,
            },
        });
    };
    const onResize: OptionsInput['eventResize'] = (data) => {
        updateTimeSpanMutation({
            variables: {
                oldStart: moment(data.prevEvent.start!).format(),
                start: moment(data.event.start!).format(),
                end: moment(data.event.end!).format(),
                id: parseInt(data.event.id, 10),
                tags: stripTypename(data.event.extendedProps.ts.tags),
                note: data.event.extendedProps.ts.note,
            },
        });
    };
    const onSelect: OptionsInput['select'] = (data) => {
        addTimeSpan({
            variables: {
                start: moment(data.start).format(),
                end: moment(data.end).format(),
                tags: [],
                note: '',
            },
        });
    };
    const onClick: OptionsInput['eventClick'] = (data) => {
        data.jsEvent.preventDefault();
        if (data.event.id === StartTimerId) {
            startTimer({variables: {start: moment().format(), tags: [], note: ''}}).then(() => {
                setCurrentDate(moment());
            });
            return;
        }

        // tslint:disable-next-line:no-any
        setSelected({data: data.event.extendedProps.ts, selected: data.jsEvent.target as any});
    };
    if (trackersResult.data && !(trackersResult.data.timers || []).length) {
        const startTimerEvent: ExtendedEventSourceInput = {
            start: currentDate.toDate(),
            end: moment(currentDate)
                .add(15, 'minute')
                .toDate(),
            className: '__start',
            editable: false,
            id: StartTimerId,
        };
        values.push(startTimerEvent);
    }

    const handleGoToDate = () => {
        const calendarApi = calendarRef.current && calendarRef.current.getApi();
        if (calendarApi) {
            calendarApi.gotoDate(selectedDate);
        }
    };

    // Get all unique tags from the data
    const allTags = React.useMemo(() => {
        if (!timeSpansResult.data || !timeSpansResult.data.timeSpans) {
            return [];
        }
        const tagSet = new Set<string>();
        timeSpansResult.data.timeSpans.timeSpans.forEach(ts => {
            if (ts.tags) {
                ts.tags.forEach(tag => {
                    tagSet.add(tag.key + ':' + tag.value);
                });
            }
        });
        return Array.from(tagSet).sort();
    }, [timeSpansResult.data]);

    const handleZoomIn = () => {
        setZoomLevel(prev => Math.min(prev + 0.5, 4));
    };

    const handleZoomOut = () => {
        setZoomLevel(prev => Math.max(prev - 0.5, 0.5));
    };

    const slotHeight = 42 * zoomLevel;

    return (
        <Paper style={{padding: 10, bottom: 10, top: 80, position: 'absolute', display: 'flex', flexDirection: 'column'}} color="red">
            <div style={{padding: 10, backgroundColor: theme.palette.background.default, marginBottom: 10, flexShrink: 0}}>
                <Grid container spacing={2} alignItems="center">
                    <Grid item>
                        <TextField
                            type="date"
                            label="Jump to Date"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            InputLabelProps={{ shrink: true }}
                        />
                    </Grid>
                    <Grid item>
                        <Button variant="contained" color="primary" onClick={handleGoToDate}>
                            Go
                        </Button>
                    </Grid>
                    <Grid item xs>
                        <FormControl style={{ minWidth: 250, maxWidth: 400 }}>
                            <InputLabel id="tag-filter-label">Filter by Tags</InputLabel>
                            <Select
                                labelId="tag-filter-label"
                                multiple
                                value={selectedTags}
                                onChange={(e) => setSelectedTags(e.target.value as string[])}
                                input={<Input />}
                                renderValue={(selected) => (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                        {(selected as string[]).map((value) => (
                                            <Chip key={value} label={value} size="small" />
                                        ))}
                                    </div>
                                )}
                            >
                                {allTags.map((tag) => (
                                    <MenuItem key={tag} value={tag}>
                                        {tag}
                                    </MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>
                    <Grid item>
                        <IconButton
                            onClick={() => setSelectedTags([])}
                            disabled={selectedTags.length === 0}
                            title="Clear tag filter"
                        >
                            <Clear />
                        </IconButton>
                    </Grid>
                    <Grid item>
                        <IconButton onClick={handleZoomOut} disabled={zoomLevel <= 0.5} title="Zoom Out">
                            <ZoomOut />
                        </IconButton>
                        <IconButton onClick={handleZoomIn} disabled={zoomLevel >= 4} title="Zoom In">
                            <ZoomIn />
                        </IconButton>
                    </Grid>
                </Grid>
            </div>
            <div style={{flex: 1, overflow: 'hidden'}}>
            <FullCalendarStyling slotHeight={slotHeight}>
                <FullCalendar
                    ref={calendarRef}
                    defaultView="timeGridWeek"
                    rerenderDelay={30}
                    datesRender={(x) => {
                        const range = {
                            start: moment(x.view.currentStart).format(),
                            end: moment(x.view.currentEnd).format()
                        };
                        if (
                            timeSpansResult.variables &&
                            (timeSpansResult.variables.start !== range.start ||
                             timeSpansResult.variables.end !== range.end)
                        ) {
                            timeSpansResult.refetch(range);
                        }
                    }}
                    views={{
                        timeGrid5Day: {
                            type: 'timeGrid',
                            duration: {days: 7},
                            buttonText: '5 day',
                            hiddenDays: [0, 6],
                        },
                    }}
                    editable={true}
                    events={values}
                    slotEventOverlap={false}
                    allDaySlot={false}
                    selectable={true}
                    selectMirror={true}
                    handleWindowResize={true}
                    height={'parent'}
                    selectMinDistance={20}
                    now={currentDate.toDate()}
                    defaultTimedEventDuration={{minute: 15}}
                    eventRender={(e) => {
                        const content = e.el.getElementsByClassName('fc-content').item(0);
                        if (content) {
                            content.innerHTML = getElementContent(e.event, () => {
                                stopTimer({
                                    variables: {id: e.event.extendedProps.ts.id, end: moment().format()},
                                });
                            });
                        }

                        e.el.setAttribute('data-has-end', '' + (!e.event.extendedProps.ts || !!e.event.extendedProps.ts.end));
                    }}
                    slotLabelInterval={{minute: 60}}
                    slotDuration={{minute: 15}}
                    scrollTime={{hour: 6, minute: 30}}
                    select={onSelect}
                    firstDay={moment.localeData().firstDayOfWeek()}
                    eventResize={onResize}
                    eventClick={onClick}
                    eventDrop={onDrop}
                    slotLabelFormat={(s) => toMoment(s.start.marker).format('LT')}
                    columnHeaderFormat={(s) => toMoment(s.start.marker).format('DD ddd')}
                    nowIndicator={true}
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, momentPlugin]}
                    header={{
                        center: 'title',
                        left: 'prev,next today',
                        right: 'timeGridWeek,timeGrid5Day,timeGridDay',
                    }}
                />
            </FullCalendarStyling>
            {!!selected.selected && (
                <Popper open={true} anchorEl={selected.selected} style={{zIndex: 1200, maxWidth: 700}}>
                    <ClickAwayListener
                        onClickAway={() => {
                            if (ignore) {
                                return;
                            }
                            setSelected({selected: null, data: null});
                        }}>
                        <div>
                            <TimeSpan
                                elevation={10}
                                id={selected.data!.id}
                                key={selected.data!.id}
                                rangeChange={(range) => {
                                    setSelected({
                                        ...selected,
                                        data: {...selected.data!, start: range.from.format(), end: range.to && range.to.format()},
                                    });
                                }}
                                deleted={() => {
                                    removeFromTimeSpanInRangeCache(apollo.cache, selected.data!.id, timeSpansResult.variables);
                                    setSelected({selected: null, data: null});
                                }}
                                continued={() => setCurrentDate(moment())}
                                range={{
                                    from: moment(selected.data!.start),
                                    to: selected.data!.end ? moment(selected.data!.end) : undefined,
                                }}
                                initialTags={toTagSelectorEntry(
                                    tagsResult.data!.tags!,
                                    selected.data!.tags!.map((tag) => ({key: tag.key, value: tag.value}))
                                )}
                                note={selected.data!.note}
                                dateSelectorOpen={setIgnore}
                                stopped={() => {
                                    setSelected({
                                        ...selected,
                                        data: {...selected.data!, end: currentDate.toDate()},
                                    });
                                }}
                            />
                        </div>
                    </ClickAwayListener>
                </Popper>
            )}
            </div>
        </Paper>
    );
};

const getElementContent = (event: EventApi, stop: () => void): string => {
    if (!event.start || !event.end) {
        return '';
    }

    if (event.id === StartTimerId) {
        return 'START';
    }

    const start = moment(event.start);
    const end = moment(event.end);
    const diff = end.diff(start, 'minute');

    const lines = Math.floor(diff / 15);
    const hasEnd = !event.extendedProps.ts || event.extendedProps.ts.end;
    const hasNote = event.extendedProps.ts && event.extendedProps.ts.note && event.extendedProps.ts.note.trim() !== '';

    // Note indicator badge (orange dot on right edge, vertically centered)
    const noteBadge = hasNote ? '<span style="position: absolute; top: 50%; right: 2px; transform: translateY(-50%); width: 8px; height: 8px; background-color: #FF9800; border-radius: 50%; box-shadow: 0 1px 2px rgba(0,0,0,0.3);" title="Has notes"></span>' : '';

    let stopButton = '';
    if (!hasEnd) {
        const id = event.extendedProps.ts.id;
        if (!window.__TRAGGO_CALENDAR) {
            window.__TRAGGO_CALENDAR = {};
        }
        window.__TRAGGO_CALENDAR[id] = (e: Event) => {
            e.preventDefault();
            e.stopPropagation();
            stop();
            return false;
        };
        stopButton = `<div class="stop"><a onClick="return window.__TRAGGO_CALENDAR[${id}](event)">STOP ${timeRunningCalendar(
            start,
            end
        )}</a></div>`;
    }

    // Extract only the suffix (value) part of tags
    const tagSuffixes = event.extendedProps.ts && event.extendedProps.ts.tags
        ? event.extendedProps.ts.tags.map((tag: any) => tag.value).join(' ')
        : event.title || '';

    const clamp = (amount: number) =>
        `<span class="ellipsis" title="${event.title}" style="-webkit-line-clamp: ${amount}">${tagSuffixes}</span>`;

    // For very small entries (less than 15 minutes), show only color - no text
    if (diff < 15) {
        return noteBadge + stopButton;
    }

    // For small entries (less than 2 lines worth), show only tag suffixes
    if (lines < 2) {
        return noteBadge + (tagSuffixes
            ? `<span class="ellipsis-single" title="${event.title}">${tagSuffixes}</span>${stopButton}`
            : stopButton);
    }

    // For medium entries (2 lines), show tag suffixes
    if (lines === 2) {
        return `${noteBadge}<span class="ellipsis-single" title="${event.title}">${tagSuffixes}</span>${stopButton}`;
    }

    // For larger entries, show tag suffixes on multiple lines
    return `${noteBadge}${clamp(lines - 1)}${stopButton}`;
};
