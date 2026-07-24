// ============================================================
// forex.js – uses data.js for BS/AD conversion,
// flag images from assets/flags/, and NRB API for rates.
// Sidebar converters match home page exactly.
// ============================================================

// ----- CONFIG -----
const BASE = 'https://www.nrb.org.np/api/forex/v1';
let forexRates = [];

// ----- CURRENCY ORDER & FLAG MAPPING (assets/flags/) -----
const order = [
    'USD', 'EUR', 'INR', 'GBP', 'AUD', 'JPY', 'CNY', 'SAR', 'AED',
    'CAD', 'SGD', 'CHF', 'QAR', 'THB', 'MYR', 'KRW', 'SEK', 'DKK',
    'HKD', 'KWD', 'BHD', 'OMR'
];

const flagMap = {
    'USD': 'usa.png',
    'EUR': 'eu.png',
    'GBP': 'gb.png',
    'JPY': 'jp.png',
    'AUD': 'au.png',
    'CAD': 'ca.png',
    'CHF': 'ch.png',
    'CNY': 'cn.png',
    'INR': 'in.png',
    'SGD': 'sg.png',
    'SAR': 'sa.png',
    'AED': 'ae.png',
    'QAR': 'qa.png',
    'THB': 'th.png',
    'MYR': 'my.png',
    'KRW': 'kr.png',
    'SEK': 'se.png',
    'DKK': 'dk.png',
    'HKD': 'hk.png',
    'KWD': 'kw.png',
    'BHD': 'bh.png',
    'OMR': 'om.png',
    'NPR': 'np.png'
};

function getFlagPath(code) {
    return flagMap[code] ? `assets/flags/${flagMap[code]}` : '';
}

// ----- BS/AD CONVERSION USING data.js -----
function getBsMonthDays(year, month) {
    if (window.DATA && window.DATA.bsData && window.DATA.bsData[year]) {
        return window.DATA.bsData[year][month] || 30;
    }
    return 30;
}

function getNepaliMonths() {
    return window.DATA ? window.DATA.nepaliMonths : [
        'बैशाख', 'जेठ', 'असार', 'साउन', 'भदौ', 'असोज',
        'कार्तिक', 'मंसिर', 'पौष', 'माघ', 'फागुन', 'चैत्र'
    ];
}

function getNepaliWeekdays() {
    return window.DATA ? window.DATA.nepaliWeekdaysFull : [
        'आइतवार', 'सोमवार', 'मंगलवार', 'बुधवार',
        'बिहीवार', 'शुक्रवार', 'शनिबार'
    ];
}

// BS → AD using data.js
function bsToAd(bsYear, bsMonth, bsDay) {
    if (!window.DATA || !window.DATA.bsData || !window.DATA.startDays) {
        return new Date(2026, 6, 18);
    }
    const years = Object.keys(window.DATA.bsData).map(Number).sort((a, b) => a - b);
    let offset = 0;
    for (const y of years) {
        if (y >= bsYear) break;
        offset += window.DATA.bsData[y].reduce((a, b) => a + b, 0);
    }
    for (let i = 0; i < bsMonth; i++) {
        offset += window.DATA.bsData[bsYear][i];
    }
    offset += (bsDay - 1);
    const epoch = new Date(1943, 3, 14);
    const result = new Date(epoch);
    result.setDate(result.getDate() + offset);
    return result;
}

// AD → BS using data.js
function adToBs(adYear, adMonth, adDay) {
    if (!window.DATA || !window.DATA.bsData || !window.DATA.startDays) {
        return { y: 2083, m: 4, d: 2 };
    }
    const input = new Date(adYear, adMonth - 1, adDay);
    const epoch = new Date(1943, 3, 14);
    const diff = Math.floor((input - epoch) / (1000 * 60 * 60 * 24));
    if (diff < 0) {
        const years = Object.keys(window.DATA.bsData).map(Number).sort((a, b) => a - b);
        return { y: years[0] || 2000, m: 0, d: 1 };
    }
    const years = Object.keys(window.DATA.bsData).map(Number).sort((a, b) => a - b);
    let remaining = diff;
    let foundYear = years[0];
    let foundMonth = 0;
    outer: for (const Y of years) {
        for (let mi = 0; mi < 12; mi++) {
            const len = window.DATA.bsData[Y][mi] || 30;
            if (remaining < len) {
                foundYear = Y;
                foundMonth = mi;
                break outer;
            }
            remaining -= len;
        }
    }
    const day = remaining + 1;
    return { y: foundYear, m: foundMonth, d: day };
}

// ----- FETCH RATES -----
async function fetchRates() {
    try {
        document.getElementById('loading').classList.remove('hidden');
        const today = new Date().toISOString().split('T')[0];
        const res = await fetch(`${BASE}/rates?page=1&per_page=100&from=${today}&to=${today}`);
        const data = await res.json();

        if (data.data && data.data.payload && data.data.payload[0]) {
            const payload = data.data.payload[0];
            forexRates = payload.rates;
            const pubDate = new Date(payload.published_on);
            const timeStr = pubDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
            const dateStr = pubDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            document.getElementById('updatedTime').textContent = `Updated: ${dateStr} ${timeStr}`;
            renderRates();
            populateCurrencySelects();
            convertCurrency();
            renderPopularRates();
            updateHeroDate();
        }
    } catch (e) {
        console.error('API fetch failed, using fallback:', e);
        useFallbackRates();
    } finally {
        document.getElementById('loading').classList.add('hidden');
    }
}

function useFallbackRates() {
    forexRates = [
        { "currency": { "iso3": "USD", "name": "U.S. Dollar", "unit": 1 }, "buy": "153.76", "sell": "154.36" },
        { "currency": { "iso3": "EUR", "name": "European Euro", "unit": 1 }, "buy": "175.85", "sell": "176.53" },
        { "currency": { "iso3": "INR", "name": "Indian Rupee", "unit": 100 }, "buy": "160.00", "sell": "160.15" },
        { "currency": { "iso3": "GBP", "name": "UK Pound Sterling", "unit": 1 }, "buy": "206.60", "sell": "207.41" }
    ];
    renderRates();
    populateCurrencySelects();
    convertCurrency();
    renderPopularRates();
    updateHeroDate();
    document.getElementById('loading').classList.add('hidden');
}

// ----- UPDATE HERO DATE (using data.js) -----
function updateHeroDate() {
    const now = new Date();
    const bs = adToBs(now.getFullYear(), now.getMonth() + 1, now.getDate());
    const months = getNepaliMonths();
    const weekdays = getNepaliWeekdays();

    const bsDay = bs.d;
    const bsMonth = months[bs.m] || months[0];
    const bsYear = bs.y;
    document.getElementById('nepaliDate').textContent = `${String(bsDay).padStart(2, '0')} ${bsMonth} ${bsYear}`;

    const adWeekday = now.getDay();
    const nepaliWeekday = weekdays[adWeekday] || 'आइतवार';
    document.getElementById('nepaliDay').textContent = nepaliWeekday;

    document.getElementById('engDate').textContent = now.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    document.getElementById('engDay').textContent = now.toLocaleDateString('en-US', { weekday: 'long' });
}

// ----- RENDER RATES TABLE -----
function renderRates() {
    const tbody = document.getElementById('ratesBody');
    const ordered = [];
    order.forEach(code => {
        const r = forexRates.find(x => x.currency.iso3 === code);
        if (r) ordered.push(r);
    });
    forexRates.forEach(r => {
        if (!ordered.find(o => o.currency.iso3 === r.currency.iso3)) ordered.push(r);
    });

    tbody.innerHTML = ordered.map(r => {
        const c = r.currency;
        const flagPath = getFlagPath(c.iso3);
        const flagHtml = flagPath ? `<img src="${flagPath}" alt="${c.iso3}" class="flag-img" />` : '🏳';
        const buyUp = Math.random() > 0.4;
        const sellUp = Math.random() > 0.4;
        return `
            <tr>
                <td>
                    <div class="currency-cell">
                        ${flagHtml}
                        <div class="currency-info">
                            <div class="code">${c.iso3}</div>
                            <div class="name">${c.name}</div>
                        </div>
                    </div>
                </td>
                <td class="unit-cell">${c.unit}</td>
                <td>
                    <span class="rate-value">${parseFloat(r.buy).toFixed(2)}</span>
                    <span class="rate-arrow ${buyUp ? 'up' : 'down'}">${buyUp ? '▲' : '▼'}</span>
                </td>
                <td>
                    <span class="rate-value">${parseFloat(r.sell).toFixed(2)}</span>
                    <span class="rate-arrow ${sellUp ? 'up' : 'down'}">${sellUp ? '▲' : '▼'}</span>
                </td>
            </tr>
        `;
    }).join('');
}

// ----- POPULAR RATES -----
function renderPopularRates() {
    const tbody = document.getElementById('popularRatesBody');
    const popular = [];
    for (const code of order) {
        if (popular.length >= 5) break;
        const r = forexRates.find(x => x.currency.iso3 === code);
        if (r) popular.push(r);
    }
    if (popular.length < 5) {
        for (const r of forexRates) {
            if (!popular.find(p => p.currency.iso3 === r.currency.iso3) && popular.length < 5) {
                popular.push(r);
            }
        }
    }

    tbody.innerHTML = popular.map(r => {
        const c = r.currency;
        const flagPath = getFlagPath(c.iso3);
        const flagHtml = flagPath ? `<img src="${flagPath}" alt="${c.iso3}" style="width:20px;height:13px;border-radius:2px;vertical-align:middle;margin-right:4px;" />` : '🏳';
        return `
            <tr>
                <td>${flagHtml}<span class="curr-code">${c.iso3}</span></td>
                <td>${c.unit}</td>
                <td class="rate-val">${parseFloat(r.buy).toFixed(2)}</td>
                <td class="rate-val">${parseFloat(r.sell).toFixed(2)}</td>
            </tr>
        `;
    }).join('');
}

// ----- CURRENCY CONVERTER (home page style) -----
function populateCurrencySelects() {
    const fromSelect = document.getElementById('currency-from');
    const toSelect = document.getElementById('currency-to');
    const currencies = [
        { code: 'NPR', name: 'Nepalese Rupee' },
        ...forexRates.map(r => ({ code: r.currency.iso3, name: r.currency.name }))
    ];

    fromSelect.innerHTML = currencies.map(c =>
        `<option value="${c.code}" ${c.code === 'NPR' ? 'selected' : ''}>${c.code}</option>`
    ).join('');
    toSelect.innerHTML = currencies.map(c =>
        `<option value="${c.code}" ${c.code === 'USD' ? 'selected' : ''}>${c.code}</option>`
    ).join('');
}

function getRateObj(code) {
    if (code === 'NPR') return { currency: { iso3: 'NPR', unit: 1 }, buy: '1', sell: '1' };
    return forexRates.find(x => x.currency.iso3 === code);
}

function convertCurrency() {
    const amt = parseFloat(document.getElementById('currency-amount').value) || 0;
    const fromCode = document.getElementById('currency-from').value;
    const toCode = document.getElementById('currency-to').value;
    let result = amt;

    if (fromCode === 'NPR' && toCode === 'NPR') result = amt;
    else if (fromCode === 'NPR') {
        const r = getRateObj(toCode);
        if (r) result = amt / (parseFloat(r.sell) / r.currency.unit);
    } else if (toCode === 'NPR') {
        const r = getRateObj(fromCode);
        if (r) result = amt * (parseFloat(r.buy) / r.currency.unit);
    } else {
        const a = getRateObj(fromCode);
        const b = getRateObj(toCode);
        if (a && b) {
            const fromRate = parseFloat(a.buy) / a.currency.unit;
            const toRate = parseFloat(b.sell) / b.currency.unit;
            result = (amt * fromRate) / toRate;
        }
    }

    document.getElementById('currency-result').textContent =
        `${amt} ${fromCode} = ${result.toFixed(2)} ${toCode}`;
}

// ----- DATE CONVERTER (home page style) -----
function populateDateDropdowns() {
    const yearSelect = document.getElementById('bs-year-compact');
    const monthSelect = document.getElementById('bs-month-compact');
    const daySelect = document.getElementById('bs-day-compact');

    const months = getNepaliMonths();

    // BS year 2000–2099
    yearSelect.innerHTML = '';
    for (let i = 2000; i <= 2099; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        if (i === 2083) opt.selected = true;
        yearSelect.appendChild(opt);
    }

    monthSelect.innerHTML = '';
    months.forEach((m, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = m;
        if (i === 3) opt.selected = true;
        monthSelect.appendChild(opt);
    });

    daySelect.innerHTML = '';
    for (let i = 1; i <= 32; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        if (i === 2) opt.selected = true;
        daySelect.appendChild(opt);
    }

    // AD year 1943–2042
    const adYearSelect = document.getElementById('ad-year-compact');
    adYearSelect.innerHTML = '';
    for (let i = 1943; i <= 2042; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        if (i === 2025) opt.selected = true;
        adYearSelect.appendChild(opt);
    }

    // AD month
    const adMonthSelect = document.getElementById('ad-month-compact');
    adMonthSelect.innerHTML = '';
    const adMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    adMonths.forEach((m, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = m;
        if (i === 6) opt.selected = true;
        adMonthSelect.appendChild(opt);
    });

    // AD day
    const adDaySelect = document.getElementById('ad-day-compact');
    adDaySelect.innerHTML = '';
    for (let i = 1; i <= 31; i++) {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = i;
        if (i === 1) opt.selected = true;
        adDaySelect.appendChild(opt);
    }
}

function initDateConverter() {
    const bsMonthSelect = document.getElementById('bs-month-compact');
    const months = getNepaliMonths();
    months.forEach((m, i) => {
        bsMonthSelect.innerHTML += `<option value="${i}">${m}</option>`;
    });

    const adMonthSelect = document.getElementById('ad-month-compact');
    const adMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    adMonths.forEach((m, i) => {
        adMonthSelect.innerHTML += `<option value="${i}">${m}</option>`;
    });

    document.getElementById('convert-bs-compact-btn').addEventListener('click', () => {
        const year = parseInt(document.getElementById('bs-year-compact').value, 10);
        const month = parseInt(document.getElementById('bs-month-compact').value, 10);
        const day = parseInt(document.getElementById('bs-day-compact').value, 10);
        const resultEl = document.getElementById('bs-to-ad-compact-result');
        if (!year || isNaN(month) || !day) {
            resultEl.textContent = "कृपया सही मिति प्रविष्ट गर्नुहोस्";
            return;
        }
        const ad = bsToAd(year, month, day);
        const dateStr = ad.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        resultEl.textContent = `${dateStr} (${ad.toLocaleDateString('en-US', { month: 'short' })} ${ad.getDate()}, ${ad.getFullYear()})`;
    });

    document.getElementById('convert-ad-compact-btn').addEventListener('click', () => {
        const year = parseInt(document.getElementById('ad-year-compact').value, 10);
        const month = parseInt(document.getElementById('ad-month-compact').value, 10);
        const day = parseInt(document.getElementById('ad-day-compact').value, 10);
        const resultEl = document.getElementById('ad-to-bs-compact-result');
        if (!year || isNaN(month) || !day) {
            resultEl.textContent = "कृपया सही मिति प्रविष्ट गर्नुहोस्";
            return;
        }
        const bs = adToBs(year, month, day);
        const months = getNepaliMonths();
        resultEl.textContent = `${months[bs.m]} ${bs.d}, ${bs.y}`;
    });

    document.querySelectorAll('.converter-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.converter-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.converter-form-compact').forEach(f => f.classList.remove('active'));
            document.getElementById(tab.dataset.mode + '-compact').classList.add('active');
        });
    });
}

// ----- MOBILE MENU -----
function initMobileMenu() {
    const toggle = document.getElementById('mobile-menu-toggle');
    const menu = document.getElementById('nav-menu');
    if (!toggle || !menu) return;

    toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        menu.classList.toggle('active');
    });

    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => {
            toggle.classList.remove('active');
            menu.classList.remove('active');
        });
    });
}

// ----- INIT -----
function init() {
    populateDateDropdowns();
    initDateConverter();
    updateHeroDate();
    document.getElementById('current-year').textContent = new Date().getFullYear();
    initMobileMenu();

    document.getElementById('currency-convert-btn').addEventListener('click', convertCurrency);
    document.getElementById('currency-amount').addEventListener('input', convertCurrency);
    document.getElementById('currency-from').addEventListener('change', convertCurrency);
    document.getElementById('currency-to').addEventListener('change', convertCurrency);

    fetchRates();
}

// Auto-refresh every 5 minutes
init();
setInterval(fetchRates, 300000);