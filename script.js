// ============================================
// CONFIGURATION
// ============================================
const CONFIG = {
    SCRIPT_URL: 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',
    SHEET_URL: 'https://docs.google.com/spreadsheets/d/YOUR_SHEET_ID/edit',
    CSV_FILE: 'cascading_data.csv',
    DHIS2_URL: ''
};

// ============================================
// USER DATABASE
// Replace with real auth endpoint or extend as needed
// ============================================
const USERS_DB = {
    'user001': { password: 'pass001', name: 'Mohamed Kanu', role: 'field_agent' },
    'user002': { password: 'pass002', name: 'Fatmata Sesay', role: 'field_agent' },
    'user003': { password: 'pass003', name: 'Ibrahim Kamara', role: 'field_agent' },
    'user004': { password: 'pass004', name: 'Aminata Conteh', role: 'field_agent' },
    'user005': { password: 'pass005', name: 'Abu Bangura', role: 'supervisor' },
    'admin':   { password: 'admin123', name: 'Admin User', role: 'admin' }
};

// ============================================
// DISTRIBUTION POINTS
// Replace with CSV-loaded data or API endpoint
// ============================================
const DIST_POINTS = [
    { id: 'dp001', name: 'Bo Town Primary DP', district: 'Bo', chiefdom: 'Kakua', community: 'Bo Town' },
    { id: 'dp002', name: 'Kenema City HC DP', district: 'Kenema', chiefdom: 'Nongowa', community: 'Kenema City' },
    { id: 'dp003', name: 'Makeni Central DP', district: 'Bombali', chiefdom: 'Bombali Shebora', community: 'Makeni' },
    { id: 'dp004', name: 'Freetown West DP', district: 'Western Area Urban', chiefdom: 'West I', community: 'Freetown' },
    { id: 'dp005', name: 'Port Loko Main DP', district: 'Port Loko', chiefdom: 'Maforki', community: 'Port Loko Town' },
    { id: 'dp006', name: 'Kailahun Town DP', district: 'Kailahun', chiefdom: 'Luawa', community: 'Kailahun Town' },
    { id: 'dp007', name: 'Kambia Central DP', district: 'Kambia', chiefdom: 'Magbema', community: 'Kambia Town' },
    { id: 'dp008', name: 'Moyamba Junction DP', district: 'Moyamba', chiefdom: 'Kaiyamba', community: 'Moyamba Town' },
    { id: 'dp009', name: 'Bonthe Island DP', district: 'Bonthe', chiefdom: 'Jong', community: 'Bonthe Town' },
    { id: 'dp010', name: 'Pujehun Town DP', district: 'Pujehun', chiefdom: 'Kpanga Kabonde', community: 'Pujehun Town' }
];

// ============================================
// APPLICATION STATE
// ============================================
const state = {
    isLoggedIn: false,
    currentUser: null,
    currentDP: null,
    geoInfo: {},
    registrations: [],
    distributions: [],
    itnStock: [],
    syncLog: [],
    isOnline: navigator.onLine
};

// ============================================
// INITIALIZATION
// ============================================
function init() {
    loadFromStorage();
    populateDistPoints();
    setupEventListeners();

    // Restore session
    if (state.isLoggedIn && state.currentUser) {
        showAppScreen();
    }
}

function loadFromStorage() {
    try {
        const saved = localStorage.getItem('itn_mass_state');
        if (saved) {
            const data = JSON.parse(saved);
            Object.assign(state, data);
        }
    } catch (e) {
        console.warn('State load failed:', e);
    }
}

function saveToStorage() {
    try {
        localStorage.setItem('itn_mass_state', JSON.stringify(state));
    } catch (e) {
        console.warn('State save failed:', e);
    }
}

function populateDistPoints() {
    const sel = document.getElementById('loginDistPoint');
    if (!sel) return;
    DIST_POINTS.forEach(dp => {
        const opt = document.createElement('option');
        opt.value = dp.id;
        opt.textContent = `${dp.name} — ${dp.district}`;
        sel.appendChild(opt);
    });
}

function setupEventListeners() {
    // Online/Offline
    window.addEventListener('online', () => {
        state.isOnline = true;
        updateOnlineStatus();
        showNotification('Back online!', 'success');
        syncPending();
    });
    window.addEventListener('offline', () => {
        state.isOnline = false;
        updateOnlineStatus();
        showNotification('You are offline. Data saved locally.', 'warning');
    });

    // Phone field auto-format
    document.addEventListener('input', function (e) {
        if (e.target.classList.contains('phone-field') || e.target.type === 'tel') {
            e.target.value = e.target.value.replace(/\D/g, '').slice(0, 9);
        }
        // Name fields - remove numbers
        if (e.target.classList.contains('name-field')) {
            e.target.value = e.target.value.replace(/[0-9]/g, '');
        }
    });

    // Enter key on distribution scanner
    document.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && e.target.id === 'dist_voucher_scan') {
            e.preventDefault();
            verifyVoucher();
        }
    });
}

function updateOnlineStatus() {
    const indicator = document.getElementById('statusIndicator');
    const text = document.getElementById('statusText');
    if (!indicator || !text) return;

    if (state.isOnline) {
        indicator.className = 'status-indicator online';
        text.textContent = 'ONLINE';
    } else {
        indicator.className = 'status-indicator offline';
        text.textContent = 'OFFLINE';
    }
}

// ============================================
// LOGIN / LOGOUT
// ============================================
function handleLogin() {
    const userId = document.getElementById('loginUserId').value.trim();
    const password = document.getElementById('loginPassword').value;
    const dpId = document.getElementById('loginDistPoint').value;
    const errorEl = document.getElementById('loginError');

    errorEl.textContent = '';

    if (!userId || !password) {
        errorEl.textContent = 'Please enter User ID and Password';
        return;
    }
    if (!dpId) {
        errorEl.textContent = 'Please select a Distribution Point';
        return;
    }

    const user = USERS_DB[userId];
    if (!user || user.password !== password) {
        errorEl.textContent = 'Invalid User ID or Password';
        return;
    }

    const dp = DIST_POINTS.find(d => d.id === dpId);

    state.isLoggedIn = true;
    state.currentUser = { id: userId, ...user };
    state.currentDP = dp;
    state.geoInfo = {
        district: dp.district,
        chiefdom: dp.chiefdom,
        community: dp.community,
        distributionPoint: dp.name
    };

    saveToStorage();
    showAppScreen();
    showNotification('Welcome, ' + user.name + '!', 'success');
}

function handleLogout() {
    if (!confirm('Are you sure you want to log out?')) return;

    state.isLoggedIn = false;
    state.currentUser = null;
    state.currentDP = null;
    saveToStorage();

    document.getElementById('appScreen').style.display = 'none';
    document.getElementById('loginScreen').style.display = 'block';

    // Clear login form
    document.getElementById('loginUserId').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').textContent = '';
}

function showAppScreen() {
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';

    // User tag
    const userTag = document.getElementById('userTag');
    if (userTag) userTag.textContent = state.currentUser.name.split(' ')[0].toUpperCase();

    // Geo info
    document.getElementById('geoDistrict').textContent = state.geoInfo.district || '—';
    document.getElementById('geoChiefdom').textContent = state.geoInfo.chiefdom || '—';
    document.getElementById('geoCommunity').textContent = state.geoInfo.community || '—';
    document.getElementById('geoDP').textContent = state.geoInfo.distributionPoint || '—';

    updateOnlineStatus();
    updateAllCounts();
    updateStockSummary();
    updateDistHistory();
    updateSyncStats();
    generateHHId();
    captureRegGPS();

    // Default date
    const dateField = document.getElementById('itn_recv_date');
    if (dateField && !dateField.value) {
        dateField.value = new Date().toISOString().split('T')[0];
    }
}

// ============================================
// TAB SWITCHING
// ============================================
function switchTab(tabId) {
    // Update buttons
    document.querySelectorAll('.tab-controls .control-btn').forEach(btn => btn.classList.remove('active'));
    document.querySelector(`.tab-controls [data-tab="${tabId}"]`).classList.add('active');

    // Update panels
    document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
    document.getElementById('tab-' + tabId).classList.add('active');

    // Focus scanner on distribution tab
    if (tabId === 'distribution') {
        setTimeout(() => {
            const scanner = document.getElementById('dist_voucher_scan');
            if (scanner) scanner.focus();
        }, 100);
    }
}

// ============================================
// HOUSEHOLD REGISTRATION
// ============================================
function generateHHId() {
    const dp = state.currentDP?.id || 'XX';
    const ts = Date.now().toString(36).toUpperCase().slice(-6);
    const rand = Math.random().toString(36).toUpperCase().slice(2, 5);
    const el = document.getElementById('reg_hh_id');
    if (el) el.value = 'HH-' + dp.toUpperCase() + '-' + ts + '-' + rand;
}

function onTotalPeopleChange() {
    const total = parseInt(document.getElementById('reg_total_people').value) || 0;
    updateVoucherAllocation(total);
    checkGenderSum();
}

function onGenderChange() {
    checkGenderSum();
}

function onVulnerableChange() {
    const total = parseInt(document.getElementById('reg_total_people').value) || 0;
    const females = parseInt(document.getElementById('reg_females').value) || 0;
    const under5 = parseInt(document.getElementById('reg_under5').value) || 0;
    const pregnant = parseInt(document.getElementById('reg_pregnant').value) || 0;

    const errUnder5 = document.getElementById('error_reg_under5');
    const errPregnant = document.getElementById('error_reg_pregnant');

    if (under5 > total) {
        if (errUnder5) { errUnder5.textContent = 'Cannot exceed total people'; errUnder5.classList.add('show'); }
    } else {
        if (errUnder5) { errUnder5.textContent = ''; errUnder5.classList.remove('show'); }
    }

    if (pregnant > females) {
        if (errPregnant) { errPregnant.textContent = 'Cannot exceed number of females'; errPregnant.classList.add('show'); }
    } else {
        if (errPregnant) { errPregnant.textContent = ''; errPregnant.classList.remove('show'); }
    }
}

function checkGenderSum() {
    const total = parseInt(document.getElementById('reg_total_people').value) || 0;
    const males = parseInt(document.getElementById('reg_males').value) || 0;
    const females = parseInt(document.getElementById('reg_females').value) || 0;

    const checkEl = document.getElementById('genderCheck');
    const textEl = document.getElementById('genderCheckText');
    if (!checkEl || !textEl) return;

    if (total > 0 && (males > 0 || females > 0)) {
        checkEl.style.display = 'flex';
        if (males + females === total) {
            checkEl.className = 'validation-note gender-check match';
            textEl.textContent = '✓ Males (' + males + ') + Females (' + females + ') = Total (' + total + ')';
        } else {
            checkEl.className = 'validation-note gender-check mismatch';
            textEl.textContent = '⚠ Males (' + males + ') + Females (' + females + ') = ' + (males + females) + ' ≠ Total (' + total + ')';
        }
    } else {
        checkEl.style.display = 'none';
    }
}

function updateVoucherAllocation(totalPeople) {
    const summaryBlock = document.getElementById('voucherSummary');
    const scannerBlock = document.getElementById('scannerBlock');

    if (totalPeople <= 0) {
        summaryBlock.style.display = 'none';
        scannerBlock.style.display = 'none';
        return;
    }

    // Voucher logic: 1-3 people = 1 voucher, 4-5 = 2, 6+ = 3
    let voucherCount;
    if (totalPeople <= 3) voucherCount = 1;
    else if (totalPeople <= 5) voucherCount = 2;
    else voucherCount = 3;

    summaryBlock.style.display = 'block';
    scannerBlock.style.display = 'block';

    document.getElementById('voucherCount').textContent = voucherCount;

    let formula;
    if (totalPeople <= 3) formula = totalPeople + ' people → 1 voucher (1 ITN)';
    else if (totalPeople <= 5) formula = totalPeople + ' people → 2 vouchers (2 ITNs)';
    else formula = totalPeople + ' people (6+) → 3 vouchers (3 ITNs)';
    document.getElementById('voucherFormula').textContent = formula;

    buildScanners(voucherCount);
}

function buildScanners(count) {
    const grid = document.getElementById('scannerGrid');
    if (!grid) return;
    grid.innerHTML = '';

    for (let i = 1; i <= count; i++) {
        const row = document.createElement('div');
        row.className = 'scanner-row';
        row.innerHTML =
            '<span class="scanner-label">VOUCHER ' + i + '</span>' +
            '<input type="text" class="scanner-input" id="voucher_scan_' + i + '" placeholder="Scan barcode..." onchange="onVoucherScanned(' + i + ')">' +
            '<div class="scanner-status pending" id="voucher_status_' + i + '">○</div>';
        grid.appendChild(row);
    }

    // Focus first scanner
    setTimeout(function () {
        const first = document.getElementById('voucher_scan_1');
        if (first) first.focus();
    }, 100);
}

function onVoucherScanned(index) {
    const input = document.getElementById('voucher_scan_' + index);
    const status = document.getElementById('voucher_status_' + index);
    const value = input.value.trim();

    if (!value) return;

    // Check duplicate within current form
    let isDuplicate = false;
    const totalScanners = document.querySelectorAll('.scanner-input').length;
    for (let i = 1; i <= totalScanners; i++) {
        if (i !== index) {
            const other = document.getElementById('voucher_scan_' + i);
            if (other && other.value.trim() === value) {
                isDuplicate = true;
                break;
            }
        }
    }

    // Check if voucher already registered in system
    let alreadyRegistered = false;
    for (const reg of state.registrations) {
        if (reg.vouchers && reg.vouchers.includes(value)) {
            alreadyRegistered = true;
            break;
        }
    }

    if (isDuplicate) {
        status.className = 'scanner-status fail';
        status.textContent = '✗';
        input.classList.add('error');
        input.classList.remove('scanned');
        showNotification('Duplicate voucher code detected!', 'error');
    } else if (alreadyRegistered) {
        status.className = 'scanner-status fail';
        status.textContent = '✗';
        input.classList.add('error');
        input.classList.remove('scanned');
        showNotification('This voucher is already registered to another household!', 'error');
    } else {
        status.className = 'scanner-status ok';
        status.textContent = '✓';
        input.classList.add('scanned');
        input.classList.remove('error');

        // Auto-focus next
        const next = document.getElementById('voucher_scan_' + (index + 1));
        if (next) next.focus();
    }
}

// ============================================
// GPS
// ============================================
function captureRegGPS() {
    const dot = document.getElementById('regGpsDot');
    const text = document.getElementById('regGpsText');
    const coords = document.getElementById('regGpsCoords');

    if (!navigator.geolocation) {
        if (dot) dot.className = 'gps-icon error';
        if (text) text.textContent = 'GPS not supported';
        return;
    }

    if (dot) dot.className = 'gps-icon loading';
    if (text) text.textContent = 'Capturing GPS...';
    if (coords) coords.textContent = '';

    navigator.geolocation.getCurrentPosition(
        function (pos) {
            var lat = pos.coords.latitude;
            var lng = pos.coords.longitude;
            var acc = pos.coords.accuracy;
            document.getElementById('reg_gps_lat').value = lat.toFixed(6);
            document.getElementById('reg_gps_lng').value = lng.toFixed(6);
            document.getElementById('reg_gps_acc').value = Math.round(acc);
            if (dot) dot.className = 'gps-icon success';
            if (text) text.textContent = 'GPS captured!';
            if (coords) coords.textContent = lat.toFixed(5) + ', ' + lng.toFixed(5) + ' (±' + Math.round(acc) + 'm)';
        },
        function () {
            if (dot) dot.className = 'gps-icon error';
            if (text) text.textContent = 'GPS failed (optional)';
        },
        { enableHighAccuracy: true, timeout: 15000 }
    );
}

// ============================================
// SUBMIT REGISTRATION
// ============================================
function submitRegistration() {
    var name = document.getElementById('reg_hh_name').value.trim();
    var phone = document.getElementById('reg_hh_phone').value.trim();
    var total = parseInt(document.getElementById('reg_total_people').value) || 0;
    var males = parseInt(document.getElementById('reg_males').value) || 0;
    var females = parseInt(document.getElementById('reg_females').value) || 0;
    var under5 = parseInt(document.getElementById('reg_under5').value) || 0;
    var pregnant = parseInt(document.getElementById('reg_pregnant').value) || 0;
    var hhId = document.getElementById('reg_hh_id').value;

    var errors = [];
    if (!name || name.length < 2) errors.push('Household head name is required (min 2 characters)');
    if (/[0-9]/.test(name)) errors.push('Name cannot contain numbers');
    if (!phone || phone.length !== 9) errors.push('Valid 9-digit phone number required');
    if (total < 1) errors.push('Total number of people must be at least 1');
    if (males + females !== total) errors.push('Males + Females must equal total people');
    if (under5 > total) errors.push('Children under 5 cannot exceed total');
    if (pregnant > females) errors.push('Pregnant women cannot exceed females');

    // Check voucher scans
    var scannerInputs = document.querySelectorAll('.scanner-input');
    var vouchers = [];
    scannerInputs.forEach(function (input, idx) {
        var val = input.value.trim();
        if (!val) errors.push('Voucher ' + (idx + 1) + ' barcode is required');
        else vouchers.push(val);
    });

    // Check duplicates
    var unique = new Set(vouchers);
    if (unique.size !== vouchers.length) {
        errors.push('Duplicate voucher codes detected');
    }

    // Check if any voucher already in system
    for (var v = 0; v < vouchers.length; v++) {
        for (var r = 0; r < state.registrations.length; r++) {
            if (state.registrations[r].vouchers && state.registrations[r].vouchers.includes(vouchers[v])) {
                errors.push('Voucher "' + vouchers[v] + '" is already registered');
                break;
            }
        }
    }

    if (errors.length > 0) {
        showNotification(errors[0], 'error');
        return;
    }

    // Build record
    var record = {
        id: hhId,
        timestamp: new Date().toISOString(),
        distributionPoint: state.currentDP ? state.currentDP.name : '',
        dpId: state.currentDP ? state.currentDP.id : '',
        district: state.geoInfo.district,
        chiefdom: state.geoInfo.chiefdom,
        community: state.geoInfo.community,
        registeredBy: state.currentUser ? state.currentUser.name : '',
        userId: state.currentUser ? state.currentUser.id : '',
        hhName: name,
        hhPhone: phone,
        totalPeople: total,
        males: males,
        females: females,
        under5: under5,
        pregnant: pregnant,
        vouchers: vouchers,
        voucherCount: vouchers.length,
        gpsLat: document.getElementById('reg_gps_lat').value,
        gpsLng: document.getElementById('reg_gps_lng').value,
        gpsAcc: document.getElementById('reg_gps_acc').value,
        status: 'registered',
        distributed: false,
        synced: false
    };

    state.registrations.push(record);
    saveToStorage();

    showNotification('Household "' + name + '" registered with ' + vouchers.length + ' voucher(s)!', 'success');

    // Try sending to Google Sheets
    sendToSheet('registration', record);

    resetRegistrationForm();
    updateAllCounts();
}

function resetRegistrationForm() {
    document.getElementById('reg_hh_name').value = '';
    document.getElementById('reg_hh_phone').value = '';
    document.getElementById('reg_total_people').value = '';
    document.getElementById('reg_males').value = '';
    document.getElementById('reg_females').value = '';
    document.getElementById('reg_under5').value = '';
    document.getElementById('reg_pregnant').value = '';
    document.getElementById('voucherSummary').style.display = 'none';
    document.getElementById('scannerBlock').style.display = 'none';
    document.getElementById('genderCheck').style.display = 'none';

    // Clear errors
    document.querySelectorAll('.field-error').forEach(function (el) {
        el.textContent = '';
        el.classList.remove('show');
    });

    generateHHId();
    captureRegGPS();
}

// ============================================
// DISTRIBUTION — VOUCHER VERIFICATION
// ============================================
function verifyVoucher() {
    var voucherCode = document.getElementById('dist_voucher_scan').value.trim();
    var resultBlock = document.getElementById('verifyResultBlock');
    var resultDiv = document.getElementById('verifyResult');

    if (!voucherCode) {
        showNotification('Please scan or enter a voucher code', 'error');
        return;
    }

    resultBlock.style.display = 'block';

    // CHECK 1: Was this voucher registered?
    var registration = null;
    for (var i = 0; i < state.registrations.length; i++) {
        if (state.registrations[i].vouchers && state.registrations[i].vouchers.includes(voucherCode)) {
            registration = state.registrations[i];
            break;
        }
    }

    var issues = [];
    var tips = [];

    if (!registration) {
        issues.push('This voucher was NOT found in the registration database');
        tips.push('Check if the voucher code was scanned correctly');
        tips.push('The household may need to register first at the registration desk');
        tips.push('Verify the voucher belongs to this distribution campaign');
    }

    if (registration) {
        // CHECK 2: Already distributed/redeemed?
        var existingDist = null;
        for (var j = 0; j < state.distributions.length; j++) {
            if (state.distributions[j].voucherCode === voucherCode) {
                existingDist = state.distributions[j];
                break;
            }
        }
        if (existingDist) {
            issues.push('This voucher was ALREADY REDEEMED on ' + new Date(existingDist.timestamp).toLocaleString());
            tips.push('This is a duplicate redemption attempt');
            tips.push('Previously distributed to: ' + existingDist.hhName);
            tips.push('Direct the person to the supervisor desk for resolution');
        }

        // CHECK 3: Distribution point match?
        if (state.currentDP && registration.dpId !== state.currentDP.id) {
            issues.push('This voucher was registered at "' + registration.distributionPoint + '", NOT at this distribution point');
            tips.push('Direct the person to their registered distribution point: ' + registration.distributionPoint);
            tips.push('If this is an error, contact the registration desk to re-assign');
        }
    }

    if (issues.length === 0 && registration) {
        // ALL PASS — Show green result with confirm button
        resultDiv.innerHTML =
            '<div class="verify-pass">' +
            '    <div class="verify-title"><span style="font-size:24px;">✓</span> VOUCHER VERIFIED — PASS</div>' +
            '    <div class="verify-detail">' +
            '        <strong>Household Head:</strong> ' + registration.hhName + '<br>' +
            '        <strong>Phone:</strong> ' + registration.hhPhone + '<br>' +
            '        <strong>Household Size:</strong> ' + registration.totalPeople + ' people (' + registration.males + 'M / ' + registration.females + 'F)<br>' +
            '        <strong>Children Under 5:</strong> ' + registration.under5 + '<br>' +
            '        <strong>Pregnant Women:</strong> ' + registration.pregnant + '<br>' +
            '        <strong>Voucher:</strong> ' + voucherCode + '<br>' +
            '        <strong>Distribution Point:</strong> ' + registration.distributionPoint + '<br>' +
            '        <strong>Registered:</strong> ' + new Date(registration.timestamp).toLocaleString() +
            '    </div>' +
            '    <div class="verify-action">' +
            '        <div class="navigation-buttons">' +
            '            <button type="button" class="btn-nav btn-submit full-width" onclick="confirmDistribution(\'' + voucherCode + '\')">' +
            '                <svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>' +
            '                GIVE ITN & CONFIRM DISTRIBUTION' +
            '            </button>' +
            '        </div>' +
            '    </div>' +
            '</div>';
    } else {
        // FAIL — Show red result with issues and tips
        var issueHTML = issues.map(function (i) { return '<div class="verify-issue"><span>⚠</span><span>' + i + '</span></div>'; }).join('');
        var tipHTML = tips.map(function (t) { return '<div class="verify-tip">' + t + '</div>'; }).join('');

        resultDiv.innerHTML =
            '<div class="verify-fail">' +
            '    <div class="verify-title"><span style="font-size:24px;">✗</span> VOUCHER VERIFICATION FAILED</div>' +
            '    <div class="verify-issues">' + issueHTML + '</div>' +
            '    <div class="verify-tips">' +
            '        <div class="verify-tips-title"><span>💡</span> RECOMMENDED ACTIONS</div>' +
            '        ' + tipHTML +
            '    </div>' +
            '</div>';
    }

    // Clear scanner for next
    document.getElementById('dist_voucher_scan').value = '';
    document.getElementById('dist_voucher_scan').focus();
}

function confirmDistribution(voucherCode) {
    // Find registration
    var registration = null;
    for (var i = 0; i < state.registrations.length; i++) {
        if (state.registrations[i].vouchers && state.registrations[i].vouchers.includes(voucherCode)) {
            registration = state.registrations[i];
            break;
        }
    }
    if (!registration) return;

    var distRecord = {
        id: 'DIST-' + Date.now().toString(36).toUpperCase(),
        timestamp: new Date().toISOString(),
        voucherCode: voucherCode,
        registrationId: registration.id,
        hhName: registration.hhName,
        hhPhone: registration.hhPhone,
        totalPeople: registration.totalPeople,
        males: registration.males,
        females: registration.females,
        under5: registration.under5,
        pregnant: registration.pregnant,
        distributionPoint: state.currentDP ? state.currentDP.name : '',
        dpId: state.currentDP ? state.currentDP.id : '',
        distributedBy: state.currentUser ? state.currentUser.name : '',
        userId: state.currentUser ? state.currentUser.id : '',
        district: state.geoInfo.district,
        chiefdom: state.geoInfo.chiefdom,
        community: state.geoInfo.community,
        status: 'distributed',
        synced: false
    };

    state.distributions.push(distRecord);
    registration.distributed = true;
    saveToStorage();

    // Hide result
    document.getElementById('verifyResultBlock').style.display = 'none';

    showNotification('ITN distributed to ' + registration.hhName + ' — Voucher ' + voucherCode, 'success');

    // Try sending to Google Sheets
    sendToSheet('distribution', distRecord);

    updateAllCounts();
    updateDistHistory();
    updateStockSummary();
    updateSyncStats();
}

function updateDistHistory() {
    var container = document.getElementById('distHistory');
    if (!container) return;

    var recent = state.distributions.slice().reverse().slice(0, 30);

    if (recent.length === 0) {
        container.innerHTML = '<div class="no-data">No distributions yet today</div>';
        return;
    }

    container.innerHTML = recent.map(function (d) {
        return '<div class="dist-item">' +
            '<div>' +
            '    <div class="dist-hh-name">' + d.hhName + '</div>' +
            '    <div class="dist-voucher-code">' + d.voucherCode + '</div>' +
            '</div>' +
            '<div style="text-align:right;">' +
            '    <div class="dist-badge pass">DISTRIBUTED</div>' +
            '    <div class="dist-time">' + new Date(d.timestamp).toLocaleTimeString() + '</div>' +
            '</div>' +
            '</div>';
    }).join('');
}

// ============================================
// ITN STOCK RECEIVED
// ============================================
function submitITNReceived() {
    var date = document.getElementById('itn_recv_date').value;
    var batch = document.getElementById('itn_batch').value.trim();
    var type = document.getElementById('itn_recv_type').value;
    var qty = parseInt(document.getElementById('itn_recv_qty').value) || 0;
    var from = document.getElementById('itn_recv_from').value.trim();
    var notes = document.getElementById('itn_recv_notes').value.trim();

    if (!date || !type || qty < 1) {
        showNotification('Please fill in date, ITN type, and quantity', 'error');
        return;
    }

    var record = {
        id: 'STK-' + Date.now().toString(36).toUpperCase(),
        timestamp: new Date().toISOString(),
        date: date,
        batch: batch,
        type: type,
        quantity: qty,
        from: from,
        notes: notes,
        distributionPoint: state.currentDP ? state.currentDP.name : '',
        dpId: state.currentDP ? state.currentDP.id : '',
        recordedBy: state.currentUser ? state.currentUser.name : '',
        synced: false
    };

    state.itnStock.push(record);
    saveToStorage();

    showNotification(qty + ' ' + type + ' ITNs recorded as received!', 'success');

    sendToSheet('stock', record);

    // Reset
    document.getElementById('itn_batch').value = '';
    document.getElementById('itn_recv_qty').value = '';
    document.getElementById('itn_recv_from').value = '';
    document.getElementById('itn_recv_notes').value = '';

    updateStockSummary();
    updateSyncStats();
}

function updateStockSummary() {
    var totalReceived = 0;
    state.itnStock.forEach(function (s) { totalReceived += s.quantity; });
    var totalDistributed = state.distributions.length;
    var remaining = totalReceived - totalDistributed;

    var elR = document.getElementById('stockReceived');
    var elD = document.getElementById('stockDistributed');
    var elRem = document.getElementById('stockRemaining');
    if (elR) elR.textContent = totalReceived.toLocaleString();
    if (elD) elD.textContent = totalDistributed.toLocaleString();
    if (elRem) elRem.textContent = remaining.toLocaleString();

    // Stock history
    var container = document.getElementById('stockHistory');
    if (!container) return;

    if (state.itnStock.length === 0) {
        container.innerHTML = '<div class="no-data">No stock records yet</div>';
        return;
    }

    container.innerHTML = state.itnStock.slice().reverse().map(function (s) {
        return '<div class="stock-item">' +
            '<div><strong>' + s.quantity + ' ' + s.type + '</strong> <span style="color:#999;margin-left:8px;">' + (s.batch || 'No batch') + '</span></div>' +
            '<div style="color:#999;">' + s.date + '</div>' +
            '</div>';
    }).join('');
}

// ============================================
// DHIS2 SYNC
// ============================================
function updateSyncStats() {
    var pendingReg = state.registrations.filter(function (r) { return !r.synced; }).length;
    var pendingDist = state.distributions.filter(function (d) { return !d.synced; }).length;
    var pendingStock = state.itnStock.filter(function (s) { return !s.synced; }).length;
    var totalSynced = state.registrations.filter(function (r) { return r.synced; }).length +
        state.distributions.filter(function (d) { return d.synced; }).length +
        state.itnStock.filter(function (s) { return s.synced; }).length;

    var el1 = document.getElementById('syncPendingReg');
    var el2 = document.getElementById('syncPendingDist');
    var el3 = document.getElementById('syncPendingStock');
    var el4 = document.getElementById('syncTotal');
    if (el1) el1.textContent = pendingReg;
    if (el2) el2.textContent = pendingDist;
    if (el3) el3.textContent = pendingStock;
    if (el4) el4.textContent = totalSynced;
}

async function syncToDHIS2() {
    if (!state.isOnline) {
        showNotification('Cannot sync while offline', 'error');
        return;
    }

    showNotification('Syncing data...', 'info');
    addSyncLog('Starting sync process...');

    var totalSynced = 0;

    // Sync registrations
    var pendingRegs = state.registrations.filter(function (r) { return !r.synced; });
    for (var i = 0; i < pendingRegs.length; i++) {
        try {
            await sendToSheetAsync('registration', pendingRegs[i]);
            pendingRegs[i].synced = true;
            totalSynced++;
            addSyncLog('Registration ' + pendingRegs[i].id + ' synced ✓');
        } catch (e) {
            addSyncLog('Registration ' + pendingRegs[i].id + ' failed: ' + e.message);
        }
    }

    // Sync distributions
    var pendingDists = state.distributions.filter(function (d) { return !d.synced; });
    for (var j = 0; j < pendingDists.length; j++) {
        try {
            await sendToSheetAsync('distribution', pendingDists[j]);
            pendingDists[j].synced = true;
            totalSynced++;
            addSyncLog('Distribution ' + pendingDists[j].id + ' synced ✓');
        } catch (e) {
            addSyncLog('Distribution ' + pendingDists[j].id + ' failed: ' + e.message);
        }
    }

    // Sync stock
    var pendingStock = state.itnStock.filter(function (s) { return !s.synced; });
    for (var k = 0; k < pendingStock.length; k++) {
        try {
            await sendToSheetAsync('stock', pendingStock[k]);
            pendingStock[k].synced = true;
            totalSynced++;
            addSyncLog('Stock ' + pendingStock[k].id + ' synced ✓');
        } catch (e) {
            addSyncLog('Stock ' + pendingStock[k].id + ' failed: ' + e.message);
        }
    }

    saveToStorage();
    updateSyncStats();
    addSyncLog('Sync complete: ' + totalSynced + ' records processed');
    showNotification('Sync complete! ' + totalSynced + ' records processed.', 'success');
}

function addSyncLog(msg) {
    var entry = { time: new Date().toLocaleTimeString(), message: msg };
    state.syncLog.unshift(entry);
    if (state.syncLog.length > 50) state.syncLog = state.syncLog.slice(0, 50);

    var container = document.getElementById('syncLog');
    if (!container) return;

    container.innerHTML = state.syncLog.map(function (l) {
        return '<div class="sync-log-item">' +
            '<span class="sync-log-time">' + l.time + '</span>' +
            '<span class="sync-log-msg">' + l.message + '</span>' +
            '</div>';
    }).join('');
}

// ============================================
// GOOGLE SHEETS INTEGRATION
// ============================================
function sendToSheet(type, data) {
    if (!state.isOnline) return;
    if (CONFIG.SCRIPT_URL === 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec') return;

    try {
        fetch(CONFIG.SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: type, ...data })
        });
    } catch (e) {
        console.warn('Sheet send failed:', e);
    }
}

function sendToSheetAsync(type, data) {
    return new Promise(function (resolve, reject) {
        if (CONFIG.SCRIPT_URL === 'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec') {
            // Simulate success for demo
            setTimeout(resolve, 100);
            return;
        }
        fetch(CONFIG.SCRIPT_URL, {
            method: 'POST',
            mode: 'no-cors',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: type, ...data })
        }).then(resolve).catch(reject);
    });
}

async function syncPending() {
    // Auto-sync when coming back online
    if (state.registrations.some(function (r) { return !r.synced; }) ||
        state.distributions.some(function (d) { return !d.synced; }) ||
        state.itnStock.some(function (s) { return !s.synced; })) {
        showNotification('Syncing pending data...', 'info');
        await syncToDHIS2();
    }
}

// ============================================
// EXPORT CSV
// ============================================
function exportData() {
    var allData = [];

    // Registrations
    state.registrations.forEach(function (r) {
        allData.push({
            type: 'Registration',
            id: r.id,
            timestamp: r.timestamp,
            district: r.district,
            chiefdom: r.chiefdom,
            community: r.community,
            distributionPoint: r.distributionPoint,
            hhName: r.hhName,
            hhPhone: r.hhPhone,
            totalPeople: r.totalPeople,
            males: r.males,
            females: r.females,
            under5: r.under5,
            pregnant: r.pregnant,
            vouchers: (r.vouchers || []).join('; '),
            voucherCount: r.voucherCount,
            gpsLat: r.gpsLat,
            gpsLng: r.gpsLng,
            registeredBy: r.registeredBy,
            distributed: r.distributed ? 'Yes' : 'No',
            synced: r.synced ? 'Yes' : 'No'
        });
    });

    // Distributions
    state.distributions.forEach(function (d) {
        allData.push({
            type: 'Distribution',
            id: d.id,
            timestamp: d.timestamp,
            district: d.district,
            chiefdom: d.chiefdom,
            community: d.community,
            distributionPoint: d.distributionPoint,
            hhName: d.hhName,
            hhPhone: d.hhPhone,
            totalPeople: d.totalPeople,
            voucherCode: d.voucherCode,
            registrationId: d.registrationId,
            distributedBy: d.distributedBy,
            synced: d.synced ? 'Yes' : 'No'
        });
    });

    // Stock
    state.itnStock.forEach(function (s) {
        allData.push({
            type: 'Stock',
            id: s.id,
            timestamp: s.timestamp,
            date: s.date,
            batch: s.batch,
            itnType: s.type,
            quantity: s.quantity,
            receivedFrom: s.from,
            notes: s.notes,
            distributionPoint: s.distributionPoint,
            recordedBy: s.recordedBy,
            synced: s.synced ? 'Yes' : 'No'
        });
    });

    if (allData.length === 0) {
        showNotification('No data to export', 'info');
        return;
    }

    var keys = new Set();
    allData.forEach(function (item) { Object.keys(item).forEach(function (k) { keys.add(k); }); });
    var headers = Array.from(keys);

    var csv = headers.join(',') + '\n';
    allData.forEach(function (item) {
        csv += headers.map(function (h) {
            var val = item[h] || '';
            val = String(val);
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
                val = '"' + val.replace(/"/g, '""') + '"';
            }
            return val;
        }).join(',') + '\n';
    });

    var blob = new Blob([csv], { type: 'text/csv' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'itn_mass_campaign_' + new Date().toISOString().split('T')[0] + '.csv';
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Data exported!', 'success');
}

// ============================================
// UTILITIES
// ============================================
function updateAllCounts() {
    var el1 = document.getElementById('regCount');
    var el2 = document.getElementById('distCount');
    if (el1) el1.textContent = state.registrations.length;
    if (el2) el2.textContent = state.distributions.length;
}

function showNotification(msg, type) {
    var notif = document.getElementById('notification');
    var text = document.getElementById('notificationText');
    if (!notif || !text) return;
    notif.className = 'notification ' + type + ' show';
    text.textContent = msg;
    setTimeout(function () { notif.classList.remove('show'); }, 4000);
}

// ============================================
// INITIALIZE
// ============================================
init();
