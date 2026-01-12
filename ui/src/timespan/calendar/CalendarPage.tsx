import * as React from 'react';
import {Paper, useTheme, Button, TextField, IconButton, Dialog, DialogTitle, DialogContent, DialogActions, List, ListItem, ListItemText, Checkbox, Badge, Collapse} from '@material-ui/core';
import {ZoomIn, ZoomOut, FilterList, ChevronLeft, ChevronRight, ExpandLess, ExpandMore} from '@material-ui/icons';
import moment from 'moment';
import {useApolloClient, useMutation, useQuery, useLazyQuery} from '@apollo/react-hooks';
import {TimeSpans_timeSpans_timeSpans} from '../../gql/__generated__/TimeSpans';
import * as gqlTimeSpan from '../../gql/timeSpan';
import {Trackers} from '../../gql/__generated__/Trackers';
import {Tags} from '../../gql/__generated__/Tags';
import {SuggestTagValue, SuggestTagValueVariables} from '../../gql/__generated__/SuggestTagValue';
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
    const [isManualDateChange, setIsManualDateChange] = React.useState<boolean>(false);
    const [selectedTags, setSelectedTags] = React.useState<string[]>([]);
    const [tempSelectedTags, setTempSelectedTags] = React.useState<string[]>([]);
    const [zoomLevel, setZoomLevel] = React.useState<number>(1);
    const [filterDialogOpen, setFilterDialogOpen] = React.useState<boolean>(false);
    const [tagSearchText, setTagSearchText] = React.useState<string>('');
    const [expandedKeys, setExpandedKeys] = React.useState<Set<string>>(new Set());
    const [tagValuesCache, setTagValuesCache] = React.useState<Map<string, string[]>>(new Map());
    const [pendingEntry, setPendingEntry] = React.useState<{start: moment.Moment; end: moment.Moment; x: number; y: number} | null>(null);

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

    // Get unique tag keys from current week's timespans for color mapping
    const visibleTagKeys = React.useMemo(() => {
        if (!timeSpansResult.data || !timeSpansResult.data.timeSpans) return [];
        if (!trackersResult.data || !trackersResult.data.timers) return [];

        const allTimespans = [
            ...timeSpansResult.data.timeSpans.timeSpans,
            ...trackersResult.data.timers
        ];

        const keys = new Set<string>();
        allTimespans.forEach(ts => {
            if (ts.tags) {
                ts.tags.forEach(tag => keys.add(tag.key));
            }
        });
        return Array.from(keys);
    }, [timeSpansResult.data, trackersResult.data]);

    // Query only tags that are visible in current week for colors
    const visibleTagsResult = useQuery<Tags>(gqlTag.Tags, {
        fetchPolicy: 'cache-and-network',
        skip: visibleTagKeys.length === 0,
    });

    // Lazy query for ALL tags (used by filter dialog)
    const [fetchAllTags, allTagsResult] = useLazyQuery<Tags>(gqlTag.Tags, {fetchPolicy: 'cache-and-network'});

    const [fetchTagValues, {data: tagValuesData, called: tagValuesCalled}] = useLazyQuery<SuggestTagValue, SuggestTagValueVariables>(gqlTag.SuggestTagValue);

    // Store the key we're currently fetching values for
    const [fetchingKey, setFetchingKey] = React.useState<string | null>(null);

    // Update cache when tag values are fetched
    React.useEffect(() => {
        if (tagValuesCalled && tagValuesData && fetchingKey && !tagValuesCache.has(fetchingKey)) {
            const newCache = new Map(tagValuesCache);
            newCache.set(fetchingKey, tagValuesData.values || []);
            setTagValuesCache(newCache);
            setFetchingKey(null);
        }
    }, [tagValuesData, tagValuesCalled, fetchingKey, tagValuesCache]);
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
            visibleTagsResult.error ||
            visibleTagsResult.loading ||
            !visibleTagsResult.data ||
            visibleTagsResult.data.tags === null
        ) {
            return [];
        }

        // Create a map of tag keys to their colors from the database
        const tagColorMap = new Map<string, string>();
        visibleTagsResult.data.tags.forEach(tag => {
            tagColorMap.set(tag.key, tag.color);
        });

        const allEvents = timeSpansResult.data.timeSpans.timeSpans
            .concat(trackersResult.data.timers)
            .filter((ts) => {
                // Filter out entries that are less than 60 seconds (1 minute)
                // These are too short to display meaningfully in the calendar view
                if (!ts.end) {
                    return true; // Keep running timers
                }
                const durationSeconds = moment(ts.end).diff(moment(ts.start), 'seconds');
                return durationSeconds >= 60;
            })
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

                // Round to minute boundaries to prevent false overlap detection.
                // Since the UI only allows editing at minute-level precision, entries that
                // end/start within the same minute (e.g., A ends 4:20:38, B starts 4:20:46)
                // should be treated as adjacent, not overlapping.
                const displayStart = moment(startMoment).startOf('minute').toDate();
                let displayEndDate = endMoment.toDate();

                if (ts.end) {
                    // End at the beginning of the end minute minus 1ms
                    // This way, an entry ending at 4:20:XX displays as ending at 4:19:59.999
                    // So it doesn't overlap with an entry starting at 4:20:XX
                    displayEndDate = moment(endMoment).startOf('minute').subtract(1, 'millisecond').toDate();
                }

                return {
                    start: displayStart,
                    end: displayEndDate,
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

    const onDateClick: OptionsInput['dateClick'] = (data) => {
        // Show a confirmation button when clicking/tapping an empty slot
        const start = moment(data.date);
        const end = moment(data.date).add(15, 'minutes');
        // Use click coordinates for positioning
        setPendingEntry({
            start,
            end,
            x: data.jsEvent.pageX,
            y: data.jsEvent.pageY
        });
    };

    const handleConfirmCreate = () => {
        if (pendingEntry) {
            addTimeSpan({
                variables: {
                    start: pendingEntry.start.format(),
                    end: pendingEntry.end.format(),
                    tags: [],
                    note: '',
                },
            });
            setPendingEntry(null);
        }
    };

    const handleCancelCreate = () => {
        setPendingEntry(null);
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
            setIsManualDateChange(false);
            calendarApi.gotoDate(selectedDate);
        }
    };

    const handlePrev = () => {
        const calendarApi = calendarRef.current && calendarRef.current.getApi();
        if (calendarApi) {
            setIsManualDateChange(false);
            calendarApi.prev();
        }
    };

    const handleNext = () => {
        const calendarApi = calendarRef.current && calendarRef.current.getApi();
        if (calendarApi) {
            setIsManualDateChange(false);
            calendarApi.next();
        }
    };

    const handleToday = () => {
        const calendarApi = calendarRef.current && calendarRef.current.getApi();
        if (calendarApi) {
            setIsManualDateChange(false);
            calendarApi.today();
        }
    };

    const handleDateInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setIsManualDateChange(true);
        setSelectedDate(e.target.value);
    };

    const handleOpenFilterDialog = () => {
        setTempSelectedTags(selectedTags);
        setTagSearchText('');
        setExpandedKeys(new Set());
        setTagValuesCache(new Map());
        setFilterDialogOpen(true);
        // Fetch ALL tags when opening the filter dialog
        if (!allTagsResult.data && !allTagsResult.loading) {
            fetchAllTags();
        }
    };

    const handleApplyFilter = () => {
        setSelectedTags(tempSelectedTags);
        setFilterDialogOpen(false);
    };

    const handleClearAllTags = () => {
        setTempSelectedTags([]);
    };

    const handleToggleKey = (key: string) => {
        const newExpandedKeys = new Set(expandedKeys);

        if (newExpandedKeys.has(key)) {
            // Collapse the key
            newExpandedKeys.delete(key);
            setExpandedKeys(newExpandedKeys);
        } else {
            // Expand the key and fetch values if not cached
            newExpandedKeys.add(key);
            setExpandedKeys(newExpandedKeys);

            if (!tagValuesCache.has(key)) {
                setFetchingKey(key);
                fetchTagValues({
                    variables: { tag: key, query: '' }
                });
            }
        }
    };

    const handleToggleValue = (key: string, value: string) => {
        const tagString = `${key}:${value}`;
        setTempSelectedTags(prev =>
            prev.includes(tagString) ? prev.filter(t => t !== tagString) : [...prev, tagString]
        );
    };

    const handleSelectAllValues = (key: string) => {
        const values = tagValuesCache.get(key) || [];
        const tagStrings = values.map(v => `${key}:${v}`);
        setTempSelectedTags(prev => {
            const filtered = prev.filter(t => !t.startsWith(`${key}:`));
            return [...filtered, ...tagStrings];
        });
    };

    const handleDeselectAllValues = (key: string) => {
        setTempSelectedTags(prev => prev.filter(t => !t.startsWith(`${key}:`)));
    };

    // Get all tag keys from the database (for filter dialog)
    const allTagKeys = React.useMemo(() => {
        if (!allTagsResult.data || !allTagsResult.data.tags) {
            return [];
        }
        return allTagsResult.data.tags.map(tag => tag.key).sort();
    }, [allTagsResult.data]);

    // Filter keys based on search text
    const filteredKeys = React.useMemo(() => {
        if (!tagSearchText) return allTagKeys;
        return allTagKeys.filter(key => key.toLowerCase().includes(tagSearchText.toLowerCase()));
    }, [allTagKeys, tagSearchText]);

    const handleZoomIn = () => {
        setZoomLevel(prev => Math.min(prev + 0.25, 2));
    };

    const handleZoomOut = () => {
        setZoomLevel(prev => Math.max(prev - 0.25, 0.75));
    };

    const slotHeight = 21 * zoomLevel;  // Original default was 21px per 15-min slot

    return (
        <Paper style={{padding: 5, bottom: 10, top: 80, position: 'absolute', display: 'flex', flexDirection: 'column'}} color="red">
            <div style={{padding: '4px 6px', backgroundColor: theme.palette.background.default, marginBottom: 5, flexShrink: 0, borderRadius: 4, display: 'flex', alignItems: 'center', flexWrap: 'nowrap'}}>
                <IconButton size="small" onClick={handlePrev} title="Previous" style={{padding: 6, marginRight: 2}}>
                    <ChevronLeft fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={handleNext} title="Next" style={{padding: 6, marginRight: 8}}>
                    <ChevronRight fontSize="small" />
                </IconButton>
                <Button size="small" onClick={handleToday} style={{minWidth: 45, padding: '4px 8px', fontSize: '0.75rem', marginRight: 8}}>
                    Today
                </Button>
                <TextField
                    type="date"
                    value={selectedDate}
                    onChange={handleDateInputChange}
                    InputLabelProps={{ shrink: true }}
                    style={{width: 130, marginRight: 4}}
                    inputProps={{style: {padding: '6px 8px', fontSize: '0.85rem'}}}
                />
                <Button size="small" variant="contained" color="primary" onClick={handleGoToDate} style={{minWidth: 35, padding: '4px 10px', fontSize: '0.75rem', marginRight: 'auto'}}>
                    Go
                </Button>
                <Badge badgeContent={selectedTags.length} color="secondary" style={{marginRight: 4}}>
                    <IconButton size="small" onClick={handleOpenFilterDialog} title="Filter" style={{padding: 6}}>
                        <FilterList fontSize="small" />
                    </IconButton>
                </Badge>
                <IconButton size="small" onClick={handleZoomOut} disabled={zoomLevel <= 0.75} title="Zoom Out" style={{padding: 6, marginRight: 2}}>
                    <ZoomOut fontSize="small" />
                </IconButton>
                <IconButton size="small" onClick={handleZoomIn} disabled={zoomLevel >= 2} title="Zoom In" style={{padding: 6}}>
                    <ZoomIn fontSize="small" />
                </IconButton>
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

                        // Update the date picker to reflect the current view (only if user is not manually typing)
                        if (!isManualDateChange) {
                            const currentViewDate = moment(x.view.currentStart).add(3, 'days').format('YYYY-MM-DD');
                            setSelectedDate(currentViewDate);
                        }

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
                    dateClick={onDateClick}
                    firstDay={moment.localeData().firstDayOfWeek()}
                    eventResize={onResize}
                    eventClick={onClick}
                    eventDrop={onDrop}
                    slotLabelFormat={(s) => toMoment(s.start.marker).format('LT')}
                    columnHeaderFormat={(s) => toMoment(s.start.marker).format('DD ddd')}
                    nowIndicator={true}
                    plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, momentPlugin]}
                    header={false}
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
                                    visibleTagsResult.data!.tags!,
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

            {/* Create Entry Confirmation Popup - "+" Button */}
            {!!pendingEntry && (
                <ClickAwayListener onClickAway={handleCancelCreate}>
                    <div
                        style={{
                            position: 'absolute',
                            left: pendingEntry.x,
                            top: pendingEntry.y,
                            transform: 'translate(-24px, -24px)',
                            zIndex: 1200,
                            pointerEvents: 'auto'
                        }}
                    >
                        <IconButton
                            onClick={handleConfirmCreate}
                            style={{
                                backgroundColor: theme.palette.primary.main,
                                color: theme.palette.primary.contrastText,
                                width: 48,
                                height: 48,
                                boxShadow: theme.shadows[8],
                            }}
                            title={`Create entry: ${pendingEntry.start.format('HH:mm')} - ${pendingEntry.end.format('HH:mm')}`}
                        >
                            <span style={{fontSize: '28px', fontWeight: 'bold'}}>+</span>
                        </IconButton>
                    </div>
                </ClickAwayListener>
            )}

            {/* Tag Filter Dialog */}
            <Dialog open={filterDialogOpen} onClose={() => setFilterDialogOpen(false)} maxWidth="sm" fullWidth>
                <DialogTitle>Filter by Tags</DialogTitle>
                <DialogContent>
                    <TextField
                        label="Search tag keys"
                        value={tagSearchText}
                        onChange={(e) => setTagSearchText(e.target.value)}
                        fullWidth
                        margin="normal"
                    />
                    <div style={{ maxHeight: 400, overflow: 'auto' }}>
                        {allTagsResult.loading && (
                            <div style={{ padding: '20px', textAlign: 'center', color: theme.palette.text.secondary }}>
                                Loading tags...
                            </div>
                        )}
                        {!allTagsResult.loading && (
                            <List>
                            {filteredKeys.map((key) => {
                                const isExpanded = expandedKeys.has(key);
                                const values = tagValuesCache.get(key) || [];
                                const selectedValuesCount = tempSelectedTags.filter(t => t.startsWith(`${key}:`)).length;

                                return (
                                    <React.Fragment key={key}>
                                        <ListItem button onClick={() => handleToggleKey(key)} dense>
                                            <ListItemText
                                                primary={key}
                                                secondary={selectedValuesCount > 0 ? `${selectedValuesCount} selected` : undefined}
                                            />
                                            {isExpanded ? <ExpandLess /> : <ExpandMore />}
                                        </ListItem>
                                        <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                                            <div style={{ paddingLeft: 16 }}>
                                                {values.length > 0 && (
                                                    <div style={{ padding: '4px 16px' }}>
                                                        <Button
                                                            size="small"
                                                            onClick={() => handleSelectAllValues(key)}
                                                            style={{ marginRight: 8 }}
                                                        >
                                                            Select All
                                                        </Button>
                                                        <Button
                                                            size="small"
                                                            onClick={() => handleDeselectAllValues(key)}
                                                        >
                                                            Deselect All
                                                        </Button>
                                                    </div>
                                                )}
                                                <List component="div" disablePadding>
                                                    {values.map((value) => {
                                                        const tagString = `${key}:${value}`;
                                                        return (
                                                            <ListItem
                                                                key={value}
                                                                button
                                                                onClick={() => handleToggleValue(key, value)}
                                                                dense
                                                                style={{ paddingLeft: 32 }}
                                                            >
                                                                <Checkbox
                                                                    edge="start"
                                                                    checked={tempSelectedTags.includes(tagString)}
                                                                    tabIndex={-1}
                                                                    disableRipple
                                                                />
                                                                <ListItemText primary={value} />
                                                            </ListItem>
                                                        );
                                                    })}
                                                    {values.length === 0 && (
                                                        <ListItem dense style={{ paddingLeft: 32 }}>
                                                            <ListItemText
                                                                primary={fetchingKey === key ? "Loading values..." : "No values found"}
                                                                primaryTypographyProps={{ color: 'textSecondary' }}
                                                            />
                                                        </ListItem>
                                                    )}
                                                </List>
                                            </div>
                                        </Collapse>
                                    </React.Fragment>
                                );
                            })}
                        </List>
                        )}
                    </div>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleClearAllTags} color="default">
                        Clear All
                    </Button>
                    <Button onClick={() => setFilterDialogOpen(false)} color="default">
                        Cancel
                    </Button>
                    <Button onClick={handleApplyFilter} color="primary" variant="contained">
                        Apply
                    </Button>
                </DialogActions>
            </Dialog>
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

    // For very small entries (less than 15 minutes), show only color - no text
    if (diff < 15) {
        return noteBadge + stopButton;
    }

    // For all other entries, show text with natural wrapping
    // The text will automatically wrap to multiple lines based on the container height
    return `${noteBadge}<span class="ellipsis-single" title="${event.title}">${tagSuffixes}</span>${stopButton}`;
};
