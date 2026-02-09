const CONFIG={SCRIPT_URL:'https://script.google.com/macros/s/YOUR_SCRIPT_ID/exec',CSV_FILE:'cascading_data.csv',USERS_FILE:'users.csv'};
let USERS_DB={};
const ROLE_LABELS={dhmt:'DHMT Distribution',phu:'PHU Distribution',field_agent:'Field Agent',supervisor:'Supervisor',admin:'Administrator'};

let cascadingData=[],csvLoaded=false,usersLoaded=false,progressChart=null,hourlyChart=null;
const state={isLoggedIn:false,currentUser:null,currentDP:null,geoInfo:{},registrations:[],distributions:[],itnStock:[],dhmtRecords:[],phuRecords:[],syncLog:[],isOnline:navigator.onLine};

// INIT
function init(){loadFromStorage();loadCascadingCSV();loadUsersCSV();setupEventListeners();
    if(state.isLoggedIn&&state.currentUser)routeUser();
    if('serviceWorker' in navigator)navigator.serviceWorker.register('sw.js').catch(function(){});
}
function loadFromStorage(){try{var s=localStorage.getItem('itn_mass_state');if(s)Object.assign(state,JSON.parse(s));}catch(e){}}
function saveToStorage(){try{localStorage.setItem('itn_mass_state',JSON.stringify(state));}catch(e){}}

// CSV
function loadCascadingCSV(){var el=document.getElementById('csvStatus');
    Papa.parse(CONFIG.CSV_FILE,{download:true,header:true,skipEmptyLines:true,
        complete:function(r){cascadingData=r.data.filter(function(row){return row.district&&row.dp_id;});csvLoaded=true;
            checkBothLoaded();onUserIdInput();},
        error:function(){csvLoaded=false;if(el)el.innerHTML='<div class="csv-error"><span>✗</span> CSV not loaded</div>';}
    });
}
function loadUsersCSV(){
    Papa.parse(CONFIG.USERS_FILE,{download:true,header:true,skipEmptyLines:true,
        complete:function(r){USERS_DB={};r.data.forEach(function(row){
            if(row.user_id&&row.password)USERS_DB[row.user_id.trim().toLowerCase()]={password:row.password.trim(),name:row.name||'',role:row.role||'field_agent',dp_id:row.dp_id||''};
        });usersLoaded=true;checkBothLoaded();onUserIdInput();},
        error:function(){usersLoaded=false;var el=document.getElementById('csvStatus');if(el)el.innerHTML='<div class="csv-error"><span>✗</span> Users CSV not loaded</div>';}
    });
}
function checkBothLoaded(){var el=document.getElementById('csvStatus');if(!el)return;
    if(csvLoaded&&usersLoaded){el.innerHTML='<div class="csv-loaded"><span style="font-size:16px;">✓</span> <span>Loaded <strong>'+cascadingData.length+'</strong> points, <strong>'+Object.keys(USERS_DB).length+'</strong> users</span></div>';populateCredentialsTable();
        // Refresh phuName in state from CSV (fixes stale localStorage)
        if(state.currentDP&&state.currentDP.id){var cphu=cascadingData.find(function(r){return r.dp_id===state.currentDP.id;});
            if(cphu&&cphu.phu){state.geoInfo.phuName=cphu.phu;state.currentDP.phuName=cphu.phu;saveToStorage();}
        }
        // Re-populate dropdowns if already on a screen
        if(state.isLoggedIn&&state.currentUser){
            if(state.currentUser.role==='dhmt')populateDhmtPhuDropdown();
            if(state.currentUser.role==='phu')populatePhuDpDropdown();
        }
    }
    else if(csvLoaded||usersLoaded){el.innerHTML='<div class="csv-loading"><div class="csv-spinner"></div><span>Loading...</span></div>';}
}

// CREDENTIALS TABLE
function populateCredentialsTable(){var tb=document.getElementById('credTableBody');if(!tb)return;tb.innerHTML='';
    for(var uid in USERS_DB){var u=USERS_DB[uid];
        var dist='—',chief='—',phu='—',dp='—';
        if(csvLoaded){var r=cascadingData.find(function(x){return x.dp_id===u.dp_id;});
            if(r){dist=r.district||'—';chief=r.chiefdom||'—';phu=r.phu||'—';dp=r.distribution_point||'—';}}
        var badge='';if(u.role==='dhmt')badge='<span style="background:#6f42c1;color:#fff;padding:2px 6px;border-radius:8px;font-size:9px;">DHMT</span>';
        else if(u.role==='phu')badge='<span style="background:#e91e8c;color:#fff;padding:2px 6px;border-radius:8px;font-size:9px;">PHU</span>';
        else badge='<span style="background:#0056a8;color:#fff;padding:2px 6px;border-radius:8px;font-size:9px;">FIELD</span>';
        tb.innerHTML+='<tr><td class="uid">'+uid+'</td><td class="pwd">'+u.password+'</td><td>'+u.name+'</td><td>'+badge+'</td><td>'+dist+'</td><td>'+chief+'</td><td>'+phu+'</td><td>'+dp+'</td></tr>';
    }
}
function toggleCredentials(){var w=document.getElementById('credTableWrap'),c=document.getElementById('credChevron');if(!w)return;
    if(w.style.display==='none'){w.style.display='block';if(c)c.classList.add('open');populateCredentialsTable();}
    else{w.style.display='none';if(c)c.classList.remove('open');}}

// USER ID → AUTO-FILL
function onUserIdInput(){var uid=document.getElementById('loginUserId').value.trim().toLowerCase(),block=document.getElementById('autoAssignment');
    if(!uid||!USERS_DB[uid]||!csvLoaded||!usersLoaded){if(block)block.style.display='none';return;}
    var u=USERS_DB[uid],dpRow=cascadingData.find(function(r){return r.dp_id===u.dp_id;});
    if(!dpRow){if(block)block.style.display='none';return;}
    document.getElementById('assignRole').value=ROLE_LABELS[u.role]||u.role;
    document.getElementById('assignDP').value=dpRow.distribution_point||'';
    document.getElementById('assignDistrict').value=dpRow.district||'';
    document.getElementById('assignCommunity').value=dpRow.phu||'';
    var title=document.getElementById('assignTitleText'),titleDiv=document.getElementById('assignTitle');
    if(u.role==='dhmt'){title.textContent='DHMT — DISTRICT LEVEL';titleDiv.style.background='#6f42c1';}
    else if(u.role==='phu'){title.textContent='PHU — HEALTH UNIT LEVEL';titleDiv.style.background='#e91e8c';}
    else{title.textContent='YOUR ASSIGNED LOCATION';titleDiv.style.background='#28a745';}
    if(block)block.style.display='block';
}

// EVENTS
function setupEventListeners(){
    window.addEventListener('online',function(){state.isOnline=true;updateOnlineStatus();showNotification('Back online!','success');});
    window.addEventListener('offline',function(){state.isOnline=false;updateOnlineStatus();showNotification('Offline — data saved locally','warning');});
    document.addEventListener('input',function(e){
        if(e.target.classList.contains('phone-field')||e.target.type==='tel')e.target.value=e.target.value.replace(/\D/g,'').slice(0,9);
        if(e.target.classList.contains('name-field'))e.target.value=e.target.value.replace(/[0-9]/g,'');
    });
    document.addEventListener('keydown',function(e){if(e.key==='Enter'&&e.target.id==='dist_voucher_scan'){e.preventDefault();verifyVoucher();}});
}
function updateOnlineStatus(){var i=document.getElementById('statusIndicator'),t=document.getElementById('statusText');if(!i||!t)return;
    if(state.isOnline){i.className='status-indicator online';t.textContent='ONLINE';}else{i.className='status-indicator offline';t.textContent='OFFLINE';}}

// LOGIN → ROUTE BY ROLE
function handleLogin(){
    var uid=document.getElementById('loginUserId').value.trim().toLowerCase(),pw=document.getElementById('loginPassword').value,err=document.getElementById('loginError');err.textContent='';
    if(!uid||!pw){err.textContent='Enter User ID and Password';return;}
    var u=USERS_DB[uid];if(!u||u.password!==pw){err.textContent='Invalid credentials';return;}
    if(!csvLoaded||!usersLoaded){err.textContent='Data not loaded yet — please wait';return;}
    var dp=cascadingData.find(function(r){return r.dp_id===u.dp_id;});
    if(!dp){err.textContent='DP '+u.dp_id+' not found';return;}
    state.isLoggedIn=true;state.currentUser={id:uid,name:u.name,role:u.role};
    state.currentDP={id:dp.dp_id,name:dp.distribution_point,district:dp.district,chiefdom:dp.chiefdom||'',phuName:dp.phu||''};
    state.geoInfo={district:dp.district,chiefdom:dp.chiefdom||'',phuName:dp.phu||'',distributionPoint:dp.distribution_point};
    // Also refresh phuName from cascading data for any stale state
    var cphu=cascadingData.find(function(r){return r.dp_id===dp.dp_id;});
    if(cphu&&cphu.phu){state.geoInfo.phuName=cphu.phu;state.currentDP.phuName=cphu.phu;}
    saveToStorage();routeUser();showNotification('Welcome, '+u.name+'!','success');
}
function routeUser(){
    document.getElementById('loginScreen').style.display='none';
    document.getElementById('appScreen').style.display='none';
    document.getElementById('dhmtScreen').style.display='none';
    document.getElementById('phuScreen').style.display='none';
    var role=state.currentUser.role;
    if(role==='dhmt'){showDHMTScreen();if(csvLoaded)setTimeout(populateDhmtPhuDropdown,100);}
    else if(role==='phu'){showPHUScreen();if(csvLoaded)setTimeout(populatePhuDpDropdown,100);}
    else{showAppScreen();}
}
function handleLogout(){if(!confirm('Log out?'))return;state.isLoggedIn=false;state.currentUser=null;state.currentDP=null;saveToStorage();
    document.getElementById('appScreen').style.display='none';document.getElementById('dhmtScreen').style.display='none';
    document.getElementById('phuScreen').style.display='none';document.getElementById('loginScreen').style.display='block';
    document.getElementById('loginUserId').value='';document.getElementById('loginPassword').value='';
    document.getElementById('loginError').textContent='';document.getElementById('autoAssignment').style.display='none';
}

// ITN TYPE CHECKBOX → QUANTITY TOGGLE
function toggleTypeQty(prefix,type,checked){
    var container=document.getElementById(prefix+'_type_qtys');if(!container)return;
    var existingRow=document.getElementById(prefix+'_qty_'+type);
    if(checked&&!existingRow){
        var row=document.createElement('div');row.className='itn-qty-row';row.id=prefix+'_qty_'+type;
        var cls=type.toLowerCase();
        row.innerHTML='<span class="itn-qty-label '+cls+'">'+type+'</span><input type="number" class="form-input" id="'+prefix+'_qty_val_'+type+'" min="1" placeholder="Quantity for '+type+'..." required oninput="updateTypeTotal(\''+prefix+'\')"><span style="font-size:10px;color:#999;">ITNs</span>';
        container.appendChild(row);
        document.getElementById(prefix+'_qty_val_'+type).focus();
    }else if(!checked&&existingRow){existingRow.remove();}
    // Ensure total row exists
    ensureTotalRow(prefix);
    updateTypeTotal(prefix);
}
function ensureTotalRow(prefix){
    var container=document.getElementById(prefix+'_type_qtys');if(!container)return;
    var existing=document.getElementById(prefix+'_total_row');
    if(!existing){
        var row=document.createElement('div');row.className='itn-total-row';row.id=prefix+'_total_row';
        row.innerHTML='<span class="itn-total-label">TOTAL ITNs</span><span class="itn-total-value" id="'+prefix+'_total_val">0</span>';
        container.appendChild(row);
    }
}
function updateTypeTotal(prefix){
    var container=document.getElementById(prefix+'_type_qtys');if(!container)return;
    var inputs=container.querySelectorAll('.itn-qty-row input[type="number"]');
    var total=0;inputs.forEach(function(inp){total+=parseInt(inp.value)||0;});
    var el=document.getElementById(prefix+'_total_val');if(el)el.textContent=total.toLocaleString();
    var totalRow=document.getElementById(prefix+'_total_row');
    if(totalRow){totalRow.style.display=inputs.length>0?'flex':'none';}
}
function getTypeQuantities(prefix){
    var results=[];var container=document.getElementById(prefix+'_type_qtys');if(!container)return results;
    var rows=container.querySelectorAll('.itn-qty-row');
    rows.forEach(function(row){
        var type=row.querySelector('.itn-qty-label').textContent.trim();
        var input=row.querySelector('input[type="number"]');
        var qty=parseInt(input?input.value:0)||0;
        if(type&&qty>0)results.push({type:type,quantity:qty});
    });
    return results;
}
function clearTypeCheckboxes(prefix){
    var container=document.getElementById(prefix+'_type_qtys');if(container)container.innerHTML='';
    var parent=container?container.closest('form')||container.closest('.form-content'):null;
    if(parent){var checks=parent.querySelectorAll('.itn-check');checks.forEach(function(cb){cb.checked=false;});}
}
function formatTypeQtySummary(items){return items.map(function(i){return i.quantity+' '+i.type;}).join(' + ');}

// ============ DHMT SCREEN ============
function showDHMTScreen(){
    document.getElementById('dhmtScreen').style.display='block';
    var ut=document.getElementById('dhmtUserTag');if(ut)ut.textContent=state.currentUser.name.split(' ')[0].toUpperCase();
    var on=document.getElementById('dhmtDistrict');if(on)on.textContent=state.geoInfo.district||'—';
    var df=document.getElementById('dhmt_date');if(df&&!df.value)df.value=new Date().toISOString().split('T')[0];
    populateDhmtPhuDropdown();
    renderDHMTHistory();
}
function populateDhmtPhuDropdown(){
    var sel=document.getElementById('dhmt_to_phu');if(!sel||!cascadingData.length)return;
    sel.innerHTML='<option value="">Select PHU...</option>';
    var district=(state.geoInfo.district||'').trim();if(!district)return;
    var phus=[];cascadingData.forEach(function(r){
        if((r.district||'').trim()===district&&r.phu&&phus.indexOf(r.phu)===-1)phus.push(r.phu);
    });
    phus.sort();phus.forEach(function(p){var o=document.createElement('option');o.value=p;o.textContent=p;sel.appendChild(o);});
}
function populatePhuDpDropdown(){
    var sel=document.getElementById('phu_to_dp');if(!sel||!cascadingData.length)return;
    sel.innerHTML='<option value="">Select Distribution Point...</option>';
    var chiefdom=(state.geoInfo.chiefdom||'').trim();if(!chiefdom)return;
    cascadingData.forEach(function(r){
        if((r.chiefdom||'').trim()===chiefdom&&r.distribution_point){var o=document.createElement('option');o.value=r.distribution_point;o.textContent=r.distribution_point;sel.appendChild(o);}
    });
}
function submitDHMT(){
    var date=document.getElementById('dhmt_date').value,batch=document.getElementById('dhmt_batch').value.trim();
    var typeQtys=getTypeQuantities('dhmt');
    var to=document.getElementById('dhmt_to_phu').value;
    var notes=document.getElementById('dhmt_notes').value.trim();
    if(!date||typeQtys.length===0||!to){showNotification('Fill date, select type(s) with qty, and PHU','error');return;}
    var totalQty=0;typeQtys.forEach(function(tq){totalQty+=tq.quantity;});
    var rec={id:'DHMT-'+Date.now().toString(36).toUpperCase(),timestamp:new Date().toISOString(),date:date,batch:batch,
        types:typeQtys,totalQuantity:totalQty,typeSummary:formatTypeQtySummary(typeQtys),
        toPhu:to,notes:notes,district:state.geoInfo.district,recordedBy:state.currentUser.name,userId:state.currentUser.id,synced:false};
    state.dhmtRecords.push(rec);saveToStorage();showNotification(totalQty+' ITNs → '+to,'success');
    sendToSheet('dhmt_distribution',rec);renderDHMTHistory();
    document.getElementById('dhmt_batch').value='';document.getElementById('dhmt_notes').value='';
    clearTypeCheckboxes('dhmt');document.getElementById('dhmt_to_phu').value='';
}
function renderDHMTHistory(){var c=document.getElementById('dhmtHistory');if(!c)return;
    if(!state.dhmtRecords.length){c.innerHTML='<div class="no-data">No records</div>';return;}
    c.innerHTML=state.dhmtRecords.slice().reverse().map(function(r){var info=r.typeSummary||(r.quantity+' '+r.type);return '<div class="dist-item"><div><div class="dist-hh-name">→ '+r.toPhu+'</div><div class="dist-voucher-code">'+info+' | '+r.date+'</div></div><div><div class="dist-badge pass">SENT</div></div></div>';}).join('');}

// ============ PHU SCREEN ============
function showPHUScreen(){
    document.getElementById('phuScreen').style.display='block';
    var ut=document.getElementById('phuUserTag');if(ut)ut.textContent=state.currentUser.name.split(' ')[0].toUpperCase();
    document.getElementById('phuDistrict').textContent=state.geoInfo.district||'—';
    document.getElementById('phuChiefdom').textContent=state.geoInfo.chiefdom||'—';
    var pn=document.getElementById('phuName');if(pn)pn.textContent=state.geoInfo.phuName||'—';
    document.getElementById('phu_from').value=state.geoInfo.phuName||state.geoInfo.chiefdom||'';
    populatePhuDpDropdown();
    var df=document.getElementById('phu_date');if(df&&!df.value)df.value=new Date().toISOString().split('T')[0];
    renderPHUHistory();
}
function submitPHU(){
    var date=document.getElementById('phu_date').value,batch=document.getElementById('phu_batch').value.trim();
    var typeQtys=getTypeQuantities('phu');
    var to=document.getElementById('phu_to_dp').value,from=document.getElementById('phu_from').value;
    var notes=document.getElementById('phu_notes').value.trim();
    if(!date||typeQtys.length===0||!to){showNotification('Fill date, select type(s) with qty, and DP','error');return;}
    var totalQty=0;typeQtys.forEach(function(tq){totalQty+=tq.quantity;});
    var rec={id:'PHU-'+Date.now().toString(36).toUpperCase(),timestamp:new Date().toISOString(),date:date,batch:batch,
        types:typeQtys,totalQuantity:totalQty,typeSummary:formatTypeQtySummary(typeQtys),
        toDp:to,from:from,notes:notes,district:state.geoInfo.district,chiefdom:state.geoInfo.chiefdom,
        recordedBy:state.currentUser.name,userId:state.currentUser.id,synced:false};
    state.phuRecords.push(rec);saveToStorage();showNotification(totalQty+' ITNs → '+to,'success');
    sendToSheet('phu_distribution',rec);renderPHUHistory();
    document.getElementById('phu_batch').value='';document.getElementById('phu_notes').value='';
    clearTypeCheckboxes('phu');document.getElementById('phu_to_dp').value='';
}
function renderPHUHistory(){var c=document.getElementById('phuHistory');if(!c)return;
    if(!state.phuRecords.length){c.innerHTML='<div class="no-data">No records</div>';return;}
    c.innerHTML=state.phuRecords.slice().reverse().map(function(r){var info=r.typeSummary||(r.quantity+' '+r.type);return '<div class="dist-item"><div><div class="dist-hh-name">→ '+r.toDp+'</div><div class="dist-voucher-code">'+info+' | '+r.date+'</div></div><div><div class="dist-badge pass">SENT</div></div></div>';}).join('');}

// ============ FIELD AGENT SCREEN ============
function showAppScreen(){
    document.getElementById('appScreen').style.display='block';
    var ut=document.getElementById('userTag');if(ut)ut.textContent=state.currentUser.name.split(' ')[0].toUpperCase();
    document.getElementById('geoDistrict').textContent=state.geoInfo.district||'—';
    document.getElementById('geoChiefdom').textContent=state.geoInfo.chiefdom||'—';
    document.getElementById('geoCommunity').textContent=state.geoInfo.phuName||'—';
    document.getElementById('geoDP').textContent=state.geoInfo.distributionPoint||'—';
    // Prefill "Received From" with PHU name
    var rf=document.getElementById('itn_recv_from');if(rf)rf.value=state.geoInfo.phuName||state.geoInfo.chiefdom||'';
    updateOnlineStatus();updateAllCounts();updateStockSummary();updateDistHistory();updateSyncStats();generateHHId();captureRegGPS();checkStockForDistribution();
    var df=document.getElementById('itn_recv_date');if(df&&!df.value)df.value=new Date().toISOString().split('T')[0];
}

// TABS
function switchTab(id){
    document.querySelectorAll('.tab-controls .control-btn').forEach(function(b){b.classList.remove('active');});
    document.querySelector('.tab-controls [data-tab="'+id+'"]').classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(function(p){p.classList.remove('active');});
    document.getElementById('tab-'+id).classList.add('active');
    if(id==='distribution'){setTimeout(function(){var s=document.getElementById('dist_voucher_scan');if(s)s.focus();},100);checkStockForDistribution();}
    if(id==='dashboard')refreshDashboard();
}

// STOCK CHECK
function getStockReceived(){var t=0;state.itnStock.forEach(function(s){t+=s.quantity;});return t;}
function getDistributed(){return state.distributions.length;}
function getStockRemaining(){return getStockReceived()-getDistributed();}
function checkStockForDistribution(){
    var warn=document.getElementById('stockWarning'),txt=document.getElementById('stockWarningText');if(!warn)return;
    var received=getStockReceived(),remaining=getStockRemaining();
    if(received===0){warn.style.display='flex';warn.style.background='#f8d7da';warn.style.borderColor='#dc3545';warn.style.color='#721c24';txt.textContent='No stock received! Go to ITN STOCK tab first.';return;}
    if(remaining<=0){warn.style.display='flex';warn.style.background='#f8d7da';warn.style.borderColor='#dc3545';warn.style.color='#721c24';txt.textContent='All stock distributed! Record more in ITN STOCK.';return;}
    if(remaining<=5){warn.style.display='flex';warn.style.background='#fff3cd';warn.style.borderColor='#ffc107';warn.style.color='#856404';txt.textContent='Low stock: '+remaining+' ITN(s) remaining.';return;}
    warn.style.display='none';
}

// VOUCHER
// VOUCHER — removed auto-generation, now scan/type
function generateHHId(){var dp=state.currentDP?state.currentDP.id.replace('dp','').toUpperCase():'XX';
    var el=document.getElementById('reg_hh_id');if(el)el.value='HH-'+dp.padStart(3,'0')+'-'+Date.now().toString(36).toUpperCase().slice(-6)+'-'+Math.random().toString(36).toUpperCase().slice(2,5);}

// REG FORM
function onTotalPeopleChange(){var t=parseInt(document.getElementById('reg_total_people').value)||0;showVoucherInputs(t);checkGenderSum();}
function showVoucherInputs(tp){
    var block=document.getElementById('voucherInputBlock'),info=document.getElementById('voucherInputInfo'),fields=document.getElementById('voucherInputFields');
    if(tp<=0){block.style.display='none';return;}
    var count;if(tp<=2)count=1;else if(tp<=4)count=2;else count=3;
    block.style.display='block';
    info.innerHTML='<div class="voucher-formula-text">'+tp+' people → <strong>'+count+' voucher(s)</strong> = '+count+' ITN(s)</div><div style="font-size:10px;color:#666;text-align:center;margin-top:4px;">1-2 people = 1 ITN | 3-4 = 2 ITNs | 5+ = 3 ITNs</div>';
    fields.innerHTML='';
    for(var i=0;i<count;i++){
        var row=document.createElement('div');row.className='voucher-scan-row';
        row.innerHTML='<span class="voucher-scan-label">VOUCHER '+(i+1)+'</span><input type="text" class="form-input voucher-scan-input" id="reg_voucher_'+(i+1)+'" placeholder="Scan QR or type code..." autocomplete="off">';
        fields.appendChild(row);
    }
    // Auto-focus first
    var first=document.getElementById('reg_voucher_1');if(first)first.focus();
}
function onGenderChange(){checkGenderSum();}
function onVulnerableChange(){
    var t=parseInt(document.getElementById('reg_total_people').value)||0,f=parseInt(document.getElementById('reg_females').value)||0;
    var u5=parseInt(document.getElementById('reg_under5').value)||0,pr=parseInt(document.getElementById('reg_pregnant').value)||0;
    var eU=document.getElementById('error_reg_under5'),eP=document.getElementById('error_reg_pregnant');
    if(u5>t){if(eU){eU.textContent='Cannot exceed total';eU.classList.add('show');}}else{if(eU){eU.textContent='';eU.classList.remove('show');}}
    if(pr>f){if(eP){eP.textContent='Cannot exceed females';eP.classList.add('show');}}else{if(eP){eP.textContent='';eP.classList.remove('show');}}
}
function checkGenderSum(){var t=parseInt(document.getElementById('reg_total_people').value)||0,m=parseInt(document.getElementById('reg_males').value)||0,f=parseInt(document.getElementById('reg_females').value)||0;
    var el=document.getElementById('genderCheck'),tx=document.getElementById('genderCheckText');if(!el||!tx)return;
    if(t>0&&(m>0||f>0)){el.style.display='flex';
        if(m+f===t){el.className='validation-note gender-check match';tx.textContent='✓ Males ('+m+') + Females ('+f+') = Total ('+t+')';}
        else{el.className='validation-note gender-check mismatch';tx.textContent='⚠ Males ('+m+') + Females ('+f+') = '+(m+f)+' ≠ Total ('+t+')';}
    }else el.style.display='none';}
function captureRegGPS(){var dot=document.getElementById('regGpsDot'),text=document.getElementById('regGpsText'),coords=document.getElementById('regGpsCoords');
    if(!navigator.geolocation){if(dot)dot.className='gps-icon error';if(text)text.textContent='Not supported';return;}
    if(dot)dot.className='gps-icon loading';if(text)text.textContent='Capturing...';if(coords)coords.textContent='';
    navigator.geolocation.getCurrentPosition(function(p){document.getElementById('reg_gps_lat').value=p.coords.latitude.toFixed(6);document.getElementById('reg_gps_lng').value=p.coords.longitude.toFixed(6);document.getElementById('reg_gps_acc').value=Math.round(p.coords.accuracy);
        if(dot)dot.className='gps-icon success';if(text)text.textContent='GPS captured!';if(coords)coords.textContent=p.coords.latitude.toFixed(5)+', '+p.coords.longitude.toFixed(5);
    },function(){if(dot)dot.className='gps-icon error';if(text)text.textContent='Failed (optional)';},{enableHighAccuracy:true,timeout:15000});}

// SUBMIT REGISTRATION
function submitRegistration(){
    var name=document.getElementById('reg_hh_name').value.trim(),phone=document.getElementById('reg_hh_phone').value.trim();
    var total=parseInt(document.getElementById('reg_total_people').value)||0,males=parseInt(document.getElementById('reg_males').value)||0,females=parseInt(document.getElementById('reg_females').value)||0;
    var under5=parseInt(document.getElementById('reg_under5').value)||0,pregnant=parseInt(document.getElementById('reg_pregnant').value)||0;
    var hhId=document.getElementById('reg_hh_id').value,err=[];
    if(!name||name.length<2)err.push('Name required');if(/[0-9]/.test(name))err.push('No numbers');
    if(!phone||phone.length!==9)err.push('9-digit phone');if(total<1)err.push('Total ≥ 1');
    if(males+females!==total)err.push('M+F must = total');if(under5>total)err.push('U5 ≤ total');if(pregnant>females)err.push('Preg ≤ females');
    if(err.length){showNotification(err[0],'error');return;}
    var count;if(total<=2)count=1;else if(total<=4)count=2;else count=3;
    var vouchers=[];var voucherErr=false;
    for(var vi=1;vi<=count;vi++){
        var inp=document.getElementById('reg_voucher_'+vi);
        var code=inp?inp.value.trim().toUpperCase():'';
        if(!code){showNotification('Enter voucher code '+vi,'error');if(inp)inp.focus();return;}
        if(vouchers.includes(code)){showNotification('Duplicate voucher: '+code,'error');if(inp)inp.focus();return;}
        // Check if voucher already used in another registration
        var alreadyUsed=false;
        for(var ri=0;ri<state.registrations.length;ri++){
            if(state.registrations[ri].vouchers&&state.registrations[ri].vouchers.includes(code)){alreadyUsed=true;break;}
        }
        if(alreadyUsed){showNotification('Voucher '+code+' already registered!','error');if(inp){inp.focus();inp.style.borderColor='#dc3545';}return;}
        vouchers.push(code);
    }
    var rec={id:hhId,timestamp:new Date().toISOString(),distributionPoint:state.currentDP?state.currentDP.name:'',dpId:state.currentDP?state.currentDP.id:'',
        district:state.geoInfo.district,chiefdom:state.geoInfo.chiefdom,phuName:state.geoInfo.phuName,
        registeredBy:state.currentUser?state.currentUser.name:'',userId:state.currentUser?state.currentUser.id:'',
        hhName:name,hhPhone:phone,totalPeople:total,males:males,females:females,under5:under5,pregnant:pregnant,
        vouchers:vouchers,voucherCount:vouchers.length,gpsLat:document.getElementById('reg_gps_lat').value,gpsLng:document.getElementById('reg_gps_lng').value,gpsAcc:document.getElementById('reg_gps_acc').value,
        status:'registered',distributed:false,synced:false};
    state.registrations.push(rec);saveToStorage();showNotification('Registered! '+vouchers.length+' voucher(s)','success');
    sendToSheet('registration',rec);updateAllCounts();
    // Reset form for next registration
    ['reg_hh_name','reg_hh_phone','reg_total_people','reg_males','reg_females','reg_under5','reg_pregnant'].forEach(function(id){document.getElementById(id).value='';});
    document.getElementById('voucherInputBlock').style.display='none';document.getElementById('voucherInputFields').innerHTML='';
    document.getElementById('genderCheck').style.display='none';
    document.querySelectorAll('.field-error').forEach(function(el){el.textContent='';el.classList.remove('show');});
    generateHHId();captureRegGPS();window.scrollTo({top:0,behavior:'smooth'});
}

// DISTRIBUTION VERIFY
function verifyVoucher(){var vc=document.getElementById('dist_voucher_scan').value.trim().toUpperCase(),rb=document.getElementById('verifyResultBlock'),rd=document.getElementById('verifyResult');
    if(!vc){showNotification('Enter code','error');return;}rb.style.display='block';
    if(getStockRemaining()<=0){rd.innerHTML='<div class="verify-fail"><div class="verify-title"><span style="font-size:22px;">✗</span> NO STOCK</div><div class="verify-issues"><div class="verify-issue"><span>⚠</span><span>All stock distributed. Record more in ITN STOCK.</span></div></div></div>';document.getElementById('dist_voucher_scan').value='';return;}
    var reg=null;for(var i=0;i<state.registrations.length;i++){if(state.registrations[i].vouchers&&state.registrations[i].vouchers.includes(vc)){reg=state.registrations[i];break;}}
    var issues=[],tips=[];
    if(!reg){issues.push('Voucher NOT found');tips.push('Check code');tips.push('Register first');}
    if(reg){var ed=null;for(var j=0;j<state.distributions.length;j++){if(state.distributions[j].voucherCode===vc){ed=state.distributions[j];break;}}
        if(ed){issues.push('ALREADY REDEEMED '+new Date(ed.timestamp).toLocaleString());tips.push('Contact supervisor');}
        if(state.currentDP&&reg.dpId!==state.currentDP.id){issues.push('Registered at "'+reg.distributionPoint+'"');tips.push('Send to: '+reg.distributionPoint);}
    }
    if(!issues.length&&reg){
        rd.innerHTML='<div class="verify-pass"><div class="verify-title"><span style="font-size:22px;">✓</span> VERIFIED</div><div class="verify-detail"><strong>Name:</strong> '+reg.hhName+'<br><strong>Phone:</strong> '+reg.hhPhone+'<br><strong>Size:</strong> '+reg.totalPeople+' ('+reg.males+'M/'+reg.females+'F)<br><strong>U5:</strong> '+reg.under5+' | <strong>Preg:</strong> '+reg.pregnant+'</div><div class="verify-action"><div class="navigation-buttons"><button type="button" class="btn-nav btn-submit full-width" onclick="confirmDistribution(\''+vc+'\')">GIVE ITN & CONFIRM</button></div></div></div>';
    }else{rd.innerHTML='<div class="verify-fail"><div class="verify-title"><span style="font-size:22px;">✗</span> FAILED</div><div class="verify-issues">'+issues.map(function(i){return '<div class="verify-issue"><span>⚠</span><span>'+i+'</span></div>';}).join('')+'</div><div class="verify-tips"><div class="verify-tips-title">💡 ACTIONS</div>'+tips.map(function(t){return '<div class="verify-tip">'+t+'</div>';}).join('')+'</div></div>';}
    document.getElementById('dist_voucher_scan').value='';document.getElementById('dist_voucher_scan').focus();
}
function confirmDistribution(vc){if(getStockRemaining()<=0){showNotification('No stock!','error');return;}
    var reg=null;for(var i=0;i<state.registrations.length;i++){if(state.registrations[i].vouchers&&state.registrations[i].vouchers.includes(vc)){reg=state.registrations[i];break;}}if(!reg)return;
    var rec={id:'DIST-'+Date.now().toString(36).toUpperCase(),timestamp:new Date().toISOString(),voucherCode:vc,registrationId:reg.id,
        hhName:reg.hhName,hhPhone:reg.hhPhone,totalPeople:reg.totalPeople,males:reg.males,females:reg.females,under5:reg.under5,pregnant:reg.pregnant,
        distributionPoint:state.currentDP?state.currentDP.name:'',dpId:state.currentDP?state.currentDP.id:'',
        distributedBy:state.currentUser?state.currentUser.name:'',userId:state.currentUser?state.currentUser.id:'',
        district:state.geoInfo.district,chiefdom:state.geoInfo.chiefdom,phuName:state.geoInfo.phuName,synced:false};
    state.distributions.push(rec);reg.distributed=true;saveToStorage();document.getElementById('verifyResultBlock').style.display='none';
    showNotification('ITN → '+reg.hhName,'success');sendToSheet('distribution',rec);updateAllCounts();updateDistHistory();updateStockSummary();updateSyncStats();checkStockForDistribution();}
function updateDistHistory(){var c=document.getElementById('distHistory');if(!c)return;var r=state.distributions.slice().reverse().slice(0,30);
    if(!r.length){c.innerHTML='<div class="no-data">No distributions yet</div>';return;}
    c.innerHTML=r.map(function(d){return '<div class="dist-item"><div><div class="dist-hh-name">'+d.hhName+'</div><div class="dist-voucher-code">'+d.voucherCode+'</div></div><div style="text-align:right;"><div class="dist-badge pass">DONE</div><div class="dist-time">'+new Date(d.timestamp).toLocaleTimeString()+'</div></div></div>';}).join('');}

// ITN STOCK
function submitITNReceived(){var date=document.getElementById('itn_recv_date').value,batch=document.getElementById('itn_batch').value.trim();
    var typeQtys=getTypeQuantities('stock');
    var from=document.getElementById('itn_recv_from').value,notes=document.getElementById('itn_recv_notes').value.trim();
    if(!date||typeQtys.length===0){showNotification('Fill date and select type(s) with qty','error');return;}
    var totalQty=0;
    typeQtys.forEach(function(tq){
        var rec={id:'STK-'+Date.now().toString(36).toUpperCase()+'-'+tq.type,timestamp:new Date().toISOString(),date:date,batch:batch,type:tq.type,quantity:tq.quantity,from:from,notes:notes,
            distributionPoint:state.currentDP?state.currentDP.name:'',dpId:state.currentDP?state.currentDP.id:'',recordedBy:state.currentUser?state.currentUser.name:'',synced:false};
        state.itnStock.push(rec);sendToSheet('stock',rec);totalQty+=tq.quantity;
    });
    saveToStorage();showNotification(formatTypeQtySummary(typeQtys)+' recorded!','success');
    document.getElementById('itn_batch').value='';document.getElementById('itn_recv_notes').value='';
    clearTypeCheckboxes('stock');
    updateStockSummary();updateSyncStats();updateAllCounts();}
function updateStockSummary(){var tR=getStockReceived(),tD=getDistributed();
    var e1=document.getElementById('stockReceived');if(e1)e1.textContent=tR;var e2=document.getElementById('stockDistributed');if(e2)e2.textContent=tD;
    var e3=document.getElementById('stockRemaining');if(e3)e3.textContent=tR-tD;
    var c=document.getElementById('stockHistory');if(!c)return;
    if(!state.itnStock.length){c.innerHTML='<div class="no-data">No records</div>';return;}
    c.innerHTML=state.itnStock.slice().reverse().map(function(s){return '<div class="stock-item"><div><strong>'+s.quantity+' '+s.type+'</strong> <span style="color:#999;margin-left:6px;">'+(s.batch||'—')+'</span></div><div style="color:#999;">'+s.date+'</div></div>';}).join('');}

// DASHBOARD CASCADING FILTERS
function populateDashFilters(){
    var dSel=document.getElementById('dashFilterDistrict');if(!dSel)return;
    var curD=dSel.value;dSel.innerHTML='<option value="">All Districts</option>';
    var dists=[];cascadingData.forEach(function(r){if(r.district&&dists.indexOf(r.district)===-1)dists.push(r.district);});
    dists.sort();dists.forEach(function(d){var o=document.createElement('option');o.value=d;o.textContent=d;dSel.appendChild(o);});
    if(curD)dSel.value=curD;
}
function onDashDistrictChange(){
    var dist=document.getElementById('dashFilterDistrict').value;
    var cSel=document.getElementById('dashFilterChiefdom');cSel.innerHTML='<option value="">All Chiefdoms</option>';
    document.getElementById('dashFilterPhu').innerHTML='<option value="">All PHUs</option>';
    document.getElementById('dashFilterDP').innerHTML='<option value="">All DPs</option>';
    if(dist){var chiefs=[];cascadingData.forEach(function(r){if(r.district===dist&&r.chiefdom&&chiefs.indexOf(r.chiefdom)===-1)chiefs.push(r.chiefdom);});
        chiefs.sort();chiefs.forEach(function(c){var o=document.createElement('option');o.value=c;o.textContent=c;cSel.appendChild(o);});}
    refreshDashboard();
}
function onDashChiefdomChange(){
    var dist=document.getElementById('dashFilterDistrict').value,chief=document.getElementById('dashFilterChiefdom').value;
    var pSel=document.getElementById('dashFilterPhu');pSel.innerHTML='<option value="">All PHUs</option>';
    document.getElementById('dashFilterDP').innerHTML='<option value="">All DPs</option>';
    if(chief){var phus=[];cascadingData.forEach(function(r){if(r.district===dist&&r.chiefdom===chief&&r.phu&&phus.indexOf(r.phu)===-1)phus.push(r.phu);});
        phus.sort();phus.forEach(function(p){var o=document.createElement('option');o.value=p;o.textContent=p;pSel.appendChild(o);});}
    refreshDashboard();
}
function onDashPhuChange(){
    var dist=document.getElementById('dashFilterDistrict').value,chief=document.getElementById('dashFilterChiefdom').value,phu=document.getElementById('dashFilterPhu').value;
    var dpSel=document.getElementById('dashFilterDP');dpSel.innerHTML='<option value="">All DPs</option>';
    if(phu){cascadingData.forEach(function(r){if(r.district===dist&&r.chiefdom===chief&&r.phu===phu&&r.distribution_point){
        var o=document.createElement('option');o.value=r.dp_id;o.textContent=r.distribution_point;dpSel.appendChild(o);}});}
    refreshDashboard();
}
function getDashFilter(){
    return{district:document.getElementById('dashFilterDistrict')?document.getElementById('dashFilterDistrict').value:'',
        chiefdom:document.getElementById('dashFilterChiefdom')?document.getElementById('dashFilterChiefdom').value:'',
        phu:document.getElementById('dashFilterPhu')?document.getElementById('dashFilterPhu').value:'',
        dpId:document.getElementById('dashFilterDP')?document.getElementById('dashFilterDP').value:''};
}
function filterByLocation(records,f){
    return records.filter(function(r){
        if(f.district&&r.district!==f.district)return false;
        if(f.chiefdom&&r.chiefdom!==f.chiefdom)return false;
        if(f.phu&&r.phuName!==f.phu)return false;
        if(f.dpId&&r.dpId!==f.dpId)return false;
        return true;
    });
}

// DASHBOARD
function refreshDashboard(){var f=getDashFilter();
    populateDashFilters();
    var regs=filterByLocation(state.registrations,f);
    var dists=filterByLocation(state.distributions,f);
    var stocks=state.itnStock.filter(function(s){
        if(f.district){var dp=cascadingData.find(function(c){return c.dp_id===s.dpId;});if(!dp||dp.district!==f.district)return false;
            if(f.chiefdom&&dp.chiefdom!==f.chiefdom)return false;if(f.phu&&dp.phu!==f.phu)return false;if(f.dpId&&s.dpId!==f.dpId)return false;}
        return true;
    });
    var stockRcv=0;stocks.forEach(function(s){stockRcv+=s.quantity;});
    var el=function(id){return document.getElementById(id);};
    el('dshRegCount').textContent=regs.length;el('dshDistCount').textContent=dists.length;el('dshStockRem').textContent=stockRcv-dists.length;
    var tP=0,tM=0,tF=0,tU=0,tPr=0,tV=0;
    regs.forEach(function(r){tP+=r.totalPeople;tM+=r.males;tF+=r.females;tU+=r.under5;tPr+=r.pregnant;tV+=r.voucherCount;});
    el('dshPeople').textContent=tP;el('dshMales').textContent=tM;el('dshFemales').textContent=tF;el('dshUnder5').textContent=tU;el('dshPregnant').textContent=tPr;
    el('dshVTotal').textContent=tV;el('dshVRedeemed').textContent=dists.length;el('dshVPending').textContent=tV-dists.length;
    el('dshAvgHH').textContent=regs.length>0?(tP/regs.length).toFixed(1):'0';
    var pCtx=document.getElementById('progressChart');
    if(pCtx){if(progressChart)progressChart.destroy();
        progressChart=new Chart(pCtx,{type:'doughnut',data:{labels:['Distributed','Pending','Stock Unused'],datasets:[{data:[dists.length,Math.max(0,tV-dists.length),Math.max(0,stockRcv-dists.length-Math.max(0,tV-dists.length))],backgroundColor:['#28a745','#ffc107','#0056a8'],borderWidth:2}]},options:{responsive:true,plugins:{legend:{position:'bottom',labels:{font:{family:'Oswald',size:11}}}}}});}
    var hCtx=document.getElementById('hourlyChart');
    if(hCtx){var hrs=new Array(24).fill(0),dH=new Array(24).fill(0);regs.forEach(function(r){hrs[new Date(r.timestamp).getHours()]++;});dists.forEach(function(d){dH[new Date(d.timestamp).getHours()]++;});
        var lbl=[];for(var i=6;i<=20;i++)lbl.push(i+':00');
        if(hourlyChart)hourlyChart.destroy();
        hourlyChart=new Chart(hCtx,{type:'bar',data:{labels:lbl,datasets:[{label:'Registrations',data:lbl.map(function(_,idx){return hrs[idx+6];}),backgroundColor:'rgba(0,86,168,.7)',borderRadius:4},{label:'Distributions',data:lbl.map(function(_,idx){return dH[idx+6];}),backgroundColor:'rgba(40,167,69,.7)',borderRadius:4}]},options:{responsive:true,scales:{y:{beginAtZero:true,ticks:{stepSize:1}}},plugins:{legend:{labels:{font:{family:'Oswald',size:11}}}}}});}
    renderDataTable();}
function renderDataTable(){var filter=document.getElementById('dataFilter').value,search=(document.getElementById('dataSearch').value||'').toLowerCase(),wrap=document.getElementById('dataTableWrap');
    var f=getDashFilter();var data=[],headers=[];
    if(filter==='registrations'){headers=['#','Time','District','Chiefdom','PHU','DP','Name','Phone','People','M/F','U5','Preg','Vouchers','Status'];
        var fRegs=filterByLocation(state.registrations,f);
        data=fRegs.map(function(r,i){return {cells:[i+1,new Date(r.timestamp).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),r.district||'',r.chiefdom||'',r.phuName||'',r.distributionPoint||'',r.hhName,r.hhPhone,r.totalPeople,r.males+'/'+r.females,r.under5,r.pregnant,'<span class="mono">'+(r.vouchers||[]).join(', ')+'</span>',r.distributed?'<span style="color:#28a745;">✓</span>':'<span style="color:#fd7e14;">…</span>'],search:(r.hhName+' '+r.hhPhone+' '+(r.vouchers||[]).join(' ')+' '+r.district+' '+r.chiefdom+' '+(r.phuName||'')).toLowerCase()};});}
    else if(filter==='distributions'){headers=['#','Time','District','PHU','DP','Name','Voucher','By'];
        var fDists=filterByLocation(state.distributions,f);
        data=fDists.map(function(d,i){return {cells:[i+1,new Date(d.timestamp).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}),d.district||'',d.phuName||'',d.distributionPoint||'',d.hhName,'<span class="mono">'+d.voucherCode+'</span>',d.distributedBy],search:(d.hhName+' '+d.voucherCode+' '+d.district+' '+(d.phuName||'')).toLowerCase()};});}
    else{headers=['#','Date','Batch','Type','Qty','From','DP'];
        data=state.itnStock.filter(function(s){
            if(f.district){var dp=cascadingData.find(function(c){return c.dp_id===s.dpId;});if(!dp||dp.district!==f.district)return false;
                if(f.chiefdom&&dp.chiefdom!==f.chiefdom)return false;if(f.phu&&dp.phu!==f.phu)return false;if(f.dpId&&s.dpId!==f.dpId)return false;}return true;
        }).map(function(s,i){return {cells:[i+1,s.date,s.batch||'—',s.type,s.quantity,s.from||'—',s.distributionPoint||''],search:(s.batch+' '+s.type+' '+s.from+' '+s.distributionPoint).toLowerCase()};});}
    if(search)data=data.filter(function(d){return d.search.includes(search);});
    if(!data.length){wrap.innerHTML='<div class="no-data">No records</div>';return;}
    wrap.innerHTML='<table class="data-table"><thead><tr>'+headers.map(function(h){return '<th>'+h+'</th>';}).join('')+'</tr></thead><tbody>'+data.map(function(d){return '<tr>'+d.cells.map(function(c){return '<td>'+c+'</td>';}).join('')+'</tr>';}).join('')+'</tbody></table>';}

// SYNC
function updateSyncStats(){var p=state.registrations.filter(function(r){return !r.synced;}).length+state.distributions.filter(function(d){return !d.synced;}).length+state.itnStock.filter(function(s){return !s.synced;}).length+state.dhmtRecords.filter(function(r){return !r.synced;}).length+state.phuRecords.filter(function(r){return !r.synced;}).length;
    var t=state.registrations.filter(function(r){return r.synced;}).length+state.distributions.filter(function(d){return d.synced;}).length+state.itnStock.filter(function(s){return s.synced;}).length;
    var e1=document.getElementById('syncPending');if(e1)e1.textContent=p;var e2=document.getElementById('syncTotal');if(e2)e2.textContent=t;}
async function syncNow(){var gasInput=document.getElementById('gasUrl');if(gasInput&&gasInput.value.trim())CONFIG.SCRIPT_URL=gasInput.value.trim();
    if(!state.isOnline){showNotification('Offline','error');return;}if(CONFIG.SCRIPT_URL.includes('YOUR_SCRIPT_ID')){showNotification('Set GAS URL','error');return;}
    showNotification('Syncing...','info');addSyncLog('Starting...');var total=0;
    var pR=state.registrations.filter(function(r){return !r.synced;});for(var i=0;i<pR.length;i++){try{await postToGAS('registration',pR[i]);pR[i].synced=true;total++;}catch(e){}}
    var pD=state.distributions.filter(function(d){return !d.synced;});for(var j=0;j<pD.length;j++){try{await postToGAS('distribution',pD[j]);pD[j].synced=true;total++;}catch(e){}}
    var pS=state.itnStock.filter(function(s){return !s.synced;});for(var k=0;k<pS.length;k++){try{await postToGAS('stock',pS[k]);pS[k].synced=true;total++;}catch(e){}}
    saveToStorage();updateSyncStats();addSyncLog('Done: '+total);showNotification('Synced '+total+'!','success');}
function addSyncLog(msg){state.syncLog.unshift({time:new Date().toLocaleTimeString(),message:msg});if(state.syncLog.length>50)state.syncLog=state.syncLog.slice(0,50);
    var c=document.getElementById('syncLog');if(!c)return;c.innerHTML=state.syncLog.map(function(l){return '<div class="sync-log-item"><span class="sync-log-time">'+l.time+'</span><span>'+l.message+'</span></div>';}).join('');}
function sendToSheet(type,data){if(!state.isOnline||CONFIG.SCRIPT_URL.includes('YOUR_SCRIPT_ID'))return;try{fetch(CONFIG.SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:type,...data})});}catch(e){}}
function postToGAS(type,data){return fetch(CONFIG.SCRIPT_URL,{method:'POST',mode:'no-cors',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:type,...data})});}

// EXPORT
function exportData(){var all=[];
    state.registrations.forEach(function(r){all.push({type:'Registration',id:r.id,timestamp:r.timestamp,district:r.district,chiefdom:r.chiefdom,phuName:r.phuName,dp:r.distributionPoint,hhName:r.hhName,hhPhone:r.hhPhone,totalPeople:r.totalPeople,males:r.males,females:r.females,under5:r.under5,pregnant:r.pregnant,vouchers:(r.vouchers||[]).join('; '),voucherCount:r.voucherCount,registeredBy:r.registeredBy,distributed:r.distributed?'Yes':'No'});});
    state.distributions.forEach(function(d){all.push({type:'Distribution',id:d.id,timestamp:d.timestamp,district:d.district,dp:d.distributionPoint,hhName:d.hhName,voucherCode:d.voucherCode,distributedBy:d.distributedBy});});
    state.itnStock.forEach(function(s){all.push({type:'Stock',id:s.id,timestamp:s.timestamp,date:s.date,batch:s.batch,itnType:s.type,quantity:s.quantity,from:s.from,dp:s.distributionPoint});});
    state.dhmtRecords.forEach(function(r){all.push({type:'DHMT',id:r.id,timestamp:r.timestamp,date:r.date,batch:r.batch,itnTypes:r.typeSummary||(r.quantity+' '+r.type),totalQuantity:r.totalQuantity||r.quantity,toPhu:r.toPhu,district:r.district,recordedBy:r.recordedBy});});
    state.phuRecords.forEach(function(r){all.push({type:'PHU',id:r.id,timestamp:r.timestamp,date:r.date,batch:r.batch,itnTypes:r.typeSummary||(r.quantity+' '+r.type),totalQuantity:r.totalQuantity||r.quantity,toDp:r.toDp,from:r.from,district:r.district,recordedBy:r.recordedBy});});
    if(!all.length){showNotification('No data','info');return;}
    var keys=new Set();all.forEach(function(item){Object.keys(item).forEach(function(k){keys.add(k);});});var h=Array.from(keys);
    var csv=h.join(',')+'\n';all.forEach(function(item){csv+=h.map(function(k){var v=String(item[k]||'');if(v.includes(',')||v.includes('"'))v='"'+v.replace(/"/g,'""')+'"';return v;}).join(',')+'\n';});
    var a=document.createElement('a');a.href=URL.createObjectURL(new Blob([csv],{type:'text/csv'}));a.download='itn_campaign_'+new Date().toISOString().split('T')[0]+'.csv';a.click();showNotification('Exported!','success');}

function updateAllCounts(){var e1=document.getElementById('regCount');if(e1)e1.textContent=state.registrations.length;
    var e2=document.getElementById('distCount');if(e2)e2.textContent=state.distributions.length;var e3=document.getElementById('stockCount');if(e3)e3.textContent=getStockReceived();}
function showNotification(msg,type){var n=document.getElementById('notification'),t=document.getElementById('notificationText');if(!n||!t)return;n.className='notification '+type+' show';t.textContent=msg;setTimeout(function(){n.classList.remove('show');},4000);}

init();
