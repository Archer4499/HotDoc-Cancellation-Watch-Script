// ==UserScript==
// @name         HotDoc Cancellation Watch
// @namespace    https://github.com/Archer4499
// @version      1.0
// @description  Watches the current doctor on HotDoc for earlier appointment times
// @author       Ailou
// @license      MIT
// @homepageURL	 https://github.com/Archer4499/HotDoc-Cancellation-Watch-Script#readme
// @supportURL	 https://github.com/Archer4499/HotDoc-Cancellation-Watch-Script/issues
// @downloadURL  https://raw.githubusercontent.com/Archer4499/HotDoc-Cancellation-Watch-Script/master/hotdoc_cancellation_watch.user.js
// @updateURL    https://raw.githubusercontent.com/Archer4499/HotDoc-Cancellation-Watch-Script/master/hotdoc_cancellation_watch.user.js
// @icon         https://cdn.hotdoc.com.au/bookings/dist/assets/favicons/favicon-196x196.png
// @match        *://*.hotdoc.com.au/*/doctors/*
// @grant        GM_notification
// ==/UserScript==

// TODO: HotDoc is a single page site, so it doesn't trigger the script match when navigating without a refresh
// TODO: Show indicator that this is working/watching

(function() {
    'use strict';

    let nextAppointment = null;

    function formatDateTime(dateTime) {
        if (!dateTime) dateTime = new Date();

        const options = { weekday: 'short', day: 'numeric', month: 'short',
                          hour: 'numeric', minute: 'numeric' }
        return dateTime.toLocaleString(undefined, options);
    }

    function triggerAlert(newTime, oldTime) {
        GM_notification({
            title: 'Earlier Appointment Available!',
            text: `Earlier time: ${formatDateTime(newTime)}, replaces old time: ${formatDateTime(oldTime)}`,
            // highlight: true,
        });
    }

    function getTimesElement() {
        return document.querySelector('#times');
    }

    function getLoaderElement(node) {
        if (node.matches && node.matches('.SiteLoader')) return node;
        if (node.nodeType === Node.ELEMENT_NODE) {
            return node.querySelector('.SiteLoader');
        }
        return null;
    }

    function parseDateTime(datetimeString) {
        // The two formats currently being parsed are:
        // 20 May, 9:00 am
        // 9:00 am Wednesday May 20

        // TODO: more forgiving datetime parsing

        if (!datetimeString) return null;

        // Clean string: remove day names to help Date.parse
        const cleanStr = datetimeString.replace(/(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\w*,?\s?/gi, '').trim();

        let parsedDate = new Date(cleanStr);

        if (!isNaN(parsedDate)) {
            const now = new Date();
            // If the parsed month is behind the current month (e.g., it's Dec, parsed is Jan), the appointment is next year.
            // TODO: Test to see how cross year appointments are shown on HotDoc
            if (parsedDate.getMonth() < now.getMonth()) {
                parsedDate.setFullYear(now.getFullYear() + 1);
            } else {
                parsedDate.setFullYear(now.getFullYear());
            }
            return parsedDate;
        }
        return null;
    }

    function getNextAppointment(timesElement) {
        // const nextAppointmentContianer = timesElement.querySelector('.OutsideRangeNav > button');
        const nextAppointmentContianer = timesElement.querySelector('.OutsideRangeNav-action');

        if (nextAppointmentContianer && nextAppointmentContianer.innerText) {
            // Future date outside current display range
            return parseDateTime(nextAppointmentContianer.innerText.trim());

        } else {
            // First slot in the first day to have slots in the current display range
            const firstTimeSlot = timesElement.querySelector('.AvailabilitySlotList-slot');

            if (firstTimeSlot) {
                return parseDateTime(firstTimeSlot.ariaLabel.trim());
            }
        }
        return null;
    }

    const timesObserver = new MutationObserver((mutationList, _) => {
        // If the loading spinner was among the removed elements, then check for a new next appointment date
        for (const mutation of mutationList) {
            for (const node of mutation.removedNodes) {
                if (getLoaderElement(node)) {
                    let nextAppointmentNew = getNextAppointment(mutation.target);
                    if (nextAppointmentNew && nextAppointmentNew?.getTime() !== nextAppointment?.getTime()) {
                        if (nextAppointmentNew < nextAppointment) {
                            triggerAlert(nextAppointmentNew, nextAppointment);
                            console.log(`Closer appointment: Old: ${nextAppointment} New: ${nextAppointmentNew}`);
                        } else {
                            console.log(`Later/initial appointment: Old: ${nextAppointment} New: ${nextAppointmentNew}`);
                        }
                        nextAppointment = nextAppointmentNew;
                    }
                }
            }
        }
    });

    function process() {
        // Run until page loads enough for the time slot listings to appear
        (function loopUntilTrue() {
            const times = getTimesElement();
            if (!times) {
                setTimeout(loopUntilTrue, 200);
            } else {
                nextAppointment = getNextAppointment(times);
                timesObserver.observe(times, { childList: true, subtree: true });
            }
        })();
    }

    // Run initially
    process();
})();
