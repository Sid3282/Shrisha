// ============================================================
// app.js – Complete Nepali Calendar + Panchang Engine
// with dynamic sunrise/sunset calculation
// ============================================================

(function() {
    "use strict";

    // ---- Constants & Data ----
    const { nepaliMonths, nepaliWeekdaysFull, englishWeekdaysUpper, adMonthsShort, bsData, startDays } = window.DATA;

    const nepDigits = "०१२३४५६७८९";
    const toNepNum = (num) => String(num).replace(/\d/g, d => nepDigits[d]);
    const pad2 = (n) => String(n).padStart(2, "0");

    // ---- BS/AD Conversion (from data.js) ----
    function getAvailableYears() { return Object.keys(bsData).map(Number).sort((a,b) => a-b); }
    function hasYear(y) { return !!bsData[y]; }
    function bsMonthDays(year, month) { return bsData[year][month]; }
    function getStartDay(year, month) { return startDays[year]?.[month] ?? 0; }

    const EPOCH_AD = { y: 1943, m: 4, d: 14 };
    const EPOCH_WEEKDAY_SUN0 = 3;

    function bsOffsetFromEpoch(year, month, day) {
        let offset = 0;
        const years = getAvailableYears();
        for (const y of years) {
            if (y >= year) break;
            offset += bsData[y].reduce((a,b) => a+b, 0);
        }
        for (let i=0; i<month; i++) offset += bsData[year][i];
        return offset + (day - 1);
    }

    function offsetToADParts(offset) {
        let y = EPOCH_AD.y, m = EPOCH_AD.m, d = EPOCH_AD.d, rem = offset;
        while (rem > 0) {
            const ml = new Date(y, m, 0).getDate();
            const left = ml - d;
            if (rem <= left) { d += rem; rem = 0; }
            else { rem -= (left + 1); d = 1; m++; if (m > 12) { m = 1; y++; } }
        }
        const w = (EPOCH_WEEKDAY_SUN0 + offset) % 7;
        return { y, m, d, w };
    }

    function bsToAdParts(year, month, day) {
        if (!hasYear(year)) return null;
        return offsetToADParts(bsOffsetFromEpoch(year, month, day));
    }

    function adToBs(adDate) {
        const ms = 86400000;
        const t = Date.UTC(adDate.getFullYear(), adDate.getMonth(), adDate.getDate());
        const e = Date.UTC(EPOCH_AD.y, EPOCH_AD.m - 1, EPOCH_AD.d);
        let delta = Math.floor((t - e) / ms);
        if (delta < 0) return { year: getAvailableYears()[0], month:0, day:1, outOfRange:true };
        const years = getAvailableYears();
        let y = years[0], m=0;
        outer: for (const Y of years) {
            for (let mi=0; mi<12; mi++) {
                const len = bsData[Y][mi];
                if (delta < len) { y=Y; m=mi; break outer; }
                delta -= len;
            }
        }
        const d = delta + 1;
        const last = years[years.length-1];
        return {
            year: y, month: m, day: d,
            outOfRange: (y === last && d > bsData[last][m])
        };
    }

    // ============================================================
    // DYNAMIC SUNRISE / SUNSET CALCULATION
    // Using sun position algorithm (accurate to ~1 minute)
    // ============================================================

    // Fixed location: Kathmandu, Nepal
    const FALLBACK_LAT = 27.7172;
    const FALLBACK_LON = 85.3240;
    const TZ_OFFSET = 5.75; // Nepal Time (UTC+05:45)

    let userLat = FALLBACK_LAT;
    let userLon = FALLBACK_LON;
    let locationReady = true; // always ready with fallback

    // ---- Sunrise/Sunset Calculation ----
    function calcSunriseSunsetForDate(date, lat, lon) {
        // Based on NOAA sunrise/sunset algorithm
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();

        // Calculate Julian day
        const jd = julianDay(year, month, day);

        // Solar declination and equation of time
        const n = jd - 2451545.0 + 0.0008;
        const meanAnomaly = (357.5291 + 0.98560028 * n) % 360;
        const mRad = meanAnomaly * Math.PI / 180;
        const center = 1.9148 * Math.sin(mRad) + 0.02 * Math.sin(2 * mRad) + 0.0003 * Math.sin(3 * mRad);
        const eclipticLon = (meanAnomaly + center + 180 + 102.9372) % 360;
        const eclipticRad = eclipticLon * Math.PI / 180;

        const sinDec = Math.sin(eclipticRad) * Math.sin(23.4393 * Math.PI / 180);
        const dec = Math.asin(sinDec);

        // Equation of time (minutes)
        const yTerm = Math.pow(Math.tan(23.4393 * Math.PI / 180 / 2), 2);
        const eqTime = 4 * (yTerm * Math.sin(2 * eclipticRad) - 2 * 0.0065 * Math.sin(mRad) + 4 * 0.0065 * yTerm * Math.sin(mRad) * Math.cos(2 * eclipticRad) - 0.5 * yTerm * yTerm * Math.sin(4 * eclipticRad) - 1.25 * 0.0065 * 0.0065 * Math.sin(2 * mRad)) * 180 / Math.PI;

        const latRad = lat * Math.PI / 180;
        const cosHA = (Math.cos(90.833 * Math.PI / 180) - Math.sin(latRad) * sinDec) / (Math.cos(latRad) * Math.cos(dec));

        if (cosHA > 1 || cosHA < -1) {
            // Polar day/night
            return { sunrise: null, sunset: null, dayDuration: null };
        }

        const ha = Math.acos(cosHA) * 180 / Math.PI;

        // Solar noon in UTC
        const solarNoon = 12 - (lon / 15) - (eqTime / 60);

        const sunriseUTC = solarNoon - ha / 15;
        const sunsetUTC = solarNoon + ha / 15;

        // Convert to Nepal Time (UTC+5:45)
        const sunriseNPT = (sunriseUTC + TZ_OFFSET) % 24;
        const sunsetNPT = (sunsetUTC + TZ_OFFSET) % 24;

        const dayDuration = sunsetNPT - sunriseNPT;

        return {
            sunrise: sunriseNPT,
            sunset: sunsetNPT,
            dayDuration: dayDuration,
            sunriseUTC: sunriseUTC,
            sunsetUTC: sunsetUTC
        };
    }

    function formatTimeNPT(hours) {
        let h = hours % 24;
        if (h < 0) h += 24;
        const hr = Math.floor(h);
        const mn = Math.floor((h - hr) * 60);
        const ampm = hr >= 12 ? 'PM' : 'AM';
        const hr12 = hr % 12 || 12;
        return `${pad2(hr12)}:${pad2(mn)} ${ampm}`;
    }

    function getDayDurationText(hours) {
        if (hours === null || hours === undefined || isNaN(hours)) return '--';
        const h = Math.floor(hours);
        const m = Math.round((hours - h) * 60);
        return `${h}h ${m}m`;
    }

    // ---- Panchang Calculation Engine ----
    const LAHIRI_BASE = 23.85;
    const PRECESSION_RATE = 0.01397;
    const TITHI_NAMES = [
        "Shukla Pratipada", "Shukla Dwitiya", "Shukla Tritiya", "Shukla Chaturthi",
        "Shukla Panchami", "Shukla Shashthi", "Shukla Saptami", "Shukla Ashtami",
        "Shukla Navami", "Shukla Dashami", "Shukla Ekadashi", "Shukla Dwadashi",
        "Shukla Trayodashi", "Shukla Chaturdashi", "Shukla Purnima",
        "Krishna Pratipada", "Krishna Dwitiya", "Krishna Tritiya", "Krishna Chaturthi",
        "Krishna Panchami", "Krishna Shashthi", "Krishna Saptami", "Krishna Ashtami",
        "Krishna Navami", "Krishna Dashami", "Krishna Ekadashi", "Krishna Dwadashi",
        "Krishna Trayodashi", "Krishna Chaturdashi", "Krishna Amavasya"
    ];
    const NAKSHATRAS = [
        "Ashwini", "Bharani", "Krittika", "Rohini", "Mrigashira", "Ardra",
        "Punarvasu", "Pushya", "Ashlesha", "Magha", "Purva Phalguni",
        "Uttara Phalguni", "Hasta", "Chitra", "Swati", "Vishakha",
        "Anuradha", "Jyeshtha", "Mula", "Purva Ashadha", "Uttara Ashadha",
        "Shravana", "Dhanishtha", "Shatabhisha", "Purva Bhadrapada",
        "Uttara Bhadrapada", "Revati"
    ];
    const YOGAS = [
        "Vishkambha", "Priti", "Ayushmana", "Saubhagya", "Shobhana",
        "Atiganda", "Sukarma", "Dhriti", "Shula", "Ganda", "Vriddhi",
        "Dhruva", "Vyaghata", "Harshana", "Vajra", "Siddhi",
        "Vyatipata", "Variyana", "Parigha", "Shiva", "Siddha",
        "Sadhya", "Shubha", "Shukla", "Brahma", "Indra", "Vaidhriti"
    ];
    const KARANAS = [
        "Kinstughna", "Bava", "Balava", "Kaulava", "Taitila",
        "Garaja", "Vanija", "Vishti", "Shakuni", "Chatushpada", "Naga"
    ];
    const RASHIS = [
        "Mesha", "Vrishabha", "Mithuna", "Karka", "Simha", "Kanya",
        "Tula", "Vrishchika", "Dhanu", "Makara", "Kumbha", "Meena"
    ];

    function julianDay(y, m, d) {
        if (m <= 2) { y -= 1; m += 12; }
        const A = Math.floor(y / 100);
        const B = 2 - A + Math.floor(A / 4);
        return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
    }

    function gmstDeg(jd) {
        const T = (jd - 2451545.0) / 36525;
        let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - T * T * T / 38710000;
        gmst = gmst % 360;
        if (gmst < 0) gmst += 360;
        return gmst;
    }

    function sunLongitude(jd) {
        const T = (jd - 2451545.0) / 36525;
        const M = 357.52911 + 35999.05029 * T - 0.0001537 * T * T;
        const Mrad = M * Math.PI / 180;
        const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(Mrad)
                + (0.019993 - 0.000101 * T) * Math.sin(2 * Mrad)
                + 0.000289 * Math.sin(3 * Mrad);
        const L0 = 280.46646 + 36000.76983 * T + 0.0003032 * T * T;
        const sunLon = (L0 + C) % 360;
        return sunLon < 0 ? sunLon + 360 : sunLon;
    }

    function moonLongitude(jd) {
        const T = (jd - 2451545.0) / 36525;
        const Lp = 218.3165 + 481267.8813 * T;
        const D = 297.8502 + 445267.1114 * T;
        const M = 357.5291 + 35999.0503 * T;
        const Mp = 134.9634 + 477198.8676 * T;
        const F = 93.272 + 483202.0175 * T;
        const Drad = D * Math.PI / 180;
        const Mrad = M * Math.PI / 180;
        const Mprad = Mp * Math.PI / 180;
        const Frad = F * Math.PI / 180;
        const dL = 6.289 * Math.sin(Mprad)
                 + 1.274 * Math.sin(2 * Drad - Mprad)
                 + 0.658 * Math.sin(2 * Drad)
                 + 0.214 * Math.sin(2 * Mprad)
                 - 0.186 * Math.sin(Mrad)
                 - 0.114 * Math.sin(2 * Frad);
        const moonLon = (Lp + dL) % 360;
        return moonLon < 0 ? moonLon + 360 : moonLon;
    }

    function getAyanamsa(year) {
        return LAHIRI_BASE + (year - 2000) * PRECESSION_RATE;
    }

    function siderealLongitude(tropicalDeg, year) {
        const ayan = getAyanamsa(year);
        let sid = (tropicalDeg - ayan) % 360;
        if (sid < 0) sid += 360;
        return sid;
    }

    // ---- Modified calcPanchangForDate with dynamic sunrise/sunset ----
    function calcPanchangForDate(date, lat, lon) {
        const year = date.getFullYear();
        const month = date.getMonth() + 1;
        const day = date.getDate();
        const hours = date.getHours() + date.getMinutes()/60;
        const jd = julianDay(year, month, day) + hours/24 - TZ_OFFSET/24;

        const sunLonTrop = sunLongitude(jd);
        const moonLonTrop = moonLongitude(jd);
        const sunLonSid = siderealLongitude(sunLonTrop, year);
        const moonLonSid = siderealLongitude(moonLonTrop, year);

        let diff = (moonLonSid - sunLonSid) % 360;
        if (diff < 0) diff += 360;
        const tithiIndex = Math.floor(diff / 12);
        const paksha = (tithiIndex < 15) ? "Shukla" : "Krishna";
        const tithiName = TITHI_NAMES[tithiIndex];
        const nextTithiIndex = (tithiIndex + 1) % 30;
        const nextTithiName = TITHI_NAMES[nextTithiIndex];

        const nakshatraIndex = Math.floor(moonLonSid / 13.333333) % 27;
        const nakshatraName = NAKSHATRAS[nakshatraIndex];
        const nextNakshatraIndex = (nakshatraIndex + 1) % 27;
        const nextNakshatraName = NAKSHATRAS[nextNakshatraIndex];

        const yogaSum = (sunLonSid + moonLonSid) % 360;
        const yogaIndex = Math.floor(yogaSum / 13.333333) % 27;
        const yogaName = YOGAS[yogaIndex];
        const nextYogaIndex = (yogaIndex + 1) % 27;
        const nextYogaName = YOGAS[nextYogaIndex];

        const karanaVal = diff / 6;
        const karanaIndex = Math.floor(karanaVal) % 11;
        const karanaName = KARANAS[karanaIndex];
        const nextKaranaIndex = (karanaIndex + 1) % 11;
        const nextKaranaName = KARANAS[nextKaranaIndex];

        const sunRashiIndex = Math.floor(sunLonSid / 30) % 12;
        const moonRashiIndex = Math.floor(moonLonSid / 30) % 12;
        const sunRashi = RASHIS[sunRashiIndex];
        const moonRashi = RASHIS[moonRashiIndex];

        const panchakNakshatras = [22,23,24,25,26];
        const isPanchak = panchakNakshatras.includes(nakshatraIndex);

        // ---- Dynamic sunrise/sunset ----
        const sunData = calcSunriseSunsetForDate(date, lat || userLat, lon || userLon);
        let sunriseStr = '--:--';
        let sunsetStr = '--:--';
        let dayDurationStr = '--';

        if (sunData && sunData.sunrise !== null && sunData.sunset !== null) {
            sunriseStr = formatTimeNPT(sunData.sunrise);
            sunsetStr = formatTimeNPT(sunData.sunset);
            dayDurationStr = getDayDurationText(sunData.dayDuration);
        } else {
            // Polar day/night fallback
            sunriseStr = '--:--';
            sunsetStr = '--:--';
            dayDurationStr = '--';
        }

        const weekdayIndex = (Math.floor(jd + 1.5) % 7);

        // Muhurat calculations using dynamic sunrise/sunset
        const sunriseHours = sunData && sunData.sunrise !== null ? sunData.sunrise : 6;
        const sunsetHours = sunData && sunData.sunset !== null ? sunData.sunset : 18;

        const rahu = getRahuKaal(sunriseHours, sunsetHours, weekdayIndex);
        const gulika = getGulikaKaal(sunriseHours, sunsetHours, weekdayIndex);
        const yamaganda = getYamaganda(sunriseHours, sunsetHours, weekdayIndex);
        const choghadiya = getChoghadiya(sunriseHours, sunsetHours, weekdayIndex);

        const abhijitStart = 12 - 0.4;
        const abhijitEnd = 12 + 0.4;
        const abhijitStr = formatTimeNPT(abhijitStart) + " - " + formatTimeNPT(abhijitEnd);
        const brahmaStart = sunriseHours - 1.5;
        const brahmaEnd = sunriseHours - 0.75;
        const brahmaStr = formatTimeNPT(brahmaStart) + " - " + formatTimeNPT(brahmaEnd);
        const nishitaStart = 0 - 0.75;
        const nishitaEnd = 0 + 0.75;
        const nishitaStr = formatTimeNPT(nishitaStart) + " - " + formatTimeNPT(nishitaEnd);
        const amritStart = sunriseHours + 0.5;
        const amritEnd = sunriseHours + 1.0;
        const amritStr = formatTimeNPT(amritStart) + " - " + formatTimeNPT(amritEnd);
        const vijayaStart = sunriseHours + 2;
        const vijayaEnd = sunriseHours + 2.5;
        const vijayaStr = formatTimeNPT(vijayaStart) + " - " + formatTimeNPT(vijayaEnd);
        const durMorning = sunriseHours + 1;
        const durEvening = sunsetHours + 1;
        const durStr = formatTimeNPT(durMorning) + " - " + formatTimeNPT(durMorning + 1/24) + ", " +
                       formatTimeNPT(durEvening) + " - " + formatTimeNPT(durEvening + 1/24);

        return {
            tithi: { name: tithiName, paksha, endTime: "—", next: nextTithiName },
            nakshatra: { name: nakshatraName, endTime: "—", next: nextNakshatraName },
            yoga: { name: yogaName, endTime: "—", next: nextYogaName },
            karana: { name: karanaName, endTime: "—", next: nextKaranaName },
            sunRashi: { name: sunRashi, index: sunRashiIndex },
            moonRashi: { name: moonRashi, index: moonRashiIndex },
            panchak: isPanchak ? "हो" : "छैन",
            sunrise: sunriseStr,
            sunset: sunsetStr,
            dayDuration: dayDurationStr,
            muhurat: {
                rahu, gulika, yamaganda,
                abhijit: abhijitStr,
                brahma: brahmaStr,
                nishita: nishitaStr,
                amrit: amritStr,
                varjyam: "12:30 - 13:30",
                vijaya: vijayaStr,
                dur: durStr
            },
            choghadiya,
            rawSunData: sunData
        };
    }

    // ---- Muhurat helpers (using hours) ----
    function getRahuKaal(sunrise, sunset, weekday) {
        const dayLen = sunset - sunrise;
        if (dayLen <= 0) return "--:-- - --:--";
        const part = dayLen / 8;
        const rahuPart = [8,2,7,5,6,4,3][weekday];
        const start = sunrise + (rahuPart - 1) * part;
        const end = sunrise + rahuPart * part;
        return formatTimeNPT(start) + " - " + formatTimeNPT(end);
    }

    function getGulikaKaal(sunrise, sunset, weekday) {
        const dayLen = sunset - sunrise;
        if (dayLen <= 0) return "--:-- - --:--";
        const part = dayLen / 8;
        const gulikaPart = [4,3,8,2,7,5,6][weekday];
        const start = sunrise + (gulikaPart - 1) * part;
        const end = sunrise + gulikaPart * part;
        return formatTimeNPT(start) + " - " + formatTimeNPT(end);
    }

    function getYamaganda(sunrise, sunset, weekday) {
        const dayLen = sunset - sunrise;
        if (dayLen <= 0) return "--:-- - --:--";
        const part = dayLen / 8;
        const yamaPart = [2,7,5,6,4,3,8][weekday];
        const start = sunrise + (yamaPart - 1) * part;
        const end = sunrise + yamaPart * part;
        return formatTimeNPT(start) + " - " + formatTimeNPT(end);
    }

    function getChoghadiya(sunrise, sunset, weekday) {
        const dayLen = sunset - sunrise;
        const nightLen = 24 - dayLen;
        const dayPart = dayLen / 8;
        const nightPart = nightLen / 8;
        const dayOrder = [
            ["Udveg", "Labh", "Amrit", "Kaal", "Shubh", "Rog", "Char", "Udveg"],
            ["Amrit", "Kaal", "Shubh", "Rog", "Char", "Udveg", "Labh", "Amrit"],
            ["Labh", "Amrit", "Kaal", "Shubh", "Rog", "Char", "Udveg", "Labh"],
            ["Shubh", "Rog", "Char", "Udveg", "Labh", "Amrit", "Kaal", "Shubh"],
            ["Char", "Udveg", "Labh", "Amrit", "Kaal", "Shubh", "Rog", "Char"],
            ["Rog", "Char", "Udveg", "Labh", "Amrit", "Kaal", "Shubh", "Rog"],
            ["Kaal", "Shubh", "Rog", "Char", "Udveg", "Labh", "Amrit", "Kaal"]
        ];
        const nightOrder = [
            ["Kaal", "Shubh", "Rog", "Char", "Udveg", "Labh", "Amrit", "Kaal"],
            ["Udveg", "Labh", "Amrit", "Kaal", "Shubh", "Rog", "Char", "Udveg"],
            ["Amrit", "Kaal", "Shubh", "Rog", "Char", "Udveg", "Labh", "Amrit"],
            ["Labh", "Amrit", "Kaal", "Shubh", "Rog", "Char", "Udveg", "Labh"],
            ["Shubh", "Rog", "Char", "Udveg", "Labh", "Amrit", "Kaal", "Shubh"],
            ["Char", "Udveg", "Labh", "Amrit", "Kaal", "Shubh", "Rog", "Char"],
            ["Rog", "Char", "Udveg", "Labh", "Amrit", "Kaal", "Shubh", "Rog"]
        ];
        const dayNames = dayOrder[weekday];
        const nightNames = nightOrder[weekday];
        const dayChoghadiya = [];
        const nightChoghadiya = [];
        for (let i=0; i<8; i++) {
            const start = sunrise + i * dayPart;
            const end = sunrise + (i+1) * dayPart;
            dayChoghadiya.push({ name: dayNames[i], start: formatTimeNPT(start), end: formatTimeNPT(end) });
        }
        for (let i=0; i<8; i++) {
            const start = sunset + i * nightPart;
            const end = sunset + (i+1) * nightPart;
            nightChoghadiya.push({ name: nightNames[i], start: formatTimeNPT(start), end: formatTimeNPT(end) });
        }
        return { day: dayChoghadiya, night: nightChoghadiya };
    }

    // ---- Festivals Helper ----
    function getFestivalsForBsDate(bsYear, bsMonth, bsDay) {
        let fests = [];
        if (window.DATA && window.DATA.holidaysByYear && window.DATA.holidaysByYear[bsYear]) {
            const holidays = window.DATA.holidaysByYear[bsYear];
            for (let h of holidays) {
                if (h.month === bsMonth && h.day === bsDay) {
                    fests.push(h.name);
                }
            }
        }
        return fests;
    }

    function getAyan(rashiIndex) {
        if (rashiIndex >= 9 || rashiIndex <= 2) return "उत्तरायण";
        return "दक्षिणायन";
    }

    function getRitu(monthIndex) {
        const map = {
            0: "वसन्त", 1: "ग्रीष्म", 2: "ग्रीष्म", 3: "वर्षा",
            4: "वर्षा", 5: "शरद", 6: "शरद", 7: "हेमन्त",
            8: "हेमन्त", 9: "शिशिर", 10: "शिशिर", 11: "वसन्त"
        };
        return map[monthIndex] || "—";
    }

    // ============================================================
    // UI CODE – Calendar Rendering, Navigation, Modal
    // ============================================================

    // DOM references – we check if calendar table exists before running UI code
    const calendarTable = document.getElementById("calendar-table");
    const skeletonEl = document.getElementById("calendar-skeleton");

    // Only run the calendar UI if the calendar table exists (prevents errors on Forex page)
    if (calendarTable) {
        const yearSelector = document.getElementById("year-selector");
        const monthSelector = document.getElementById("month-selector");
        const prevButton = document.getElementById("prev");
        const nextButton = document.getElementById("next");
        const todayBtn = document.getElementById("today-btn");
        const periodLabelEl = document.getElementById("period-label");
        const upcomingList = document.getElementById("upcoming-list");
        const mobileMenuToggle = document.getElementById("mobile-menu-toggle");
        const navMenu = document.getElementById("nav-menu");

        // Modal elements
        const modal = document.getElementById("panchang-modal");
        const modalClose = document.getElementById("modal-close");
        const modalTitle = document.getElementById("modal-title");
        const modalAd = document.getElementById("modal-ad");
        const modalSunrise = document.getElementById("modal-sunrise");
        const modalSunset = document.getElementById("modal-sunset");
        const modalUpdateTime = document.getElementById("modal-update-time");

        // Panchang fields
        const pDay = document.getElementById("p-day");
        const pTithi = document.getElementById("p-tithi");
        const pChandraRashi = document.getElementById("p-chandra-rashi");
        const pPaksha = document.getElementById("p-paksha");
        const pKarana = document.getElementById("p-karana");
        const pMaas = document.getElementById("p-maas");
        const pNakshatra = document.getElementById("p-nakshatra");
        const pYoga = document.getElementById("p-yoga");
        const pSunRashi = document.getElementById("p-sun-rashi");
        const pAyan = document.getElementById("p-ayan");
        const pRitu = document.getElementById("p-ritu");
        const pBaar = document.getElementById("p-baar");
        const pFestivals = document.getElementById("p-festivals");

        // Muhurat fields
        const mRahu = document.getElementById("m-rahu");
        const mYamaganda = document.getElementById("m-yamaganda");
        const mGulika = document.getElementById("m-gulika");
        const mAbhijit = document.getElementById("m-abhijit");
        const mDur = document.getElementById("m-dur");
        const mBrahma = document.getElementById("m-brahma");
        const mAmrit = document.getElementById("m-amrit");
        const mVijaya = document.getElementById("m-vijaya");
        const mNishita = document.getElementById("m-nishita");
        const mVarjyam = document.getElementById("m-varjyam");

        const choghadiyaGrid = document.getElementById("choghadiya-grid");

        // Info bar
        const infoBsDate = document.getElementById("info-bs-date");
        const infoAdDate = document.getElementById("info-ad-date");
        const infoTithi = document.getElementById("info-tithi");
        const infoSunrise = document.getElementById("info-sunrise");
        const infoSunset = document.getElementById("info-sunset");
        const infoMoon = document.getElementById("info-moon");

        // Calendar mode toggle
        const modeToggle = document.getElementById("calendar-mode-toggle");
        const modeBtns = modeToggle.querySelectorAll('.mode-btn');
        let currentMode = 'bs'; // 'bs' or 'ad'

        // State
        let currentYear = 2082;
        let currentMonth = 7;
        let currentLat = FALLBACK_LAT;
        let currentLon = FALLBACK_LON;

        // ---- Populate Selectors ----
        function populateSelectors() {
            const years = getAvailableYears();
            yearSelector.innerHTML = years.map(y => `<option value="${y}">${toNepNum(y)}</option>`).join('');
            monthSelector.innerHTML = nepaliMonths.map((m, i) => `<option value="${i}">${m}</option>`).join('');
            const now = new Date();
            const todayBs = adToBs(now);
            if (!todayBs.outOfRange) {
                currentYear = todayBs.year;
                currentMonth = todayBs.month;
            }
            yearSelector.value = currentYear;
            monthSelector.value = currentMonth;
        }

        // ---- Calendar Rendering ----
        function buildHeaderRow(mode) {
            const thead = document.createElement("thead");
            const tr = document.createElement("tr");
            let weekdays;
            if (mode === 'bs') {
                weekdays = nepaliWeekdaysFull;
            } else {
                // For AD, use English weekday names
                weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            }
            weekdays.forEach((label, i) => {
                const th = document.createElement("th");
                if (i === 6) th.className = "sat";
                if (mode === 'bs') {
                    th.innerHTML = `<div class="th-wrap"><div class="th-nep">${label}</div><div class="th-en">${englishWeekdaysUpper[i]}</div></div>`;
                } else {
                    th.innerHTML = `<div class="th-wrap"><div class="th-nep">${label}</div></div>`;
                }
                tr.appendChild(th);
            });
            thead.appendChild(tr);
            return thead;
        }

        function getADMonthSpanWithYear(month, year) {
            const s = bsToAdParts(year, month, 1);
            const e = bsToAdParts(year, month, bsMonthDays(year, month));
            const span = (adMonthsShort[s.m - 1] === adMonthsShort[e.m - 1]) ?
                adMonthsShort[s.m - 1] :
                `${adMonthsShort[s.m-1]}/${adMonthsShort[e.m-1]}`;
            return `${nepaliMonths[month]} ${toNepNum(year)} | ${span} ${e.y}`;
        }

        function generateCalendar(month, year, todayBs, mode) {
            // Hide skeleton, show table
            skeletonEl.style.display = 'none';
            calendarTable.style.display = '';

            // Clear previous table content
            while (calendarTable.firstChild) calendarTable.firstChild.remove();

            // Build header based on mode
            calendarTable.appendChild(buildHeaderRow(mode));

            const tbody = document.createElement("tbody");
            calendarTable.appendChild(tbody);

            if (mode === 'bs') {
                // BS calendar
                const dim = bsMonthDays(year, month);
                const start = getStartDay(year, month);
                let date = 1;
                for (let row = 0; row < 6; row++) {
                    const tr = document.createElement("tr");
                    for (let col = 0; col < 7; col++) {
                        const td = document.createElement("td");
                        if (row === 0 && col < start) {
                            td.className = "empty";
                            tr.appendChild(td);
                            continue;
                        }
                        if (date > dim) {
                            td.className = "empty";
                            tr.appendChild(td);
                            continue;
                        }
                        const dayVal = date;
                        const isToday = todayBs && todayBs.year === year && todayBs.month === month && todayBs.day === dayVal && !todayBs.outOfRange;
                        const ad = bsToAdParts(year, month, dayVal);
                        const adLabel = `${adMonthsShort[ad.m-1]} ${ad.d}`;
                        const dateObj = new Date(ad.y, ad.m - 1, ad.d);
                        const panchang = calcPanchangForDate(dateObj, currentLat, currentLon);
                        const tithiInfo = panchang.tithi.name;
                        const festivalNames = getFestivalsForBsDate(year, month, dayVal);
                        const classes = [];
                        if (col === 6) classes.push("is-sat");
                        if (isToday) classes.push("today");
                        td.className = classes.join(" ");

                        let festivalHTML = '';
                        if (festivalNames.length > 0) {
                            const displayFest = festivalNames.length === 1 ? festivalNames[0] : festivalNames.join(", ");
                            festivalHTML = `<span class="festival">${displayFest}</span>`;
                        }

                        td.innerHTML = `
                            <div class="cell-inner">
                                <div class="cell-top">
                                    <span class="bs-day">${toNepNum(dayVal)}</span>
                                </div>
                                <div class="cell-center">
                                    ${festivalHTML}
                                    <span class="cell-bottom-left">${tithiInfo}</span>
                                </div>
                                <span class="ad-date">${adLabel}</span>
                            </div>
                        `;
                        td.addEventListener("click", () => {
                            openPanchangModal(dateObj, year, month, dayVal);
                        });
                        tr.appendChild(td);
                        date++;
                    }
                    tbody.appendChild(tr);
                    if (date > dim) break;
                }
                periodLabelEl.textContent = getADMonthSpanWithYear(month, year);
            } else {
                // AD calendar
                // Get the first day of the AD month
                const adStart = bsToAdParts(year, month, 1);
                const adDateStart = new Date(adStart.y, adStart.m - 1, adStart.d);
                const firstDayOfMonth = new Date(adDateStart.getFullYear(), adDateStart.getMonth(), 1);
                const startDayOfWeek = firstDayOfMonth.getDay(); // 0=Sun
                const daysInMonth = new Date(adDateStart.getFullYear(), adDateStart.getMonth() + 1, 0).getDate();

                let date = 1;
                for (let row = 0; row < 6; row++) {
                    const tr = document.createElement("tr");
                    for (let col = 0; col < 7; col++) {
                        const td = document.createElement("td");
                        if (row === 0 && col < startDayOfWeek) {
                            td.className = "empty";
                            tr.appendChild(td);
                            continue;
                        }
                        if (date > daysInMonth) {
                            td.className = "empty";
                            tr.appendChild(td);
                            continue;
                        }
                        const dayVal = date;
                        const currentDate = new Date(firstDayOfMonth.getFullYear(), firstDayOfMonth.getMonth(), dayVal);
                        const isToday = (currentDate.toDateString() === new Date().toDateString());
                        const weekday = currentDate.getDay();
                        const classes = [];
                        if (weekday === 6) classes.push("is-sat");
                        if (isToday) classes.push("today");
                        td.className = classes.join(" ");

                        // Compute BS date, tithi, festivals for this AD date
                        const bs = adToBs(currentDate);
                        let bsDateStr = '';
                        let tithiStr = '';
                        let festivalStr = '';
                        let bsYear = 0, bsMonth = 0, bsDay = 0;
                        if (!bs.outOfRange) {
                            bsYear = bs.year;
                            bsMonth = bs.month;
                            bsDay = bs.day;
                            bsDateStr = `${nepaliMonths[bs.month]} ${toNepNum(bs.day)}`;
                            const panchang = calcPanchangForDate(currentDate, currentLat, currentLon);
                            tithiStr = panchang.tithi.name;
                            const festivals = getFestivalsForBsDate(bs.year, bs.month, bs.day);
                            if (festivals.length > 0) {
                                festivalStr = festivals.join(", ");
                            }
                        }

                        // Build AD cell without weekday
                        td.innerHTML = `
                            <div class="ad-cell-inner">
                                <div class="ad-cell-top">
                                    <span class="ad-day-number">${dayVal}</span>
                                </div>
                                <div class="ad-cell-center">
                                    ${festivalStr ? `<span class="ad-festival">${festivalStr}</span>` : ''}
                                    <span class="ad-bs-date">${bsDateStr}</span>
                                    <span class="ad-tithi">${tithiStr}</span>
                                </div>
                            </div>
                        `;

                        // Click handler to open modal with correct BS date
                        if (!bs.outOfRange) {
                            const adParts = bsToAdParts(bs.year, bs.month, bs.day);
                            const dateObj = new Date(adParts.y, adParts.m - 1, adParts.d);
                            td.addEventListener("click", () => {
                                openPanchangModal(dateObj, bs.year, bs.month, bs.day);
                            });
                        }
                        tr.appendChild(td);
                        date++;
                    }
                    tbody.appendChild(tr);
                    if (date > daysInMonth) break;
                }
                // Period label: show AD month/year
                const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
                periodLabelEl.textContent = `${monthNames[firstDayOfMonth.getMonth()]} ${firstDayOfMonth.getFullYear()}`;
            }
        }

        // ---- Modal Population ----
        function openPanchangModal(dateObj, bsYear, bsMonth, bsDay) {
            const panchang = calcPanchangForDate(dateObj, currentLat, currentLon);
            const adParts = bsToAdParts(bsYear, bsMonth, bsDay);
            const weekday = nepaliWeekdaysFull[adParts.w];
            const monthName = nepaliMonths[bsMonth];
            const bsDisplay = `${monthName} ${toNepNum(bsDay)}, ${toNepNum(bsYear)} ${weekday}`;
            modalTitle.textContent = bsDisplay;
            modalAd.textContent = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }) + ", " + weekday;

            modalSunrise.textContent = panchang.sunrise;
            modalSunset.textContent = panchang.sunset;
            modalUpdateTime.textContent = new Date().toLocaleTimeString('ne-NP', { hour: '2-digit', minute: '2-digit' });

            pDay.textContent = weekday;
            pTithi.textContent = panchang.tithi.name;
            pChandraRashi.textContent = panchang.moonRashi.name;
            pPaksha.textContent = panchang.tithi.paksha;
            pKarana.textContent = panchang.karana.name;
            pMaas.textContent = monthName;
            pNakshatra.textContent = panchang.nakshatra.name;
            pYoga.textContent = panchang.yoga.name;
            pSunRashi.textContent = panchang.sunRashi.name;
            pAyan.textContent = getAyan(panchang.sunRashi.index);
            pRitu.textContent = getRitu(bsMonth);
            pBaar.textContent = weekday;

            const festivals = getFestivalsForBsDate(bsYear, bsMonth, bsDay);
            pFestivals.textContent = festivals.length ? festivals.join(", ") : "—";

            mRahu.textContent = panchang.muhurat.rahu;
            mYamaganda.textContent = panchang.muhurat.yamaganda;
            mGulika.textContent = panchang.muhurat.gulika;
            mAbhijit.textContent = panchang.muhurat.abhijit;
            mDur.textContent = panchang.muhurat.dur;
            mBrahma.textContent = panchang.muhurat.brahma;
            mAmrit.textContent = panchang.muhurat.amrit;
            mVijaya.textContent = panchang.muhurat.vijaya;
            mNishita.textContent = panchang.muhurat.nishita;
            mVarjyam.textContent = panchang.muhurat.varjyam;

            choghadiyaGrid.innerHTML = "";
            const allChoghadiya = [
                ...panchang.choghadiya.day.map(c => ({ ...c, type: 'Day' })),
                ...panchang.choghadiya.night.map(c => ({ ...c, type: 'Night' }))
            ];
            const colSize = Math.ceil(allChoghadiya.length / 3);
            const col1 = allChoghadiya.slice(0, colSize);
            const col2 = allChoghadiya.slice(colSize, colSize * 2);
            const col3 = allChoghadiya.slice(colSize * 2);
            const columns = [col1, col2, col3];
            columns.forEach(col => {
                const colDiv = document.createElement("div");
                colDiv.className = "c-col";
                col.forEach(c => {
                    const div = document.createElement("div");
                    div.className = "c-item";
                    const isGood = ["Labh", "Amrit", "Shubh", "Char"].includes(c.name);
                    div.innerHTML = `
                        <span>${c.type} ${c.start}-${c.end}</span>
                        <span class="${isGood ? 'choghadiya-good' : 'choghadiya-bad'}">${c.name}</span>
                    `;
                    colDiv.appendChild(div);
                });
                choghadiyaGrid.appendChild(colDiv);
            });

            modal.classList.add("show");
            document.body.style.overflow = "hidden";
        }

        function closePanchangModal() {
            modal.classList.remove("show");
            document.body.style.overflow = "";
        }

        // ---- Info Bar Update ----
        function updateInfoBar() {
            const now = new Date();
            const bs = adToBs(now);
            const bsStr = `${nepaliMonths[bs.month]} ${toNepNum(bs.day)}, ${toNepNum(bs.year)}`;
            infoBsDate.innerHTML = `<strong>${bsStr}</strong>`;
            infoAdDate.innerHTML = `<strong>${now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</strong>`;
            const panchang = calcPanchangForDate(now, currentLat, currentLon);
            infoTithi.innerHTML = `<strong>${panchang.tithi.name}</strong>`;
            infoSunrise.textContent = panchang.sunrise;
            infoSunset.textContent = panchang.sunset;
            const phase = (panchang.tithi.paksha === 'Shukla') ? "शुक्ल पक्ष" : "कृष्ण पक्ष";
            infoMoon.innerHTML = `<strong>${phase}</strong>`;

            // Update document title with current BS date
            document.title = `Shrisha – ${bsStr}`;
        }

        // ---- Upcoming Events (scrollable) ----
        function renderUpcomingEvents(todayAd) {
            const events = [];
            // Look ahead 30 days from today
            for (let i = 0; i < 30; i++) {
                const d = new Date(todayAd);
                d.setDate(d.getDate() + i);
                const bs = adToBs(d);
                if (bs.outOfRange) continue;
                const festivals = getFestivalsForBsDate(bs.year, bs.month, bs.day);
                if (festivals.length > 0) {
                    events.push({
                        label: festivals.join(", "),
                        bsText: `${nepaliMonths[bs.month]} ${toNepNum(bs.day)}, ${toNepNum(bs.year)}`,
                        adText: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
                        inDays: i,
                        day: bs.day,
                        month: bs.month,
                        year: bs.year,
                        adParts: bsToAdParts(bs.year, bs.month, bs.day),
                        weekday: nepaliWeekdaysFull[bsToAdParts(bs.year, bs.month, bs.day).w]
                    });
                }
            }

            // Sort by inDays (already ascending because we iterate i from 0)
            // but if there are multiple events on same day, we keep them together
            upcomingList.innerHTML = "";
            if (events.length === 0) {
                upcomingList.innerHTML = `<div class="upcoming-item" style="justify-content:center;color:var(--text-light);font-size:0.85rem;">No upcoming events</div>`;
                return;
            }

            events.forEach(ev => {
                const li = document.createElement("li");
                li.className = "upcoming-item";
                const badgeText = ev.inDays === 0 ? "Today" : `${toNepNum(ev.inDays)} days left`;
                li.innerHTML = `
                    <div class="event-date"><div class="day">${toNepNum(ev.day)}</div><div class="month">${nepaliMonths[ev.month]}</div></div>
                    <div class="event-info"><div class="event-title">${ev.label}</div><div class="event-meta">${ev.bsText}</div><div class="event-meta">${ev.adText}</div></div>
                    <div class="event-pill">${badgeText}</div>
                `;
                li.addEventListener("click", () => {
                    const dateObj = new Date(ev.adParts.y, ev.adParts.m - 1, ev.adParts.d);
                    openPanchangModal(dateObj, ev.year, ev.month, ev.day);
                });
                upcomingList.appendChild(li);
            });
        }

        // ---- Navigation ----
        function populateMonthYearAndRender() {
            const now = new Date();
            const todayBs = adToBs(now);
            yearSelector.value = String(currentYear);
            monthSelector.value = String(currentMonth);
            generateCalendar(currentMonth, currentYear, todayBs, currentMode);
            updateInfoBar();
            renderUpcomingEvents(now);
        }

        // ---- Daily Refresh (at midnight) ----
        function scheduleDailyRefresh() {
            const now = new Date();
            const nextMidnight = new Date(now);
            nextMidnight.setDate(now.getDate() + 1);
            nextMidnight.setHours(0, 0, 0, 0);
            const msUntilMidnight = nextMidnight - now;

            setTimeout(() => {
                // Refresh info bar and upcoming events
                updateInfoBar();
                renderUpcomingEvents(new Date());
                // Also re-render calendar to update today's highlighting
                const todayBs = adToBs(new Date());
                generateCalendar(currentMonth, currentYear, todayBs, currentMode);
                // Schedule next midnight refresh
                scheduleDailyRefresh();
            }, msUntilMidnight);
        }

        // ---- Mobile Menu ----
        function initMobileMenu() {
            mobileMenuToggle.addEventListener("click", () => {
                mobileMenuToggle.classList.toggle("active");
                navMenu.classList.toggle("active");
            });
            document.querySelectorAll(".nav-link").forEach(link => {
                link.addEventListener("click", () => {
                    mobileMenuToggle.classList.remove("active");
                    navMenu.classList.remove("active");
                });
            });
        }

        // ---- Date Converter (compact) ----
        function initDateConverter() {
            const bsMonthSelect = document.getElementById("bs-month-compact");
            nepaliMonths.forEach((m, i) => {
                bsMonthSelect.innerHTML += `<option value="${i}">${m}</option>`;
            });
            const adMonthSelect = document.getElementById("ad-month-compact");
            const adMonths = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            adMonths.forEach((m, i) => {
                adMonthSelect.innerHTML += `<option value="${i}">${m}</option>`;
            });

            document.getElementById("convert-bs-compact-btn").addEventListener("click", () => {
                const year = parseInt(document.getElementById("bs-year-compact").value, 10);
                const month = parseInt(document.getElementById("bs-month-compact").value, 10);
                const day = parseInt(document.getElementById("bs-day-compact").value, 10);
                const resultEl = document.getElementById("bs-to-ad-compact-result");
                if (!year || !month || !day) {
                    resultEl.textContent = "कृपया सही मिति प्रविष्ट गर्नुहोस्";
                    return;
                }
                const ad = bsToAdParts(year, month, day);
                if (ad) {
                    const dateStr = new Date(ad.y, ad.m - 1, ad.d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
                    resultEl.textContent = `${dateStr} (${adMonths[ad.m-1]} ${ad.d}, ${ad.y})`;
                } else {
                    resultEl.textContent = "अमान्य मिति";
                }
            });

            document.getElementById("convert-ad-compact-btn").addEventListener("click", () => {
                const year = parseInt(document.getElementById("ad-year-compact").value, 10);
                const month = parseInt(document.getElementById("ad-month-compact").value, 10);
                const day = parseInt(document.getElementById("ad-day-compact").value, 10);
                const resultEl = document.getElementById("ad-to-bs-compact-result");
                if (!year || isNaN(month) || !day) {
                    resultEl.textContent = "कृपया सही मिति प्रविष्ट गर्नुहोस्";
                    return;
                }
                const dateObj = new Date(year, month, day);
                const bs = adToBs(dateObj);
                if (!bs.outOfRange) {
                    resultEl.textContent = `${nepaliMonths[bs.month]} ${toNepNum(bs.day)}, ${toNepNum(bs.year)}`;
                } else {
                    resultEl.textContent = "अमान्य मिति वा दायरा बाहिर";
                }
            });

            document.querySelectorAll(".converter-tab").forEach(tab => {
                tab.addEventListener("click", () => {
                    document.querySelectorAll(".converter-tab").forEach(t => t.classList.remove("active"));
                    tab.classList.add("active");
                    document.querySelectorAll(".converter-form-compact").forEach(f => f.classList.remove("active"));
                    document.getElementById(tab.dataset.mode + "-compact").classList.add("active");
                });
            });
        }

        // ---- Currency Converter (compact) ----
        function initCurrencyConverter() {
            const from = document.getElementById('currency-from');
            const to = document.getElementById('currency-to');
            const amount = document.getElementById('currency-amount');
            const btn = document.getElementById('currency-convert-btn');
            const result = document.getElementById('currency-result');
            const currencies = ['USD', 'EUR', 'GBP', 'JPY', 'NPR', 'INR'];
            currencies.forEach(c => {
                from.innerHTML += `<option value="${c}">${c}</option>`;
                to.innerHTML += `<option value="${c}">${c}</option>`;
            });
            from.value = 'USD'; to.value = 'NPR';
            const rates = {
                'USD_NPR': 135.5, 'EUR_NPR': 147.2, 'GBP_NPR': 172.8, 'JPY_NPR': 0.92,
                'USD_INR': 83.2, 'EUR_INR': 90.5, 'GBP_INR': 106.1, 'JPY_INR': 0.57,
                'NPR_INR': 0.62
            };
            btn.addEventListener('click', () => {
                const amt = parseFloat(amount.value) || 0;
                const fromCurr = from.value;
                const toCurr = to.value;
                if (fromCurr === toCurr) {
                    result.textContent = `${amt} ${fromCurr} = ${amt.toFixed(2)} ${toCurr}`;
                    return;
                }
                const key = `${fromCurr}_${toCurr}`;
                const reverseKey = `${toCurr}_${fromCurr}`;
                let rate = rates[key];
                if (!rate && rates[reverseKey]) {
                    rate = 1 / rates[reverseKey];
                } else if (!rate) {
                    rate = 1;
                }
                result.textContent = `${amt} ${fromCurr} = ${(amt * rate).toFixed(2)} ${toCurr}`;
            });
        }

        // ---- Calendar Mode Toggle ----
        function initModeToggle() {
            modeBtns.forEach(btn => {
                btn.addEventListener('click', () => {
                    modeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentMode = btn.dataset.mode;
                    // Re-render calendar with new mode
                    const now = new Date();
                    const todayBs = adToBs(now);
                    generateCalendar(currentMonth, currentYear, todayBs, currentMode);
                });
            });
        }

        // ---- Initialize ----
        function initCalendar() {
            // Fixed location
            currentLat = FALLBACK_LAT;
            currentLon = FALLBACK_LON;
            locationReady = true;

            populateSelectors();
            const now = new Date();
            const todayBs = adToBs(now);
            generateCalendar(currentMonth, currentYear, todayBs, currentMode);
            updateInfoBar();
            renderUpcomingEvents(now);
            initMobileMenu();
            initDateConverter();
            initCurrencyConverter();
            initModeToggle();

            // Navigation events
            prevButton.addEventListener("click", () => {
                if (currentMode === 'bs') {
                    currentMonth--;
                    if (currentMonth < 0) {
                        currentMonth = 11;
                        const years = getAvailableYears();
                        const idx = years.indexOf(currentYear);
                        currentYear = years[Math.max(0, idx - 1)];
                    }
                } else {
                    // AD: go to previous month
                    const adStart = bsToAdParts(currentYear, currentMonth, 1);
                    const adDate = new Date(adStart.y, adStart.m - 1, adStart.d);
                    adDate.setMonth(adDate.getMonth() - 1);
                    const bs = adToBs(adDate);
                    if (!bs.outOfRange) {
                        currentYear = bs.year;
                        currentMonth = bs.month;
                    }
                }
                populateMonthYearAndRender();
            });

            nextButton.addEventListener("click", () => {
                if (currentMode === 'bs') {
                    currentMonth++;
                    if (currentMonth > 11) {
                        currentMonth = 0;
                        const years = getAvailableYears();
                        const idx = years.indexOf(currentYear);
                        currentYear = years[Math.min(years.length - 1, idx + 1)];
                    }
                } else {
                    // AD: go to next month
                    const adStart = bsToAdParts(currentYear, currentMonth, 1);
                    const adDate = new Date(adStart.y, adStart.m - 1, adStart.d);
                    adDate.setMonth(adDate.getMonth() + 1);
                    const bs = adToBs(adDate);
                    if (!bs.outOfRange) {
                        currentYear = bs.year;
                        currentMonth = bs.month;
                    }
                }
                populateMonthYearAndRender();
            });

            todayBtn.addEventListener("click", () => {
                const now = new Date();
                const todayBs = adToBs(now);
                if (!todayBs.outOfRange) {
                    currentYear = todayBs.year;
                    currentMonth = todayBs.month;
                }
                populateMonthYearAndRender();
            });

            yearSelector.addEventListener("change", () => {
                currentYear = parseInt(yearSelector.value, 10);
                populateMonthYearAndRender();
            });
            monthSelector.addEventListener("change", () => {
                currentMonth = parseInt(monthSelector.value, 10);
                populateMonthYearAndRender();
            });

            modalClose.addEventListener("click", closePanchangModal);
            modal.querySelector(".modal-overlay").addEventListener("click", closePanchangModal);
            document.addEventListener("keydown", (e) => {
                if (e.key === "Escape" && modal.classList.contains("show")) closePanchangModal();
            });

            let resizeTimer;
            window.addEventListener("resize", () => {
                clearTimeout(resizeTimer);
                resizeTimer = setTimeout(() => {
                    const now = new Date();
                    const todayBs = adToBs(now);
                    generateCalendar(currentMonth, currentYear, todayBs, currentMode);
                }, 300);
            });

            document.getElementById("current-year").textContent = new Date().getFullYear();
            console.log("Shrisha Panchang loaded with fixed Kathmandu location and AD enhancements.");

            // Schedule daily midnight refresh
            scheduleDailyRefresh();
        }

        // Actually run it
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", initCalendar);
        } else {
            initCalendar();
        }
    } else {
        console.log("Calendar table not found – skipping UI initialization (Forex page).");
    }

    // ============================================================
    // EXPOSE CORE FUNCTIONS FOR FOREX PAGE
    // ============================================================
    window.Sharsha = {
        adToBs: adToBs,
        bsToAdParts: bsToAdParts,
        toNepNum: toNepNum,
        nepaliMonths: window.DATA.nepaliMonths,
        nepaliWeekdaysFull: window.DATA.nepaliWeekdaysFull,
        pad2: pad2
    };

})();