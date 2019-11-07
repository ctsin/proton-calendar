import React, { useMemo, useState, useRef, useLayoutEffect, createElement } from 'react';
import { chunk } from 'proton-shared/lib/helpers/array';
import PropTypes from 'prop-types';
import { useWindowSize } from 'react-components';
import { isDateYYMMDDEqual } from 'proton-shared/lib/date/date';

import { eachDayOfInterval, getWeekNumber } from 'proton-shared/lib/date-fns-utc';

import { sortWithTemporaryEvent } from './layout';
import useDayGridEventLayout from './useDayGridEventLayout';
import './DayGrid.scss';
import { TYPES } from './constants';
import useDayGridMouseHandler from './useDayGridMouseHandler';
import usePopoverEvent from './usePopoverEvent';
import useMore from './useMore';

export const isMoreSelected = (idx, moreIdx, rowIndex, moreRow) => idx === moreIdx && rowIndex === moreRow;

export const getMoreProps = ({ idx, data, eventRef, style, children, isSelected }) => {
    const props = {
        style,
        data,
        key: `more${idx}`,
        isSelected,
        eventRef
    };

    return createElement(children, props);
};

export const getEvent = (idx, eventsInRow, sortedEvents) => {
    const { idx: eventIdx } = eventsInRow[idx];
    return sortedEvents[eventIdx];
};

export const renderEvent = ({ style, data, children, isSelected, eventRef, formatTime }) => {
    const props = {
        style,
        data,
        type: TYPES.FULL_DAY,
        key: data.id,
        formatTime,
        isSelected,
        eventRef
    };

    return createElement(children, props);
};

const DayGrid = ({
    children,
    now,
    date,
    dateRange: [start, end],
    dateRange,
    displayWeekNumbers = false,
    tzid,
    components: { FullDayEvent, PartDayEvent, PopoverEvent, MorePopoverEvent, MoreFullDayEvent },
    events,
    formatTime,
    onClickDate,
    onEditEvent,
    onCreateEvent,
    weekdaysLong = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
}) => {
    const rowsWrapperRef = useRef();
    const firstRowRef = useRef();
    const [numberOfRows, setNumberOfRows] = useState(0);
    const [windowWidth, windowHeight] = useWindowSize();

    const daysInWeek = 7;
    const dayEventHeight = 24; // in px

    const rows = useMemo(() => {
        return chunk(eachDayOfInterval(start, end), daysInWeek);
    }, [+start, +end]);

    const [temporaryEvent, setTemporaryEvent] = useState();
    const [selectedEventID, setSelectedEventID] = useState();
    const [moreDateIdx, setMoreDateIdx] = useState();

    const sortedEvents = useMemo(() => {
        return sortWithTemporaryEvent(events, temporaryEvent);
    }, [temporaryEvent, events]);

    const eventsPerRows = useDayGridEventLayout(rows, sortedEvents, numberOfRows, dayEventHeight);

    useLayoutEffect(() => {
        const rect = firstRowRef.current.getBoundingClientRect();
        const newNumberOfRows = rect.height / dayEventHeight;
        setNumberOfRows(Math.floor(newNumberOfRows) - 1);
        // This is listening to windowHeight instead of the actual dom size because resizeObserver is not well supported
    }, [firstRowRef.current, windowHeight, dateRange]);

    const onDayGridMouseDown = useDayGridMouseHandler({
        setTemporaryEvent,
        setSelectedEventID,
        setMoreDateIdx,
        events: sortedEvents,
        eventsPerRows,
        rows
    });

    const selectedEventRef = useRef();
    const mainRef = useRef();
    const selectedEvent = useMemo(() => {
        return sortedEvents.find(({ id }) => id === selectedEventID);
    }, [selectedEventID, sortedEvents]);

    const [popoverStyle, popoverLayout] = usePopoverEvent(
        selectedEvent,
        selectedEventRef,
        mainRef,
        rows,
        windowWidth,
        windowHeight
    );

    const selectedMoreRef = useRef();
    const [selectedMoreData, moreRow, moreIdx] = useMore(moreDateIdx, eventsPerRows, sortedEvents);
    const selectedMoreDate =
        typeof moreRow !== 'undefined' && typeof moreIdx !== 'undefined' ? rows[moreRow][moreIdx] : undefined;
    const [morePopoverStyle, morePopoverLayout] = usePopoverEvent(
        selectedMoreData,
        selectedMoreRef,
        mainRef,
        rows,
        windowWidth,
        windowHeight
    );

    let isFirstSelection = true;

    return (
        <div className="flex flex-column relative h100" ref={mainRef}>
            <div className="flex daygrid-days">
                {displayWeekNumbers ? <div className="daygrid-weeknumber-width" /> : null}
                {rows[0].map((day) => {
                    return (
                        <div className="flex-item-fluid aligncenter daygrid-day" key={day.getUTCDate()}>
                            {weekdaysLong[day.getUTCDay()]}
                        </div>
                    );
                })}
            </div>
            <div className="flex flex-item-fluid">
                {displayWeekNumbers ? (
                    <div className="flex flex-column daygrid-weeknumber-width">
                        {rows.map((days) => {
                            const week = getWeekNumber(days[0]);
                            return (
                                <div
                                    key={week}
                                    className="flex-item-fluid flex flex-column relative daygrid-weeknumber"
                                >
                                    {week}
                                </div>
                            );
                        })}
                    </div>
                ) : null}

                <div
                    className="flex flex-item-fluid flex-column daygrid-rows"
                    ref={rowsWrapperRef}
                    onMouseDownCapture={onDayGridMouseDown}
                >
                    {rows.map((days, rowIndex) => {
                        const { eventsInRow, eventsInRowStyles, eventsInRowSummary } = eventsPerRows[rowIndex];
                        return (
                            <div key={rowIndex} className="flex-item-fluid flex flex-column h100 w100 relative">
                                <div className="flex daygrid-columns">
                                    {days.map((day) => {
                                        return (
                                            <div className="flex-item-fluid daygrid-column" key={day.getUTCDate()} />
                                        );
                                    })}
                                </div>
                                <div className="flex">
                                    {days.map((day) => {
                                        return (
                                            <div
                                                className="flex-item-fluid aligncenter"
                                                key={day.getUTCDate()}
                                                aria-current={isDateYYMMDDEqual(day, now) ? 'date' : undefined}
                                                aria-pressed={isDateYYMMDDEqual(day, date) ? true : undefined}
                                                onClick={() => onClickDate(day)}
                                            >
                                                {day.getUTCDate()}
                                            </div>
                                        );
                                    })}
                                </div>
                                <div
                                    className="relative flex-item-fluid daygrid-row"
                                    data-row={rowIndex}
                                    {...(rowIndex === 0 ? { ref: firstRowRef } : undefined)}
                                >
                                    {eventsInRowStyles.map(({ idx, type, style }) => {
                                        if (type === 'more') {
                                            const isSelected = isMoreSelected(idx, moreIdx, rowIndex, moreRow);
                                            const eventRef = isSelected ? selectedMoreRef : undefined;
                                            return createElement(MoreFullDayEvent, {
                                                key: `more${idx}`,
                                                style,
                                                more: eventsInRowSummary[idx].more,
                                                eventRef,
                                                isSelected
                                            });
                                        }

                                        const event = getEvent(idx, eventsInRow, sortedEvents);
                                        const isSelected = event.id === selectedEventID;
                                        const isBeforeNow = now > event.end && !isDateYYMMDDEqual(now, event.end);
                                        const eventRef = isSelected && isFirstSelection ? selectedEventRef : undefined;
                                        if (eventRef) {
                                            isFirstSelection = false;
                                        }
                                        return createElement(FullDayEvent, {
                                            event,
                                            style,
                                            key: event.id,
                                            isBeforeNow,
                                            eventRef,
                                            formatTime,
                                            isSelected
                                        });
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
            {morePopoverStyle &&
                selectedMoreData &&
                createElement(MorePopoverEvent, {
                    events: selectedMoreData,
                    style: morePopoverStyle,
                    layout: morePopoverLayout,
                    eventRef: selectedEventRef,
                    selectedEventID,
                    setSelectedEventID,
                    selectedMoreDate,
                    formatTime,
                    onClose: () => setMoreDateIdx()
                })}
            {popoverStyle &&
                selectedEvent &&
                createElement(PopoverEvent, {
                    event: selectedEvent,
                    style: popoverStyle,
                    layout: popoverLayout,
                    tzid,
                    formatTime,
                    onClose: () => {
                        setSelectedEventID();
                        setTemporaryEvent();
                    },
                    onEditEvent,
                    onCreateEvent
                })}
        </div>
    );
};

DayGrid.propTypes = {
    children: PropTypes.func
};

export default DayGrid;