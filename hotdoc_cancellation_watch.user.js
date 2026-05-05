// ==UserScript==
// @name         HotDoc Cancellation Watch
// @namespace    https://github.com/Archer4499
// @version      1.1
// @description  Watches individual practitioner pages on HotDoc (or sites that embed HotDoc) for earlier appointment availability
// @author       Ailou
// @license      MIT
// @homepageURL	 https://github.com/Archer4499/HotDoc-Cancellation-Watch-Script#readme
// @supportURL	 https://github.com/Archer4499/HotDoc-Cancellation-Watch-Script/issues
// @downloadURL  https://raw.githubusercontent.com/Archer4499/HotDoc-Cancellation-Watch-Script/master/hotdoc_cancellation_watch.user.js
// @updateURL    https://raw.githubusercontent.com/Archer4499/HotDoc-Cancellation-Watch-Script/master/hotdoc_cancellation_watch.user.js
// @icon         https://cdn.hotdoc.com.au/bookings/dist/assets/favicons/favicon-196x196.png
// @match        *://*.hotdoc.com.au/*
// @grant        GM_notification
// @grant        window.onurlchange
// ==/UserScript==

// Works through external clinic pages since they embed an iframe containing the HotDoc booking interface

// TODO: Show indicator that this is working/watching
// TODO: Some practices only show appointments through this page instead:
//        https://www.hotdoc.com.au/request/appointment/doctor-time?*
// TODO: Add name to doctor to notification

(function() {
    'use strict';

    const LOG_PREFIX = '[HotDoc Watch]';

    let nextAppointment = null;
    let currURL = null;

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
            // If the parsed month is behind the current month, the appointment is next year.
            // TODO: Test to see how cross year appointments are shown on HotDoc
            if (parsedDate.getMonth() < now.getMonth()) {
                parsedDate.setFullYear(now.getFullYear() + 1);
            } else {
                parsedDate.setFullYear(now.getFullYear());
            }
            return parsedDate;
        }

        console.warn(`${LOG_PREFIX} Failed to parse date string: ${datetimeString}`);
        return null;
    }

    function getNextAppointment(timesElement) {
        // const nextAppointmentContainer = timesElement.querySelector('.OutsideRangeNav > button');
        const nextAppointmentContainer = timesElement.querySelector('.OutsideRangeNav-action');

        if (nextAppointmentContainer && nextAppointmentContainer.innerText) {
            // Future date outside current display range
            return parseDateTime(nextAppointmentContainer.innerText.trim());

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
                        if (!nextAppointment) {
                            console.log(`${LOG_PREFIX} Initial appointment: ${formatDateTime(nextAppointmentNew)}`);
                        } else if (nextAppointmentNew < nextAppointment) {
                            triggerAlert(nextAppointmentNew, nextAppointment);
                            console.log(`${LOG_PREFIX} Closer appointment: New: ${formatDateTime(nextAppointmentNew)} Old: ${formatDateTime(nextAppointment)}`);
                        } else {
                            console.log(`${LOG_PREFIX} Later appointment: New: ${formatDateTime(nextAppointmentNew)} Old: ${formatDateTime(nextAppointment)}`);
                        }
                        nextAppointment = nextAppointmentNew;
                    }
                    return;
                }
            }
        }
    });

    const loadingObserver = new MutationObserver((mutationList, observer) => {
        // Double check we haven't navigated away while waiting
        if (window.location.href !== currURL) {
            observer.disconnect();
            // Make sure we process the page change freshly
            currURL = null;

            return;
        }

        const times = getTimesElement();
        if (times) {
            observer.disconnect();

            nextAppointment = getNextAppointment(times);
            timesObserver.observe(times, { childList: true, subtree: true });
        }
    });

    function process(url) {
        // URL format of pages that have the individual booking times (Even for non-doctors):
        //  https://www.hotdoc.com.au/medical-centres/<Suburb>-<State>-<Postcode>/<Practice Name>/doctors/<Practitioner's Name>
        // URLs ending in "/doctors" have a list of all practitioner's names

        if (url !== currURL) {
            loadingObserver.disconnect();
            timesObserver.disconnect();
            currURL = url;
            nextAppointment = null;

            if (url.includes('/doctors/')) {
                const times = getTimesElement();
                if (times) {
                    nextAppointment = getNextAppointment(times);
                    timesObserver.observe(times, { childList: true, subtree: true });
                } else {
                    // Haven't loaded yet, watch for the times element appearing
                    loadingObserver.observe(document.body, { childList: true, subtree: true });
                }
            }
        }
    }


    // Run initially
    process(window.location.href);

    // First we try window.onurlchange as it's supported by Tampermonkey but it appears not by the other Greasemonkey-likes
    //  https://www.tampermonkey.net/documentation.php?locale=en#api:window.onurlchange
    if ('onurlchange' in window) {
        window.addEventListener('urlchange', (info) => {
            process(info.url);
        });
    } else if ('navigation' in window) {
        // If window.onurlchange not supported, try the Navigation API, though this is not supported by Firefox as of writing this in 2026
        //  https://developer.mozilla.org/en-US/docs/Web/API/Navigation/navigatesuccess_event
        window.navigation.addEventListener('navigatesuccess', (event) => {
            process(event.target.currentEntry.url);
        });
    } else {
        // Legacy fallback
        setInterval(() => {
            process(window.location.href);
        }, 2000);
    }
})();
