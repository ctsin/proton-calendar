import React, { useRef, useState } from 'react';
import {
    SmallButton,
    PrimaryButton,
    Loader,
    useApi,
    useEventManager,
    useGetAddresses,
    useGetAddressKeys,
    useGetCalendarBootstrap,
    useGetCalendarKeys,
    useGetCalendars,
    useLoading,
    useNotifications,
    useModals,
    ConfirmModal,
    Alert
} from 'react-components';
import PropTypes from 'prop-types';
import { noop } from 'proton-shared/lib/helpers/function';
import { c } from 'ttag';
import { deleteEvent } from 'proton-shared/lib/api/calendars';
import createOrUpdateEvent from 'proton-shared/lib/calendar/integration/createOrUpdateEvent';

import './PopoverEvent.scss';
import usePopoverPlacement from './usePopoverPlacement';
import { getI18N } from '../eventModal/eventForm/i18n';
import { useReadCalendarEvent, useReadEvent } from './useReadCalendarEvent';

import { modelToVeventComponent } from '../eventModal/eventForm/modelToProperties';
import { getEmptyModel, getExistingEvent } from '../eventModal/eventForm/state';
import PopoverEventContent from './PopoverEventContent';

const PopoverEvent = ({ tzid, onClose, formatTime, onEditEvent, style, layout, event: targetEvent }) => {
    const api = useApi();
    const { call } = useEventManager();
    const { createNotification } = useNotifications();
    const [loadingAction, withLoadingAction] = useLoading();
    const ref = useRef();
    const otherStyle = usePopoverPlacement(ref, style, layout);
    const { createModal } = useModals();

    const [tmpTitle, setTmpTitle] = useState('');

    const getCalendars = useGetCalendars();
    const getCalendarKeys = useGetCalendarKeys();
    const getAddresses = useGetAddresses();
    const getCalendarBootstrap = useGetCalendarBootstrap();
    const getAddressKeys = useGetAddressKeys();

    const targetEventData = targetEvent && targetEvent.data;
    const targetCalendar = targetEventData && targetEventData.Calendar;
    const calendarColor = (targetCalendar && targetCalendar.Color) || undefined;
    const isCreateEvent = targetEvent.id === 'tmp' && !targetEventData;
    const isMoveEvent = targetEvent.id === 'tmp' && targetEventData;

    const [value, isLoading, error] = useReadCalendarEvent(targetEventData);
    const model = useReadEvent(value);

    const handleDelete = async () => {
        if (!targetEventData) {
            return;
        }
        await new Promise((resolve, reject) => {
            createModal(
                <ConfirmModal
                    confirm={c('Action').t`Delete`}
                    title={c('Info').t`Delete event`}
                    onClose={reject}
                    onConfirm={resolve}
                >
                    <Alert>{c('Info').t`Would you like to delete this event?`}</Alert>
                </ConfirmModal>
            );
        });
        const { Event } = targetEventData;
        await api(deleteEvent(Event.CalendarID, Event.ID));
        await call();
        const i18n = getI18N('event');
        createNotification({ text: i18n.deleted });
    };

    const handleEdit = () => {
        onEditEvent({
            Event: targetEventData ? targetEventData.Event : undefined,
            ...(isCreateEvent || isMoveEvent
                ? {
                      start: targetEvent.start,
                      end: targetEvent.end
                  }
                : undefined),
            ...(isCreateEvent && tmpTitle
                ? {
                      title: tmpTitle
                  }
                : undefined)
        });
    };

    const getFirstCalendarID = async () => {
        const Calendars = await getCalendars();
        if (!Calendars.length) {
            throw new Error('No calendars, should never happen');
        }
        return Calendars[0].ID;
    };

    const getModel = async () => {
        const actualCalendarID = targetEventData ? targetEventData.Event.CalendarID : await getFirstCalendarID();

        const [CalendarBootstrap, Addresses, [veventComponent, personalMap]] = await Promise.all([
            getCalendarBootstrap(actualCalendarID),
            getAddresses(),
            targetEventData ? value : []
        ]);

        const emptyModel = getEmptyModel({
            title: tmpTitle,
            calendarID: actualCalendarID,
            CalendarBootstrap,
            Addresses,
            isAllDay: targetEvent.isAllDay,
            start: targetEvent.start,
            end: targetEvent.end
        });

        const eventModel = veventComponent
            ? getExistingEvent({
                  veventComponent,
                  veventValarmComponent: personalMap[emptyModel.memberID],
                  tzid,
                  start: targetEvent.start,
                  end: targetEvent.end
              })
            : {};

        return {
            ...emptyModel,
            ...eventModel
        };
    };

    const handleSave = async () => {
        const model = await getModel();

        const { calendarID, addressID, memberID } = model;
        const [addressKeys, calendarKeys] = await Promise.all([getAddressKeys(addressID), getCalendarKeys(calendarID)]);
        const veventComponent = modelToVeventComponent(model, tzid);

        await createOrUpdateEvent({
            Event: targetEventData ? targetEventData.Event : undefined,
            veventComponent,
            memberID,
            calendarID,
            addressKeys,
            calendarKeys,
            api
        });

        await call();

        const i18n = getI18N('event');
        createNotification({ text: isCreateEvent ? i18n.created : i18n.updated });
        onClose();
    };

    if (error) {
        return (
            <div style={otherStyle} className="eventpopover p1" ref={ref}>
                <header className="">
                    <h3>{c('Error').t`Error`}</h3>
                    <button
                        type="button"
                        className="pm-modalClose"
                        title={c('Action').t`Close popover`}
                        onClick={onClose}
                    >
                        ×
                    </button>
                </header>
                <div className="ellipsis">
                    {c('Error').t`Error: `}
                    {error && error.message}
                </div>
                <footer>
                    <SmallButton
                        onClick={loadingAction ? noop : () => withLoadingAction(handleDelete())}
                        loading={loadingAction}
                        className="mr1"
                    >{c('Action').t`Delete`}</SmallButton>
                </footer>
            </div>
        );
    }

    if (isLoading) {
        return (
            <div style={otherStyle} className="eventpopover p1" ref={ref}>
                <Loader />
            </div>
        );
    }

    return (
        <div style={otherStyle} className="eventpopover p1" ref={ref}>
            <header className="">
                {isCreateEvent ? (
                    <input
                        placeholder={c('Placeholder').t`Add an event title`}
                        type="text"
                        value={tmpTitle}
                        autoFocus={true}
                        // Too lazy to change to a form
                        onKeyDown={({ key }) => key === 'Enter' && withLoadingAction(handleSave())}
                        onChange={({ target: { value } }) => setTmpTitle(value)}
                    />
                ) : (
                    <h3 className="">{model.title}</h3>
                )}
                <button type="button" className="pm-modalClose" title={c('Action').t`Close popover`} onClick={onClose}>
                    ×
                </button>
            </header>
            <div>
                <PopoverEventContent
                    targetCalendar={targetCalendar}
                    targetEvent={targetEvent}
                    model={model}
                    formatTime={formatTime}
                    tmpTitle={tmpTitle}
                    setTmpTitle={setTmpTitle}
                />
            </div>
            <footer className="flex flex-nowrap flex-spacebetween">
                {isCreateEvent || isMoveEvent ? (
                    <>
                        <SmallButton onClick={onClose}>{c('Action').t`Cancel`}</SmallButton>
                        <div>
                            <SmallButton className="mr1" onClick={handleEdit}>{c('Action').t`More`}</SmallButton>
                            <PrimaryButton
                                className="pm-button--small"
                                onClick={loadingAction ? noop : () => withLoadingAction(handleSave())}
                                loading={loadingAction}
                            >{c('Action').t`Save`}</PrimaryButton>
                        </div>
                    </>
                ) : (
                    <>
                        <SmallButton
                            onClick={loadingAction ? noop : () => withLoadingAction(handleDelete())}
                            loading={loadingAction}
                            className="mr1"
                        >{c('Action').t`Delete`}</SmallButton>
                        <PrimaryButton className="pm-button--small" onClick={handleEdit}>{c('Action')
                            .t`Edit`}</PrimaryButton>
                    </>
                )}
            </footer>
        </div>
    );
};

PopoverEvent.propTypes = {
    tzid: PropTypes.string,
    formatTime: PropTypes.func,
    style: PropTypes.object.isRequired,
    onClose: PropTypes.func.isRequired,
    onEditEvent: PropTypes.func,
    event: PropTypes.object,
    layout: PropTypes.object
};

export default PopoverEvent;