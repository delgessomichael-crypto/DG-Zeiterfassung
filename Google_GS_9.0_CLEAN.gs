// DG ZEITERFASSUNG BACKEND 9.0 CLEAN - konsolidierter Produktionsstand mit sicheren Lese-Caches.
// Bestehendes Apps-Script-Projekt samt Script Properties beibehalten. setup NICHT erneut ausfuehren.
const DG_BACKEND_VERSION="9.0";

const CONFIG = {
  OFFICE_EMAIL: 'kontakt@delgesso.info',
  SPREADSHEET_NAME: 'Del Gesso Zeiterfassung',
  TIME_SHEET: 'Zeiten',
  CLOSE_SHEET: 'Tagesabschluesse',
  STATUS_SHEET: 'Tagesstatus',
  EMPLOYEE_SHEET: 'Mitarbeiter',
  ABSENCE_SHEET: 'Abwesenheiten',
  VACATION_SHEET: 'Urlaubskonto',
  ADJUSTMENT_SHEET: 'Stundenkorrekturen',
  ASSIGNMENT_SHEET: 'Mitarbeiterzuordnungen',
  CONFLICT_REVIEW_SHEET: 'Pruefungen',
  MONTH_CLOSURE_SHEET: 'MonatsabschlussHistorie',
  PAYROLL_REVIEW_SHEET: 'LohnPruefungen',
  PAYROLL_CLOSE_SHEET: 'LohnMonatsabschluss',
  TIME_CORRECTION_SHEET: 'ZeitKorrekturen',
  OBJECT_SHEET: 'Objekte',
  TIME_BANK_SHEET: 'Zeitguthaben',
  REGIE_MERGE_SHEET: 'RegieZusammenfuehrungen',
  SIGNATURE_FOLDER: 'Del Gesso Zeiterfassung - Unterschriften',
  PHOTO_FOLDER: 'Del Gesso Zeiterfassung - Auftragsbilder',
  TZ: 'Europe/Berlin',
  EMPLOYEES: [
    'Del Gesso Michael',
    'Del Gesso Laura',
    'Del Gesso Marco',
    'Del Gesso Katia',
    'Del Gesso Aurora',
    'Sharifi Habibullah',
    'Arapoglu David'
  ],
  EMPLOYEE_PINS: {
    'Del Gesso Michael': '2905',
    'Del Gesso Laura': '0901',
    'Del Gesso Marco': '0108',
    'Del Gesso Katia': '2506',
    'Del Gesso Aurora': '1608',
    'Sharifi Habibullah': '0506',
    'Arapoglu David': '0303'
  },
  EMPLOYEE_CALENDARS: {
    'Del Gesso Michael': 'delgessomichael@gmail.com',
    'Del Gesso Laura': 'f564a415f213d58d0218fc85f4201b67f49d80c6fad08192a6b93c7f748827c3@group.calendar.google.com',
    'Del Gesso Marco': '1d01c45d1de737a26378d0c370d36e3cf12b9a4c0b3ad6423c66f499273d05c9@group.calendar.google.com',
    'Del Gesso Katia': '9cc358e3813a082c1d4e6f2983d5c2bbca16217975b5ff86b74e08d296b302c2@group.calendar.google.com',
    'Del Gesso Aurora': 'e319756c277331600af7144876ef6cf32fb05b8821c93db9de9c7bc33b34bd69@group.calendar.google.com',
    'Sharifi Habibullah': 'ef9437263cfbc68fad42319b09182d3fe0ea59cee8002396e4262e5a8f058fa8@group.calendar.google.com',
    'Arapoglu David': '9af31449459e22edd18f6dc788d5f5d9f78c42bb573b7543011ed1da57aa0426@group.calendar.google.com'
  }
};

const PRODUCTIVE_START_DATE = '2026-09-07';

function doGet(){return jsonResponse_({ok:true,version:DG_BACKEND_VERSION,message:'DG Zeiterfassung Backend '+DG_BACKEND_VERSION});}

function setup() {
  // Produktionsbetrieb: setup legt niemals eine zweite Tabelle an.
  const ss = getSpreadsheetRaw_();

  ensureSheets_(ss);
  ensureSignatureFolder_();
  ensureMonthlyTrigger_();


  return {
    ok: true,
    spreadsheetUrl: ss.getUrl(),
    message: 'Einrichtung abgeschlossen.'
  };
}

function getEmployees() {
  return getEmployeeRecords_(false).map(function(item) { return item.name; });
}

function normalizePin_(value) {
  let pin = clean_(value);
  // Google Sheets liefert als Zahl gespeicherte PINs ohne fuehrende Null.
  // Bestehende vierstellige PINs werden deshalb wieder auf 4 Stellen aufgefuellt.
  if (/^\d{1,3}$/.test(pin)) pin = pin.padStart(4, '0');
  return pin;
}

function dg511SessionHash_(token){
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,clean_(token),Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'');
}
function dg511SessionKey_(token){return 'DG511_SESSION_'+dg511SessionHash_(token);}
function dg511CreateDeviceSession_(employee){
  employee=clean_(employee);
  const rec=getEmployeeRecord_(employee);
  if(!rec||!rec.active)throw new Error('Mitarbeiter ist nicht aktiv.');
  const token='DGSESSION.'+Utilities.getUuid()+'.'+Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperty(dg511SessionKey_(token),JSON.stringify({employee:employee,createdAt:new Date().toISOString()}));
  return token;
}
function dg511VerifyDeviceSession_(employee,token){
  employee=clean_(employee);token=clean_(token);
  if(!/^DGSESSION\.[A-Za-z0-9-]+\.[A-Za-z0-9-]+$/.test(token))return false;
  let item=null;
  try{item=JSON.parse(PropertiesService.getScriptProperties().getProperty(dg511SessionKey_(token))||'null');}catch(e){}
  if(!item||clean_(item.employee)!==employee)throw new Error('Sitzung ungültig oder abgemeldet. Bitte erneut anmelden.');
  const rec=getEmployeeRecord_(employee);
  if(!rec||!rec.active)throw new Error('Mitarbeiter inaktiv. Anmeldung erforderlich.');
  return true;
}
function dg511RevokeDeviceSession_(employee,token){
  employee=clean_(employee);token=clean_(token);
  if(!token)return {ok:true};
  const key=dg511SessionKey_(token),props=PropertiesService.getScriptProperties();
  let item=null;try{item=JSON.parse(props.getProperty(key)||'null');}catch(e){}
  if(!item||clean_(item.employee)===employee)props.deleteProperty(key);
  return {ok:true};
}
function verifyEmployeePin(employee,pin){
  employee=clean_(employee);pin=clean_(pin);
  if(/^DGSESSION\./.test(pin))return dg511VerifyDeviceSession_(employee,pin);
  pin=normalizePin_(pin);
  const cache=CacheService.getScriptCache(),key='dg3-login-'+Utilities.base64EncodeWebSafe(employee).slice(0,150);let a={count:0,until:0};
  try{a=JSON.parse(cache.get(key)||'{"count":0,"until":0}');}catch(e){}
  if(a.until>Date.now())throw new Error('Zu viele Fehlversuche. Bitte in 15 Minuten erneut anmelden.');
  const r=getEmployeeRecord_(employee);
  if(!r||!r.active||normalizePin_(r.pin)!==pin){a.count++;if(a.count>=8)a.until=Date.now()+900000;cache.put(key,JSON.stringify(a),900);throw new Error('Mitarbeiter oder PIN ungueltig bzw. Mitarbeiter inaktiv.');}
  cache.remove(key);return true;
}

function ensureSheets_(ss) {
  let sheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.TIME_SHEET);
  }

  const headers = [
    'ID',
    'Mitarbeiter',
    'Datum',
    'Kunde/Baustelle',
    'Von',
    'Bis',
    'Stunden',
    'Ausgeführte Tätigkeit',
    'Kalender-ID',
    'Erfasst am',
    'Tag abgeschlossen',
    'Material verbaut',
    'Material',
    'Kundenunterschrift Datei-ID',
    'Kundenunterschrift URL',
    'Bilder Anzahl',
    'Bilder Datei-IDs',
    'Bilder URLs',
    'Weitere Mitarbeiter anwesend',
    'Weitere Mitarbeiter',
    'Weitere Mitarbeiter Stunden',
    'Quell-Kalendertermin-ID',
    'Regiebericht Status',
    'Abgerechnet am',
    'Abgerechnet von',
    'Objekt-ID',
    'Auftragsstatus',
    'Nachtrag',
    'Nachtrag erfasst am',
    'Angebots-ID',
    'Angebotsstatus geändert am',
    'Angebotsstatus geändert von',
    'Ist Wartung',
    'Nächste Wartung fällig',
    'Wartung Kunden-ID',
    'Wartung Objekt-ID',
    'Wartung Geräte-ID'
  ];
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  }

  let closeSheet = ss.getSheetByName(CONFIG.CLOSE_SHEET);
  if (!closeSheet) {
    closeSheet = ss.insertSheet(CONFIG.CLOSE_SHEET);
  }

  const closeHeaders = [
    'Mitarbeiter',
    'Datum',
    'Abgeschlossen am',
    'Stunden gesamt',
    'Unterschrift Datei-ID',
    'Unterschrift URL',
    'Pause Minuten',
    'Netto Stunden',
    'Zuletzt aktualisiert am',
    'Aktualisierungsgrund'
  ];

  if (closeSheet.getLastRow() === 0) {
    closeSheet.getRange(1, 1, 1, closeHeaders.length).setValues([closeHeaders]);
    closeSheet.setFrozenRows(1);
  } else {
    // v58: auch bestehende Tabellen bekommen neue Abschluss-Spalten/Überschriften.
    closeSheet.getRange(1, 1, 1, closeHeaders.length).setValues([closeHeaders]);
  }

  let statusSheet = ss.getSheetByName(CONFIG.STATUS_SHEET);
  if (!statusSheet) {
    statusSheet = ss.insertSheet(CONFIG.STATUS_SHEET);
  }

  const statusHeaders = [
    'Mitarbeiter',
    'Datum',
    'Status',
    'Erfasst am',
    'Quelle',
    'Referenz-ID',
    'Gutschrift Stunden'
  ];

  if (statusSheet.getLastRow() === 0) {
    statusSheet.getRange(1, 1, 1, statusHeaders.length).setValues([statusHeaders]);
    statusSheet.setFrozenRows(1);
  } else {
    statusSheet.getRange(1, 1, 1, statusHeaders.length).setValues([statusHeaders]);
  }

  ensureEmployeeSheet_(ss);
  ensureAbsenceSheet_(ss);
  ensureVacationSheet_(ss);
  ensureAdjustmentSheet_(ss);
  ensureAssignmentSheet_(ss);
  ensureConflictReviewSheet_(ss);
  ensureMonthClosureSheet_(ss);
  ensurePayrollReviewSheet_(ss);
  ensurePayrollCloseSheet_(ss);
  ensureTimeCorrectionSheet_(ss);
  ensureObjectSheet_(ss);
  ensureTimeBankSheet_(ss);
  ensureRegieMergeSheet_(ss);
}

function updateExistingSheet() {
  const ss = getSpreadsheet_();
  ensureSheets_(ss); // enthaelt auch die drei neuen 5.2-Tabellen
  clearInitialHourValuesOnce_(ss);
  migrateLegacyAssignments_(ss);
  ensureObjectIds_(ss);
  ensureMonthlyTrigger_();
  SpreadsheetApp.flush();
  return { ok: true, version:DG_BACKEND_VERSION };
}

function ensureV58SchemaOnce_() {
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('V58_SCHEMA_READY')==='1') return;
  const ss=getSpreadsheet_();
  ensureSheets_(ss);
  ensureObjectIds_(ss);
  props.setProperty('V58_SCHEMA_READY','1');
}

const MINIMUM_WAGE_TABLE = [
  { from:'2025-01-01', amount:12.82 },
  { from:'2026-01-01', amount:13.90 },
  { from:'2027-01-01', amount:14.60 }
];

function getMinimumWageForDate_(dateValue) {
  const d = normalizeDate_(dateValue) || Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd');
  let current = null;
  MINIMUM_WAGE_TABLE.forEach(function(row){
    if (row.from <= d && (!current || row.from > current.from)) current = row;
  });
  if (!current) return {date:d, from:'', amount:0};
  return {date:d, from:current.from, amount:Number(current.amount)||0};
}

function minimumWageCheckDate_(entryDate) {
  const today = Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd');
  const start = normalizeDate_(entryDate);
  return start && start > today ? start : today;
}

function ensureV61SchemaOnce_() {
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('V61_SCHEMA_READY')==='1') return;
  const ss=getSpreadsheet_();
  ensureEmployeeSheet_(ss);
  props.setProperty('V61_SCHEMA_READY','1');
}

function ensureV520SchemaOnce_() {
  const props=PropertiesService.getScriptProperties();
  if(props.getProperty('V520_SCHEMA_READY')==='1') return;
  const ss=getSpreadsheet_();
  ensureEmployeeSheet_(ss);
  ensurePayrollReviewSheet_(ss);
  ensurePayrollCloseSheet_(ss);
  ensureTimeCorrectionSheet_(ss);
  props.setProperty('V520_SCHEMA_READY','1');
}

function clearInitialHourValuesOnce_(ss) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('V12_HOURS_CLEARED') === '1') return;
  const sheet = ss.getSheetByName(CONFIG.EMPLOYEE_SHEET);
  if (sheet && sheet.getLastRow() >= 2) {
    // Einmalige Migration: alle bisher automatisch vorbelegten Sollstunden entfernen.
    // Danach werden Sollstunden ausschließlich manuell im Chefbereich gepflegt.
    sheet.getRange(2,5,sheet.getLastRow()-1,6).clearContent();
  }
  props.setProperty('V12_HOURS_CLEARED','1');
}

function ensureEmployeeSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.EMPLOYEE_SHEET);
  if (!sheet) sheet = ss.insertSheet(CONFIG.EMPLOYEE_SHEET);
  const headers = [
    'Name','PIN','Kalender-ID','Beschäftigungsart','Wochenstunden',
    'Montag','Dienstag','Mittwoch','Donnerstag','Freitag',
    'Feiertagsgutschrift','Aktiv','Chefzugang','Geändert am',
    'Nachname','Vorname','Geburtsdatum','Personalnummer','Straße','PLZ','Ort',
    'Telefon','Mobil','E-Mail','Krankenkasse','KV-Versichertennummer',
    'Sozialversicherungsnummer','Steuer-ID','Bank','IBAN','Eintrittsdatum','Austrittsdatum',
    'Auszahlungsart','Notfallkontakt Name','Notfallkontakt Telefon','Führerscheinklasse','Bemerkungen','Stundenlohn brutto',
    'Abrechnungsart','Monatsgehalt brutto','Lohnabrechnung relevant'
  ];
  if (sheet.getMaxColumns() < headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), headers.length - sheet.getMaxColumns());
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    // Neue Stammdaten-Spalten nur rechts ergänzen; vorhandene Mitarbeiterdaten bleiben unverändert.
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
  }
  // Textfelder mit moeglichen fuehrenden Nullen immer als Text behandeln.
  // Das betrifft nicht nur die PIN, sondern z. B. PLZ, Telefon/Mobil,
  // Versicherungs-/Steuerdaten und IBAN. Ohne Textformat kann Google Sheets
  // etwa 0172... als Zahl speichern und die fuehrende 0 entfernen.
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('V61_TEXT_COLUMNS_FORMAT') !== '1') {
    ['B:B','R:R','T:T','V:V','W:W','Z:Z','AA:AA','AB:AB','AD:AD','AI:AI'].forEach(function(a1) {
      sheet.getRange(a1).setNumberFormat('@');
    });
    props.setProperty('V61_TEXT_COLUMNS_FORMAT', '1');
  }
  if (sheet.getLastRow() < 2) {
    CONFIG.EMPLOYEES.forEach(function(name) {
      // Keine Sollstunden vorbelegen. Diese werden ausschließlich im Chefbereich gepflegt.
      sheet.appendRow([
        name,
        CONFIG.EMPLOYEE_PINS[name] || '',
        CONFIG.EMPLOYEE_CALENDARS[name] || '',
        'Vollzeit',
        0,
        0,0,0,0,0,
        'Ja','Ja',
        (name === 'Del Gesso Michael' || name === 'Del Gesso Katia') ? 'Ja' : 'Nein',
        new Date()
      ]);
    });
  }
  return sheet;
}

function ensureVacationSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.VACATION_SHEET);
  if (!sheet) sheet = ss.insertSheet(CONFIG.VACATION_SHEET);
  const headers = ['Mitarbeiter','Jahr','Urlaub zustehend','Geändert am','Geändert von'];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
  }
  return sheet;
}

function ensureAdjustmentSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.ADJUSTMENT_SHEET);
  if (!sheet) sheet = ss.insertSheet(CONFIG.ADJUSTMENT_SHEET);
  const headers = ['ID','Mitarbeiter','Jahr','Monat','Stunden','Grund','Erfasst am','Erfasst von'];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
  }
  return sheet;
}

function ensureAssignmentSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.ASSIGNMENT_SHEET);
  if (!sheet) sheet = ss.insertSheet(CONFIG.ASSIGNMENT_SHEET);
  const headers = [
    'ID','Quell-Auftrag-ID','Mitarbeiter','Stunden','Status','Erstellt am','Erstellt von',
    'Bestätigt am','Abweichung gemeldet am','Hinweis','Ersetzt durch Eintrag-ID'
  ];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
  }
  return sheet;
}

function migrateLegacyAssignments_(ss) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('V22_ASSIGNMENTS_MIGRATED') === '1') return;
  const timeSheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  const assignmentSheet = ensureAssignmentSheet_(ss);
  if (!timeSheet || timeSheet.getLastRow() < 2) {
    props.setProperty('V22_ASSIGNMENTS_MIGRATED','1');
    return;
  }
  const timeValues = timeSheet.getDataRange().getValues();
  const existingValues = assignmentSheet.getDataRange().getValues();
  const existing = {};
  for (let i=1;i<existingValues.length;i++) {
    existing[clean_(existingValues[i][1]) + '|' + clean_(existingValues[i][2])] = true;
  }
  const rows = [];
  for (let i=1;i<timeValues.length;i++) {
    const sourceId = clean_(timeValues[i][0]);
    const sourceEmployee = clean_(timeValues[i][1]);
    if (!sourceId) continue;
    parseAdditionalEmployeeHours_(timeValues[i][20]).forEach(function(item) {
      const target = clean_(item.name);
      const hours = Number(item.hours) || 0;
      const key = sourceId + '|' + target;
      if (!target || target === sourceEmployee || !(hours > 0) || existing[key]) return;
      const rowDate = normalizeDate_(timeValues[i][2]);
      if (hasManualReplacement_(timeValues, target, rowDate, timeValues[i][3], timeValues[i][4], timeValues[i][5])) return;
      rows.push([Utilities.getUuid(),sourceId,target,round2_(hours),'Zugeordnet',new Date(),sourceEmployee,'','','','']);
      existing[key] = true;
    });
  }
  if (rows.length) assignmentSheet.getRange(assignmentSheet.getLastRow()+1,1,rows.length,11).setValues(rows);
  props.setProperty('V22_ASSIGNMENTS_MIGRATED','1');
}

function createAssignmentsForEntry_(ss, sourceEntryId, sourceEmployee, additionalEmployeeHours) {
  const sheet = ensureAssignmentSheet_(ss);
  const rows = [];
  (additionalEmployeeHours || []).forEach(function(item) {
    const target = clean_(item.name);
    const hours = Number(item.hours) || 0;
    if (!target || target === clean_(sourceEmployee) || !(hours > 0)) return;
    rows.push([Utilities.getUuid(),clean_(sourceEntryId),target,round2_(hours),'Zugeordnet',new Date(),clean_(sourceEmployee),'','','','']);
  });
  if (rows.length) sheet.getRange(sheet.getLastRow()+1,1,rows.length,11).setValues(rows);
}

function getAssignmentRecords_(ss) {
  const sheet = ensureAssignmentSheet_(ss);
  const values = sheet.getDataRange().getValues();
  const out = [];
  for (let i=1;i<values.length;i++) {
    const id = clean_(values[i][0]);
    if (!id) continue;
    out.push({
      row:i+1,id:id,sourceEntryId:clean_(values[i][1]),employee:clean_(values[i][2]),
      hours:Number(values[i][3])||0,status:clean_(values[i][4])||'Zugeordnet',
      createdAt:values[i][5],createdBy:clean_(values[i][6]),confirmedAt:values[i][7],
      issueAt:values[i][8],note:clean_(values[i][9]),replacedByEntryId:clean_(values[i][10])
    });
  }
  return out;
}

function assignmentIsActive_(a) {
  return a && a.status !== 'Ersetzt';
}

function getSourceRowsById_(timeValues) {
  const out = {};
  for (let i=1;i<timeValues.length;i++) {
    const id=clean_(timeValues[i][0]);
    if (id) out[id]=timeValues[i];
  }
  return out;
}

function getAssignmentById_(ss, assignmentId) {
  assignmentId=clean_(assignmentId);
  const list=getAssignmentRecords_(ss);
  for (let i=0;i<list.length;i++) if (list[i].id===assignmentId) return list[i];
  return null;
}

function confirmEmployeeAssignment(employee, employeePin, assignmentId) {
  verifyEmployeePin(employee, employeePin);
  const ss=getSpreadsheet_();
  const a=getAssignmentById_(ss,assignmentId);
  if (!a || a.employee!==clean_(employee)) throw new Error('Mitarbeiterzuordnung wurde nicht gefunden.');
  if (a.status==='Ersetzt') throw new Error('Diese Zuordnung wurde bereits durch einen eigenen Eintrag ersetzt.');
  const sh=ensureAssignmentSheet_(ss);
  sh.getRange(a.row,5).setValue('Bestätigt');
  sh.getRange(a.row,8).setValue(new Date());
  sh.getRange(a.row,9,1,2).clearContent();
  return {ok:true,status:'Bestätigt'};
}

function reportEmployeeAssignmentIssue(employee, employeePin, assignmentId, note) {
  verifyEmployeePin(employee, employeePin);
  note=clean_(note);
  if (!note) throw new Error('Bitte kurz beschreiben, was an der Zuordnung nicht stimmt.');
  const ss=getSpreadsheet_();
  const a=getAssignmentById_(ss,assignmentId);
  if (!a || a.employee!==clean_(employee)) throw new Error('Mitarbeiterzuordnung wurde nicht gefunden.');
  if (a.status==='Ersetzt') throw new Error('Diese Zuordnung wurde bereits ersetzt.');
  const sh=ensureAssignmentSheet_(ss);
  sh.getRange(a.row,5).setValue('Abweichung');
  sh.getRange(a.row,9).setValue(new Date());
  sh.getRange(a.row,10).setValue(note);
  return {ok:true,status:'Abweichung'};
}

function markAssignmentReplaced_(ss, assignmentId, employee, newEntryId) {
  const a=getAssignmentById_(ss,assignmentId);
  if (!a || a.employee!==clean_(employee)) throw new Error('Die zu ersetzende Mitarbeiterzuordnung wurde nicht gefunden.');
  if (a.status==='Ersetzt') throw new Error('Diese Mitarbeiterzuordnung wurde bereits ersetzt.');
  const sh=ensureAssignmentSheet_(ss);
  sh.getRange(a.row,5).setValue('Ersetzt');
  sh.getRange(a.row,11).setValue(clean_(newEntryId));
}

function getEmployeeOverlapConflicts_(ss, employee, date, start, end, ignoreAssignmentId) {
  employee=clean_(employee); date=clean_(date); ignoreAssignmentId=clean_(ignoreAssignmentId);
  const timeValues=ss.getSheetByName(CONFIG.TIME_SHEET).getDataRange().getValues();
  const sourceById=getSourceRowsById_(timeValues);
  const conflicts=[];
  for (let i=1;i<timeValues.length;i++) {
    if (clean_(timeValues[i][1])!==employee || normalizeDate_(timeValues[i][2])!==date) continue;
    if (timesOverlap_(timeValues[i][4],timeValues[i][5],start,end)) {
      conflicts.push({type:'Eigener Eintrag',entryId:clean_(timeValues[i][0]),customer:clean_(timeValues[i][3]),start:normalizeTime_(timeValues[i][4]),end:normalizeTime_(timeValues[i][5])});
    }
  }
  getAssignmentRecords_(ss).forEach(function(a) {
    if (!assignmentIsActive_(a) || a.employee!==employee || a.id===ignoreAssignmentId) return;
    const row=sourceById[a.sourceEntryId];
    if (!row || normalizeDate_(row[2])!==date) return;
    if (timesOverlap_(row[4],row[5],start,end)) {
      conflicts.push({type:'Mitarbeit',assignmentId:a.id,customer:clean_(row[3]),start:normalizeTime_(row[4]),end:normalizeTime_(row[5]),assignedBy:a.createdBy,hours:a.hours,status:a.status});
    }
  });
  return conflicts;
}

function ensureTimeBankSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.TIME_BANK_SHEET);
  if (!sheet) sheet = ss.insertSheet(CONFIG.TIME_BANK_SHEET);
  const headers = ['ID','Mitarbeiter','Stunden','Art','Jahr','Monat','Referenz','Grund','Erfasst am','Erfasst von'];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
  }
  return sheet;
}

function getTimeBankTransactions_(ss, employee) {
  const sh=ensureTimeBankSheet_(ss), v=sh.getDataRange().getValues(), out=[];
  employee=clean_(employee);
  for(let i=1;i<v.length;i++) {
    if(clean_(v[i][1])!==employee) continue;
    out.push({
      id:clean_(v[i][0]), employee:employee, hours:round2_(Number(v[i][2])||0), art:clean_(v[i][3]),
      year:Number(v[i][4])||0, month:Number(v[i][5])||0, reference:clean_(v[i][6]), reason:clean_(v[i][7]),
      createdAt:formatDateTimeDE_(v[i][8]),
      createdIso:v[i][8] instanceof Date ? Utilities.formatDate(v[i][8], CONFIG.TZ, 'yyyy-MM-dd') : '',
      createdBy:clean_(v[i][9])
    });
  }
  return out;
}

function getTimeBankBalance_(ss, employee) {
  return round2_(Math.max(0,getTimeBankTransactions_(ss,employee).reduce(function(s,x){return s+Number(x.hours||0);},0)));
}

function getTimeBankMaps_(ss, year, month) {
  const sh=ensureTimeBankSheet_(ss), v=sh.getDataRange().getValues(), balance={}, monthCredit={}, monthSurplusBanked={};
  const requestedYear=Number(year)||0, requestedMonth=Number(month)||0;
  for(let i=1;i<v.length;i++) {
    const employee=clean_(v[i][1]); if(!employee) continue;
    const hours=Number(v[i][2])||0, art=clean_(v[i][3]), y=Number(v[i][4])||0, m=Number(v[i][5])||0;
    const createdIso=v[i][8] instanceof Date ? Utilities.formatDate(v[i][8], CONFIG.TZ, 'yyyy-MM-dd') : '';
    const createdYear=createdIso ? Number(createdIso.slice(0,4)) : 0;
    const createdMonth=createdIso ? Number(createdIso.slice(5,7)) : 0;
    const bookingYear=y || createdYear;
    const bookingMonth=m || createdMonth;
    const startupTestBooking=(requestedYear===2026 && requestedMonth===9 && createdIso && createdIso<PRODUCTIVE_START_DATE);
    balance[employee]=(balance[employee]||0)+hours;

    // Monatsausgleich zieht Stunden vom Zeitkonto ab, erhoeht aber das Monats-Ist.
    if(!startupTestBooking && art==='Monatsausgleich' && y===requestedYear && m===requestedMonth) {
      monthCredit[employee]=(monthCredit[employee]||0)+Math.abs(Math.min(0,hours));
    }

    // Manuelle Gutschriften/Abzuege gehoeren in den Monat ihrer Buchung.
    // Alte Buchungen mit Jahr/Monat = 0 werden anhand "Erfasst am" zugeordnet.
    if(!startupTestBooking && (art==='Stunden Gutschreiben' || art==='Stunden abziehen') && bookingYear===requestedYear && bookingMonth===requestedMonth) {
      monthCredit[employee]=(monthCredit[employee]||0)+hours;
    }

    if(!startupTestBooking && art==='Monatsplus' && y===requestedYear && m===requestedMonth) monthSurplusBanked[employee]=true;
  }
  Object.keys(balance).forEach(function(k){balance[k]=round2_(Math.max(0,balance[k]));});
  Object.keys(monthCredit).forEach(function(k){monthCredit[k]=round2_(monthCredit[k]);});
  return {balance:balance,monthCredit:monthCredit,monthSurplusBanked:monthSurplusBanked};
}

function findTimeBankReference_(ss, reference) {
  reference=clean_(reference); if(!reference) return null;
  const sh=ensureTimeBankSheet_(ss), v=sh.getDataRange().getValues();
  for(let i=1;i<v.length;i++) if(clean_(v[i][6])===reference) return {row:i+1,hours:Number(v[i][2])||0,art:clean_(v[i][3])};
  return null;
}

function appendTimeBankTransaction_(ss, targetEmployee, hours, art, year, month, reference, reason, createdBy) {
  targetEmployee=clean_(targetEmployee); hours=round2_(Number(hours)||0); art=clean_(art); reference=clean_(reference); reason=clean_(reason);
  if(!targetEmployee || !getEmployeeRecord_(targetEmployee)) throw new Error('Mitarbeiter nicht gefunden.');
  if(!isFinite(hours) || hours===0) throw new Error('Zeitguthaben-Buchung darf nicht 0 Stunden sein.');
  if(reference && findTimeBankReference_(ss,reference)) throw new Error('Diese Zeitguthaben-Buchung wurde bereits durchgeführt.');
  const before=getTimeBankBalance_(ss,targetEmployee);
  if(hours<0 && before + hours < -0.001) throw new Error('Nicht genügend Zeitguthaben. Verfügbar: '+formatHours_(before)+' Std.');
  const id=Utilities.getUuid();
  ensureTimeBankSheet_(ss).appendRow([id,targetEmployee,hours,art,Number(year)||0,Number(month)||0,reference,reason,new Date(),clean_(createdBy)]);
  return {ok:true,id:id,hours:hours,balanceBefore:before,balanceAfter:getTimeBankBalance_(ss,targetEmployee)};
}

function getTimeBankAccount(employee, employeePin, targetEmployee) {
  requireChef_(employee,employeePin); const ss=getSpreadsheet_(); targetEmployee=clean_(targetEmployee);
  const tx=getTimeBankTransactions_(ss,targetEmployee).sort(function(a,b){return String(b.createdAt).localeCompare(String(a.createdAt));});
  return {employee:targetEmployee,balance:getTimeBankBalance_(ss,targetEmployee),transactions:tx};
}

function getMyTimeBank(employee, employeePin) {
  verifyEmployeePin(employee,employeePin); const ss=getSpreadsheet_();
  return {employee:clean_(employee),balance:getTimeBankBalance_(ss,employee)};
}

function saveTimeBankManual(employee, employeePin, targetEmployee, hours, art, reason) {
  requireChef_(employee,employeePin); hours=Math.abs(Number(hours)||0); art=clean_(art); reason=clean_(reason);
  if(!(hours>0 && hours<=500)) throw new Error('Bitte gültige Stunden eingeben.');
  if(!reason) throw new Error('Bitte einen Grund angeben.');
  let signed=hours;
  if(art==='Auszahlung' || art==='Stunden abziehen') { signed=-hours; art='Stunden abziehen'; }
  else if(art==='Manuelle Gutschrift' || art==='Stunden Gutschreiben') { art='Stunden Gutschreiben'; }
  else throw new Error('Ungültige Buchungsart.');
  const now=new Date();
  const y=Number(Utilities.formatDate(now,CONFIG.TZ,'yyyy'));
  const m=Number(Utilities.formatDate(now,CONFIG.TZ,'MM'));
  return appendTimeBankTransaction_(getSpreadsheet_(),targetEmployee,signed,art,y,m,'manual:'+Utilities.getUuid(),reason,employee);
}

function getMonthTimeBankCredit_(ss, employee, year, month) {
  year=Number(year); month=Number(month);
  return round2_(getTimeBankTransactions_(ss,employee).reduce(function(sum,x){
    if(year===2026 && month===9 && x.createdIso && x.createdIso<PRODUCTIVE_START_DATE) return sum;
    if(x.art==='Monatsausgleich' && Number(x.year)===year && Number(x.month)===month) {
      return sum + Math.abs(Math.min(0,Number(x.hours||0)));
    }
    if(x.art==='Stunden Gutschreiben' || x.art==='Stunden abziehen') {
      const by=Number(x.year)||Number((x.createdIso||'').slice(0,4));
      const bm=Number(x.month)||Number((x.createdIso||'').slice(5,7));
      if(by===year && bm===month) return sum + Number(x.hours||0);
    }
    return sum;
  },0));
}

function applyTimeBankToMonth(employee, employeePin, targetEmployee, year, month, requestedHours) {
  requireChef_(employee,employeePin); year=Number(year);month=Number(month); targetEmployee=clean_(targetEmployee);
  const ss=getSpreadsheet_(), report=getMonthDataInternal_(targetEmployee,year,month,true), rec=getEmployeeRecord_(targetEmployee);
  const target=getMonthlyTargetHours_(targetEmployee,year,month,rec);
  const already=getMonthTimeBankCredit_(ss,targetEmployee,year,month);
  const base=Math.max(0,Number(report.total||0)-already);
  const deficit=round2_(Math.max(0,target-base-already));
  const balance=getTimeBankBalance_(ss,targetEmployee);
  let amount=Number(requestedHours)||0;
  if(!(amount>0)) amount=Math.min(deficit,balance);
  amount=round2_(Math.min(amount,deficit,balance));
  if(!(amount>0)) throw new Error('Für diesen Monat ist keine weitere Zeitguthaben-Anrechnung möglich.');
  return appendTimeBankTransaction_(ss,targetEmployee,-amount,'Monatsausgleich',year,month,'month-credit:'+year+'-'+month+':'+Utilities.getUuid(),'Anrechnung auf Monats-Soll',employee);
}

function bankMonthSurplus(employee, employeePin, targetEmployee, year, month) {
  requireChef_(employee,employeePin); year=Number(year);month=Number(month);targetEmployee=clean_(targetEmployee);
  const ss=getSpreadsheet_(), ref='month-surplus:'+targetEmployee+':'+year+'-'+month;
  if(findTimeBankReference_(ss,ref)) throw new Error('Das Monatsplus wurde bereits ins Zeitguthaben übernommen.');
  const report=getMonthDataInternal_(targetEmployee,year,month,true), target=getMonthlyTargetHours_(targetEmployee,year,month,getEmployeeRecord_(targetEmployee));
  const surplus=round2_(Math.max(0,Number(report.total||0)-target));
  if(!(surplus>0)) throw new Error('Für diesen Monat besteht kein Plus, das übernommen werden kann.');
  return appendTimeBankTransaction_(ss,targetEmployee,surplus,'Monatsplus',year,month,ref,'Monatsplus ins Zeitguthaben übernommen',employee);
}

function ensureConflictReviewSheet_(ss) {
  let sheet=ss.getSheetByName(CONFIG.CONFLICT_REVIEW_SHEET);
  if(!sheet) sheet=ss.insertSheet(CONFIG.CONFLICT_REVIEW_SHEET);
  const headers=['Konflikt-ID','Mitarbeiter','Jahr','Monat','Datum','Geprüft am','Geprüft von'];
  if(sheet.getLastRow()===0){sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);} else sheet.getRange(1,1,1,headers.length).setValues([headers]);
  return sheet;
}

function ensureMonthClosureSheet_(ss) {
  let sheet=ss.getSheetByName(CONFIG.MONTH_CLOSURE_SHEET);
  if(!sheet) sheet=ss.insertSheet(CONFIG.MONTH_CLOSURE_SHEET);
  const headers=['ID','Mitarbeiter','Jahr','Monat','Aktion','Zeitpunkt','Durch','Grund'];
  if(sheet.getLastRow()===0){sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);} else sheet.getRange(1,1,1,headers.length).setValues([headers]);
  return sheet;
}

function ensureObjectSheet_(ss) {
  let sheet=ss.getSheetByName(CONFIG.OBJECT_SHEET);
  if(!sheet) sheet=ss.insertSheet(CONFIG.OBJECT_SHEET);
  const headers=['Objekt-ID','Objekt-Key','Anzeigename','Angelegt am'];
  if(sheet.getLastRow()===0){sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);} else sheet.getRange(1,1,1,headers.length).setValues([headers]);
  return sheet;
}

function objectKey_(customer) { return normalizedCustomerKey_(customer); }

function getOrCreateObjectId_(ss, customer) {
  const key=objectKey_(customer); if(!key) return '';
  const sh=ensureObjectSheet_(ss), values=sh.getDataRange().getValues();
  for(let i=1;i<values.length;i++) if(clean_(values[i][1])===key) return clean_(values[i][0]);
  const id='OBJ-'+Utilities.getUuid();
  sh.appendRow([id,key,clean_(customer),new Date()]);
  return id;
}

function ensureObjectIds_(ss) {
  const sh=ss.getSheetByName(CONFIG.TIME_SHEET); if(!sh||sh.getLastRow()<2) return;
  const values=sh.getDataRange().getValues();
  for(let i=1;i<values.length;i++) {
    if(clean_(values[i][25])) continue;
    const customer=clean_(values[i][3]); if(!customer) continue;
    sh.getRange(i+1,26).setValue(getOrCreateObjectId_(ss,customer));
  }
}

function conflictId_(employee, a, b) {
  const ids=[clean_(a.id),clean_(b.id)].sort();
  return [clean_(employee),clean_(a.date),ids[0],ids[1]].join('|');
}

function reviewedConflictMap_(ss, year, month) {
  const sh=ensureConflictReviewSheet_(ss), v=sh.getDataRange().getValues(), out={};
  for(let i=1;i<v.length;i++) if(Number(v[i][2])===Number(year)&&Number(v[i][3])===Number(month)) out[clean_(v[i][0])]={reviewedAt:formatDateTimeDE_(v[i][5]),reviewedBy:clean_(v[i][6])};
  return out;
}

function markConflictReviewed(employee, employeePin, conflictId, targetEmployee, year, month, date) {
  requireChef_(employee,employeePin); conflictId=clean_(conflictId); if(!conflictId) throw new Error('Konflikt-ID fehlt.');
  const ss=getSpreadsheet_(), sh=ensureConflictReviewSheet_(ss), v=sh.getDataRange().getValues();
  for(let i=1;i<v.length;i++) if(clean_(v[i][0])===conflictId) return {ok:true,alreadyReviewed:true};
  sh.appendRow([conflictId,clean_(targetEmployee),Number(year),Number(month),clean_(date),new Date(),clean_(employee)]);
  return {ok:true};
}

function getMonthClosureState_(ss, employee, year, month) {
  const sh=ensureMonthClosureSheet_(ss), v=sh.getDataRange().getValues(); let last=null; const history=[];
  for(let i=1;i<v.length;i++) {
    if(clean_(v[i][1])!==clean_(employee)||Number(v[i][2])!==Number(year)||Number(v[i][3])!==Number(month)) continue;
    const item={id:clean_(v[i][0]),action:clean_(v[i][4]),at:formatDateTimeDE_(v[i][5]),by:clean_(v[i][6]),reason:clean_(v[i][7])}; history.push(item); last=item;
  }
  return {status:last&&last.action==='Abgeschlossen'?'Abgeschlossen':'Offen',last:last,history:history};
}

function setMonthClosureStatus(employee, employeePin, targetEmployee, year, month, action, reason) {
  requireChef_(employee,employeePin); action=clean_(action); reason=clean_(reason);
  if(!['Abgeschlossen','Wieder geöffnet'].includes(action)) throw new Error('Ungültige Abschlussaktion.');
  if(action==='Wieder geöffnet'&&!reason) throw new Error('Bitte einen Grund für die Wiederöffnung angeben.');
  const ss=getSpreadsheet_(), sh=ensureMonthClosureSheet_(ss);
  sh.appendRow([Utilities.getUuid(),clean_(targetEmployee),Number(year),Number(month),action,new Date(),clean_(employee),reason]);
  return getMonthClosureState_(ss,targetEmployee,year,month);
}

function getObjectReports(employee, employeePin, objectId, customer) {
  requireChef_(employee,employeePin); const ss=getSpreadsheet_(); ensureObjectIds_(ss);
  objectId=clean_(objectId); const key=objectKey_(customer), sh=ss.getSheetByName(CONFIG.TIME_SHEET), v=sh.getDataRange().getValues(), out=[];
  const mergeMap=getRegieMergeMap_(ss), wantedMerge=objectId?(mergeMap[objectId]||''):'';
  for(let i=1;i<v.length;i++) {
    const row=v[i], rowObj=clean_(row[25]), rowKey=objectKey_(row[3]), rowMerge=mergeMap[rowObj]||'';
    const sameObject=objectId && rowObj===objectId;
    const sameCustomer=key && rowKey===key;
    const sameMerge=wantedMerge && rowMerge===wantedMerge;
    if(!(sameObject || sameCustomer || sameMerge)) continue;
    out.push({id:clean_(row[0]),objectId:rowObj,employee:clean_(row[1]),date:normalizeDate_(row[2]),customer:clean_(row[3]),start:normalizeTime_(row[4]),end:normalizeTime_(row[5]),hours:Number(row[6])||0,activity:clean_(row[7]),transmittedAt:row[9]?formatDateTimeDE_(row[9]):'',materialUsed:clean_(row[11])==='Ja',material:clean_(row[12]),customerSignatureUrl:clean_(row[14]),photoCount:Number(row[15])||0,photoFileIds:clean_(row[16]),photoUrls:clean_(row[17]),additionalEmployeeHours:clean_(row[20]),regieStatus:clean_(row[22])||'Offen',jobStatus:clean_(row[26])||'Abgeschlossen',isSupplement:clean_(row[27])==='Ja',supplementCreatedAt:row[28]?formatDateTimeDE_(row[28]):'',maintenance:clean_(row[32])==='Ja',nextMaintenanceDue:clean_(row[33])});
  }
  out.sort(function(a,b){return (b.date+' '+b.start).localeCompare(a.date+' '+a.start);});
  const employees={}; let total=0; out.forEach(function(r){employees[r.employee]=true;total+=Number(r.hours||0);});
  return {objectId:objectId||(out[0]&&out[0].objectId)||'',displayName:(out[0]&&out[0].customer)||clean_(customer),totalHours:round2_(total),reportCount:out.length,employees:Object.keys(employees).sort(),reports:out};
}

function pdfAscii_(value) {
  return String(value == null ? '' : value)
    .replace(/ä/g,'ae').replace(/ö/g,'oe').replace(/ü/g,'ue')
    .replace(/Ä/g,'Ae').replace(/Ö/g,'Oe').replace(/Ü/g,'Ue').replace(/ß/g,'ss')
    .replace(/[^\x20-\x7E]/g,' ')
    .replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
}

function buildSimplePdf_(lines) {
  // Kleine PDF-Erzeugung ohne DocumentApp/DriveApp. Dadurch sind keine
  // zusaetzlichen Google-Documents-Berechtigungen fuer den Export noetig.
  const pageLines=44, pages=[];
  for (let i=0;i<lines.length;i+=pageLines) pages.push(lines.slice(i,i+pageLines));
  if (!pages.length) pages.push(['Keine Daten']);
  const objects=[];
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  const pageIds=[], contentIds=[];
  let next=4;
  pages.forEach(function(){pageIds.push(next++);contentIds.push(next++);});
  const fontId=next++;
  objects[2]='<< /Type /Pages /Kids ['+pageIds.map(function(id){return id+' 0 R';}).join(' ') +'] /Count '+pages.length+' >>';
  objects[fontId]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  pages.forEach(function(linesOnPage,idx){
    const content=[];
    content.push('BT /F1 9 Tf 36 806 Td');
    linesOnPage.forEach(function(line,i){
      if(i>0) content.push('0 -17 Td');
      content.push('('+pdfAscii_(line)+') Tj');
    });
    content.push('ET');
    const stream=content.join('\n');
    objects[contentIds[idx]]='<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream';
    objects[pageIds[idx]]='<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 '+fontId+' 0 R >> >> /Contents '+contentIds[idx]+' 0 R >>';
  });
  let pdf='%PDF-1.4\n', offsets=[0];
  for(let i=1;i<objects.length;i++){
    if(!objects[i]) continue;
    offsets[i]=pdf.length;
    pdf+=i+' 0 obj\n'+objects[i]+'\nendobj\n';
  }
  const xref=pdf.length;
  pdf+='xref\n0 '+objects.length+'\n0000000000 65535 f \n';
  for(let i=1;i<objects.length;i++) pdf+=String(offsets[i]||0).padStart(10,'0')+' 00000 n \n';
  pdf+='trailer\n<< /Size '+objects.length+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF';
  return Utilities.newBlob(pdf,'application/pdf');
}

function createTaxAdvisorPdf(employee, employeePin, year, month) {
  requireChef_(employee,employeePin); year=Number(year);month=Number(month);
  const audit=getMonthPayrollAudit(employee,employeePin,year,month);
  const lines=[
    'Del Gesso Gebaeudetechnik',
    'Lohnuebergabe / Monatsuebersicht - '+monthNameDE_(month)+' '+year,
    'Erstellt am '+formatDateTimeDE_(new Date())+' - erstellt von '+clean_(employee),
    'Lohnuebergabe faellig am 20.'+String(month).padStart(2,'0')+'.'+year,
    '',
    'Mitarbeiter | Status | Abrechnung | Soll | Ist | Lohn-Std | Satz/Gehalt | Brutto rechnerisch | Urlaub | Krank'
  ];
  audit.payrollRows.forEach(function(r){
    const pay=r.payrollType==='Festgehalt'?(Number(r.monthlySalary||0).toFixed(2).replace('.',',')+' EUR/Monat'):(Number(r.hourlyWage||0).toFixed(2).replace('.',',')+' EUR/Std');
    lines.push([r.employee,r.employmentType,r.payrollType,formatHours_(r.targetHours),formatHours_(r.actualHours),formatHours_(r.payrollHours),pay,Number(r.grossEstimate||0).toFixed(2).replace('.',',')+' EUR',String(r.vacationDays||0),String(r.sickDays||0),formatHours_(r.timeBankBalance||0)].join(' | '));
  });
  lines.push('', 'Pruefung: '+audit.summary.errors+' Fehler | '+audit.summary.warnings+' offene Hinweise | '+audit.summary.reviewedWarnings+' bestaetigte Hinweise', 'Lohnstatus: '+(audit.state.status||'Offen'));
  const name='DG_Lohnuebergabe_'+year+'_'+String(month).padStart(2,'0')+'.pdf';
  const pdf=buildSimplePdf_(lines).setName(name);
  return {fileName:name,base64:Utilities.base64Encode(pdf.getBytes())};
}

function saveMonthlyAdjustment(chefEmployee, chefPin, targetEmployee, year, month, hours, reason, adjustmentId) {
  requireChef_(chefEmployee, chefPin);
  targetEmployee = clean_(targetEmployee);
  year = Number(year);
  month = Number(month);
  hours = Number(hours);
  reason = clean_(reason);

  if (!getEmployeeRecord_(targetEmployee)) throw new Error('Mitarbeiter wurde nicht gefunden.');
  if (!(year > 0 && month >= 1 && month <= 12)) throw new Error('Ungültiger Monat.');
  if (!isFinite(hours) || hours === 0 || Math.abs(hours) > 250) {
    throw new Error('Die Korrektur muss zwischen -250 und +250 Stunden liegen und darf nicht 0 sein.');
  }
  if (!reason) throw new Error('Bitte einen Grund für die Stundenkorrektur eintragen.');

  const ss = getSpreadsheet_();
  const sheet = ensureAdjustmentSheet_(ss);
  const id = clean_(adjustmentId) || Utilities.getUuid();
  sheet.appendRow([id, targetEmployee, year, month, round2_(hours), reason, new Date(), clean_(chefEmployee)]);
  return {ok:true,id:id,hours:round2_(hours)};
}

function deleteMonthlyAdjustment(chefEmployee, chefPin, adjustmentId) {
  requireChef_(chefEmployee, chefPin);
  adjustmentId = clean_(adjustmentId);
  if (!adjustmentId) throw new Error('Korrektur-ID fehlt.');
  const ss = getSpreadsheet_();
  const sheet = ensureAdjustmentSheet_(ss);
  const values = sheet.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    if (clean_(values[i][0]) === adjustmentId) {
      sheet.deleteRow(i + 1);
      return {ok:true};
    }
  }
  throw new Error('Stundenkorrektur wurde nicht gefunden.');
}

function getVacationEntitlement_(ss, employee, year) {
  const sheet = ensureVacationSheet_(ss);
  const values = sheet.getDataRange().getValues();
  for (let i=1;i<values.length;i++) {
    if (clean_(values[i][0]) === clean_(employee) && Number(values[i][1]) === Number(year)) {
      return Math.max(0, Number(values[i][2]) || 0);
    }
  }
  return 0;
}

function countStatusDaysForYear_(ss, employee, year, status) {
  const sheet = ss.getSheetByName(CONFIG.STATUS_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return 0;
  const values = sheet.getDataRange().getValues();
  const seen = {};
  for (let i=1;i<values.length;i++) {
    if (clean_(values[i][0]) !== clean_(employee)) continue;
    const date = normalizeDate_(values[i][1]);
    if (!date || Number(date.slice(0,4)) !== Number(year)) continue;
    if (clean_(values[i][2]) !== status) continue;
    seen[date] = true;
  }
  return Object.keys(seen).length;
}

function getAnnualStatusSummary_(ss, employee, year, skipHolidaySync) {
  if (!skipHolidaySync) ensureHolidayStatusesForYear_(ss, Number(year));
  const entitlement = getVacationEntitlement_(ss, employee, year);
  const vacationUsed = countStatusDaysForYear_(ss, employee, year, 'Urlaub');
  const sickDays = countStatusDaysForYear_(ss, employee, year, 'Krank');
  const holidayDays = countStatusDaysForYear_(ss, employee, year, 'Feiertag');
  return {
    year:Number(year),
    vacationEntitlement:round2_(entitlement),
    vacationUsed:vacationUsed,
    vacationRemaining:round2_(entitlement - vacationUsed),
    sickDays:sickDays,
    holidayDays:holidayDays
  };
}

function saveVacationEntitlement(employee, employeePin, targetEmployee, year, entitlement) {
  requireChef_(employee, employeePin);
  targetEmployee = clean_(targetEmployee);
  year = Number(year);
  entitlement = Math.max(0, Number(entitlement) || 0);
  if (!getEmployeeRecord_(targetEmployee)) throw new Error('Mitarbeiter nicht gefunden.');
  if (!(year >= 2000 && year <= 2100)) throw new Error('Ungültiges Jahr.');
  const ss = getSpreadsheet_();
  const sheet = ensureVacationSheet_(ss);
  const values = sheet.getDataRange().getValues();
  let row = 0;
  for (let i=1;i<values.length;i++) {
    if (clean_(values[i][0]) === targetEmployee && Number(values[i][1]) === year) { row=i+1; break; }
  }
  const data=[targetEmployee,year,entitlement,new Date(),clean_(employee)];
  if (row) sheet.getRange(row,1,1,data.length).setValues([data]); else sheet.appendRow(data);
  return getVacationAccount(employee,employeePin,targetEmployee,year);
}

function getVacationAccount(employee, employeePin, targetEmployee, year) {
  requireChef_(employee, employeePin);
  const ss=getSpreadsheet_();
  return Object.assign({employee:clean_(targetEmployee)},getAnnualStatusSummary_(ss,clean_(targetEmployee),Number(year)));
}

function getVacationAccounts(employee, employeePin, year) {
  requireChef_(employee, employeePin);
  const ss=getSpreadsheet_();
  return getEmployeeRecords_(true).map(function(rec){
    return Object.assign({employee:rec.name,active:rec.active},getAnnualStatusSummary_(ss,rec.name,Number(year)));
  });
}

function getEmployeeRecords_(includeInactive) {
  const ss = getSpreadsheetRaw_();
  const sheet = ensureEmployeeSheet_(ss);
  const values = sheet.getDataRange().getValues();
  const result = [];
  for (let i=1;i<values.length;i++) {
    const name = clean_(values[i][0]);
    if (!name) continue;
    const item = {
      name: name,
      pin: normalizePin_(values[i][1]),
      calendarId: clean_(values[i][2]),
      employmentType: clean_(values[i][3]) || 'Vollzeit',
      weeklyHours: Number(values[i][4]) || 0,
      monday: Number(values[i][5]) || 0,
      tuesday: Number(values[i][6]) || 0,
      wednesday: Number(values[i][7]) || 0,
      thursday: Number(values[i][8]) || 0,
      friday: Number(values[i][9]) || 0,
      holidayCredit: String(values[i][10]).toLowerCase() !== 'nein',
      active: String(values[i][11]).toLowerCase() !== 'nein',
      chefAccess: String(values[i][12]).toLowerCase() === 'ja',
      lastName: clean_(values[i][14]), firstName: clean_(values[i][15]),
      birthDate: normalizeDate_(values[i][16]), personnelNumber: clean_(values[i][17]),
      street: clean_(values[i][18]), postalCode: clean_(values[i][19]), city: clean_(values[i][20]),
      phone: clean_(values[i][21]), mobile: clean_(values[i][22]), email: clean_(values[i][23]),
      healthInsurance: clean_(values[i][24]), healthInsuranceNumber: clean_(values[i][25]),
      socialSecurityNumber: clean_(values[i][26]), taxId: clean_(values[i][27]),
      bank: clean_(values[i][28]), iban: clean_(values[i][29]),
      entryDate: normalizeDate_(values[i][30]), exitDate: normalizeDate_(values[i][31]),
      paymentMethod: clean_(values[i][32]) || 'Überweisung',
      emergencyContactName: clean_(values[i][33]), emergencyContactPhone: clean_(values[i][34]),
      drivingLicence: clean_(values[i][35]), notes: clean_(values[i][36]),
      hourlyWage: Number(values[i][37]) || 0,
      payrollType: clean_(values[i][38]) || 'Stundenlohn',
      monthlySalary: Number(values[i][39]) || 0,
      payrollRelevant: values[i][40] === '' || values[i][40] === null || values[i][40] === undefined ? true : String(values[i][40]).toLowerCase() !== 'nein'
    };
    if (includeInactive || item.active) result.push(item);
  }
  result.sort(function(a,b){ return a.name.localeCompare(b.name,'de'); });
  return result;
}

function getEmployeeRecord_(name) {
  name = clean_(name);
  const list = getEmployeeRecords_(true);
  for (let i=0;i<list.length;i++) if (list[i].name === name) return list[i];
  return null;
}

function getSpreadsheetRaw_() {
  const id = clean_(PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID'));
  if (!id) throw new Error('SPREADSHEET_ID fehlt. Die App legt aus Sicherheitsgründen keine neue Produktiv-Tabelle an.');
  return SpreadsheetApp.openById(id);
}

function requireChef_(employee, employeePin) {
  verifyEmployeePin(employee, employeePin);
  if (!canAccessChef_(employee)) throw new Error('Kein Zugriff auf Büro / Chef.');
}

function getEmployeeAdminData(employee, employeePin) {
  requireChef_(employee, employeePin);
  const ss=getSpreadsheet_(), bank=getTimeBankMaps_(ss,0,0).balance;
  return getEmployeeRecords_(true).map(function(x){
    return {
      name:x.name, calendarId:x.calendarId, employmentType:x.employmentType,
      weeklyHours:x.weeklyHours, monday:x.monday, tuesday:x.tuesday,
      wednesday:x.wednesday, thursday:x.thursday, friday:x.friday,
      holidayCredit:x.holidayCredit, active:x.active, chefAccess:x.chefAccess,
      lastName:x.lastName, firstName:x.firstName, birthDate:x.birthDate, personnelNumber:x.personnelNumber,
      street:x.street, postalCode:x.postalCode, city:x.city, phone:x.phone, mobile:x.mobile, email:x.email,
      healthInsurance:x.healthInsurance, healthInsuranceNumber:x.healthInsuranceNumber,
      socialSecurityNumber:x.socialSecurityNumber, taxId:x.taxId, bank:x.bank, iban:x.iban,
      entryDate:x.entryDate, exitDate:x.exitDate, paymentMethod:x.paymentMethod,
      emergencyContactName:x.emergencyContactName, emergencyContactPhone:x.emergencyContactPhone,
      drivingLicence:x.drivingLicence, notes:x.notes, hourlyWage:x.hourlyWage,
      payrollType:x.payrollType, monthlySalary:x.monthlySalary, payrollRelevant:x.payrollRelevant,
      minimumWage:getMinimumWageForDate_(minimumWageCheckDate_(x.entryDate)),
      timeBankBalance:round2_(bank[x.name]||0)
    };
  });
}

function saveEmployeeAdmin(employee, employeePin, item) {
  requireChef_(employee, employeePin);
  item = item || {};
  const name = clean_(item.name);
  const originalName = clean_(item.originalName);
  const pin = normalizePin_(item.pin);
  if (!name) throw new Error('Name fehlt.');
  if (pin && !/^\d{4,10}$/.test(pin)) throw new Error('PIN muss aus 4 bis 10 Ziffern bestehen.');
  const type = clean_(item.employmentType) || 'Vollzeit';
  if (!['Vollzeit','Teilzeit','Aushilfe','Minijob','Azubi'].includes(type)) throw new Error('Ungültige Beschäftigungsart.');
  let requestedWeekly = Number(item.weeklyHours);
  if (!isFinite(requestedWeekly)) requestedWeekly = 0;
  if (requestedWeekly < 0 || requestedWeekly > 60) throw new Error('Wochenstunden müssen zwischen 0 und 60 liegen.');
  const weekdays = ['monday','tuesday','wednesday','thursday','friday'].map(function(k){
    const v = Number(item[k]);
    if (!isFinite(v) || v < 0 || v > 24) throw new Error('Tages-Sollstunden müssen zwischen 0 und 24 liegen.');
    return v;
  });
  if (weekdays.every(function(v){return v === 0;}) && requestedWeekly > 0) {
    const d = round2_(requestedWeekly / 5);
    for (let wi=0; wi<weekdays.length; wi++) weekdays[wi] = d;
  }
  const weekly = round2_(weekdays.reduce(function(s,v){return s+v;},0));
  const ss = getSpreadsheet_();
  // v43: Mitarbeiterblatt und alle Stammdaten-Spalten vor jedem Speichern sicherstellen.
  // So gehen neue Felder auch dann nicht verloren, wenn der produktive Bestand noch aus
  // einem älteren Tabellenstand mit nur den ursprünglichen 14 Spalten stammt.
  const sheet = ensureEmployeeSheet_(ss);
  const values = sheet.getDataRange().getValues();
  let row = 0;
  const lookupName = originalName || name;
  for (let i=1;i<values.length;i++) {
    if (clean_(values[i][0]) === lookupName) { row=i+1; break; }
  }
  // Bei bestehenden Mitarbeitern wird die vorhandene PIN direkt aus der
  // Tabellenzeile beibehalten. Eine Sollstunden-Aenderung darf niemals eine
  // erneute PIN-Eingabe erzwingen.
  let finalPin = pin;
  if (row && !finalPin) finalPin = normalizePin_(values[row - 1][1]);
  if (row && !finalPin && CONFIG.EMPLOYEE_PINS[lookupName]) finalPin = normalizePin_(CONFIG.EMPLOYEE_PINS[lookupName]);
  if (row && !finalPin && CONFIG.EMPLOYEE_PINS[name]) finalPin = normalizePin_(CONFIG.EMPLOYEE_PINS[name]);

  if (!row && !/^\d{4,10}$/.test(finalPin)) {
    throw new Error('Für neue Mitarbeiter muss eine gültige PIN vergeben werden.');
  }
  // Bei einem alten/importierten bestehenden Datensatz ohne PIN werden die
  // Stammdaten trotzdem gespeichert. Das PIN-Feld der Tabelle bleibt leer,
  // bis bewusst eine neue PIN gesetzt wird.
  const holidayCredit = (type === 'Aushilfe' || type === 'Minijob') ? false : Boolean(item.holidayCredit !== false);
  const paymentMethod = clean_(item.paymentMethod) || 'Überweisung';
  if (!['Bar','Überweisung'].includes(paymentMethod)) throw new Error('Ungültige Auszahlungsart.');
  const oldPayrollRow = row ? values[row - 1] : [];
  const payrollType = item.payrollType !== undefined ? clean_(item.payrollType) : (clean_(oldPayrollRow[38]) || 'Stundenlohn');
  if (!['Stundenlohn','Festgehalt'].includes(payrollType)) throw new Error('Ungültige Abrechnungsart.');
  const monthlySalary = item.monthlySalary !== undefined ? (Number(String(item.monthlySalary == null ? '' : item.monthlySalary).replace(',','.')) || 0) : (Number(oldPayrollRow[39]) || 0);
  const payrollRelevant = item.payrollRelevant !== undefined ? Boolean(item.payrollRelevant) : (row ? (oldPayrollRow[40] === '' || oldPayrollRow[40] === null || oldPayrollRow[40] === undefined ? true : String(oldPayrollRow[40]).toLowerCase() !== 'nein') : true);
  const hourlyWage = Number(String(item.hourlyWage == null ? '' : item.hourlyWage).replace(',','.')) || 0;
  const wageDate = minimumWageCheckDate_(item.entryDate);
  const minimumWage = getMinimumWageForDate_(wageDate);
  if (type !== 'Azubi' && payrollRelevant && payrollType === 'Stundenlohn') {
    if (!(hourlyWage > 0)) throw new Error('Bitte den Brutto-Stundenlohn eintragen.');
    if (minimumWage.amount > 0 && hourlyWage + 0.0001 < minimumWage.amount) {
      throw new Error('Stundenlohn zu niedrig. Gesetzlicher Mindestlohn ab '+formatDateDE_(minimumWage.from)+': '+formatHours_(minimumWage.amount)+' EUR/Std.');
    }
  } else if (hourlyWage < 0) {
    throw new Error('Stundenlohn darf nicht negativ sein.');
  }
  if (payrollRelevant && payrollType === 'Festgehalt' && !(monthlySalary > 0)) throw new Error('Bitte das Brutto-Monatsgehalt eintragen.');
  if (monthlySalary < 0) throw new Error('Monatsgehalt darf nicht negativ sein.');
  const email = clean_(item.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('E-Mail-Adresse ist ungültig.');
  const iban = clean_(item.iban).replace(/\s+/g,'').toUpperCase();
  if (paymentMethod === 'Überweisung' && iban && !/^[A-Z]{2}[0-9A-Z]{13,32}$/.test(iban)) throw new Error('IBAN ist ungültig.');
  const data = [name,finalPin,clean_(item.calendarId),type,weekly].concat(weekdays).concat([
    holidayCredit ? 'Ja':'Nein', item.active === false ? 'Nein':'Ja', Boolean(item.chefAccess) ? 'Ja':'Nein', new Date(),
    clean_(item.lastName), clean_(item.firstName), clean_(item.birthDate), clean_(item.personnelNumber),
    clean_(item.street), clean_(item.postalCode), clean_(item.city), clean_(item.phone), clean_(item.mobile), email,
    clean_(item.healthInsurance), clean_(item.healthInsuranceNumber), clean_(item.socialSecurityNumber), clean_(item.taxId),
    clean_(item.bank), iban, clean_(item.entryDate), clean_(item.exitDate), paymentMethod,
    clean_(item.emergencyContactName), clean_(item.emergencyContactPhone), clean_(item.drivingLicence), clean_(item.notes), hourlyWage,
    payrollType, monthlySalary, payrollRelevant ? 'Ja' : 'Nein'
  ]);
  if (row) {
    sheet.getRange(row,1,1,data.length).setValues([data]);
  } else {
    sheet.appendRow(data);
    row = sheet.getLastRow();
  }
  SpreadsheetApp.flush();

  // v43: Speicherung unmittelbar aus dem Blatt verifizieren. Damit meldet die App nicht
  // fälschlich „gespeichert“, wenn ein Stammdatenfeld nicht tatsächlich persistiert wurde.
  const saved = sheet.getRange(row,1,1,data.length).getValues()[0];
  const verifyIndexes = [0,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40];
  const verifyNames = {
    0:'Name',14:'Nachname',15:'Vorname',16:'Geburtsdatum',17:'Personalnummer',18:'Strasse',19:'PLZ',20:'Ort',
    21:'Telefon',22:'Mobil',23:'E-Mail',24:'Krankenkasse',25:'KV-Versichertennummer',26:'Sozialversicherungsnummer',
    27:'Steuer-ID',28:'Bank',29:'IBAN',30:'Eintrittsdatum',31:'Austrittsdatum',32:'Auszahlungsart',
    33:'Notfallkontakt Name',34:'Notfallkontakt Telefon',35:'Fuehrerscheinklasse',36:'Bemerkungen',37:'Stundenlohn brutto',
    38:'Abrechnungsart',39:'Monatsgehalt brutto',40:'Lohnabrechnung relevant'
  };
  for (let vi=0; vi<verifyIndexes.length; vi++) {
    const ci = verifyIndexes[vi];
    const expected = (ci===16 || ci===30 || ci===31) ? normalizeDate_(data[ci]) : clean_(data[ci]);
    const actual = (ci===16 || ci===30 || ci===31) ? normalizeDate_(saved[ci]) : clean_(saved[ci]);
    if (expected !== actual) throw new Error('Stammdaten konnten nicht vollständig gespeichert werden ('+(verifyNames[ci]||('Spalte '+(ci+1)))+').');
  }
  return {ok:true, employees:getEmployeeAdminData(employee,employeePin)};
}

function setEmployeeActive(employee, employeePin, targetName, active) {
  requireChef_(employee, employeePin);
  targetName = clean_(targetName);
  if (targetName === clean_(employee) && !active) throw new Error('Der aktuell angemeldete Chef kann sich nicht selbst deaktivieren.');
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.EMPLOYEE_SHEET);
  const values = sheet.getDataRange().getValues();
  for (let i=1;i<values.length;i++) {
    if (clean_(values[i][0]) === targetName) {
      sheet.getRange(i+1,12).setValue(active ? 'Ja':'Nein');
      sheet.getRange(i+1,14).setValue(new Date());
      return {ok:true};
    }
  }
  throw new Error('Mitarbeiter nicht gefunden.');
}

function deleteEmployeeAdmin(employee, employeePin, targetName, confirmationPin) {
  requireChef_(employee, employeePin);
  targetName = clean_(targetName);
  confirmationPin = clean_(confirmationPin);
  if (!targetName) throw new Error('Mitarbeiter fehlt.');
  if (targetName === clean_(employee)) throw new Error('Der aktuell angemeldete Chef kann sich nicht selbst löschen.');
  // Sicherheitsbestätigung: PIN des aktuell angemeldeten Chef-Nutzers erneut prüfen.
  verifyEmployeePin(employee, confirmationPin);
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.EMPLOYEE_SHEET);
  const values = sheet.getDataRange().getValues();
  for (let i=1;i<values.length;i++) {
    if (clean_(values[i][0]) === targetName) {
      sheet.deleteRow(i+1);
      // Historische Zeiten, Tagesabschlüsse, Abwesenheiten und Urlaubskonten bleiben bewusst erhalten.
      return {ok:true, deleted:targetName, employees:getEmployeeAdminData(employee,employeePin)};
    }
  }
  throw new Error('Mitarbeiter nicht gefunden.');
}

function weekdayHoursForDate_(employee, date) {
  const rec = getEmployeeRecord_(employee);
  if (!rec) return 0;
  const p = String(date).split('-').map(Number);
  const d = new Date(p[0],p[1]-1,p[2]);
  const day = d.getDay();
  return round2_(({1:rec.monday,2:rec.tuesday,3:rec.wednesday,4:rec.thursday,5:rec.friday}[day]) || 0);
}

function easterSunday_(year) {
  const a=year%19,b=Math.floor(year/100),c=year%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3);
  const h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451);
  const month=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1;
  return new Date(year,month-1,day);
}

function addDays_(date, days){ const d=new Date(date.getFullYear(),date.getMonth(),date.getDate()); d.setDate(d.getDate()+days); return d; }

function isoDate_(d){ return Utilities.formatDate(d,CONFIG.TZ,'yyyy-MM-dd'); }

function bavariaNurembergHolidays_(year) {
  const easter=easterSunday_(year);
  const items=[
    [year,0,1,'Neujahr'],[year,0,6,'Heilige Drei Könige'],
    [addDays_(easter,-2),'Karfreitag'],[addDays_(easter,1),'Ostermontag'],
    [year,4,1,'Tag der Arbeit'],[addDays_(easter,39),'Christi Himmelfahrt'],
    [addDays_(easter,50),'Pfingstmontag'],[addDays_(easter,60),'Fronleichnam'],
    [year,9,3,'Tag der Deutschen Einheit'],[year,10,1,'Allerheiligen'],
    [year,11,25,'1. Weihnachtstag'],[year,11,26,'2. Weihnachtstag']
  ];
  return items.map(function(x){
    let d,name;
    if (x[0] instanceof Date) { d=x[0]; name=x[1]; } else { d=new Date(x[0],x[1],x[2]); name=x[3]; }
    return {date:isoDate_(d), name:name};
  });
}

function upsertStatus_(ss, employee, date, status, source, refId, creditedHours, overwriteAutomatic) {
  const sheet=ss.getSheetByName(CONFIG.STATUS_SHEET);
  const values=sheet.getDataRange().getValues();
  let row=0;
  for(let i=1;i<values.length;i++){
    if(clean_(values[i][0])===employee && normalizeDate_(values[i][1])===date){ row=i+1; break; }
  }
  if(row){
    const oldSource=clean_(sheet.getRange(row,5).getValue());
    if (!overwriteAutomatic && oldSource !== 'Automatisch Feiertag') return false;
    sheet.getRange(row,3,1,5).setValues([[status,new Date(),source,refId,creditedHours]]);
  } else {
    sheet.appendRow([employee,date,status,new Date(),source,refId,creditedHours]);
  }
  return true;
}

function ensureHolidayStatusesForYear_(ss, year) {
  // Feiertage nur einmal pro Aufruf aus den bereits geladenen Tabellenwerten
  // abgleichen. Die fruehere Version hat fuer jeden Feiertag/Mitarbeiter die
  // komplette Tabelle erneut gelesen und konnte dadurch in der Chef-
  // Monatsuebersicht sehr lange laufen.
  year = Number(year);
  const holidays = bavariaNurembergHolidays_(year);
  const employees = getEmployeeRecords_(false);
  const sheet = ss.getSheetByName(CONFIG.STATUS_SHEET);
  if (!sheet) return;

  const values = sheet.getDataRange().getValues();
  const existing = {};
  for (let i = 1; i < values.length; i++) {
    const employee = clean_(values[i][0]);
    const date = normalizeDate_(values[i][1]);
    if (employee && date) existing[employee + '|' + date] = { row: i + 1, source: clean_(values[i][4]) };
  }

  const inserts = [];
  const dayField = {1:'monday',2:'tuesday',3:'wednesday',4:'thursday',5:'friday'};
  holidays.forEach(function(h) {
    const p = h.date.split('-').map(Number);
    const dow = new Date(p[0], p[1] - 1, p[2]).getDay();
    if (dow === 0 || dow === 6) return;

    employees.forEach(function(emp) {
      const key = emp.name + '|' + h.date;
      const old = existing[key];
      // Manuelle Statuswerte (Urlaub/Krank etc.) niemals ueberschreiben.
      if (old && old.source !== 'Automatisch Feiertag') return;

      const credit = (emp.employmentType === 'Aushilfe' || !emp.holidayCredit)
        ? 0
        : round2_(Number(emp[dayField[dow]] || 0));
      const rowData = [emp.name, h.date, 'Feiertag', new Date(), 'Automatisch Feiertag', 'holiday:' + h.date, credit];

      if (old) {
        // Nur aktualisieren, wenn sich Status/Gutschrift wirklich geaendert hat.
        const r = values[old.row - 1] || [];
        if (clean_(r[2]) !== 'Feiertag' || Number(r[6] || 0) !== Number(credit)) {
          sheet.getRange(old.row, 3, 1, 5).setValues([rowData.slice(2)]);
        }
      } else {
        inserts.push(rowData);
        existing[key] = { row: -1, source: 'Automatisch Feiertag' };
      }
    });
  });

  if (inserts.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, inserts.length, 7).setValues(inserts);
  }
}

function hasWorkEntryOnDate_(ss, employee, date) {
  const values=ss.getSheetByName(CONFIG.TIME_SHEET).getDataRange().getValues();
  for(let i=1;i<values.length;i++) if(clean_(values[i][1])===employee && normalizeDate_(values[i][2])===date) return true;
  return false;
}

function saveAbsence(employee, employeePin, targetEmployee, type, startDate, endDate) {
  requireChef_(employee, employeePin);
  targetEmployee=clean_(targetEmployee); type=clean_(type); startDate=clean_(startDate); endDate=clean_(endDate);
  if (!getEmployeeRecord_(targetEmployee)) throw new Error('Mitarbeiter nicht gefunden.');
  if (!['Urlaub','Krank','Freizeitausgleich','Schulung'].includes(type)) throw new Error('Als Abwesenheit sind Urlaub, Krank, Freizeitausgleich oder Schulung möglich.');
  if (!validDate3_(startDate)||!validDate3_(endDate)||endDate<startDate) throw new Error('Ungültiger Zeitraum.');
  const ss=getSpreadsheet_();
  const startYear=Number(startDate.slice(0,4)), endYear=Number(endDate.slice(0,4));
  for(let y=startYear;y<=endYear;y++) ensureHolidayStatusesForYear_(ss,y);
  const s=startDate.split('-').map(Number), e=endDate.split('-').map(Number);
  const cur=new Date(s[0],s[1]-1,s[2]), last=new Date(e[0],e[1]-1,e[2]);
  const dates=[], conflicts=[];
  while(cur<=last){
    const dow=cur.getDay(), iso=isoDate_(cur);
    if(dow>=1&&dow<=5){
      const existingStatus=getStatusInfo_(ss,targetEmployee,iso);
      if(existingStatus.status==='Feiertag'){
        // Gesetzliche Feiertage bleiben Feiertage.
      } else if(existingStatus.status && existingStatus.status!=='Arbeiten') {
        conflicts.push(iso);
      } else if(hasWorkEntryOnDate_(ss,targetEmployee,iso)) conflicts.push(iso); else dates.push(iso);
    }
    cur.setDate(cur.getDate()+1);
  }
  if(conflicts.length) throw new Error('Für folgende Tage bestehen bereits Arbeitszeiten: '+conflicts.map(formatDateDE_).join(', ')+'. Bitte zuerst prüfen/löschen.');
  const credits=dates.map(function(date){return {date:date,hours:weekdayHoursForDate_(targetEmployee,date)};});
  const totalCredit=round2_(credits.reduce(function(s,x){return s+Number(x.hours||0);},0));
  if(type==='Freizeitausgleich') {
    const available=getTimeBankBalance_(ss,targetEmployee);
    if(totalCredit<=0) throw new Error('Für diesen Zeitraum sind keine Sollstunden hinterlegt.');
    if(totalCredit>available+0.001) throw new Error('Nicht genügend Zeitguthaben. Benötigt: '+formatHours_(totalCredit)+' Std., verfügbar: '+formatHours_(available)+' Std.');
  }
  const id=Utilities.getUuid();
  ensureAbsenceSheet_(ss).appendRow([id,targetEmployee,type,startDate,endDate,new Date(),employee,'Ja']);
  credits.forEach(function(x){upsertStatus_(ss,targetEmployee,x.date,type,'Chef Abwesenheit',id,x.hours,true);});
  let timeBank=null;
  if(type==='Freizeitausgleich') timeBank=appendTimeBankTransaction_(ss,targetEmployee,-totalCredit,'Freizeitausgleich',Number(startDate.slice(0,4)),Number(startDate.slice(5,7)),'absence:'+id,'Freizeitausgleich '+formatDateDE_(startDate)+' bis '+formatDateDE_(endDate),employee);
  return {ok:true,id:id,days:dates.length,creditedHours:totalCredit,timeBankBalance:timeBank?timeBank.balanceAfter:getTimeBankBalance_(ss,targetEmployee)};
}

function getAbsences(employee, employeePin) {
  requireChef_(employee, employeePin);
  const ss=getSpreadsheet_(), sheet=ensureAbsenceSheet_(ss), values=sheet.getDataRange().getValues(), out=[];
  const credits={}; const st=ss.getSheetByName(CONFIG.STATUS_SHEET);
  if(st&&st.getLastRow()>=2){const sv=st.getDataRange().getValues();for(let j=1;j<sv.length;j++){const ref=clean_(sv[j][5]);if(ref)credits[ref]=(credits[ref]||0)+(Number(sv[j][6])||0);}}
  for(let i=1;i<values.length;i++) if(String(values[i][7]).toLowerCase()!=='nein') {
    const id=clean_(values[i][0]), target=clean_(values[i][1]), type=clean_(values[i][2]);
    out.push({id:id,employee:target,type:type,start:normalizeDate_(values[i][3]),end:normalizeDate_(values[i][4]),creditedHours:round2_(credits[id]||0)});
  }
  out.sort(function(a,b){return b.start.localeCompare(a.start);});
  return out;
}

function deleteAbsence(employee, employeePin, id) {
  requireChef_(employee, employeePin); id=clean_(id);
  const ss=getSpreadsheet_(), abs=ensureAbsenceSheet_(ss), av=abs.getDataRange().getValues();
  let found=null;
  for(let i=1;i<av.length;i++) if(clean_(av[i][0])===id && String(av[i][7]).toLowerCase()!=='nein'){found={row:i+1,target:clean_(av[i][1]),type:clean_(av[i][2])};abs.getRange(i+1,8).setValue('Nein');break;}
  if(!found) throw new Error('Abwesenheit nicht gefunden.');
  const st=ss.getSheetByName(CONFIG.STATUS_SHEET), sv=st.getDataRange().getValues(); let credited=0;
  for(let i=sv.length-1;i>=1;i--) if(clean_(sv[i][5])===id){credited+=Number(sv[i][6])||0;st.deleteRow(i+1);}
  if(found.type==='Freizeitausgleich' && credited>0 && !findTimeBankReference_(ss,'absence-reversal:'+id)) appendTimeBankTransaction_(ss,found.target,round2_(credited),'Freizeitausgleich Storno',0,0,'absence-reversal:'+id,'Freizeitausgleich gelöscht',employee);
  return {ok:true,timeBankBalance:getTimeBankBalance_(ss,found.target)};
}

function getStatusInfo_(ss, employee, date) {
  const sheet=ss.getSheetByName(CONFIG.STATUS_SHEET);
  if(!sheet||sheet.getLastRow()<2) return {status:'Arbeiten',creditedHours:0,source:''};
  const v=sheet.getDataRange().getValues();
  for(let i=1;i<v.length;i++) if(clean_(v[i][0])===clean_(employee)&&normalizeDate_(v[i][1])===date) return {status:clean_(v[i][2])||'Arbeiten',source:clean_(v[i][4]),creditedHours:Number(v[i][6])||0};
  return {status:'Arbeiten',creditedHours:0,source:''};
}

function getSpreadsheet_() {
  // 7.0: Genau ein produktiver Tabellenpfad. Alle Zugriffe laufen über SPREADSHEET_ID.
  return getSpreadsheetRaw_();
}

function getDayStatus_(ss, employee, date) {
  return getStatusInfo_(ss, employee, date).status;
}

function setDayStatus(employee, date, employeePin, status) {
  requireChef_(employee, employeePin);

  employee = clean_(employee);
  date = clean_(date);
  status = clean_(status);

  const allowed = ['Arbeiten', 'Krank', 'Urlaub', 'Feiertag'];

  if (!allowed.includes(status)) {
    throw new Error('Ungültiger Tagesstatus.');
  }

  if (!validDate3_(date)) {
    throw new Error('Ungültiges Datum.');
  }

  const ss = getSpreadsheet_();
  const existingStatusInfo = getStatusInfo_(ss, employee, date);
  if (!canAccessChef_(employee) && existingStatusInfo.status !== 'Arbeiten' &&
      (existingStatusInfo.source === 'Chef Abwesenheit' || existingStatusInfo.source === 'Automatisch Feiertag')) {
    throw new Error('Dieser Tagesstatus wurde durch den Chefbereich bzw. automatisch gesetzt und kann hier nicht geändert werden.');
  }

  if (isDayClosed_(ss, employee, date)) {
    throw new Error('Der Tag wurde bereits abgeschlossen.');
  }

  const timeSheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  const timeValues = timeSheet.getDataRange().getValues();
  let hasEntries = false;

  for (let i = 1; i < timeValues.length; i++) {
    if (
      String(timeValues[i][1]) === employee &&
      normalizeDate_(timeValues[i][2]) === date
    ) {
      hasEntries = true;
      break;
    }
  }

  if (status !== 'Arbeiten' && hasEntries) {
    throw new Error('Für diesen Tag sind bereits Arbeitszeiten erfasst. Bitte zuerst die Einträge löschen.');
  }

  const sheet = ss.getSheetByName(CONFIG.STATUS_SHEET);
  const values = sheet.getDataRange().getValues();
  let foundRow = 0;

  for (let i = 1; i < values.length; i++) {
    if (
      String(values[i][0]) === employee &&
      normalizeDate_(values[i][1]) === date
    ) {
      foundRow = i + 1;
      break;
    }
  }

  if (status === 'Arbeiten') {
    if (foundRow) {
      sheet.deleteRow(foundRow);
    }
  } else if (foundRow) {
    sheet.getRange(foundRow, 3, 1, 5).setValues([[status, new Date(), 'Mitarbeiter', '', status === 'Arbeiten' ? 0 : weekdayHoursForDate_(employee, date)]]);
  } else {
    sheet.appendRow([employee, date, status, new Date(), 'Mitarbeiter', '', status === 'Arbeiten' ? 0 : weekdayHoursForDate_(employee, date)]);
  }

  return {
    ok: true,
    status: status
  };
}

function isMaintenanceCalendarEvent_(employee,eventId){
  eventId=clean_(eventId);if(!eventId)return false;
  try{const workers=getPlannerWorkerRows_(),w=workers.find(function(x){return clean_(x.employeeName)===clean_(employee);});if(!w)return false;const rows=getPlannerEventRows_();for(let i=0;i<rows.length;i++){const e=rows[i];if(e.type==='Wartung'&&clean_(e.googleEventIds&&e.googleEventIds[w.id])===eventId)return true;}}catch(_e){}
  return false;
}

function saveEntry(data) {
  validateEntry_(data);
  verifyEmployeePin(data.employee, data.employeePin);

  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.TIME_SHEET);

  const employee = clean_(data.employee);
  const date = data.date;

  const dayStatus = getDayStatus_(ss, employee, date);
  if (dayStatus !== 'Arbeiten' && !canAccessChef_(employee)) {
    throw new Error('Dieser Tag ist als ' + dayStatus + ' markiert. Eingaben und Übermittlungen sind für diesen Tag deaktiviert.');
  }

  const customer = clean_(data.customer);
  const hours = Number(data.hours);
  const maintenanceLink = getMaintenanceCalendarLink37_(employee, clean_(data.sourceCalendarEventId || ''));
  const isMaintenance = Boolean(data.maintenance) || Boolean(maintenanceLink.maintenance);
  const nextMaintenanceDue = clean_(data.nextMaintenanceDue || '');
  const maintenanceCustomerId=clean_(data.maintenanceCustomerId||maintenanceLink.customerId||''),maintenanceObjectId=clean_(data.maintenanceObjectId||maintenanceLink.objectId||''),maintenanceDeviceId=clean_(data.maintenanceDeviceId||maintenanceLink.deviceId||'');
  if (isMaintenance && !/^\d{4}-(0[1-9]|1[0-2])$/.test(nextMaintenanceDue)) {
    throw new Error('Bei Wartungen ist „Nächste Wartung fällig“ mit Monat und Jahr Pflicht.');
  }
  // v28: Die frühere Fremdzuordnungs-/Mitarbeit-Logik blockiert neue eigene Einträge nicht mehr.
  // Jeder Mitarbeiter erfasst ausschließlich seine eigenen Stunden.
  const replacementAssignmentId = '';


  // Offline-Wiederholungen dürfen denselben Auftrag nicht doppelt speichern.
  if (data.clientId) {
    const existing = sheet.getDataRange().getValues();
    for (let i = 1; i < existing.length; i++) {
      if (String(existing[i][0]) === String(data.clientId)) {
        return getDayData(employee, date, data.employeePin);
      }
    }
  }

  const dayWasClosed = isDayClosed_(ss, employee, date);
  const isSupplement = Boolean(data.isSupplement);
  if (dayWasClosed && !isSupplement) {
    throw new Error('Dieser Tag wurde bereits abgeschlossen. Für weitere Einsätze bitte die Funktion „Nachtrag erfassen“ verwenden.');
  }

  // v55: Nachträge zu abgeschlossenen Tagen sind nur nach ausdrücklicher Bestätigung
  // im Frontend möglich und werden serverseitig dauerhaft mit Zeitstempel gekennzeichnet.
  const supplementCreatedAt = dayWasClosed && isSupplement ? new Date() : '';

  // v25: Mitarbeiter schreiben keine Arbeitszeit mehr in Google Kalender zurück.
  const calendarId = '';

  let customerSignatureFile = null;
  let customerSignatureId = '';
  let customerSignatureUrl = '';

  if (
    data.customerSignature &&
    String(data.customerSignature).startsWith('data:image/png;base64,')
  ) {
    customerSignatureFile = saveCustomerSignature_(
      employee,
      date,
      customer,
      data.customerSignature
    );
    customerSignatureId = customerSignatureFile.getId();
    customerSignatureUrl = customerSignatureFile.getUrl();
  }

  const photoFiles = saveJobPhotos_(employee, date, customer, data.photos || []);
  const photoIds = photoFiles.map(function(file) { return file.getId(); });
  const photoUrls = photoFiles.map(function(file) { return file.getUrl(); });

  const newEntryId = data.clientId ? clean_(data.clientId) : Utilities.getUuid();
  sheet.appendRow([
    newEntryId,
    employee,
    date,
    customer,
    data.start,
    data.end,
    hours,
    clean_(data.activity),
    calendarId,
    new Date(),
    false, // v56: neue Eintraege/Nachtraege muessen durch Tagesabschluss bzw. Aktualisierung bestaetigt werden
    data.materialUsed ? 'Ja' : 'Nein',
    clean_(data.material || ''),
    customerSignatureId,
    customerSignatureUrl,
    photoFiles.length,
    photoIds.join(','),
    photoUrls.join(' | '),
    'Nein',
    '',
    '',
    clean_(data.sourceCalendarEventId || ''),
    'Offen',
    '',
    '',
    getOrCreateObjectId_(ss, customer),
    clean_(data.jobStatus) === 'Laufend' ? 'Laufend' : 'Abgeschlossen',
    dayWasClosed && isSupplement ? 'Ja' : 'Nein',
    supplementCreatedAt,
    '',
    '',
    '',
    isMaintenance ? 'Ja' : 'Nein',
    isMaintenance ? nextMaintenanceDue : '',
    isMaintenance ? maintenanceCustomerId : '',
    isMaintenance ? maintenanceObjectId : '',
    isMaintenance ? maintenanceDeviceId : ''
  ]);

  // v25: Fremderfassung wurde entfernt. Jeder Mitarbeiter erfasst nur seine eigenen Stunden.
  if (replacementAssignmentId) markAssignmentReplaced_(ss, replacementAssignmentId, employee, newEntryId);

  // v21: Kunden-/Regieberichte werden nicht mehr automatisch per E-Mail
  // versendet. Sie stehen im Chefbereich als offene Regieberichte bereit.
  SpreadsheetApp.flush();
  if(isMaintenance&&maintenanceDeviceId)updateMaintenanceDeviceDue37_(maintenanceDeviceId,nextMaintenanceDue,employee);
  const result = getDayData(employee, date, data.employeePin);
  if (dayWasClosed && isSupplement) {
    result.supplementSaved = true;
    result.supplementEntryId = newEntryId;
    result.regieCreated = true;
    result.closureNeedsRefresh = true;
    result.message = 'Nachtrag erfolgreich gespeichert. Der neue Regiebericht steht im Chefbereich bereit. Tagesabschluss bitte aktualisieren.';
  }
  return result;
}

function sendJobMail_(employee, date, customer, data, customerSignatureFile, photoFiles) {
  const subject =
    'Kundendienstauftrag - ' +
    employee +
    ' - ' +
    customer +
    ' - ' +
    formatDateDE_(date);

  const lines = [
    'Kundendienstauftrag',
    '',
    'Mitarbeiter: ' + employee,
    'Datum: ' + formatDateDE_(date),
    'Kunde/Baustelle: ' + customer,
    'Zeit: ' + data.start + ' bis ' + data.end,
    'Stunden: ' + formatHours_(data.hours),
    'Ausgeführte Tätigkeit: ' + clean_(data.activity),
    'Material verbaut: ' + (data.materialUsed ? 'Ja' : 'Nein')
  ];

  if (data.materialUsed) {
    lines.push('Material: ' + clean_(data.material));
  }

  const additionalEmployees = normalizeAdditionalEmployees_(
    data.additionalEmployees,
    employee
  );

  lines.push(
    'Weitere Mitarbeiter anwesend: ' + (additionalEmployees.length ? 'Ja' : 'Nein')
  );

  if (additionalEmployees.length) {
    const additionalEmployeeHours = normalizeAdditionalEmployeeHours_(
      data.additionalEmployeeHours,
      additionalEmployees
    );
    lines.push(
      'Weitere Mitarbeiter: ' +
      (additionalEmployeeHours.length
        ? additionalEmployeeHours.map(function(x) {
            return x.name + ' (' + formatHours_(x.hours) + ' Std.)';
          }).join(', ')
        : additionalEmployees.join(', '))
    );
  }

  lines.push(
    'Bilder: ' + ((photoFiles || []).length),
    '',
    'Kundenunterschrift und vorhandene Auftragsbilder sind als Anhang beigefügt.',
    '',
    'Dieser Auftrag wurde direkt nach der Kundenunterschrift aus der Del Gesso Zeiterfassung an das Büro übermittelt.'
  );

  GmailApp.sendEmail(
    CONFIG.OFFICE_EMAIL,
    subject,
    lines.join('\n'),
    {
      attachments: (customerSignatureFile ? [
        customerSignatureFile
          .getBlob()
          .setName(
            'Kundenunterschrift_' +
            safeFilePart_(customer) +
            '_' +
            date +
            '.png'
          )
      ] : []).concat((photoFiles || []).map(function(file, index) {
        return file.getBlob().setName(
          'Auftragsbild_' + safeFilePart_(customer) + '_' + (index + 1) + '.jpg'
        );
      }))
    }
  );
}

function cleanupAssignmentsForDeletedEntry_(ss, entryId) {
  entryId=clean_(entryId);
  const sh=ensureAssignmentSheet_(ss);
  const values=sh.getDataRange().getValues();
  for (let i=values.length-1;i>=1;i--) {
    const sourceId=clean_(values[i][1]);
    const replacedBy=clean_(values[i][10]);
    if (sourceId===entryId) {
      sh.deleteRow(i+1);
    } else if (replacedBy===entryId) {
      sh.getRange(i+1,5).setValue('Zugeordnet');
      sh.getRange(i+1,11).clearContent();
    }
  }
}

function deleteEntry(id, employee, date, employeePin) {
  verifyEmployeePin(employee, employeePin);
  employee = clean_(employee);
  date = clean_(date);
  id = clean_(id);
  if (!id) throw new Error('Eintrag-ID fehlt.');
  if (!validDate3_(date)) throw new Error('Ungültiges Datum.');

  const ss = getSpreadsheet_();

  if (isDayClosed_(ss, employee, date)) {
    throw new Error('Der Tag ist bereits abgeschlossen.');
  }

  const sheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  const values = sheet.getDataRange().getValues();
  let found = false;

  for (let i = values.length - 1; i >= 1; i--) {
    if (clean_(values[i][0]) !== id) continue;
    // v58: Ein Mitarbeiter darf ausschließlich den eigenen Eintrag des gewählten Tages löschen.
    if (clean_(values[i][1]) !== employee || normalizeDate_(values[i][2]) !== date) {
      throw new Error('Dieser Eintrag gehört nicht zum angemeldeten Mitarbeiter bzw. Tag.');
    }
    const calendarId = values[i][8];

    if (calendarId) {
      try {
        const event = CalendarApp.getDefaultCalendar().getEventById(calendarId);
        if (event) event.deleteEvent();
      } catch (e) {
        console.log(e);
      }
    }

    cleanupAssignmentsForDeletedEntry_(ss, id);
    sheet.deleteRow(i + 1);
    found = true;
    break;
  }

  if (!found) throw new Error('Eintrag wurde nicht gefunden.');
  return getDayData(employee, date, employeePin);
}

function updateEmployeeEntry(employee, employeePin, entryId, item) {
  verifyEmployeePin(employee, employeePin);
  employee = clean_(employee);
  entryId = clean_(entryId);
  item = item || {};
  if (!entryId) throw new Error('Eintrag-ID fehlt.');

  const ss = getSpreadsheet_();
  ensureObjectIds_(ss);
  const sheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  const values = sheet.getDataRange().getValues();
  let rowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    if (clean_(values[i][0]) === entryId) { rowIndex = i; break; }
  }
  if (rowIndex < 1) throw new Error('Eintrag wurde nicht gefunden.');

  const row = values[rowIndex];
  const rowEmployee = clean_(row[1]);
  const rowDate = normalizeDate_(row[2]);
  if (rowEmployee !== employee) throw new Error('Dieser Eintrag gehoert nicht zum angemeldeten Mitarbeiter.');
  if (isDayClosed_(ss, employee, rowDate)) throw new Error('Der Tag ist bereits abgeschlossen. Eintraege koennen danach nicht mehr bearbeitet werden.');
  const dayStatus = getDayStatus_(ss, employee, rowDate);
  if (dayStatus !== 'Arbeiten') throw new Error('Dieser Tag ist als ' + dayStatus + ' markiert und kann nicht bearbeitet werden.');
  if ((clean_(row[22]) || 'Offen') !== 'Offen') throw new Error('Dieser Regiebericht wurde bereits abgerechnet und kann vom Mitarbeiter nicht mehr bearbeitet werden.');

  // Manipulationsschutz: Zeiten/Stunden bleiben immer exakt so gespeichert wie bei der Ersterfassung.
  // Auch falls ein manipuliertes Frontend solche Felder mitsendet, werden sie ignoriert.
  const customer = clean_(item.customer);
  const activity = clean_(item.activity);
  const materialUsed = Boolean(item.materialUsed);
  const material = materialUsed ? clean_(item.material) : '';
  const jobStatus = clean_(item.jobStatus) === 'Laufend' ? 'Laufend' : 'Abgeschlossen';
  if (!customer) throw new Error('Bitte Kunde / Baustelle eintragen.');
  if (!activity) throw new Error('Bitte die ausgefuehrte Taetigkeit eintragen.');
  if (materialUsed && !material) throw new Error('Bitte Material eintragen.');

  const oldCustomer = clean_(row[3]);
  const targetRow = rowIndex + 1;
  sheet.getRange(targetRow, 4).setValue(customer);      // Kunde / Baustelle
  sheet.getRange(targetRow, 8).setValue(activity);      // Taetigkeit
  sheet.getRange(targetRow, 12).setValue(materialUsed ? 'Ja' : 'Nein');
  sheet.getRange(targetRow, 13).setValue(material);
  sheet.getRange(targetRow, 27).setValue(jobStatus);    // Auftragsstatus
  if (normalizedCustomerKey_(oldCustomer) !== normalizedCustomerKey_(customer)) {
    sheet.getRange(targetRow, 26).setValue(getOrCreateObjectId_(ss, customer));
  }
  SpreadsheetApp.flush();
  return getDayData(employee, rowDate, employeePin);
}

function normalizedCustomerKey_(value) {
  // Gemeinsamer Auftrags-/Objektschluessel unabhaengig von Kalender-Event-IDs.
  // Vereinheitlicht auch typische Schreibweisen wie Straße / Strasse / Str.
  let s = clean_(value).toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  s = s.replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
  s = s.replace(/\bstr\b/g, 'strasse').replace(/([a-z0-9]+)str\b/g, '$1strasse');
  return s;
}

function timeToMinutes_(value) {
  const text = normalizeTime_(value);
  const match = text.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h=Number(match[1]), m=Number(match[2]);
  if(h<0||h>23||m<0||m>59) return null;
  return h*60+m;
}

function timesOverlap_(startA, endA, startB, endB) {
  let a1 = timeToMinutes_(startA);
  let a2 = timeToMinutes_(endA);
  let b1 = timeToMinutes_(startB);
  let b2 = timeToMinutes_(endB);
  if (a1 === null || a2 === null || b1 === null || b2 === null) return false;
  if (a2 === a1 || b2 === b1) return false;
  if (a2 < a1) a2 += 1440;
  if (b2 < b1) b2 += 1440;
  return a1 < b2 && b1 < a2;
}

function hasManualReplacement_(values, employee, date, customer, start, end) {
  const customerKey = normalizedCustomerKey_(customer);
  for (let i = 1; i < values.length; i++) {
    if (clean_(values[i][1]) !== clean_(employee)) continue;
    if (normalizeDate_(values[i][2]) !== date) continue;
    if (normalizedCustomerKey_(values[i][3]) !== customerKey) continue;
    if (timesOverlap_(values[i][4], values[i][5], start, end)) return true;
  }
  return false;
}

function buildOwnEntryFromRow_(row) {
  return {
    id: row[0],
    employee: row[1],
    date: normalizeDate_(row[2]),
    customer: row[3],
    start: normalizeTime_(row[4]),
    end: normalizeTime_(row[5]),
    hours: Number(row[6]) || 0,
    activity: row[7] || '',
    transmittedAt: row[9] ? formatDateTimeDE_(row[9]) : '',
    transmittedDate: row[9] ? formatDateDE_(normalizeDate_(row[9])) : '',
    materialUsed: String(row[11]) === 'Ja',
    material: row[12] || '',
    customerSignatureUrl: row[14] || '',
    photoCount: Number(row[15]) || 0,
    photoUrls: row[17] || '',
    additionalEmployeesUsed: String(row[18]) === 'Ja',
    additionalEmployees: clean_(row[19])
      .split(',')
      .map(function(name) { return clean_(name); })
      .filter(Boolean),
    additionalEmployeeHours: parseAdditionalEmployeeHours_(row[20]),
    sourceCalendarEventId: clean_(row[21]),
    billingStatus: clean_(row[22]) || 'Offen',
    billedAt: row[23] ? formatDateTimeDE_(row[23]) : '',
    billedBy: clean_(row[24]),
    objectId: clean_(row[25]),
    jobStatus: clean_(row[26]) || 'Abgeschlossen',
    isSupplement: clean_(row[27]) === 'Ja',
    supplementCreatedAt: row[28] ? formatDateTimeDE_(row[28]) : '',
    maintenance: clean_(row[32]) === 'Ja',
    nextMaintenanceDue: maintenanceMonth37_(row[33]),
    isAdditionalAssignment: false,
    assignedBy: ''
  };
}

function getEntriesForEmployee_(ss, employee, dateFilter) {
  employee = clean_(employee);
  const sheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  const values = sheet.getDataRange().getValues();
  const sourceById = getSourceRowsById_(values);
  const entries = [];

  for (let i = 1; i < values.length; i++) {
    const rowDate = normalizeDate_(values[i][2]);
    if (dateFilter && rowDate !== dateFilter) continue;
    if (clean_(values[i][1]) === employee) entries.push(buildOwnEntryFromRow_(values[i]));
  }

  getAssignmentRecords_(ss).forEach(function(a) {
    if (!assignmentIsActive_(a) || a.employee !== employee) return;
    const row=sourceById[a.sourceEntryId];
    if (!row) return;
    const rowDate=normalizeDate_(row[2]);
    if (dateFilter && rowDate !== dateFilter) return;
    entries.push({
      id:'assigned:' + a.id, assignmentId:a.id, sourceEntryId:a.sourceEntryId,
      employee:employee,date:rowDate,customer:row[3]||'',start:normalizeTime_(row[4]),end:normalizeTime_(row[5]),
      hours:Number(a.hours)||0,activity:row[7]||'',transmittedAt:row[9]?formatDateTimeDE_(row[9]):'',transmittedDate:row[9]?formatDateDE_(normalizeDate_(row[9])):'',materialUsed:false,material:'',customerSignatureUrl:'',photoCount:0,photoUrls:'',
      additionalEmployeesUsed:false,additionalEmployees:[],additionalEmployeeHours:[],isAdditionalAssignment:true,
      isSupplement:false,supplementCreatedAt:'',
      assignedBy:a.createdBy||clean_(row[1]),assignmentStatus:a.status||'Zugeordnet',assignmentNote:a.note||''
    });
  });

  entries.sort(function(a,b){return (a.date+' '+a.start).localeCompare(b.date+' '+b.start);});
  return entries;
}

function findAdditionalAssignmentConflicts_(ss, employee, date, customer, start, end) {
  return getEmployeeOverlapConflicts_(ss, employee, date, start, end, '').filter(function(x){return x.type==='Mitarbeit';});
}

function checkEntryConflict(employee, employeePin, date, customer, start, end) {
  verifyEmployeePin(employee, employeePin);
  const ss = getSpreadsheet_();
  return { conflicts: getEmployeeOverlapConflicts_(ss, employee, clean_(date), start, end, '') };
}

function sanitizeEmployeeEntry_(entry) {
  // Mitarbeiter sehen ausschliesslich die fuer sie relevanten Stunden.
  // Namen/Stunden weiterer Kollegen bleiben nur im Chefbereich sichtbar.
  return {
    id: entry.id,
    employee: entry.employee,
    date: entry.date,
    customer: entry.customer,
    start: entry.start,
    end: entry.end,
    hours: Number(entry.hours) || 0,
    activity: entry.activity || '',
    transmittedDate: entry.transmittedDate || '',
    materialUsed: Boolean(entry.materialUsed),
    material: entry.material || '',
    customerSignatureUrl: entry.customerSignatureUrl || '',
    photoCount: Number(entry.photoCount) || 0,
    photoUrls: entry.photoUrls || '',
    jobStatus: entry.jobStatus || 'Abgeschlossen',
    isAdditionalAssignment: Boolean(entry.isAdditionalAssignment),
    assignedBy: entry.isAdditionalAssignment ? (entry.assignedBy || '') : '',
    assignmentId: entry.isAdditionalAssignment ? (entry.assignmentId || '') : '',
    assignmentStatus: entry.isAdditionalAssignment ? (entry.assignmentStatus || 'Zugeordnet') : '',
    assignmentNote: entry.isAdditionalAssignment ? (entry.assignmentNote || '') : '',
    isSupplement: Boolean(entry.isSupplement),
    supplementCreatedAt: entry.supplementCreatedAt || ''
  };
}

function automaticPauseHours_(grossWorkHours) {
  const gross = round2_(Math.max(0, Number(grossWorkHours) || 0));
  return gross >= 6 ? 1 : 0;
}

function netWorkHours_(grossWorkHours) {
  return round2_(Math.max(0, (Number(grossWorkHours) || 0) - automaticPauseHours_(grossWorkHours)));
}

function getDayClosureInfo_(ss, employee, date) {
  const sheet = ss.getSheetByName(CONFIG.CLOSE_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return {closed:false,row:0,closedAt:null,updatedAt:null};
  const values = sheet.getDataRange().getValues();
  let info = {closed:false,row:0,closedAt:null,updatedAt:null};
  for (let i=1;i<values.length;i++) {
    if (clean_(values[i][0]) !== clean_(employee) || normalizeDate_(values[i][1]) !== clean_(date)) continue;
    info = {closed:true,row:i+1,closedAt:values[i][2] instanceof Date ? values[i][2] : null,updatedAt:values[i][8] instanceof Date ? values[i][8] : null};
  }
  return info;
}

function getLatestSupplementAt_(ss, employee, date) {
  const sheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return null;
  const values = sheet.getDataRange().getValues();
  let latest = null;
  for (let i=1;i<values.length;i++) {
    if (clean_(values[i][1]) !== clean_(employee) || normalizeDate_(values[i][2]) !== clean_(date)) continue;
    if (clean_(values[i][27]) !== 'Ja') continue;
    const d = values[i][28] instanceof Date ? values[i][28] : null;
    if (d && (!latest || d.getTime() > latest.getTime())) latest = d;
  }
  return latest;
}

function dayClosureNeedsRefresh_(ss, employee, date) {
  const closure = getDayClosureInfo_(ss, employee, date);
  if (!closure.closed) return false;
  const supplement = getLatestSupplementAt_(ss, employee, date);
  if (!supplement) return false;
  const baseline = closure.updatedAt || closure.closedAt;
  return !baseline || supplement.getTime() > baseline.getTime();
}

function refreshClosedDay(employee, date, employeePin) {
  verifyEmployeePin(employee, employeePin);
  employee = clean_(employee); date = clean_(date);
  const ss = getSpreadsheet_();
  const closure = getDayClosureInfo_(ss, employee, date);
  if (!closure.closed || !closure.row) throw new Error('Dieser Tag ist noch nicht abgeschlossen.');
  const data = getDayData(employee, date, employeePin);
  if (!data.entries.length) throw new Error('Es sind keine Stunden fuer diesen Tag erfasst.');
  const pauseHours = automaticPauseHours_(data.grossWorkTotal);
  const closeSheet = ss.getSheetByName(CONFIG.CLOSE_SHEET);
  closeSheet.getRange(closure.row, 4).setValue(data.grossTotal);
  closeSheet.getRange(closure.row, 7).setValue(Math.round(pauseHours * 60));
  closeSheet.getRange(closure.row, 8).setValue(data.total);
  closeSheet.getRange(closure.row, 9).setValue(new Date());
  closeSheet.getRange(closure.row,10).setValue('Nachtrag / Tagesabschluss aktualisiert');
  const timeSheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  const values = timeSheet.getDataRange().getValues();
  for (let i=1;i<values.length;i++) {
    if (clean_(values[i][1])===employee && normalizeDate_(values[i][2])===date) timeSheet.getRange(i+1,11).setValue(true);
  }
  SpreadsheetApp.flush();
  const refreshed = getDayData(employee,date,employeePin);
  refreshed.closureRefreshed = true;
  refreshed.closureNeedsRefresh = false;
  refreshed.closureRefreshedAt = formatDateTimeDE_(new Date());
  return refreshed;
}

function getDayData(employee, date, employeePin) {
  verifyEmployeePin(employee, employeePin);
  const ss = getSpreadsheet_();
  ensureHolidayStatusesForYear_(ss, Number(String(date).slice(0,4)));
  const entries = getEntriesForEmployee_(ss, employee, date);
  const grossWorkTotal = round2_(entries.reduce(function(sum, entry) { return sum + Number(entry.hours || 0); }, 0));
  const pauseHours = automaticPauseHours_(grossWorkTotal);
  const workTotal = netWorkHours_(grossWorkTotal);
  const statusInfo = getStatusInfo_(ss, employee, date);
  const credited = statusInfo.status === 'Arbeiten' ? 0 : Number(statusInfo.creditedHours || 0);
  return {
    entries: entries.map(sanitizeEmployeeEntry_),
    total: round2_(workTotal + credited),
    grossTotal: round2_(grossWorkTotal + credited),
    grossWorkTotal: grossWorkTotal,
    workTotal: workTotal,
    automaticPauseHours: pauseHours,
    pauseMinutes: Math.round(pauseHours * 60),
    creditedHours: round2_(credited),
    closed: isDayClosed_(ss, employee, date),
    closureNeedsRefresh: dayClosureNeedsRefresh_(ss, employee, date),
    latestSupplementAt: (function(){ const d=getLatestSupplementAt_(ss,employee,date); return d ? formatDateTimeDE_(d) : ''; })(),
    status: statusInfo.status,
    statusSource: statusInfo.source,
    targetHours: weekdayHoursForDate_(employee,date),
    timeBankBalance: getTimeBankBalance_(ss,employee)
  };
}

function closeDay(employee, date, employeePin, signatureDataUrl, pauseHours) {
  verifyEmployeePin(employee, employeePin);
  employee = clean_(employee);

  if (!employee) {
    throw new Error('Mitarbeiter fehlt.');
  }

  if (!date) {
    throw new Error('Datum fehlt.');
  }

  const ss = getSpreadsheet_();

  if (isDayClosed_(ss, employee, date)) {
    return { ok: true, alreadyClosed: true };
  }

  const data = getDayData(employee, date, employeePin);

  if (data.status && data.status !== 'Arbeiten' && !canAccessChef_(employee)) {
    throw new Error('Dieser Tag ist als ' + data.status + ' markiert. Eingaben und Übermittlungen sind für diesen Tag deaktiviert.');
  }

  // v54: der vom Frontend uebermittelte Pausenwert wird aus Kompatibilitaetsgruenden
  // noch angenommen, aber bewusst ignoriert. Die Pause wird ausschliesslich serverseitig berechnet.
  pauseHours = automaticPauseHours_(data.grossWorkTotal);
  const pauseMinutes = Math.round(pauseHours * 60);
  const netTotal = round2_(data.total);

  if (!data.entries.length) {
    throw new Error('Es sind keine Stunden fuer diesen Tag erfasst.');
  }

  const closeSheet = ss.getSheetByName(CONFIG.CLOSE_SHEET);
  closeSheet.appendRow([
    employee,
    date,
    new Date(),
    data.grossTotal,
    '',
    '',
    pauseMinutes,
    netTotal
  ]);

  const timeSheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  const values = timeSheet.getDataRange().getValues();
  const rowsToClose = [];
  for (let i = 1; i < values.length; i++) {
    if (clean_(values[i][1]) === employee && normalizeDate_(values[i][2]) === date) rowsToClose.push(i + 1);
  }
  // Nur das Abschlussfeld setzen; Bilder/Unterschriften werden nicht mehr fuer eine Mail geladen.
  rowsToClose.forEach(function(row) { timeSheet.getRange(row, 11).setValue(true); });

  // v21: Tagesabschluesse werden im Chefbereich angezeigt und nicht mehr
  // automatisch per E-Mail versendet. Die Unterschrift bleibt in Drive gespeichert.
  return {
    ok: true,
    total: data.total,
    pauseMinutes: pauseMinutes,
    netTotal: netTotal
  };
}

function getMonthDataInternal_(employee, year, month, skipHolidaySync) {
  const ss = getSpreadsheet_();
  year = Number(year); month = Number(month);
  if (!skipHolidaySync) ensureHolidayStatusesForYear_(ss, year);
  const closeSheet = ss.getSheetByName(CONFIG.CLOSE_SHEET);
  const closedDates = {};
  if (closeSheet && closeSheet.getLastRow() >= 2) {
    const cv = closeSheet.getDataRange().getValues();
    for (let ci = 1; ci < cv.length; ci++) {
      if (clean_(cv[ci][0]) === clean_(employee)) closedDates[normalizeDate_(cv[ci][1])] = true;
    }
  }
  // Produktivstart 07.09.2026: fruehere Zeiterfassungen waren Testdaten.
  // Sie bleiben physisch erhalten, damit echte Regieberichte unangetastet bleiben,
  // werden aber in der Mitarbeiter-Monatsuebersicht nicht mehr gezaehlt/angezeigt.
  const rows = getEntriesForEmployee_(ss, employee).filter(function(entry) {
    const parts = String(entry.date || '').split('-');
    return String(entry.date || '') >= PRODUCTIVE_START_DATE && Number(parts[0]) === year && Number(parts[1]) === month;
  }).map(function(entry) {
    return {date:entry.date,customer:entry.customer,hours:Number(entry.hours)||0,activity:entry.activity||'',transmittedDate:entry.transmittedDate||'',closed:Boolean(closedDates[entry.date]),isAdditionalAssignment:Boolean(entry.isAdditionalAssignment),assignedBy:entry.assignedBy||'',assignmentStatus:entry.assignmentStatus||'',assignmentNote:entry.assignmentNote||'',isSupplement:Boolean(entry.isSupplement),supplementCreatedAt:entry.supplementCreatedAt||''};
  });
  rows.sort(function(a,b){return a.date.localeCompare(b.date);});
  const statuses=[];
  const statusSheet=ss.getSheetByName(CONFIG.STATUS_SHEET);
  if(statusSheet&&statusSheet.getLastRow()>=2){
    const v=statusSheet.getDataRange().getValues();
    for(let i=1;i<v.length;i++){
      if(clean_(v[i][0])!==clean_(employee)) continue;
      const d=normalizeDate_(v[i][1]), p=d.split('-');
      if(d >= PRODUCTIVE_START_DATE && Number(p[0])===year&&Number(p[1])===month){ const st=clean_(v[i][2]); let cr=(v[i][6]===''||v[i][6]===null)?weekdayHoursForDate_(employee,d):(Number(v[i][6])||0); const rec=getEmployeeRecord_(employee); if(st==='Feiertag'&&rec&&(rec.employmentType==='Aushilfe'||!rec.holidayCredit)) cr=0; statuses.push({date:d,status:st,source:clean_(v[i][4]),creditedHours:round2_(cr)}); }
    }
  }
  statuses.sort(function(a,b){return a.date.localeCompare(b.date);});
  const grossByDate={};
  rows.forEach(function(r){grossByDate[r.date]=(grossByDate[r.date]||0)+Number(r.hours||0);});
  const dayTotals=Object.keys(grossByDate).sort().map(function(date){
    const gross=round2_(grossByDate[date]||0), pause=automaticPauseHours_(gross);
    return {date:date,grossHours:gross,pauseHours:pause,netHours:netWorkHours_(gross)};
  });
  const workTotalGross=round2_(dayTotals.reduce(function(s,x){return s+Number(x.grossHours||0);},0));
  const automaticPauseTotal=round2_(dayTotals.reduce(function(s,x){return s+Number(x.pauseHours||0);},0));
  const workTotal=round2_(workTotalGross-automaticPauseTotal);
  const statusCredit=statuses.reduce(function(s,x){return s+Number(x.creditedHours||0);},0);
  const timeBankMonthCredit=getMonthTimeBankCredit_(ss,employee,year,month);
  const creditedTotal=round2_(statusCredit+timeBankMonthCredit);

  // v52: Büro-Stundenkorrekturen aus der Monatsübersicht auch in der
  // Mitarbeiteransicht berücksichtigen. Damit sehen Mitarbeiter und Büro
  // dieselbe korrigierte Monatsstundenzahl.
  let adjustmentTotal=0;
  const adjustmentSheet=ensureAdjustmentSheet_(ss);
  if(adjustmentSheet && adjustmentSheet.getLastRow()>=2){
    const av=adjustmentSheet.getDataRange().getValues();
    for(let ai=1;ai<av.length;ai++){
      if(clean_(av[ai][1])!==clean_(employee)) continue;
      if(Number(av[ai][2])!==year || Number(av[ai][3])!==month) continue;
      const createdIso=av[ai][6] instanceof Date ? Utilities.formatDate(av[ai][6],CONFIG.TZ,'yyyy-MM-dd') : '';
      if(year===2026 && month===9 && createdIso && createdIso<PRODUCTIVE_START_DATE) continue;
      adjustmentTotal+=Number(av[ai][4])||0;
    }
  }
  adjustmentTotal=round2_(adjustmentTotal);

  const monthSummary={
    vacationDays:statuses.filter(function(x){return x.status==='Urlaub';}).length,
    sickDays:statuses.filter(function(x){return x.status==='Krank';}).length,
    holidayDays:statuses.filter(function(x){return x.status==='Feiertag';}).length,
    compensatoryDays:statuses.filter(function(x){return x.status==='Freizeitausgleich';}).length,
    compensatoryHours:round2_(statuses.filter(function(x){return x.status==='Freizeitausgleich';}).reduce(function(s,x){return s+Number(x.creditedHours||0);},0)),
    timeBankMonthCredit:timeBankMonthCredit,
    adjustmentTotal:adjustmentTotal
  };
  const yearSummary=getAnnualStatusSummary_(ss,employee,year,true);
  const actualTotal=round2_(workTotal+creditedTotal+adjustmentTotal);
  return {rows:rows,total:actualTotal,actualTotal:actualTotal,adjustmentTotal:adjustmentTotal,workTotal:round2_(workTotal),workTotalGross:workTotalGross,automaticPauseTotal:automaticPauseTotal,dayTotals:dayTotals,creditedTotal:creditedTotal,statusCredit:round2_(statusCredit),timeBankMonthCredit:timeBankMonthCredit,timeBankBalance:0,statuses:statuses,monthSummary:monthSummary,yearSummary:yearSummary};
}

function getWeekData(employee, employeePin, referenceDate) {
  verifyEmployeePin(employee, employeePin);
  const ref = clean_(referenceDate) || Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd');
  if (!validDate3_(ref)) throw new Error('Ungültiges Bezugsdatum.');
  const p = ref.split('-').map(Number);
  const d = new Date(p[0], p[1]-1, p[2]);
  const dow = d.getDay();
  const monday = addDays_(d, dow === 0 ? -6 : 1-dow);
  const sunday = addDays_(monday, 6);
  const start = isoDate_(monday), end = isoDate_(sunday);
  const ss = getSpreadsheet_();
  ensureHolidayStatusesForYear_(ss, Number(start.slice(0,4)));
  if (end.slice(0,4) !== start.slice(0,4)) ensureHolidayStatusesForYear_(ss, Number(end.slice(0,4)));
  const entries = getEntriesForEmployee_(ss, employee).filter(function(x){return x.date>=start && x.date<=end;});
  const grossByDate = {};
  entries.forEach(function(x){grossByDate[x.date]=(grossByDate[x.date]||0)+Number(x.hours||0);});
  let gross=0,pause=0,net=0;
  Object.keys(grossByDate).forEach(function(date){const g=round2_(grossByDate[date]);const b=automaticPauseHours_(g);gross+=g;pause+=b;net+=Math.max(0,g-b);});
  let credited=0;
  const statusSheet=ss.getSheetByName(CONFIG.STATUS_SHEET);
  if(statusSheet&&statusSheet.getLastRow()>=2){
    const v=statusSheet.getDataRange().getValues();
    for(let i=1;i<v.length;i++){
      if(clean_(v[i][0])!==clean_(employee)) continue;
      const date=normalizeDate_(v[i][1]); if(date<start||date>end) continue;
      credited+=Number(v[i][6])||0;
    }
  }
  return {start:start,end:end,grossWorkTotal:round2_(gross),automaticPauseTotal:round2_(pause),workTotal:round2_(net),creditedHours:round2_(credited),total:round2_(net+credited)};
}

function getMonthData(employee, year, month, employeePin) {
  verifyEmployeePin(employee, employeePin);
  return getMonthDataInternal_(employee, year, month);
}

function sendMonthReport(employee, year, month, employeePin) {
  const report = getMonthData(employee, year, month, employeePin);
  const monthName = monthNameDE_(month);
  const subject = `Monatsstunden ${employee} - ${monthName} ${year}`;
  const body = buildMonthMail_(
    employee,
    year,
    month,
    report.rows,
    report.total,
    report.statuses
  );

  GmailApp.sendEmail(CONFIG.OFFICE_EMAIL, subject, body);

  return {
    ok: true,
    total: report.total,
    subject
  };
}

function automaticMonthlyReport() {
  const now = new Date();
  let year = Number(Utilities.formatDate(now, CONFIG.TZ, 'yyyy'));
  let month = Number(Utilities.formatDate(now, CONFIG.TZ, 'M')) - 1;

  if (month === 0) {
    month = 12;
    year--;
  }

  getEmployees().forEach(function(employee) {
    const report = getMonthDataInternal_(employee, year, month);
    if (!report.rows.length && !report.statuses.length) return;
    GmailApp.sendEmail(
      CONFIG.OFFICE_EMAIL,
      `Monatsstunden ${employee} - ${monthNameDE_(month)} ${year}`,
      buildMonthMail_(employee, year, month, report.rows, report.total, report.statuses)
    );
  });
}

function ensureMonthlyTrigger_() {
  // v21: Monatsabschluesse werden im Chefbereich aufgerufen. Alte automatische
  // Monatsmail-Trigger werden entfernt, damit keine doppelten Berichte entstehen.
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'automaticMonthlyReport') {
      ScriptApp.deleteTrigger(trigger);
    }
  });
}

function getMonthlyTargetHours_(employee, year, month, employeeRecord) {
  year = Number(year);
  month = Number(month);
  if (!(year > 0 && month >= 1 && month <= 12)) return 0;
  const rec = employeeRecord || getEmployeeRecord_(employee);
  if (!rec) return 0;
  const fields = {1:'monday',2:'tuesday',3:'wednesday',4:'thursday',5:'friday'};
  const lastDay = new Date(year, month, 0).getDate();
  let total = 0;
  for (let day = 1; day <= lastDay; day++) {
    const iso = String(year).padStart(4,'0') + '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    if (iso < PRODUCTIVE_START_DATE) continue;
    const dow = new Date(year, month - 1, day).getDay();
    if (fields[dow]) total += Number(rec[fields[dow]] || 0);
  }
  return round2_(total);
}

function getBossMonthData(employee, employeePin, year, month) {
  requireChef_(employee, employeePin);
  year = Number(year);
  month = Number(month);
  if (!(year > 0 && month >= 1 && month <= 12)) throw new Error('Ungültiger Monat.');

  const ss = getSpreadsheet_();
  ensureHolidayStatusesForYear_(ss, year);

  // PERFORMANCE: Alle benoetigten Tabellen fuer die komplette Chef-
  // Monatsuebersicht jeweils nur EINMAL lesen. Die alte Version hat fuer
  // jeden Mitarbeiter Zeiten, Status, Urlaubskonto und Tagesabschluesse
  // erneut aus Google Sheets geladen. Das war bei mehreren Mitarbeitern
  // der groesste Zeitfresser.
  const employees = getEmployeeRecords_(true);
  const employeeByName = {};
  employees.forEach(function(emp) { employeeByName[emp.name] = emp; });

  const timeSheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  const statusSheet = ss.getSheetByName(CONFIG.STATUS_SHEET);
  const closeSheet = ss.getSheetByName(CONFIG.CLOSE_SHEET);
  const vacationSheet = ensureVacationSheet_(ss);
  const adjustmentSheet = ensureAdjustmentSheet_(ss);
  const reviewedConflicts = reviewedConflictMap_(ss, year, month);
  const timeBankMaps = getTimeBankMaps_(ss, year, month);

  const timeValues = timeSheet && timeSheet.getLastRow() ? timeSheet.getDataRange().getValues() : [];
  const statusValues = statusSheet && statusSheet.getLastRow() ? statusSheet.getDataRange().getValues() : [];
  const closeValues = closeSheet && closeSheet.getLastRow() ? closeSheet.getDataRange().getValues() : [];
  const vacationValues = vacationSheet && vacationSheet.getLastRow() ? vacationSheet.getDataRange().getValues() : [];
  const adjustmentValues = adjustmentSheet && adjustmentSheet.getLastRow() ? adjustmentSheet.getDataRange().getValues() : [];

  const closedSet = {};
  for (let i = 1; i < closeValues.length; i++) {
    const n = clean_(closeValues[i][0]);
    const d = normalizeDate_(closeValues[i][1]);
    if (n && d) closedSet[n + '|' + d] = true;
  }

  const vacationEntitlement = {};
  for (let i = 1; i < vacationValues.length; i++) {
    const n = clean_(vacationValues[i][0]);
    const y = Number(vacationValues[i][1]);
    if (n && y === year) vacationEntitlement[n] = Math.max(0, Number(vacationValues[i][2]) || 0);
  }

  const adjustmentsByEmployee = {};
  employees.forEach(function(emp) { adjustmentsByEmployee[emp.name] = []; });
  for (let i = 1; i < adjustmentValues.length; i++) {
    const n = clean_(adjustmentValues[i][1]);
    const y = Number(adjustmentValues[i][2]);
    const m = Number(adjustmentValues[i][3]);
    if (!n || y !== year || m !== month || !adjustmentsByEmployee[n]) continue;
    const adjCreated = adjustmentValues[i][6] instanceof Date ? Utilities.formatDate(adjustmentValues[i][6], CONFIG.TZ, 'yyyy-MM-dd') : '';
    if (year===2026 && month===9 && adjCreated && adjCreated < PRODUCTIVE_START_DATE) continue;
    adjustmentsByEmployee[n].push({
      id:clean_(adjustmentValues[i][0]),
      hours:round2_(Number(adjustmentValues[i][4]) || 0),
      reason:clean_(adjustmentValues[i][5]),
      createdAt:adjustmentValues[i][6] instanceof Date ? Utilities.formatDate(adjustmentValues[i][6], CONFIG.TZ, 'dd.MM.yyyy HH:mm') : clean_(adjustmentValues[i][6]),
      createdBy:clean_(adjustmentValues[i][7])
    });
  }

  // Jahresstatus einmalig vorbereiten (eindeutige Tage je Status).
  const annualStatus = {};
  employees.forEach(function(emp) {
    annualStatus[emp.name] = { Urlaub:{}, Krank:{}, Feiertag:{} };
  });

  // Monatsstatus je Mitarbeiter vorbereiten.
  const monthStatuses = {};
  employees.forEach(function(emp) { monthStatuses[emp.name] = []; });
  const dayField = {1:'monday',2:'tuesday',3:'wednesday',4:'thursday',5:'friday'};

  for (let i = 1; i < statusValues.length; i++) {
    const n = clean_(statusValues[i][0]);
    const d = normalizeDate_(statusValues[i][1]);
    const st = clean_(statusValues[i][2]);
    if (!n || !d || !employeeByName[n]) continue;
    const p = d.split('-');
    const y = Number(p[0]);
    const m = Number(p[1]);

    if (y === year && annualStatus[n] && annualStatus[n][st]) {
      annualStatus[n][st][d] = true;
    }

    if (y !== year || m !== month) continue;
    if (d < PRODUCTIVE_START_DATE) continue;
    const emp = employeeByName[n];
    let credit;
    if (statusValues[i][6] === '' || statusValues[i][6] === null || statusValues[i][6] === undefined) {
      const pp = d.split('-').map(Number);
      const dow = new Date(pp[0], pp[1] - 1, pp[2]).getDay();
      credit = dayField[dow] ? Number(emp[dayField[dow]] || 0) : 0;
    } else {
      credit = Number(statusValues[i][6]) || 0;
    }
    if (st === 'Feiertag' && (emp.employmentType === 'Aushilfe' || !emp.holidayCredit)) credit = 0;
    monthStatuses[n].push({
      date:d,
      status:st,
      source:clean_(statusValues[i][4]),
      creditedHours:round2_(credit)
    });
  }

  // v22: Mitarbeit wird ueber die relationale Zuordnungstabelle aufgebaut.
  const assignmentValues = ensureAssignmentSheet_(ss).getDataRange().getValues();
  const sourceById = getSourceRowsById_(timeValues);
  const assignments = [];
  for (let i=1;i<assignmentValues.length;i++) {
    const a={id:clean_(assignmentValues[i][0]),sourceEntryId:clean_(assignmentValues[i][1]),employee:clean_(assignmentValues[i][2]),hours:Number(assignmentValues[i][3])||0,status:clean_(assignmentValues[i][4])||'Zugeordnet',createdBy:clean_(assignmentValues[i][6]),note:clean_(assignmentValues[i][9])};
    if (a.id && a.status!=='Ersetzt') assignments.push(a);
  }

  const entriesByEmployee = {};
  employees.forEach(function(emp) { entriesByEmployee[emp.name] = []; });
  for (let i=1;i<timeValues.length;i++) {
    const row=timeValues[i], d=normalizeDate_(row[2]);
    if (!d) continue;
    const p=d.split('-');
    if (Number(p[0])!==year || Number(p[1])!==month) continue;
    if (d < PRODUCTIVE_START_DATE) continue;
    const sourceEmployee=clean_(row[1]);
    if (entriesByEmployee[sourceEmployee]) {
      const own=buildOwnEntryFromRow_(row); own.closed=Boolean(closedSet[sourceEmployee+'|'+d]); entriesByEmployee[sourceEmployee].push(own);
    }
  }
  assignments.forEach(function(a) {
    const row=sourceById[a.sourceEntryId];
    if (!row || !entriesByEmployee[a.employee]) return;
    const d=normalizeDate_(row[2]), p=d.split('-');
    if (Number(p[0])!==year || Number(p[1])!==month) return;
    if (d < PRODUCTIVE_START_DATE) return;
    entriesByEmployee[a.employee].push({id:'assigned:'+a.id,assignmentId:a.id,sourceEntryId:a.sourceEntryId,employee:a.employee,date:d,customer:row[3]||'',start:normalizeTime_(row[4]),end:normalizeTime_(row[5]),hours:a.hours,activity:row[7]||'',transmittedAt:row[9]?formatDateTimeDE_(row[9]):'',transmittedDate:row[9]?formatDateDE_(normalizeDate_(row[9])):'',materialUsed:false,material:'',customerSignatureUrl:'',photoCount:0,photoUrls:'',additionalEmployeesUsed:false,additionalEmployees:[],additionalEmployeeHours:[],isAdditionalAssignment:true,assignedBy:a.createdBy||clean_(row[1]),assignmentStatus:a.status,assignmentNote:a.note,objectId:clean_(row[25]),isSupplement:false,supplementCreatedAt:'',closed:Boolean(closedSet[a.employee+'|'+d])});
  });

  const result = [];
  employees.forEach(function(emp) {
    const rows = entriesByEmployee[emp.name] || [];
    rows.sort(function(a,b){ return (a.date + ' ' + a.start).localeCompare(b.date + ' ' + b.start); });
    const statuses = monthStatuses[emp.name] || [];
    statuses.sort(function(a,b){ return a.date.localeCompare(b.date); });

    if (!rows.length && !statuses.length && !emp.active) return;

    const grossByDate = {};
    rows.forEach(function(r){grossByDate[r.date]=(grossByDate[r.date]||0)+Number(r.hours||0);});
    const workTotalGross = round2_(Object.keys(grossByDate).reduce(function(sum,d){return sum+Number(grossByDate[d]||0);},0));
    const automaticPauseTotal = round2_(Object.keys(grossByDate).reduce(function(sum,d){return sum+automaticPauseHours_(grossByDate[d]);},0));
    const workTotal = round2_(workTotalGross - automaticPauseTotal);
    const statusCredit = round2_(statuses.reduce(function(s,x){ return s + Number(x.creditedHours || 0); }, 0));
    const timeBankMonthCredit = round2_(timeBankMaps.monthCredit[emp.name]||0);
    const creditedTotal = round2_(statusCredit + timeBankMonthCredit);
    const timeBankBalance = round2_(timeBankMaps.balance[emp.name]||0);
    const adjustments = adjustmentsByEmployee[emp.name] || [];
    const adjustmentTotal = round2_(adjustments.reduce(function(sum,x){ return sum + Number(x.hours || 0); }, 0));
    const actualBeforeAdjustment = round2_(workTotal + creditedTotal);
    const actualTotal = round2_(actualBeforeAdjustment + adjustmentTotal);
    const targetTotal = getMonthlyTargetHours_(emp.name, year, month, emp);

    const dates = {};
    rows.forEach(function(r){ dates[r.date] = true; });
    const dateList = Object.keys(dates);
    const closedDays = dateList.filter(function(d){ return Boolean(closedSet[emp.name + '|' + d]); }).length;

    const a = annualStatus[emp.name] || {Urlaub:{},Krank:{},Feiertag:{}};
    const yearVacationDays = Object.keys(a.Urlaub || {}).length;
    const yearSickDays = Object.keys(a.Krank || {}).length;
    const yearHolidayDays = Object.keys(a.Feiertag || {}).length;
    const entitlement = round2_(vacationEntitlement[emp.name] || 0);

    const overlapConflicts=[];
    for (let ri=0;ri<rows.length;ri++) {
      for (let rj=ri+1;rj<rows.length;rj++) {
        if (rows[ri].date!==rows[rj].date) continue;
        if (!timesOverlap_(rows[ri].start,rows[ri].end,rows[rj].start,rows[rj].end)) continue;
        const cid=conflictId_(emp.name,rows[ri],rows[rj]);
        overlapConflicts.push({id:cid,date:rows[ri].date,first:rows[ri].customer,second:rows[rj].customer,start1:rows[ri].start,end1:rows[ri].end,start2:rows[rj].start,end2:rows[rj].end,reviewed:Boolean(reviewedConflicts[cid]),reviewedInfo:reviewedConflicts[cid]||null});
      }
    }
    const assignmentIssues=rows.filter(function(r){return r.isAdditionalAssignment && r.assignmentStatus==='Abweichung';}).map(function(r){return {date:r.date,customer:r.customer,note:r.assignmentNote||'',assignedBy:r.assignedBy||''};});
    const closure=getMonthClosureState_(ss,emp.name,year,month);

    result.push({
      employee:emp.name,
      active:emp.active,
      employmentType:emp.employmentType,
      personnelNumber:emp.personnelNumber,
      entryDate:emp.entryDate, exitDate:emp.exitDate,
      hourlyWage:emp.hourlyWage, payrollType:emp.payrollType, monthlySalary:emp.monthlySalary, payrollRelevant:emp.payrollRelevant,
      weeklyHours:emp.weeklyHours,
      targetTotal:targetTotal,
      actualTotal:actualTotal,
      actualBeforeAdjustment:actualBeforeAdjustment,
      adjustmentTotal:adjustmentTotal,
      adjustments:adjustments,
      balance:round2_(actualTotal - targetTotal),
      total:actualTotal,
      payableHours:round2_(targetTotal>0?Math.min(actualTotal,targetTotal):actualTotal),
      workTotal:workTotal,
      workTotalGross:workTotalGross,
      automaticPauseTotal:automaticPauseTotal,
      creditedTotal:creditedTotal,
      statusCredit:statusCredit,
      timeBankMonthCredit:timeBankMonthCredit,
      timeBankBalance:timeBankBalance,
      monthSurplusBanked:Boolean(timeBankMaps.monthSurplusBanked[emp.name]),
      days:dateList.length,
      closedDays:closedDays,
      openDays:dateList.length - closedDays,
      entries:rows,
      statuses:statuses,
      sickDays:statuses.filter(function(x){return x.status === 'Krank';}).length,
      vacationDays:statuses.filter(function(x){return x.status === 'Urlaub';}).length,
      holidayDays:statuses.filter(function(x){return x.status === 'Feiertag';}).length,
      compensatoryDays:statuses.filter(function(x){return x.status === 'Freizeitausgleich';}).length,
      compensatoryHours:round2_(statuses.filter(function(x){return x.status==='Freizeitausgleich';}).reduce(function(s,x){return s+Number(x.creditedHours||0);},0)),
      yearSickDays:yearSickDays,
      yearVacationDays:yearVacationDays,
      yearHolidayDays:yearHolidayDays,
      vacationEntitlement:entitlement,
      vacationRemaining:round2_(entitlement - yearVacationDays),
      overlapConflicts:overlapConflicts,
      assignmentIssues:assignmentIssues,
      closureStatus:closure.status,
      closureLast:closure.last,
      closureHistory:closure.history
    });
  });

  result.sort(function(a,b){ return a.employee.localeCompare(b.employee,'de'); });
  return result;
}


/* ===== v5.2.0 Monatsabschluss & Lohnuebergabe ===== */
function spreadsheetRetry520_(fn,label) {
  let lastError=null;
  for(let attempt=1;attempt<=4;attempt++){
    try{return fn();}catch(err){
      lastError=err;
      const msg=String(err&&err.message||err||'');
      const retryable=/timed out|Service Spreadsheets|internal error|try again|temporarily unavailable/i.test(msg);
      if(!retryable||attempt===4)throw err;
      Utilities.sleep(700*attempt*attempt);
    }
  }
  throw lastError||new Error((label||'Spreadsheet-Zugriff')+' fehlgeschlagen.');
}
function ensurePayrollSheet520_(ss,name,headers) {
  return spreadsheetRetry520_(function(){
    let sh=ss.getSheetByName(name);
    let created=false;
    if(!sh){sh=ss.insertSheet(name);created=true;SpreadsheetApp.flush();}
    const range=sh.getRange(1,1,1,headers.length);
    let needsHeader=created;
    if(!created){
      const current=range.getDisplayValues()[0];
      needsHeader=headers.some(function(h,i){return String(current[i]||'')!==String(h);});
    }
    if(needsHeader)range.setValues([headers]);
    if(sh.getFrozenRows()<1)sh.setFrozenRows(1);
    SpreadsheetApp.flush();
    return sh;
  },'Tabelle '+name);
}
function ensurePayrollReviewSheet_(ss) {
  return ensurePayrollSheet520_(ss,CONFIG.PAYROLL_REVIEW_SHEET,['Pruef-ID','Jahr','Monat','Mitarbeiter','Datum','Geprueft am','Geprueft von','Notiz']);
}
function ensurePayrollCloseSheet_(ss) {
  return ensurePayrollSheet520_(ss,CONFIG.PAYROLL_CLOSE_SHEET,['ID','Jahr','Monat','Aktion','Zeitpunkt','Durch','Grund','Fingerprint']);
}
function ensureTimeCorrectionSheet_(ss) {
  return ensurePayrollSheet520_(ss,CONFIG.TIME_CORRECTION_SHEET,['ID','Eintrag-ID','Mitarbeiter','Datum','Alt Von','Alt Bis','Alt Stunden','Neu Von','Neu Bis','Neu Stunden','Grund','Korrigiert am','Korrigiert von']);
}
function payrollReviewedMap_(ss,year,month){
  const sh=ensurePayrollReviewSheet_(ss),v=sh.getDataRange().getValues(),out={};
  for(let i=1;i<v.length;i++) if(Number(v[i][1])===Number(year)&&Number(v[i][2])===Number(month)) out[clean_(v[i][0])]={reviewedAt:formatDateTimeDE_(v[i][5]),reviewedBy:clean_(v[i][6]),note:clean_(v[i][7])};
  return out;
}
function markPayrollIssueReviewed(employee,employeePin,issueId,targetEmployee,year,month,date,note){
  requireChef_(employee,employeePin);issueId=clean_(issueId);if(!issueId)throw new Error('Pruef-ID fehlt.');
  const ss=getSpreadsheet_(),sh=ensurePayrollReviewSheet_(ss),v=sh.getDataRange().getValues();
  for(let i=1;i<v.length;i++) if(clean_(v[i][0])===issueId) return {ok:true,alreadyReviewed:true};
  sh.appendRow([issueId,Number(year),Number(month),clean_(targetEmployee),clean_(date),new Date(),clean_(employee),clean_(note)]);
  return {ok:true};
}
function payrollMonthState_(ss,year,month,fingerprint){
  const sh=ensurePayrollCloseSheet_(ss),v=sh.getDataRange().getValues(),history=[],fp=clean_(fingerprint);let last=null;
  for(let i=1;i<v.length;i++){
    if(Number(v[i][1])!==Number(year)||Number(v[i][2])!==Number(month))continue;
    const x={id:clean_(v[i][0]),action:clean_(v[i][3]),at:formatDateTimeDE_(v[i][4]),by:clean_(v[i][5]),reason:clean_(v[i][6]),fingerprint:clean_(v[i][7])};history.push(x);last=x;
  }
  let status=last?last.action:'Offen';
  if(status==='Wieder geoeffnet') status='Offen';
  const changed=Boolean(last&&['Freigegeben','Uebergeben'].includes(last.action)&&last.fingerprint&&fp&&last.fingerprint!==fp);
  return {status:changed?'Aenderung nach Abschluss':status,last:last,history:history,changedSinceApproval:changed};
}
function minijobMonthlyLimitForDate_(dateValue){
  const mw=getMinimumWageForDate_(dateValue).amount||0;
  return mw>0?Math.ceil((mw*130/3)-0.000001):0;
}
function payrollIssueId_(parts){
  const text=parts.map(function(x){return clean_(x);}).join('|');
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8);
  return 'PAY-'+Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'').slice(0,24);
}
function payrollFingerprint_(rows){
  const compact=(rows||[]).map(function(r){return {
    employee:r.employee,active:r.active,employmentType:r.employmentType,personnelNumber:r.personnelNumber,entryDate:r.entryDate,exitDate:r.exitDate,
    hourlyWage:r.hourlyWage,payrollType:r.payrollType,monthlySalary:r.monthlySalary,payrollRelevant:r.payrollRelevant,target:r.targetTotal,actual:r.actualTotal,payable:r.payableHours,
    entries:(r.entries||[]).map(function(e){return [e.id,e.date,e.start,e.end,e.hours,e.customer,e.billingStatus,e.closed];}),
    statuses:(r.statuses||[]).map(function(x){return [x.date,x.status,x.creditedHours];}),adjustments:r.adjustments||[]
  };});
  const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify(compact),Utilities.Charset.UTF_8);
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/,'');
}
function statutoryPauseMinutes_(netWorkHours){
  const h=Number(netWorkHours)||0;return h>9?45:(h>6?30:0);
}
function previousToNextRestHours_(prevEnd,nextStart){
  let a=timeToMinutes_(prevEnd),b=timeToMinutes_(nextStart);if(a===null||b===null)return null;
  let diff=(1440-a)+b;return round2_(diff/60);
}
function getClosureMap520_(ss){
  const sh=ss.getSheetByName(CONFIG.CLOSE_SHEET),out={};if(!sh||sh.getLastRow()<2)return out;
  const v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++){const emp=clean_(v[i][0]),d=normalizeDate_(v[i][1]);if(emp&&d)out[emp+'|'+d]={grossHours:Number(v[i][3])||0,pauseMinutes:Number(v[i][6])||0,netHours:Number(v[i][7])||0,closedAt:formatDateTimeDE_(v[i][2])};}return out;
}
function getMonthPayrollAudit(employee,employeePin,year,month){
  requireChef_(employee,employeePin);year=Number(year);month=Number(month);if(!(year>0&&month>=1&&month<=12))throw new Error('Ungueltiger Monat.');
  const ss=getSpreadsheet_(),rows=getBossMonthData(employee,employeePin,year,month),reviewed=payrollReviewedMap_(ss,year,month),closures=getClosureMap520_(ss),issues=[],payrollRows=[];
  const today=Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd'),lastDate=String(year)+'-'+String(month).padStart(2,'0')+'-'+String(new Date(year,month,0).getDate()).padStart(2,'0'),checkThrough=today<lastDate?today:lastDate;
  function addIssue(severity,type,r,date,title,detail,extra){
    const id=payrollIssueId_([year,month,r.employee,date,type,(extra&&extra.key)||'']);const rev=reviewed[id]||null;
    issues.push(Object.assign({id:id,severity:severity,type:type,employee:r.employee,date:date||'',title:title,detail:detail||'',reviewed:Boolean(rev),reviewedInfo:rev},extra||{}));
  }
  rows.forEach(function(r){
    const rec=getEmployeeRecord_(r.employee)||{};
    const byDate={},statusByDate={};(r.entries||[]).forEach(function(e){(byDate[e.date]||(byDate[e.date]=[])).push(e);});(r.statuses||[]).forEach(function(st){statusByDate[st.date]=st;});
    Object.keys(byDate).sort().forEach(function(d){
      const es=byDate[d],gross=round2_(es.reduce(function(a,e){return a+Number(e.hours||0);},0)),net=netWorkHours_(gross),closure=closures[r.employee+'|'+d];
      if(net>10.0001)addIssue('error','daily_over_10',r,d,'Mehr als 10 Stunden Arbeitszeit','Netto-Arbeitszeit '+formatHours_(net)+' Std. (Bruttozeit '+formatHours_(gross)+' Std.).');
      else if(net>8.0001)addIssue('warn','daily_over_8',r,d,'Mehr als 8 Stunden Arbeitszeit','Netto-Arbeitszeit '+formatHours_(net)+' Std.');
      if(!closure)addIssue('error','day_not_closed',r,d,'Tagesabschluss fehlt','Für diesen Arbeitstag wurde kein Tagesabschluss gefunden.');
      else {const req=statutoryPauseMinutes_(net);if(req>0&&Number(closure.pauseMinutes||0)<req)addIssue('error','pause_short',r,d,'Pause zu kurz','Erfasst '+Number(closure.pauseMinutes||0)+' Min.; erforderlich mindestens '+req+' Min.');}
      const st=statusByDate[d];if(st&&st.status&&st.status!=='Arbeiten')addIssue(st.status==='Feiertag'?'warn':'error','work_and_status',r,d,'Arbeitszeit und '+st.status+' am selben Tag','Es sind '+formatHours_(net)+' Arbeitsstunden erfasst und der Tag ist zugleich als '+st.status+' markiert.');
      if(rec.entryDate&&d<rec.entryDate)addIssue('error','before_entry',r,d,'Arbeitszeit vor Eintrittsdatum','Eintrittsdatum: '+formatDateDE_(rec.entryDate)+'.');
      if(rec.exitDate&&d>rec.exitDate)addIssue('error','after_exit',r,d,'Arbeitszeit nach Austrittsdatum','Austrittsdatum: '+formatDateDE_(rec.exitDate)+'.');
      if(rec.active===false)addIssue('warn','inactive_time',r,d,'Arbeitszeit bei inaktivem Mitarbeiter','Mitarbeiter ist aktuell als inaktiv gekennzeichnet.');
      es.forEach(function(e){const sm=timeToMinutes_(e.start),em=timeToMinutes_(e.end);if(!(Number(e.hours)>0)||sm===null||em===null)addIssue('error','invalid_entry',r,d,'Unplausibler Zeiteintrag',(e.customer||'Ohne Kunde')+' · '+(e.start||'?')+'–'+(e.end||'?')+' · '+formatHours_(e.hours)+' Std.',{entryId:e.id,start:e.start,end:e.end,customer:e.customer,key:e.id});});
      for(let i=0;i<es.length;i++)for(let j=i+1;j<es.length;j++)if(normalizedCustomerKey_(es[i].customer)===normalizedCustomerKey_(es[j].customer)&&es[i].start===es[j].start&&es[i].end===es[j].end){addIssue('warn','duplicate_entry',r,d,'Möglicher Doppeleintrag',(es[i].customer||'Ohne Kunde')+' · '+es[i].start+'–'+es[i].end,{entryId:es[j].id,start:es[j].start,end:es[j].end,customer:es[j].customer,key:es[i].id+'|'+es[j].id});}
      const target=weekdayHoursForDate_(r.employee,d);if(d<=checkThrough&&!st&&target>0&&Math.abs(net-target)>2.5)addIssue('warn','target_deviation',r,d,'Starke Abweichung von Tages-Soll','Soll '+formatHours_(target)+' Std. · Ist '+formatHours_(net)+' Std.');
    });
    // Vergessene Arbeitstage erkennen: nur bis heute, nur innerhalb des Beschäftigungszeitraums,
    // und nur wenn weder Arbeitszeit noch bezahlter Tagesstatus vorhanden ist.
    const firstDate=String(year)+'-'+String(month).padStart(2,'0')+'-01',lastCheck=checkThrough;
    for(let day=1;day<=new Date(year,month,0).getDate();day++){
      const d=String(year)+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
      if(d<PRODUCTIVE_START_DATE||d<firstDate||d>lastCheck)continue;
      if(rec.entryDate&&d<rec.entryDate)continue;if(rec.exitDate&&d>rec.exitDate)continue;
      const target=weekdayHoursForDate_(r.employee,d);if(!(target>0))continue;
      if(!byDate[d]&&!statusByDate[d])addIssue('error','missing_workday',r,d,'Arbeitstag ohne Stunden oder Abwesenheit','Für diesen Soll-Arbeitstag ('+formatHours_(target)+' Std.) fehlen Arbeitszeit und Tagesstatus.');
    }
    (r.overlapConflicts||[]).forEach(function(c){if(!c.reviewed)addIssue('error','overlap',r,c.date,'Überschneidende Uhrzeiten',c.first+' '+c.start1+'–'+c.end1+' / '+c.second+' '+c.start2+'–'+c.end2,{key:c.id});});
    const dates=Object.keys(byDate).sort();for(let i=1;i<dates.length;i++){
      const prev=byDate[dates[i-1]].slice().sort(function(a,b){return (a.end||'').localeCompare(b.end||'');}).pop(),next=byDate[dates[i]].slice().sort(function(a,b){return (a.start||'').localeCompare(b.start||'');})[0];
      const rest=previousToNextRestHours_(prev&&prev.end,next&&next.start);if(rest!==null&&rest<11)addIssue('warn','rest_under_11',r,dates[i],'Ruhezeit unter 11 Stunden','Zwischen '+formatDateDE_(dates[i-1])+' '+(prev.end||'?')+' und '+formatDateDE_(dates[i])+' '+(next.start||'?')+' liegen nur '+formatHours_(rest)+' Std.');
    }
    if(r.payrollRelevant!==false){
      if(!r.employmentType)addIssue('error','master_employment',r,'','Beschäftigungsart fehlt','Bitte Mitarbeiter-Stammdaten ergänzen.');
      if(r.payrollType==='Festgehalt'&&!(Number(r.monthlySalary)>0))addIssue('error','master_salary',r,'','Monatsgehalt fehlt','Für Festgehalt muss ein Brutto-Monatsgehalt hinterlegt sein.');
      if((r.payrollType||'Stundenlohn')==='Stundenlohn'&&r.employmentType!=='Azubi'&&!(Number(r.hourlyWage)>0))addIssue('error','master_wage',r,'','Stundenlohn fehlt','Bitte Brutto-Stundenlohn hinterlegen.');
    }
    const grossEstimate=r.payrollRelevant===false?0:(r.payrollType==='Festgehalt'?Number(r.monthlySalary||0):round2_(Number(r.payableHours||0)*Number(r.hourlyWage||0)));
    const minijobLimit=minijobMonthlyLimitForDate_(String(year)+'-'+String(month).padStart(2,'0')+'-01');
    if(r.employmentType==='Minijob'&&grossEstimate>minijobLimit+0.001)addIssue('error','minijob_limit',r,'','Minijob-Grenze überschritten','Rechnerisch '+grossEstimate.toFixed(2).replace('.',',')+' EUR bei Monatsgrenze '+minijobLimit.toFixed(2).replace('.',',')+' EUR.');
    payrollRows.push({employee:r.employee,personnelNumber:r.personnelNumber||'',employmentType:r.employmentType||'',payrollType:r.payrollType||'Stundenlohn',payrollRelevant:r.payrollRelevant!==false,hourlyWage:Number(r.hourlyWage)||0,monthlySalary:Number(r.monthlySalary)||0,targetHours:Number(r.targetTotal)||0,actualHours:Number(r.actualTotal)||0,workHours:Number(r.workTotal)||0,payrollHours:Number(r.payableHours)||0,grossEstimate:round2_(grossEstimate),vacationDays:Number(r.vacationDays)||0,sickDays:Number(r.sickDays)||0,compensatoryHours:Number(r.compensatoryHours)||0,timeBankBalance:Number(r.timeBankBalance)||0,monthClosure:r.closureStatus||'Offen',minijobLimit:minijobLimit});
  });
  issues.sort(function(a,b){const rank={error:0,warn:1,info:2};return (rank[a.severity]-rank[b.severity])||(a.employee+a.date+a.type).localeCompare(b.employee+b.date+b.type,'de');});
  const openErrors=issues.filter(function(x){return x.severity==='error';}).length,openWarnings=issues.filter(function(x){return x.severity==='warn'&&!x.reviewed;}).length,reviewedWarnings=issues.filter(function(x){return x.severity==='warn'&&x.reviewed;}).length;
  const fingerprint=payrollFingerprint_(rows),state=payrollMonthState_(ss,year,month,fingerprint),dueDate=String(year)+'-'+String(month).padStart(2,'0')+'-20';
  return {year:year,month:month,dueDate:dueDate,checkThrough:checkThrough,summary:{errors:openErrors,warnings:openWarnings,reviewedWarnings:reviewedWarnings,totalIssues:issues.length,employees:payrollRows.length},issues:issues,payrollRows:payrollRows,fingerprint:fingerprint,state:state,canRelease:openErrors===0&&openWarnings===0};
}
function setPayrollMonthStatus(employee,employeePin,year,month,action,reason){
  requireChef_(employee,employeePin);year=Number(year);month=Number(month);action=clean_(action);reason=clean_(reason);
  if(!['Freigegeben','Uebergeben','Wieder geoeffnet'].includes(action))throw new Error('Ungueltige Lohnabschluss-Aktion.');
  const audit=getMonthPayrollAudit(employee,employeePin,year,month),ss=getSpreadsheet_(),sh=ensurePayrollCloseSheet_(ss);
  if(action==='Freigegeben'&&!audit.canRelease)throw new Error('Monat kann noch nicht freigegeben werden: offene Fehler oder ungeprüfte Hinweise vorhanden.');
  if(action==='Uebergeben'){
    if(audit.state.changedSinceApproval)throw new Error('Daten wurden nach der Freigabe geändert. Bitte Monatsprüfung erneut durchführen.');
    if(!audit.state.last||audit.state.last.action!=='Freigegeben')throw new Error('Bitte Monat zuerst freigeben.');
  }
  if(action==='Wieder geoeffnet'&&!reason)throw new Error('Bitte einen Grund für die Wiederöffnung angeben.');
  sh.appendRow([Utilities.getUuid(),year,month,action,new Date(),clean_(employee),reason,audit.fingerprint]);
  return payrollMonthState_(ss,year,month,audit.fingerprint);
}
function hoursBetweenTimes520_(start,end){let a=timeToMinutes_(start),b=timeToMinutes_(end);if(a===null||b===null||a===b)throw new Error('Von/Bis-Zeit ist ungültig.');if(b<a)b+=1440;const h=round2_((b-a)/60);if(!(h>0&&h<=24))throw new Error('Zeitspanne ist ungültig.');return h;}
function recalcClosedDay520_(ss,targetEmployee,date){
  const info=getDayClosureInfo_(ss,targetEmployee,date);if(!info.closed)return;
  const entries=getEntriesForEmployee_(ss,targetEmployee,date),grossWork=round2_(entries.reduce(function(s,e){return s+Number(e.hours||0);},0)),pause=automaticPauseHours_(grossWork),st=getStatusInfo_(ss,targetEmployee,date),credit=st.status==='Arbeiten'?0:Number(st.creditedHours||0),gross=round2_(grossWork+credit),net=round2_(netWorkHours_(grossWork)+credit),sh=ss.getSheetByName(CONFIG.CLOSE_SHEET);
  sh.getRange(info.row,4).setValue(gross);sh.getRange(info.row,7).setValue(Math.round(pause*60));sh.getRange(info.row,8).setValue(net);sh.getRange(info.row,9).setValue(new Date());sh.getRange(info.row,10).setValue('Büro-Zeitkorrektur');
}
function updateBossDayEntry(employee,employeePin,targetEmployee,date,entryId,start,end,reason){
  requireChef_(employee,employeePin);targetEmployee=clean_(targetEmployee);date=clean_(date);entryId=clean_(entryId);start=normalizeTime_(start);end=normalizeTime_(end);reason=clean_(reason);
  if(!reason)throw new Error('Bitte einen Grund für die Korrektur eintragen.');
  if(entryId.indexOf('assigned:')===0)throw new Error('Mitarbeit-Zuordnungen können hier nicht direkt korrigiert werden. Bitte den Quellbericht prüfen.');
  const hours=hoursBetweenTimes520_(start,end),ss=getSpreadsheet_(),sh=ss.getSheetByName(CONFIG.TIME_SHEET),v=sh.getDataRange().getValues();let row=0,old=null;
  for(let i=1;i<v.length;i++)if(clean_(v[i][0])===entryId){row=i+1;old=v[i];break;}
  if(!row||!old)throw new Error('Eintrag wurde nicht gefunden.');
  if(clean_(old[1])!==targetEmployee||normalizeDate_(old[2])!==date)throw new Error('Eintrag gehört nicht zu Mitarbeiter/Datum.');
  const wasBilled=(clean_(old[22])||'Offen')==='Abgerechnet';
  const oldStart=normalizeTime_(old[4]),oldEnd=normalizeTime_(old[5]),oldHours=Number(old[6])||0;
  sh.getRange(row,5,1,3).setValues([[start,end,hours]]);
  ensureTimeCorrectionSheet_(ss).appendRow([Utilities.getUuid(),entryId,targetEmployee,date,oldStart,oldEnd,oldHours,start,end,hours,(wasBilled?'ABGERECHNETER EINTRAG KORRIGIERT: ':'')+reason,new Date(),clean_(employee)]);
  recalcClosedDay520_(ss,targetEmployee,date);
  try{CacheService.getScriptCache().remove('DG51_DAY_'+dg51SafeCacheKey_(targetEmployee)+'_'+dg51SafeCacheKey_(date));}catch(_e){}
  try{CacheService.getScriptCache().remove('DG51_DASH_'+dg51SafeCacheKey_(clean_(employee)));}catch(_e){}
  SpreadsheetApp.flush();
  return {ok:true,entryId:entryId,employee:targetEmployee,date:date,start:start,end:end,hours:hours,wasBilled:wasBilled};
}

function canAccessChef_(employee) {
  const record = getEmployeeRecord_(clean_(employee));
  return Boolean(record && record.active && record.chefAccess);
}

function isDayClosed_(ss, employee, date) {
  const sheet = ss.getSheetByName(CONFIG.CLOSE_SHEET);
  const values = sheet.getDataRange().getValues();

  for (let i = 1; i < values.length; i++) {
    if (
      String(values[i][0]) === String(employee) &&
      normalizeDate_(values[i][1]) === date
    ) {
      return true;
    }
  }

  return false;
}

function saveSignature_(employee, date, dataUrl) {
  const base64 = String(dataUrl).split(',')[1];

  if (!base64) {
    throw new Error('Unterschrift konnte nicht verarbeitet werden.');
  }

  const bytes = Utilities.base64Decode(base64);
  if (bytes.length < 250) {
    throw new Error('Die Unterschrift scheint leer zu sein.');
  }

  const fileName =
    'Mitarbeiterunterschrift_' +
    safeFilePart_(employee) +
    '_' +
    date +
    '.png';

  const blob = Utilities.newBlob(bytes, 'image/png', fileName);
  return ensureSignatureFolder_().createFile(blob);
}

function saveCustomerSignature_(employee, date, customer, dataUrl) {
  const base64 = String(dataUrl).split(',')[1];

  if (!base64) {
    throw new Error('Kundenunterschrift konnte nicht verarbeitet werden.');
  }

  const bytes = Utilities.base64Decode(base64);

  if (bytes.length < 250) {
    throw new Error('Die Kundenunterschrift scheint leer zu sein.');
  }

  const fileName =
    'Kundenunterschrift_' +
    safeFilePart_(employee) +
    '_' +
    safeFilePart_(customer) +
    '_' +
    date +
    '.png';

  const blob = Utilities.newBlob(bytes, 'image/png', fileName);
  return ensureSignatureFolder_().createFile(blob);
}

function saveJobPhotos_(employee, date, customer, photos) {
  if (!Array.isArray(photos) || !photos.length) return [];
  const folder = ensurePhotoFolder_();
  return photos.map(function(photo, index) {
    const dataUrl = clean_(photo && photo.dataUrl ? photo.dataUrl : photo);
    const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/);
    if (!match) throw new Error('Ein Auftragsbild konnte nicht verarbeitet werden.');
    const bytes = Utilities.base64Decode(match[2]);
    if (bytes.length > 3 * 1024 * 1024) throw new Error('Ein Auftragsbild ist zu groß.');
    const ext = match[1].indexOf('png') >= 0 ? 'png' : 'jpg';
    const name = 'Auftragsbild_' + safeFilePart_(employee) + '_' + safeFilePart_(customer) + '_' + date + '_' + (index + 1) + '.' + ext;
    return folder.createFile(Utilities.newBlob(bytes, match[1], name));
  });
}

function ensurePhotoFolder_(){return fixedFolder3_('PHOTO_FOLDER_ID',CONFIG.PHOTO_FOLDER);}

function ensureSignatureFolder_(){return fixedFolder3_('SIGNATURE_FOLDER_ID',CONFIG.SIGNATURE_FOLDER); }

function createCalendarEvent_(data) {
  const start = combineDateTime_(data.date, data.start);
  let end = combineDateTime_(data.date, data.end);

  if (end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  const title =
    'Arbeitszeit - ' +
    clean_(data.customer) +
    ' (' +
    clean_(data.employee) +
    ')';

  const description =
    'Stunden: ' +
    data.hours +
    '\nAusgeführte Tätigkeit: ' +
    clean_(data.activity);

  const calendar = getEmployeeCalendar_(clean_(data.employee));

  return calendar
    .createEvent(
      title,
      start,
      end,
      { description: description }
    )
    .getId();
}

function getEmployeeCalendar_(employee) {
  const record = getEmployeeRecord_(employee);
  const calendarId = record ? clean_(record.calendarId) : '';
  if (!calendarId) throw new Error('Für diesen Mitarbeiter ist kein Google Kalender hinterlegt.');
  const calendar = CalendarApp.getCalendarById(calendarId);
  if (!calendar) throw new Error('Der Google Kalender des Mitarbeiters konnte nicht geöffnet werden.');
  return calendar;
}

function getEmployeeCalendarEvents(employee, employeePin, startDate, days) {
  verifyEmployeePin(employee, employeePin);

  startDate = clean_(startDate);
  days = Math.max(1, Math.min(3, Number(days) || 3));
  if (!validDate3_(startDate)) throw new Error('Ungültiges Startdatum.');

  const parts = startDate.split('-').map(Number);
  const rangeStart = new Date(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0);
  const rangeEnd = new Date(rangeStart.getTime() + days * 24 * 60 * 60 * 1000);
  const calendar = getEmployeeCalendar_(employee);
  const events = calendar.getEvents(rangeStart, rangeEnd);

  // Nur einmal die Zeittabelle lesen und bereits uebernommene/erledigte
  // Kalendertermine herausfiltern.
  const ss = getSpreadsheet_();
  const timeSheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  const values = timeSheet && timeSheet.getLastRow() >= 2 ? timeSheet.getDataRange().getValues() : [];
  const completedIds = {};
  const completedFallback = {};
  for (let i = 1; i < values.length; i++) {
    if (clean_(values[i][1]) !== clean_(employee)) continue;
    const d = normalizeDate_(values[i][2]);
    if (!d || d < startDate) continue;
    const sourceId = clean_(values[i][21]);
    if (sourceId) completedIds[sourceId] = true;
    completedFallback[d + '|' + normalizedCustomerKey_(values[i][3])] = true;
  }

  // 6.0.1: Auch abgeschlossene Besichtigungstermine aus dem Angebotsbereich
  // gelten als erledigt. Sie erzeugen keinen Zeiteintrag und waren deshalb bisher
  // nach der Uebertragung weiterhin unter "Meine Termine" sichtbar.
  const inspectionSheet = ss.getSheetByName('AnfrageAngebote');
  if (inspectionSheet && inspectionSheet.getLastRow() >= 2) {
    const inspectionRows = inspectionSheet.getDataRange().getValues();
    for (let i = 1; i < inspectionRows.length; i++) {
      const eventId = clean_(inspectionRows[i][11]);
      const inspectionStatus = clean_(inspectionRows[i][8]);
      if (eventId && inspectionStatus !== 'Verworfen') completedIds[eventId] = true;
    }
  }

  return events.map(function(event) {
    const start = event.getStartTime();
    const end = event.getEndTime();
    const item = {
      id: event.getId(),
      title: clean_(event.getTitle()).replace(/^🔧 WARTUNG ·\s*/i,''),
      location: clean_(event.getLocation()),
      description: clean_(event.getDescription()),
      maintenance: plannerTypeFromDescription_(event.getDescription()) === 'Wartung' || /^🔧 WARTUNG ·/i.test(clean_(event.getTitle())),
      startDate: Utilities.formatDate(start, CONFIG.TZ, 'yyyy-MM-dd'),
      startTime: Utilities.formatDate(start, CONFIG.TZ, 'HH:mm'),
      endTime: Utilities.formatDate(end, CONFIG.TZ, 'HH:mm'),
      allDay: event.isAllDayEvent()
    };
    const customerText = item.title + (item.location ? ' - ' + item.location : '');
    const dgMarker = plannerMarkerId_(event.getDescription());
    // DG-Termine immer ueber ihre eindeutige Kalender-ID abgleichen. Der alte
    // Kunden/Tag-Fallback darf einen neuen zweiten Termin am selben Tag nicht ausblenden.
    item.completed = Boolean(completedIds[item.id] || (!dgMarker && completedFallback[item.startDate + '|' + normalizedCustomerKey_(customerText)]));
    return item;
  }).filter(function(item) {
    // Erledigte Termine verschwinden aus der normalen Mitarbeiterliste.
    return !item.completed;
  }).sort(function(a, b) {
    return (a.startDate + ' ' + a.startTime).localeCompare(b.startDate + ' ' + b.startTime);
  });
}

function getChefEmployeeMonthData(employee, employeePin, targetEmployee, year, month) {
  requireChef_(employee, employeePin);
  targetEmployee = clean_(targetEmployee);
  year = Number(year); month = Number(month);
  if (!getEmployeeRecord_(targetEmployee)) throw new Error('Mitarbeiter nicht gefunden.');
  const data = getMonthDataInternal_(targetEmployee, year, month);
  const ss = getSpreadsheet_();
  const closeSheet = ss.getSheetByName(CONFIG.CLOSE_SHEET);
  const dayClosures = [];
  if (closeSheet && closeSheet.getLastRow() >= 2) {
    const v = closeSheet.getDataRange().getValues();
    for (let i = 1; i < v.length; i++) {
      if (clean_(v[i][0]) !== targetEmployee) continue;
      const d = normalizeDate_(v[i][1]); const p = d.split('-');
      if (Number(p[0]) !== year || Number(p[1]) !== month) continue;
      dayClosures.push({date:d,closedAt:formatDateTimeDE_(v[i][2]),grossHours:Number(v[i][3])||0,signatureUrl:clean_(v[i][5]),pauseMinutes:Number(v[i][6])||0,netHours:Number(v[i][7])||0});
    }
  }
  dayClosures.sort(function(a,b){return a.date.localeCompare(b.date);});
  return Object.assign({ employee: targetEmployee, dayClosures: dayClosures }, data);
}

function ensureRegieMergeSheet_(ss) {
  let sheet = ss.getSheetByName(CONFIG.REGIE_MERGE_SHEET);
  if (!sheet) sheet = ss.insertSheet(CONFIG.REGIE_MERGE_SHEET);
  const headers = ['Objekt-ID','Merge-ID','Zusammengeführt am','Zusammengeführt von'];
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  } else {
    sheet.getRange(1,1,1,headers.length).setValues([headers]);
  }
  return sheet;
}

function getRegieMergeMap_(ss) {
  const sheet = ensureRegieMergeSheet_(ss);
  const map = {};
  if (sheet.getLastRow() < 2) return map;
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    const objectId = clean_(values[i][0]);
    const mergeId = clean_(values[i][1]);
    if (objectId && mergeId) map[objectId] = mergeId;
  }
  return map;
}

function mergeRegieObjects(employee, employeePin, objectIds) {
  requireChef_(employee, employeePin);
  const input = Array.isArray(objectIds) ? objectIds : String(objectIds || '').split(',');
  let ids = Array.from(new Set(input.map(clean_).filter(Boolean)));
  if (ids.length < 2) throw new Error('Bitte mindestens zwei offene Regieberichte auswählen.');

  const ss = getSpreadsheet_();
  ensureObjectIds_(ss);
  const timeSheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  const values = timeSheet.getDataRange().getValues();
  const openIds = {};
  for (let i = 1; i < values.length; i++) {
    const status = clean_(values[i][22]) || 'Offen';
    const objectId = clean_(values[i][25]);
    if (status === 'Offen' && objectId) openIds[objectId] = true;
  }
  ids = ids.filter(function(id){ return openIds[id]; });
  if (ids.length < 2) throw new Error('Mindestens zwei der ausgewählten Objekte müssen offene Regieberichte enthalten.');

  const mergeSheet = ensureRegieMergeSheet_(ss);
  const mergeValues = mergeSheet.getDataRange().getValues();
  const relatedMergeIds = {};
  for (let i = 1; i < mergeValues.length; i++) {
    const objectId = clean_(mergeValues[i][0]);
    const mergeId = clean_(mergeValues[i][1]);
    if (ids.indexOf(objectId) >= 0 && mergeId) relatedMergeIds[mergeId] = true;
  }
  if (Object.keys(relatedMergeIds).length) {
    for (let i = 1; i < mergeValues.length; i++) {
      const objectId = clean_(mergeValues[i][0]);
      const mergeId = clean_(mergeValues[i][1]);
      if (mergeId && relatedMergeIds[mergeId]) ids.push(objectId);
    }
    ids = Array.from(new Set(ids.filter(Boolean)));
  }

  const mergeId = 'RM-' + Utilities.getUuid();
  const now = new Date();
  const by = clean_(employee);
  const rowByObject = {};
  for (let i = 1; i < mergeValues.length; i++) {
    const objectId = clean_(mergeValues[i][0]);
    if (objectId) rowByObject[objectId] = i + 1;
  }
  ids.forEach(function(objectId) {
    if (rowByObject[objectId]) {
      mergeSheet.getRange(rowByObject[objectId], 1, 1, 4).setValues([[objectId, mergeId, now, by]]);
    } else {
      mergeSheet.appendRow([objectId, mergeId, now, by]);
    }
  });
  return {ok:true, mergeId:mergeId, objectIds:ids, count:ids.length, mergedBy:by, mergedAt:formatDateTimeDE_(now)};
}

function getBossDayClosures(employee, employeePin, year, month) {
  requireChef_(employee, employeePin);
  year=Number(year); month=Number(month);
  if(!(year>0 && month>=1 && month<=12)) throw new Error('Ungültiger Monat.');

  // Gleiche Datenbasis wie die Chef-Monatsübersicht verwenden, damit eigene
  // Einträge und Mitarbeit/Zuordnungen identisch ausgewertet werden.
  const monthRows=getBossMonthData(employee, employeePin, year, month) || [];
  return monthRows.map(function(emp){
    const byDate={};
    (emp.entries||[]).forEach(function(entry){
      const d=clean_(entry.date);
      if(!d) return;
      if(!byDate[d]) byDate[d]={date:d,hours:0,entryCount:0,closed:true,reports:[]};
      byDate[d].hours += Number(entry.hours)||0;
      byDate[d].entryCount++;
      if(!entry.closed) byDate[d].closed=false;
      byDate[d].reports.push({
        id:clean_(entry.id),
        customer:clean_(entry.customer),
        start:clean_(entry.start),
        end:clean_(entry.end),
        hours:round2_(Number(entry.hours)||0),
        activity:clean_(entry.activity),
        transmittedAt:clean_(entry.transmittedAt),
        materialUsed:Boolean(entry.materialUsed),
        material:clean_(entry.material),
        billingStatus:clean_(entry.billingStatus)||'Offen',
        isAdditionalAssignment:Boolean(entry.isAdditionalAssignment),
        assignedBy:clean_(entry.assignedBy),
        assignmentStatus:clean_(entry.assignmentStatus),
        isSupplement:Boolean(entry.isSupplement),
        supplementCreatedAt:clean_(entry.supplementCreatedAt)
      });
    });
    const ss=getSpreadsheet_();
    const days=Object.keys(byDate).sort().map(function(d){
      const gross=round2_(byDate[d].hours);
      const pause=automaticPauseHours_(gross);
      byDate[d].grossHours=gross;
      byDate[d].pauseHours=pause;
      byDate[d].hours=netWorkHours_(gross);
      byDate[d].status=getDayStatus_(ss,emp.employee,d)||'Arbeiten';
      byDate[d].reports.sort(function(a,b){return (a.start||'').localeCompare(b.start||'');});
      return byDate[d];
    });
    return {employee:emp.employee,active:emp.active!==false,days:days};
  }).filter(function(emp){return emp.days.length>0;});
}

function deleteBossDayEntry(employee, employeePin, targetEmployee, date, entryId, reason) {
  requireChef_(employee, employeePin);
  targetEmployee=clean_(targetEmployee); date=clean_(date); entryId=clean_(entryId); reason=clean_(reason);
  if(!targetEmployee || !getEmployeeRecord_(targetEmployee)) throw new Error('Mitarbeiter wurde nicht gefunden.');
  if(!validDate3_(date)) throw new Error('Ungültiges Datum.');
  if(!entryId) throw new Error('Eintrag-ID fehlt.');
  if(!reason) throw new Error('Bitte einen Grund für das Entfernen des Eintrags angeben.');

  const ss=getSpreadsheet_();
  const timeSheet=ss.getSheetByName(CONFIG.TIME_SHEET);
  if(!timeSheet) throw new Error('Zeiterfassung wurde nicht gefunden.');
  const timeValues=timeSheet.getDataRange().getValues();
  const affectedEmployees={}; affectedEmployees[targetEmployee]=true;
  let deletedHours=0, customer='', sourceEntryId='', deletedType='Eigener Eintrag', wasBilled=false, oldStart='', oldEnd='';

  if(entryId.indexOf('assigned:')===0) {
    const assignmentId=entryId.slice('assigned:'.length);
    const assignmentSheet=ensureAssignmentSheet_(ss), av=assignmentSheet.getDataRange().getValues();
    let row=0, assignment=null;
    for(let i=1;i<av.length;i++) if(clean_(av[i][0])===assignmentId){row=i+1;assignment=av[i];break;}
    if(!row||!assignment) throw new Error('Mitarbeit-Eintrag wurde nicht gefunden.');
    if(clean_(assignment[2])!==targetEmployee) throw new Error('Dieser Mitarbeit-Eintrag gehört nicht zum ausgewählten Mitarbeiter.');
    sourceEntryId=clean_(assignment[1]); deletedHours=Number(assignment[3])||0; deletedType='Mitarbeit';
    let sourceRow=null;
    for(let i=1;i<timeValues.length;i++) if(clean_(timeValues[i][0])===sourceEntryId){sourceRow=timeValues[i];break;}
    if(!sourceRow) throw new Error('Quell-Regiebericht wurde nicht gefunden.');
    if(normalizeDate_(sourceRow[2])!==date) throw new Error('Datum des Mitarbeit-Eintrags stimmt nicht überein.');
    wasBilled=(clean_(sourceRow[22])||'Offen')==='Abgerechnet';
    customer=clean_(sourceRow[3]); oldStart=normalizeTime_(sourceRow[4]); oldEnd=normalizeTime_(sourceRow[5]);
    assignmentSheet.deleteRow(row);
  } else {
    let row=0, sourceRow=null;
    for(let i=1;i<timeValues.length;i++) if(clean_(timeValues[i][0])===entryId){row=i+1;sourceRow=timeValues[i];break;}
    if(!row||!sourceRow) throw new Error('Eintrag wurde nicht gefunden.');
    if(clean_(sourceRow[1])!==targetEmployee || normalizeDate_(sourceRow[2])!==date) throw new Error('Eintrag gehört nicht zum ausgewählten Mitarbeiter bzw. Tag.');
    wasBilled=(clean_(sourceRow[22])||'Offen')==='Abgerechnet';
    deletedHours=Number(sourceRow[6])||0; customer=clean_(sourceRow[3]); sourceEntryId=entryId; oldStart=normalizeTime_(sourceRow[4]); oldEnd=normalizeTime_(sourceRow[5]);
    getAssignmentRecords_(ss).forEach(function(a){if(a.sourceEntryId===entryId && assignmentIsActive_(a) && a.employee) affectedEmployees[a.employee]=true;});
    cleanupAssignmentsForDeletedEntry_(ss,entryId);
    timeSheet.deleteRow(row);
  }

  ensureTimeCorrectionSheet_(ss).appendRow([Utilities.getUuid(),entryId,targetEmployee,date,oldStart,oldEnd,deletedHours,'','',0,(wasBilled?'ABGERECHNETER EINTRAG GELÖSCHT: ':'GELÖSCHT: ')+reason,new Date(),clean_(employee)]);
  SpreadsheetApp.flush();
  Object.keys(affectedEmployees).forEach(function(emp){
    syncClosedDayTotals_(ss,emp,date,'Büro: Fehleintrag gelöscht · '+reason);
    try{CacheService.getScriptCache().remove('DG51_DAY_'+dg51SafeCacheKey_(emp)+'_'+dg51SafeCacheKey_(date));}catch(_e){}
  });
  try{CacheService.getScriptCache().remove('DG51_DASH_'+dg51SafeCacheKey_(clean_(employee)));}catch(_e){}
  SpreadsheetApp.flush();
  return {ok:true,id:entryId,sourceEntryId:sourceEntryId,employee:targetEmployee,date:date,customer:customer,hours:round2_(deletedHours),type:deletedType,affectedEmployees:Object.keys(affectedEmployees),deletedBy:clean_(employee),deletedAt:formatDateTimeDE_(new Date()),reason:reason,wasBilled:wasBilled};
}

function manualCloseBossDay(employee, employeePin, targetEmployee, date) {
  requireChef_(employee, employeePin);
  targetEmployee=clean_(targetEmployee); date=clean_(date);
  if(!targetEmployee || !getEmployeeRecord_(targetEmployee)) throw new Error('Mitarbeiter wurde nicht gefunden.');
  if(!validDate3_(date)) throw new Error('Ungültiges Datum.');

  const ss=getSpreadsheet_();
  if(isDayClosed_(ss,targetEmployee,date)) return {ok:true,alreadyClosed:true,employee:targetEmployee,date:date};

  // Arbeitsstunden aus eigenen Eintraegen und aktiven Mitarbeit-Zuordnungen ermitteln.
  const parts=date.split('-').map(Number);
  const monthRows=getBossMonthData(employee, employeePin, parts[0], parts[1]);
  const empRow=(monthRows||[]).filter(function(x){return clean_(x.employee)===targetEmployee;})[0];
  const dayEntries=empRow ? (empRow.entries||[]).filter(function(x){return clean_(x.date)===date;}) : [];
  if(!dayEntries.length) throw new Error('Für diesen Mitarbeiter sind an diesem Tag keine Arbeitszeiten vorhanden.');
  const grossTotal=round2_(dayEntries.reduce(function(sum,x){return sum+Number(x.hours||0);},0));
  const pauseHours=automaticPauseHours_(grossTotal);
  const total=netWorkHours_(grossTotal);

  const closeSheet=ss.getSheetByName(CONFIG.CLOSE_SHEET);
  closeSheet.appendRow([targetEmployee,date,new Date(),grossTotal,'Büro: manueller Abschluss durch '+clean_(employee),'',Math.round(pauseHours*60),total]);

  // Eigene Zeitzeilen ebenfalls als abgeschlossen markieren. Zugeordnete Mitarbeit
  // wird ueber den Tagesabschluss des Zielmitarbeiters abgedeckt.
  const timeSheet=ss.getSheetByName(CONFIG.TIME_SHEET);
  const values=timeSheet.getDataRange().getValues();
  for(let i=1;i<values.length;i++) {
    if(clean_(values[i][1])===targetEmployee && normalizeDate_(values[i][2])===date) timeSheet.getRange(i+1,11).setValue(true);
  }
  SpreadsheetApp.flush();
  return {ok:true,alreadyClosed:false,employee:targetEmployee,date:date,total:total,closedBy:clean_(employee),closedAt:formatDateTimeDE_(new Date())};
}

function syncClosedDayTotals_(ss, employee, date, reason) {
  employee = clean_(employee); date = clean_(date);
  if (!employee || !validDate3_(date)) return false;
  const closure = getDayClosureInfo_(ss, employee, date);
  if (!closure.closed || !closure.row) return false;
  const entries = getEntriesForEmployee_(ss, employee, date);
  const gross = round2_(entries.reduce(function(sum,x){return sum + Number(x.hours||0);},0));
  const pause = automaticPauseHours_(gross);
  const net = netWorkHours_(gross);
  const sh = ss.getSheetByName(CONFIG.CLOSE_SHEET);
  sh.getRange(closure.row,4).setValue(gross);
  sh.getRange(closure.row,7).setValue(Math.round(pause*60));
  sh.getRange(closure.row,8).setValue(net);
  sh.getRange(closure.row,9).setValue(new Date());
  sh.getRange(closure.row,10).setValue(clean_(reason)||'Büro-Korrektur');
  return true;
}

function updateRegieReport(employee, employeePin, entryId, item) {
  requireChef_(employee, employeePin);
  entryId=clean_(entryId); item=item||{};
  if(!entryId) throw new Error('Regiebericht-ID fehlt.');
  const date=clean_(item.date), customer=clean_(item.customer), start=clean_(item.start), end=clean_(item.end), activity=clean_(item.activity);
  const materialUsed=Boolean(item.materialUsed), material=clean_(item.material), jobStatus=clean_(item.jobStatus)||'Abgeschlossen';
  if(!validDate3_(date)||!customer||!start||!end||!activity) throw new Error('Bitte alle Pflichtfelder prüfen.');
  if(!['Laufend','Abgeschlossen'].includes(jobStatus)) throw new Error('Ungültiger Auftragsstatus.');
  let startMinutes=timeToMinutes_(start), endMinutes=timeToMinutes_(end);
  if(startMinutes===null||endMinutes===null) throw new Error('Von-/Bis-Zeit ist ungültig.');
  if(endMinutes===startMinutes) throw new Error('Von- und Bis-Zeit dürfen nicht identisch sein.');
  if(endMinutes<startMinutes) endMinutes+=1440; // Nachteinsatz über Mitternacht zulassen.
  const hours=round2_((endMinutes-startMinutes)/60);
  if(!(hours>0&&hours<24)) throw new Error('Die Arbeitszeit muss größer 0 und kleiner als 24 Stunden sein.');
  const ss=getSpreadsheet_(); ensureObjectIds_(ss);
  const sh=ss.getSheetByName(CONFIG.TIME_SHEET), values=sh.getDataRange().getValues();
  let row=0;
  for(let i=1;i<values.length;i++) if(clean_(values[i][0])===entryId){row=i+1;break;}
  if(!row) throw new Error('Regiebericht wurde nicht gefunden.');
  const sourceEmployee=clean_(values[row-1][1]);
  const oldDate=normalizeDate_(values[row-1][2]);
  const oldCustomer=clean_(values[row-1][3]);
  let objectId=clean_(values[row-1][25]);
  if(!objectId || objectKey_(oldCustomer)!==objectKey_(customer)) objectId=getOrCreateObjectId_(ss,customer);
  sh.getRange(row,3).setValue(date);
  sh.getRange(row,4).setValue(customer);
  sh.getRange(row,5).setValue(normalizeTime_(start));
  sh.getRange(row,6).setValue(normalizeTime_(end));
  sh.getRange(row,7).setValue(hours);
  sh.getRange(row,8).setValue(activity);
  sh.getRange(row,11).setValue(isDayClosed_(ss,sourceEmployee,date));
  sh.getRange(row,12).setValue(materialUsed?'Ja':'Nein');
  sh.getRange(row,13).setValue(materialUsed?material:'');
  sh.getRange(row,26).setValue(objectId);
  sh.getRange(row,27).setValue(jobStatus);
  // Falls ein bereits abgeschlossener Tag korrigiert wurde, gespeicherte Summen sofort nachziehen.
  syncClosedDayTotals_(ss,sourceEmployee,oldDate,'Büro: Regiebericht korrigiert');
  if(date!==oldDate) syncClosedDayTotals_(ss,sourceEmployee,date,'Büro: Regiebericht verschoben/korrigiert');
  SpreadsheetApp.flush();
  return {ok:true,id:entryId,hours:hours,objectId:objectId,jobStatus:jobStatus,changedBy:clean_(employee),changedAt:formatDateTimeDE_(new Date())};
}


// 5.2.0.4: Reparatur und konsistente Behandlung zusammengefuehrter Regieberichte.
function dg5204RepairKnownMergeCorruption_(ss) {
  const props = PropertiesService.getScriptProperties();
  if (props.getProperty('DG5204_REGIE_MERGE_REPAIR') === '1') return;
  const sh = ensureRegieMergeSheet_(ss);
  if (!sh || sh.getLastRow() < 2) { props.setProperty('DG5204_REGIE_MERGE_REPAIR','1'); return; }
  const target = {
    'OBJ-4a3256ea-8dff-4ca8-9145-81f07d664b22':'RM-FIX-AQON-KRAUTER-20260916',
    'OBJ-e6a1d897-b3d4-4939-9960-31d7df5a2547':'RM-FIX-AQON-KRAUTER-20260916',
    'OBJ-fe3ba0dd-9998-438a-9c2f-44fa71f926e1':'RM-FIX-FICHTNER-20260916',
    'OBJ-e61b9f20-9032-44dc-8806-252f2c31af57':'RM-FIX-FICHTNER-20260916'
  };
  const values = sh.getDataRange().getValues();
  for (let i=1;i<values.length;i++) {
    const objectId = clean_(values[i][0]);
    const mergeId = target[objectId];
    if (!mergeId || clean_(values[i][1]) === mergeId) continue;
    sh.getRange(i+1,2).setValue(mergeId);
  }
  SpreadsheetApp.flush();
  props.setProperty('DG5204_REGIE_MERGE_REPAIR','1');
}

function dg5204ExpandedObjectIds_(ss, objectIds) {
  dg5204RepairKnownMergeCorruption_(ss);
  const ids = Array.from(new Set((objectIds || []).map(clean_).filter(Boolean)));
  const mergeMap = getRegieMergeMap_(ss);
  const mergeIds = {};
  ids.forEach(function(id){ const m=clean_(mergeMap[id]); if(m) mergeIds[m]=true; });
  Object.keys(mergeMap).forEach(function(id){ if(mergeIds[clean_(mergeMap[id])]) ids.push(id); });
  return Array.from(new Set(ids));
}

function dg5204RegieBaseKey_(mergeMap, objectId) {
  const mergeId = clean_(mergeMap[objectId]);
  return mergeId ? ('MERGE|' + mergeId) : ('OBJECT|' + objectId);
}

function getRegieReports(employee, employeePin, status, year, month) {
  requireChef_(employee, employeePin);
  status = clean_(status) || 'Offen';
  year = Number(year) || 0;
  month = Number(month) || 0;
  if (!['Offen','Abgerechnet'].includes(status)) throw new Error('Ungültiger Regiebericht-Status.');

  const ss = getSpreadsheet_();
  ensureObjectIds_(ss);
  dg5204RepairKnownMergeCorruption_(ss);
  const sheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getDataRange().getValues();
  const mergeMap = getRegieMergeMap_(ss);
  const groups = {};
  const active = {};
  const excludedJobStates = ['Angebot zu erstellen','Offenes Angebot','Angebot Angenommen','Angebot Abgelehnt','Verworfen'];

  // Fuer laufende/abgeschlossene Arbeitsauftraege bestimmt immer der neueste OFFENE
  // Bericht den aktuellen Auftragsstatus. Bereits abgerechnete Vortage bleiben dadurch
  // Bestandteil derselben Kundenkarte, verschwinden aber nicht aus dem Abrechnungsarchiv.
  if (status === 'Offen') {
    for (let i=1;i<values.length;i++) {
      const row=values[i], date=normalizeDate_(row[2]);
      if (!date) continue;
      const p=date.split('-');
      if (year && Number(p[0]) !== year) continue;
      if (month && Number(p[1]) !== month) continue;
      if ((clean_(row[22]) || 'Offen') !== 'Offen') continue;
      const rowJobStatus=clean_(row[26]) || 'Abgeschlossen';
      if (excludedJobStates.includes(rowJobStatus)) continue;
      const objectId=clean_(row[25]) || getOrCreateObjectId_(ss,clean_(row[3]));
      if (!objectId) continue;
      const baseKey=dg5204RegieBaseKey_(mergeMap,objectId);
      const sortKey=date+' '+normalizeTime_(row[4])+' '+String(i).padStart(6,'0');
      if (!active[baseKey] || sortKey >= active[baseKey].sortKey) {
        active[baseKey]={jobStatus:rowJobStatus,sortKey:sortKey};
      }
    }
  }

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const date = normalizeDate_(row[2]);
    if (!date) continue;
    const p = date.split('-');
    if (year && Number(p[0]) !== year) continue;
    if (month && Number(p[1]) !== month) continue;

    const rowStatus = clean_(row[22]) || 'Offen';
    const objectId = clean_(row[25]) || getOrCreateObjectId_(ss, clean_(row[3]));
    if (!objectId) continue;
    const manualMergeId = mergeMap[objectId] || '';
    const baseKey = dg5204RegieBaseKey_(mergeMap, objectId);
    const rowJobStatus = clean_(row[26]) || 'Abgeschlossen';
    if (excludedJobStates.includes(rowJobStatus)) continue;

    let groupJobStatus = rowJobStatus;
    if (status === 'Offen') {
      if (!active[baseKey]) continue;
      groupJobStatus = active[baseKey].jobStatus;
    } else {
      if (rowStatus !== 'Abgerechnet') continue;
    }

    const key = baseKey + '|JOB|' + groupJobStatus;
    if (!groups[key]) groups[key] = {
      objectId: objectId,
      customer: clean_(row[3]),
      status: status,
      jobStatus: groupJobStatus,
      totalHours: 0,
      reportCount: 0,
      employeesMap: {},
      objectIdsMap: {},
      reports: [],
      firstDate: date,
      lastDate: date,
      billedAt: '',
      billedBy: '',
      mergeId: manualMergeId,
      customerNamesMap: {}
    };
    const g = groups[key];
    if (clean_(row[3])) g.customerNamesMap[clean_(row[3])] = true;
    g.totalHours += Number(row[6]) || 0;
    g.reportCount++;
    g.employeesMap[clean_(row[1])] = true;
    if (objectId) g.objectIdsMap[objectId] = true;
    if (date < g.firstDate) g.firstDate = date;
    if (date > g.lastDate) g.lastDate = date;
    if (row[23]) g.billedAt = formatDateTimeDE_(row[23]);
    if (clean_(row[24])) g.billedBy = clean_(row[24]);
    g.reports.push({
      id: clean_(row[0]), employee: clean_(row[1]), date: date,
      customer: clean_(row[3]), start: normalizeTime_(row[4]), end: normalizeTime_(row[5]),
      hours: Number(row[6]) || 0, activity: clean_(row[7]),
      transmittedAt: row[9] ? formatDateTimeDE_(row[9]) : '',
      materialUsed: clean_(row[11]) === 'Ja', material: clean_(row[12]),
      customerSignatureUrl: clean_(row[14]), photoCount: Number(row[15]) || 0,
      photoFileIds: clean_(row[16]), photoUrls: clean_(row[17]), status: rowStatus,
      objectId: objectId, jobStatus: rowJobStatus,
      isSupplement: clean_(row[27]) === 'Ja', supplementCreatedAt: row[28] ? formatDateTimeDE_(row[28]) : '',
      maintenance: clean_(row[32]) === 'Ja', nextMaintenanceDue: maintenanceMonth37_(row[33]),
      billedAt: row[23] ? formatDateTimeDE_(row[23]) : '', billedBy: clean_(row[24])
    });
  }

  const out = Object.keys(groups).map(function(key) {
    const g = groups[key];
    g.totalHours = round2_(g.totalHours);
    g.employees = Object.keys(g.employeesMap).filter(Boolean).sort();
    g.objectIds = Object.keys(g.objectIdsMap).filter(Boolean);
    const customerNames = Object.keys(g.customerNamesMap).filter(Boolean);
    if (customerNames.length > 1) g.customer = customerNames.join(' / ');
    delete g.customerNamesMap;
    delete g.employeesMap;
    delete g.objectIdsMap;
    g.reports.sort(function(a,b){ return (a.date+' '+a.start).localeCompare(b.date+' '+b.start); });
    return g;
  });
  out.sort(function(a,b) {
    return status === 'Offen' ? a.firstDate.localeCompare(b.firstDate) : b.lastDate.localeCompare(a.lastDate);
  });
  return out;
}

function markRegieReportBilled(employee, employeePin, entryId) {
  requireChef_(employee, employeePin);
  entryId = clean_(entryId);
  if (!entryId) throw new Error('Auftrags-ID fehlt.');
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (clean_(values[i][0]) !== entryId) continue;
    sheet.getRange(i + 1, 23, 1, 3).setValues([['Abgerechnet', new Date(), clean_(employee)]]);
    return { ok:true, id:entryId, billedBy:clean_(employee), billedAt:formatDateTimeDE_(new Date()) };
  }
  throw new Error('Regiebericht wurde nicht gefunden.');
}

function setRegieObjectJobStatus(employee, employeePin, objectId, jobStatus) {
  requireChef_(employee, employeePin);
  objectId = clean_(objectId);
  jobStatus = clean_(jobStatus);
  if (!objectId) throw new Error('Objekt-ID fehlt.');
  if (!['Laufend','Abgeschlossen'].includes(jobStatus)) throw new Error('Ungültiger Auftragsstatus.');
  const ss = getSpreadsheet_();
  ensureObjectIds_(ss);
  const ids = dg5204ExpandedObjectIds_(ss,[objectId]);
  const sheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  const values = sheet.getDataRange().getValues();
  let count = 0, matched = 0;
  for (let i = 1; i < values.length; i++) {
    if (!ids.includes(clean_(values[i][25]))) continue;
    if ((clean_(values[i][22]) || 'Offen') !== 'Offen') continue;
    matched++;
    if ((clean_(values[i][26]) || 'Abgeschlossen') === jobStatus) continue;
    sheet.getRange(i + 1, 27).setValue(jobStatus);
    count++;
  }
  if (!matched) throw new Error('Für dieses Objekt wurden keine passenden offenen Regieberichte zum Ändern gefunden.');
  SpreadsheetApp.flush();
  return {ok:true,objectId:objectId,objectIds:ids,jobStatus:jobStatus,count:count,changedBy:clean_(employee),changedAt:formatDateTimeDE_(new Date())};
}

function markRegieObjectCompleted(employee, employeePin, objectId) {
  return setRegieObjectJobStatus(employee, employeePin, objectId, 'Abgeschlossen');
}

function offerStatuses_() {
  return ['Angebot zu erstellen','Offenes Angebot','Angebot Angenommen','Angebot Abgelehnt'];
}

function setRegieReportsOfferStatus(employee, employeePin, entryIds, offerStatus, offerId) {
  requireChef_(employee, employeePin);
  offerStatus = clean_(offerStatus);
  if (!offerStatuses_().includes(offerStatus)) throw new Error('Ungueltiger Angebotsstatus.');
  const fromInquiry=setInquiryOffer3_(employee,clean_(offerId),offerStatus);if(fromInquiry)return fromInquiry;
  const ids = Array.from(new Set((entryIds || []).map(clean_).filter(Boolean)));
  if (!ids.length && !clean_(offerId)) throw new Error('Regiebericht- oder Angebots-ID fehlt.');
  const ss = getSpreadsheet_();
  const sh = ss.getSheetByName(CONFIG.TIME_SHEET);
  const v = sh.getDataRange().getValues();
  const wantedOfferId = clean_(offerId);
  const finalOfferId = wantedOfferId || ('ANG-' + Utilities.getUuid());
  let count = 0;
  for (let i=1;i<v.length;i++) {
    const rowEntryId = clean_(v[i][0]);
    const rowOfferId = clean_(v[i][29]);
    const match = wantedOfferId ? rowOfferId === wantedOfferId : ids.includes(rowEntryId);
    if (!match) continue;
    if ((clean_(v[i][22]) || 'Offen') !== 'Offen') continue;
    sh.getRange(i+1,27).setValue(offerStatus);
    sh.getRange(i+1,30,1,3).setValues([[finalOfferId,new Date(),clean_(employee)]]);
    count++;
  }
  if (!count) throw new Error('Keine passenden offenen Berichte fuer den Angebotsstatus gefunden.');
  if (offerStatus==='Angebot Angenommen') closeOpenReminderByOfferId_(employee,finalOfferId,'Angenommen - Archiv');
  if (offerStatus==='Angebot Abgelehnt') closeOpenReminderByOfferId_(employee,finalOfferId,'Kein Auftrag');
  SpreadsheetApp.flush();
  return {ok:true,offerId:finalOfferId,status:offerStatus,count:count,changedAt:formatDateTimeDE_(new Date()),changedBy:clean_(employee)};
}

function createInspectionOffer(employee,employeePin,item){
  requireChef_(employee,employeePin);item=item||{};
  const customer=clean_(item.customer),hours=Number(item.hours),date=normalizeDate_(item.date)||Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd');
  if(!customer)throw new Error('Kundenname fehlt.');
  if(![0.5,1,1.5,2,2.5,3].includes(hours))throw new Error('Zeitaufwand muss zwischen 0,5 und 3,0 Std. im 30-Minuten-Takt liegen.');
  const event=item.event||{},sourceCalendarEventId=clean_(item.sourceCalendarEventId||event.id||''),now=new Date();
  const location=clean_(event.location),phone=clean_(event.phone),email=clean_(event.email),eventDescription=clean_(event.description);
  const sh=ensureInquiryOfferSheet_();

  // 6.0.1: Ein Besichtigungstermin darf nur einmal in den Angebotsbereich gelangen.
  // Bei erneutem Tippen/Reload wird der bereits vorhandene Vorgang zurueckgegeben.
  if(sourceCalendarEventId && sh.getLastRow()>=2){
    const existing=sh.getDataRange().getValues();
    for(let i=1;i<existing.length;i++){
      if(clean_(existing[i][11])===sourceCalendarEventId && clean_(existing[i][8])!=='Verworfen'){
        return {ok:true,offerId:clean_(existing[i][0]),status:'Angebot zu erstellen',customer:clean_(existing[i][2])||customer,date:date,hours:hours,vehicleUsed:true,existing:true,transferredAt:existing[i][7]?formatDateTimeDE_(existing[i][7]):'',transferredBy:clean_(existing[i][10])};
      }
    }
  }

  const offerId='BES-'+Utilities.getUuid().slice(0,12);
  const transferred='Übertragen von: '+clean_(employee)+' · '+formatDateTimeDE_(now)+' · Zeitaufwand: '+formatHours_(hours)+' Std. · Fahrzeugeinsatz: Ja';
  const details=[
    'Besichtigungstermin',
    location&&('Adresse: '+location),
    eventDescription&&('Termininformation: '+eventDescription),
    transferred
  ].filter(Boolean).join(' · ');
  sh.appendRow([offerId,'',customer,phone,email,details,'Besichtigung',now,'Zu erstellen',now,clean_(employee),sourceCalendarEventId]);
  return {ok:true,offerId:offerId,status:'Angebot zu erstellen',customer:customer,date:date,hours:hours,vehicleUsed:true,sourceCalendarEventId:sourceCalendarEventId,transferredAt:formatDateTimeDE_(now),transferredBy:clean_(employee)};
}

function getOfferReports(employee, employeePin, stage) {
  requireChef_(employee, employeePin);
  stage = clean_(stage) || 'Zu erstellen';
  const allowed = {
    'Zu erstellen':['Angebot zu erstellen'],
    'Offen':['Offenes Angebot'],
    'Archiv':['Angebot Angenommen','Angebot Abgelehnt']
  };
  if (!allowed[stage]) throw new Error('Ungueltiger Angebotsbereich.');
  const ss=getSpreadsheet_(), sh=ss.getSheetByName(CONFIG.TIME_SHEET);
  if (!sh || sh.getLastRow()<2) return inquiryOfferGroups3_(stage);
  const v=sh.getDataRange().getValues(), groups={};
  for (let i=1;i<v.length;i++) {
    const st=clean_(v[i][26])||'Abgeschlossen';
    if (!allowed[stage].includes(st)) continue;
    const offerId=clean_(v[i][29]);
    if (!offerId) continue;
    const date=normalizeDate_(v[i][2]);
    if (!groups[offerId]) groups[offerId]={offerId:offerId,status:st,customer:clean_(v[i][3]),objectId:clean_(v[i][25]),totalHours:0,reportCount:0,employeesMap:{},reports:[],firstDate:date,lastDate:date,changedAt:v[i][30]?formatDateTimeDE_(v[i][30]):'',changedBy:clean_(v[i][31])};
    const g=groups[offerId];
    g.totalHours+=Number(v[i][6])||0;g.reportCount++;g.employeesMap[clean_(v[i][1])]=true;
    if(date&&(!g.firstDate||date<g.firstDate))g.firstDate=date;if(date&&(!g.lastDate||date>g.lastDate))g.lastDate=date;
    if(v[i][30])g.changedAt=formatDateTimeDE_(v[i][30]);if(clean_(v[i][31]))g.changedBy=clean_(v[i][31]);
    g.reports.push({id:clean_(v[i][0]),employee:clean_(v[i][1]),date:date,customer:clean_(v[i][3]),start:normalizeTime_(v[i][4]),end:normalizeTime_(v[i][5]),hours:Number(v[i][6])||0,activity:clean_(v[i][7]),transmittedAt:v[i][9]?formatDateTimeDE_(v[i][9]):'',materialUsed:clean_(v[i][11])==='Ja',material:clean_(v[i][12]),customerSignatureUrl:clean_(v[i][14]),photoCount:Number(v[i][15])||0,photoFileIds:clean_(v[i][16]),photoUrls:clean_(v[i][17]),offerStatus:st});
  }
  const out=Object.keys(groups).map(function(k){const g=groups[k];g.totalHours=round2_(g.totalHours);g.employees=Object.keys(g.employeesMap).filter(Boolean).sort();delete g.employeesMap;g.reports.sort(function(a,b){return (a.date+' '+a.start).localeCompare(b.date+' '+b.start);});return g;});
  out.sort(function(a,b){return stage==='Archiv'?(b.lastDate||'').localeCompare(a.lastDate||''):(a.firstDate||'').localeCompare(b.firstDate||'');});
  return out.concat(inquiryOfferGroups3_(stage));
}

function discardOfferPermanently(employee, employeePin, offerId) {
  requireChef_(employee, employeePin);
  offerId=clean_(offerId);if(!offerId)throw new Error('Angebots-ID fehlt.');
  const ss=getSpreadsheet_(),sh=ss.getSheetByName(CONFIG.TIME_SHEET),v=sh.getDataRange().getValues();let count=0;
  for(let i=1;i<v.length;i++){
    if(clean_(v[i][29])!==offerId)continue;
    const st=clean_(v[i][26]);
    if(st!=='Angebot zu erstellen')throw new Error('Nur noch nicht erstellte Angebote koennen ueber „Auftrag loeschen“ entfernt werden.');
    // Auftrag aus Regie-/Angebotsverwaltung entfernen, Arbeitszeit aber aus Nachweisgruenden erhalten.
    sh.getRange(i+1,27).setValue('Verworfen');
    sh.getRange(i+1,30,1,3).clearContent();
    count++;
  }
  if(!count)throw new Error('Auftrag wurde nicht gefunden.');
  SpreadsheetApp.flush();
  return {ok:true,count:count};
}

function ensureInternalNotesSheet_() {
  const ss=getSpreadsheet_();
  let sh=ss.getSheetByName('InterneVermerke');
  if(!sh){sh=ss.insertSheet('InterneVermerke');sh.appendRow(['Objekt-ID','Vermerk','Geaendert am','Geaendert von']);sh.setFrozenRows(1);}
  return sh;
}

function getObjectInternalNote(employee,employeePin,objectId){
  requireChef_(employee,employeePin);objectId=clean_(objectId);if(!objectId)throw new Error('Objekt-ID fehlt.');
  const sh=ensureInternalNotesSheet_(),v=sh.getDataRange().getValues();
  for(let i=1;i<v.length;i++)if(clean_(v[i][0])===objectId)return {objectId:objectId,note:clean_(v[i][1]),changedAt:v[i][2]?formatDateTimeDE_(v[i][2]):'',changedBy:clean_(v[i][3])};
  return {objectId:objectId,note:'',changedAt:'',changedBy:''};
}

function getObjectInternalNotes(employee,employeePin,objectIds){
  requireChef_(employee,employeePin);objectIds=Array.isArray(objectIds)?objectIds.map(clean_).filter(Boolean):[];
  const wanted={};objectIds.forEach(function(id){wanted[id]=true;});
  const out={},sh=ensureInternalNotesSheet_(),v=sh.getDataRange().getValues();
  for(let i=1;i<v.length;i++){const id=clean_(v[i][0]);if(wanted[id])out[id]={objectId:id,note:clean_(v[i][1]),changedAt:v[i][2]?formatDateTimeDE_(v[i][2]):'',changedBy:clean_(v[i][3])};}
  objectIds.forEach(function(id){if(!out[id])out[id]={objectId:id,note:'',changedAt:'',changedBy:''};});
  return out;
}

function saveObjectInternalNote(employee,employeePin,objectId,note){
  requireChef_(employee,employeePin);objectId=clean_(objectId);if(!objectId)throw new Error('Objekt-ID fehlt.');note=String(note==null?'':note).trim();
  const sh=ensureInternalNotesSheet_(),v=sh.getDataRange().getValues(),now=new Date(),by=clean_(employee);
  for(let i=1;i<v.length;i++)if(clean_(v[i][0])===objectId){sh.getRange(i+1,1,1,4).setValues([[objectId,note,now,by]]);return {ok:true,objectId:objectId,note:note,changedAt:formatDateTimeDE_(now),changedBy:by};}
  sh.appendRow([objectId,note,now,by]);return {ok:true,objectId:objectId,note:note,changedAt:formatDateTimeDE_(now),changedBy:by};
}

function acceptOfferAsRunning(employee,employeePin,offerId){
  requireChef_(employee,employeePin);offerId=clean_(offerId);if(!offerId)throw new Error('Angebots-ID fehlt.');
  const ss=getSpreadsheet_(),sh=ss.getSheetByName(CONFIG.TIME_SHEET),v=sh.getDataRange().getValues();
  const rows=[];let totalHours=0;
  for(let i=1;i<v.length;i++){
    if(clean_(v[i][29])!==offerId)continue;
    const st=clean_(v[i][26]);
    if(st!=='Offenes Angebot'&&st!=='Angebot Angenommen')continue;
    rows.push(i+1);totalHours+=Number(v[i][6])||0;
  }
  if(!rows.length)throw new Error('Offenes Angebot wurde nicht gefunden.');
  // Wichtig: erst pruefen, dann schreiben. So entsteht bei 0 Stunden kein Teilzustand.
  if(totalHours<=0)throw new Error('Zu diesem Angebot ist noch keine Arbeitszeit erfasst. Es kann daher nicht als laufender Auftrag uebernommen werden.');
  rows.forEach(function(row){sh.getRange(row,27).setValue('Laufend');sh.getRange(row,30,1,3).clearContent();});
  closeOpenReminderByOfferId_(employee,offerId,'Angenommen - Laufender Auftrag');
  SpreadsheetApp.flush();return {ok:true,count:rows.length,totalHours:round2_(totalHours)};
}

function ensureOfferReminderSheet_() {
  const ss=getSpreadsheet_();
  let sh=ss.getSheetByName('AngebotsReminder');
  const headers=['Reminder-ID','Angebots-ID','Kundenname','Angebotsnummer','Telefon','E-Mail','Auftragsbeschreibung','Erstellt am','Faellig am','Status','Ergebnis','Geaendert am','Geaendert von'];
  if(!sh){sh=ss.insertSheet('AngebotsReminder');sh.appendRow(headers);sh.setFrozenRows(1);} else sh.getRange(1,1,1,headers.length).setValues([headers]);
  return sh;
}

function reminderDueDateFromDays_(days){const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()+Math.max(0,Number(days)||0));return d;}

function findReminderRow_(sh, reminderId){const v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(clean_(v[i][0])===clean_(reminderId))return {row:i+1,values:v[i]};return null;}

function findReminderByOfferId_(sh, offerId){const v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(clean_(v[i][1])===clean_(offerId))return {row:i+1,values:v[i]};return null;}

function getOfferTotalHoursById_(offerId){const ss=getSpreadsheet_(),sh=ss.getSheetByName(CONFIG.TIME_SHEET);if(!sh||sh.getLastRow()<2)return 0;const v=sh.getDataRange().getValues();let h=0;for(let i=1;i<v.length;i++)if(clean_(v[i][29])===clean_(offerId))h+=Number(v[i][6])||0;return round2_(h);}

function saveOfferCreatedWithReminder(employee,employeePin,offerId,item){
  requireChef_(employee,employeePin);offerId=clean_(offerId);item=item||{};if(!offerId)throw new Error('Angebots-ID fehlt.');
  const customer=clean_(item.customer),offerNumber=clean_(item.offerNumber),phone=clean_(item.phone),email=clean_(item.email),description=clean_(item.description);
  const reminderDays=Math.max(1,Math.min(90,Number(item.reminderDays)||5));
  if(!customer)throw new Error('Kundenname fehlt.');if(!offerNumber)throw new Error('Angebotsnummer fehlt.');
  setRegieReportsOfferStatus(employee,employeePin,[],'Offenes Angebot',offerId);
  const sh=ensureOfferReminderSheet_(),now=new Date(),due=reminderDueDateFromDays_(reminderDays),existing=findReminderByOfferId_(sh,offerId),rid=existing?clean_(existing.values[0]):('REM-'+Utilities.getUuid());
  const row=[rid,offerId,customer,offerNumber,phone,email,description,now,due,'Offen','',now,clean_(employee)];
  if(existing)sh.getRange(existing.row,1,1,row.length).setValues([row]);else sh.appendRow(row);
  try{CacheService.getScriptCache().remove('DG51_DASH_'+dg51SafeCacheKey_(clean_(employee)));}catch(_e){}
  return {ok:true,reminderId:rid,offerId:offerId,dueDate:Utilities.formatDate(due,CONFIG.TZ,'yyyy-MM-dd'),reminderDays:reminderDays};
}

function moveOfferBackToCreate(employee,employeePin,offerId){
  requireChef_(employee,employeePin);offerId=clean_(offerId);if(!offerId)throw new Error('Angebots-ID fehlt.');
  const result=setRegieReportsOfferStatus(employee,employeePin,[],'Angebot zu erstellen',offerId);
  closeOpenReminderByOfferId_(employee,offerId,'Zurück zu Angebote zu erstellen');
  try{CacheService.getScriptCache().remove('DG51_DASH_'+dg51SafeCacheKey_(clean_(employee)));}catch(_e){}
  return {ok:true,offerId:offerId,count:Number(result&&result.count||0),status:'Angebot zu erstellen'};
}

function getOfferReminders(employee,employeePin,includeDone){
  requireChef_(employee,employeePin);const sh=ensureOfferReminderSheet_(),v=sh.getDataRange().getValues(),today=Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd'),out=[];
  for(let i=1;i<v.length;i++){
    const status=clean_(v[i][9])||'Offen';if(!includeDone&&status!=='Offen')continue;const due=normalizeDate_(v[i][8]);
    out.push({id:clean_(v[i][0]),offerId:clean_(v[i][1]),customer:clean_(v[i][2]),offerNumber:clean_(v[i][3]),phone:clean_(v[i][4]),email:clean_(v[i][5]),description:clean_(v[i][6]),createdAt:v[i][7]?formatDateTimeDE_(v[i][7]):'',dueDate:due,status:status,result:clean_(v[i][10]),changedAt:v[i][11]?formatDateTimeDE_(v[i][11]):'',changedBy:clean_(v[i][12]),isDue:!!due&&due<=today,isOverdue:!!due&&due<today,totalHours:getOfferTotalHoursById_(clean_(v[i][1]))});
  }
  out.sort(function(a,b){if(a.status!==b.status)return a.status==='Offen'?-1:1;if(a.dueDate!==b.dueDate)return String(a.dueDate).localeCompare(String(b.dueDate));return a.customer.localeCompare(b.customer,'de');});return out;
}

function rescheduleOfferReminder(employee,employeePin,reminderId,days,dueDate){
  requireChef_(employee,employeePin);const sh=ensureOfferReminderSheet_(),rec=findReminderRow_(sh,reminderId);if(!rec)throw new Error('Reminder wurde nicht gefunden.');if(clean_(rec.values[9])!=='Offen')throw new Error('Reminder ist bereits erledigt.');
  let due=null;const fixed=normalizeDate_(dueDate);if(fixed){const today=Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd');if(fixed<today)throw new Error('Das Reminder-Datum darf nicht in der Vergangenheit liegen.');const p=fixed.split('-').map(Number);due=new Date(p[0],p[1]-1,p[2],12,0,0,0);}else due=reminderDueDateFromDays_(Math.max(1,Number(days)||5));
  sh.getRange(rec.row,9).setValue(due);sh.getRange(rec.row,12,1,2).setValues([[new Date(),clean_(employee)]]);return {ok:true,dueDate:Utilities.formatDate(due,CONFIG.TZ,'yyyy-MM-dd')};
}

function markReminderResult_(employee,reminderId,result){const sh=ensureOfferReminderSheet_(),rec=findReminderRow_(sh,reminderId);if(!rec)throw new Error('Reminder wurde nicht gefunden.');sh.getRange(rec.row,10,1,4).setValues([['Erledigt',clean_(result),new Date(),clean_(employee)]]);return rec;}

function closeOpenReminderByOfferId_(employee,offerId,result){
  offerId=clean_(offerId);if(!offerId)return false;const sh=ensureOfferReminderSheet_(),v=sh.getDataRange().getValues();let changed=false;
  for(let i=1;i<v.length;i++){if(clean_(v[i][1])!==offerId)continue;if((clean_(v[i][9])||'Offen')!=='Offen')continue;sh.getRange(i+1,10,1,4).setValues([['Erledigt',clean_(result),new Date(),clean_(employee)]]);changed=true;}
  return changed;
}

function declineOfferFromReminder(employee,employeePin,reminderId){requireChef_(employee,employeePin);const sh=ensureOfferReminderSheet_(),rec=findReminderRow_(sh,reminderId);if(!rec)throw new Error('Reminder wurde nicht gefunden.');const offerId=clean_(rec.values[1]);setRegieReportsOfferStatus(employee,employeePin,[],'Angebot Abgelehnt',offerId);markReminderResult_(employee,reminderId,'Kein Auftrag');return {ok:true,offerId:offerId};}

function acceptOfferFromReminder(employee,employeePin,reminderId,asRunning){requireChef_(employee,employeePin);const sh=ensureOfferReminderSheet_(),rec=findReminderRow_(sh,reminderId);if(!rec)throw new Error('Reminder wurde nicht gefunden.');const offerId=clean_(rec.values[1]),hours=getOfferTotalHoursById_(offerId);if(asRunning){if(!(hours>0))throw new Error('Noch keine Arbeitszeit vorhanden.');acceptOfferAsRunning(employee,employeePin,offerId);}else setRegieReportsOfferStatus(employee,employeePin,[],'Angebot Angenommen',offerId);markReminderResult_(employee,reminderId,asRunning?'Angenommen - Laufender Auftrag':'Angenommen - Archiv');return {ok:true,offerId:offerId,totalHours:hours,asRunning:Boolean(asRunning)};}

function getOfferStatistics(employee,pin){requireChef_(employee,pin);const ids={},months={};['Offen','Archiv'].forEach(stage=>getOfferReports(employee,pin,stage).forEach(r=>ids[r.offerId]={status:r.status,date:r.firstDate}));getOfferReminders(employee,pin,true).forEach(r=>{if(!ids[r.offerId]){const m=(r.createdAt||'').match(/(\d{2})\.(\d{2})\.(\d{4})/);ids[r.offerId]={date:m?m[3]+'-'+m[2]+'-'+m[1]:'',status:(r.result||'').indexOf('Angenommen')===0?'Angebot Angenommen':r.result==='Kein Auftrag'?'Angebot Abgelehnt':'Offenes Angebot'};}});let open=0,accepted=0,declined=0;Object.values(ids).forEach(r=>{const a=r.status==='Angebot Angenommen',d=r.status==='Angebot Abgelehnt';if(a)accepted++;else if(d)declined++;else open++;const k=(r.date||'').slice(0,7);if(!k)return;if(!months[k])months[k]={month:k,total:0,accepted:0,declined:0};months[k].total++;if(a)months[k].accepted++;if(d)months[k].declined++;});const decided=accepted+declined;return {total:Object.keys(ids).length,open,accepted,declined,decided,acceptanceRate:decided?round2_(accepted/decided*100):0,months:Object.keys(months).sort().reverse().map(k=>{const x=months[k],d=x.accepted+x.declined;x.acceptanceRate=d?round2_(x.accepted/d*100):0;return x;})};}

function checkRegieBillingRisk(employee, employeePin, objectIds) {
  requireChef_(employee, employeePin);
  const selectedIds = Array.from(new Set((objectIds || []).map(clean_).filter(Boolean)));
  if (!selectedIds.length) throw new Error('Objekt-ID fehlt.');

  const ss = getSpreadsheet_();
  ensureObjectIds_(ss);
  const sheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  const values = sheet.getDataRange().getValues();
  const selectedCustomers = [];

  for (let i = 1; i < values.length; i++) {
    const objectId = clean_(values[i][25]);
    if (!selectedIds.includes(objectId)) continue;
    const customer = clean_(values[i][3]);
    if (customer) selectedCustomers.push(customer);
  }
  if (!selectedCustomers.length) throw new Error('Ausgewählter Auftrag wurde nicht gefunden.');

  // Absichtlich kundenbezogen und nicht nur objektbezogen prüfen: verschiedene Wohnungen /
  // Adressen bleiben getrennte Objekte, werden aber vor der Abrechnung als möglicher Treffer gezeigt.
  const customerKeys = Array.from(new Set(selectedCustomers.map(normalizedCustomerKey_).filter(Boolean)));
  const groups = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const objectId = clean_(row[25]);
    if (!objectId || selectedIds.includes(objectId)) continue;
    if ((clean_(row[22]) || 'Offen') !== 'Offen') continue;
    const customer = clean_(row[3]);
    const key = normalizedCustomerKey_(customer);
    if (!key) continue;
    const related = customerKeys.some(function(selectedKey) {
      return key === selectedKey || key.indexOf(selectedKey) >= 0 || selectedKey.indexOf(key) >= 0;
    });
    if (!related) continue;

    if (!groups[objectId]) groups[objectId] = {
      objectId: objectId, customer: customer, jobStatus: clean_(row[26]) || 'Abgeschlossen',
      firstDate: '', lastDate: '', reportCount: 0
    };
    const g = groups[objectId];
    const date = normalizeDate_(row[2]);
    if (date && (!g.firstDate || date < g.firstDate)) g.firstDate = date;
    if (date && (!g.lastDate || date > g.lastDate)) g.lastDate = date;
    g.reportCount++;
    if ((clean_(row[26]) || 'Abgeschlossen') === 'Laufend') g.jobStatus = 'Laufend';
  }
  return {matches:Object.keys(groups).map(function(k){return groups[k];})};
}

function markRegieObjectsBilled(employee, employeePin, objectIds, force) {
  requireChef_(employee, employeePin);
  const ss = getSpreadsheet_();
  ensureObjectIds_(ss);
  const ids = dg5204ExpandedObjectIds_(ss,objectIds || []);
  if (!ids.length) throw new Error('Objekt-ID fehlt.');
  if (!force) {
    const risk = checkRegieBillingRisk(employee, employeePin, ids);
    if (risk.matches && risk.matches.length) {
      throw new Error('Weitere offene oder laufende Aufträge dieses Kunden gefunden. Bitte vor der Abrechnung prüfen.');
    }
  }
  const sheet = ss.getSheetByName(CONFIG.TIME_SHEET);
  const values = sheet.getDataRange().getValues();
  const now = new Date();
  let count = 0;
  for (let i = 1; i < values.length; i++) {
    if (!ids.includes(clean_(values[i][25]))) continue;
    if ((clean_(values[i][22]) || 'Offen') !== 'Offen') continue;
    sheet.getRange(i + 1, 23, 1, 3).setValues([['Abgerechnet', now, clean_(employee)]]);
    count++;
  }
  if (!count) throw new Error('Für diese Auswahl wurden keine offenen Regieberichte gefunden.');
  SpreadsheetApp.flush();
  return {ok:true,objectIds:ids,count:count,billedBy:clean_(employee),billedAt:formatDateTimeDE_(now)};
}

function createRegiePhotoZip(employee, employeePin, fileIds, customer) {
  requireChef_(employee, employeePin);
  const ids = Array.from(new Set((fileIds || []).map(clean_).filter(Boolean)));
  if (!ids.length) throw new Error('Keine Bilder ausgewählt.');
  if (ids.length > 80) throw new Error('Bitte höchstens 80 Bilder auf einmal herunterladen.');

  // v58: Nur Bilder zulassen, die tatsächlich in einem Zeiterfassungs-/Regiebericht gespeichert sind.
  const ss=getSpreadsheet_();
  const sh=ss.getSheetByName(CONFIG.TIME_SHEET);
  const values=sh&&sh.getLastRow()>=2?sh.getDataRange().getValues():[];
  const allowed={};
  for(let i=1;i<values.length;i++) {
    clean_(values[i][16]).split(',').map(clean_).filter(Boolean).forEach(function(id){allowed[id]=true;});
  }
  const invalid=ids.filter(function(id){return !allowed[id];});
  if(invalid.length) throw new Error('Mindestens ein ausgewähltes Bild gehört nicht zu einem gespeicherten Regiebericht. Bitte Ansicht neu laden.');

  const blobs = [];
  ids.forEach(function(id, index){
    try {
      const file = DriveApp.getFileById(id);
      const blob = file.getBlob();
      const ext = (file.getName().match(/\.[A-Za-z0-9]{2,5}$/)||['.jpg'])[0];
      blob.setName(String(index+1).padStart(2,'0')+'_'+safeFilePart_(file.getName().replace(/\.[^.]+$/,''))+ext);
      blobs.push(blob);
    } catch (e) {
      throw new Error('Ein ausgewähltes Bild konnte nicht geladen werden.');
    }
  });
  const name='Regiebilder_'+safeFilePart_(customer||'Objekt')+'_'+Utilities.formatDate(new Date(),CONFIG.TZ,'yyyyMMdd_HHmm')+'.zip';
  const zip=Utilities.zip(blobs,name);
  return {fileName:name,count:blobs.length,base64:Utilities.base64Encode(zip.getBytes())};
}

function createRegieReportZip(employee, employeePin, objectIds, fileIds, customer, entryIds) {
  requireChef_(employee, employeePin);
  const ids = Array.from(new Set((objectIds || []).map(clean_).filter(Boolean)));
  const selectedPhotoIds = Array.from(new Set((fileIds || []).map(clean_).filter(Boolean)));
  if (!ids.length) throw new Error('Objekt-ID fehlt. Bitte Regieberichte neu laden.');
  if (selectedPhotoIds.length > 80) throw new Error('Bitte hoechstens 80 Bilder auf einmal herunterladen.');

  const ss = getSpreadsheet_();
  ensureObjectIds_(ss);
  const sh = ss.getSheetByName(CONFIG.TIME_SHEET);
  const values = sh && sh.getLastRow() >= 2 ? sh.getDataRange().getValues() : [];
  const wanted=Array.isArray(entryIds)?Array.from(new Set(entryIds.map(clean_).filter(Boolean))):null;
  if(wanted&&!wanted.length)throw new Error('Keine Einzelberichte fuer Export gewaehlt.');
  const rows = [];
  const allowedPhotos = {};
  const signatureIds = [];

  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    if (!ids.includes(clean_(row[25]))) continue;
    if(wanted&&!wanted.includes(clean_(row[0])))continue;
    rows.push(row);
    clean_(row[16]).split(',').map(clean_).filter(Boolean).forEach(function(id){ allowedPhotos[id] = true; });
    const signatureId = clean_(row[13]);
    if (signatureId && !signatureIds.includes(signatureId)) signatureIds.push(signatureId);
  }
  if (!rows.length) throw new Error('Fuer dieses Objekt wurden keine Regieberichte gefunden.');

  if(wanted&&wanted.length!==rows.length)throw new Error('Exportauswahl nicht mehr aktuell. Bitte neu laden.');
  const invalid = selectedPhotoIds.filter(function(id){ return !allowedPhotos[id]; });
  if (invalid.length) throw new Error('Mindestens ein ausgewaehltes Bild gehoert nicht zu diesem Regiebericht. Bitte Ansicht neu laden.');

  rows.sort(function(a,b){
    return (normalizeDate_(a[2]) + ' ' + normalizeTime_(a[4])).localeCompare(normalizeDate_(b[2]) + ' ' + normalizeTime_(b[4]));
  });

  const displayCustomer = clean_(customer) || clean_(rows[0][3]) || 'Objekt';
  let totalHours = 0;
  const lines = [
    'Del Gesso Gebaeudetechnik',
    'Regiebericht',
    '',
    'Kunde / Baustelle: ' + displayCustomer,
    'Anzahl Berichte: ' + rows.length,
    ''
  ];

  rows.forEach(function(row, index){
    const hours = Number(row[6]) || 0;
    totalHours += hours;
    lines.push('Bericht ' + (index + 1));
    lines.push('Datum: ' + formatDateDE_(normalizeDate_(row[2])));
    lines.push('Mitarbeiter: ' + clean_(row[1]));
    lines.push('Kunde / Baustelle: ' + clean_(row[3]));
    lines.push('Zeit: ' + normalizeTime_(row[4]) + ' bis ' + normalizeTime_(row[5]));
    lines.push('Stunden: ' + formatHours_(hours));
    lines.push('Taetigkeit: ' + clean_(row[7]));
    lines.push('Material verbaut: ' + (clean_(row[11]) === 'Ja' ? 'Ja' : 'Nein'));
    if (clean_(row[11]) === 'Ja' && clean_(row[12])) lines.push('Material: ' + clean_(row[12]));
    lines.push('Auftragsstatus: ' + (clean_(row[26]) || 'Abgeschlossen'));
    lines.push('Kundenunterschrift: ' + (clean_(row[13]) ? 'vorhanden' : 'nicht vorhanden'));
    lines.push('Bilder im Bericht: ' + (Number(row[15]) || 0));
    if (clean_(row[27]) === 'Ja') lines.push('Kennzeichnung: NACHTRAG');
    lines.push('');
  });
  lines.push('Gesamtstunden: ' + formatHours_(round2_(totalHours)));
  lines.push('');
  lines.push('Digitaler Regiebericht - Del Gesso Gebaeudetechnik');

  const blobs = [];
  const pdfName = 'Regiebericht_' + safeFilePart_(displayCustomer) + '.pdf';
  blobs.push(buildSimplePdf_(lines).setName(pdfName));

  signatureIds.forEach(function(id, index){
    try {
      const file = DriveApp.getFileById(id);
      const blob = file.getBlob();
      let ext = (file.getName().match(/\.[A-Za-z0-9]{2,5}$/) || ['.png'])[0];
      blob.setName('Kundenunterschrift_' + String(index + 1).padStart(2,'0') + ext);
      blobs.push(blob);
    } catch (e) {
      throw new Error('Eine Kundenunterschrift konnte nicht geladen werden.');
    }
  });

  selectedPhotoIds.forEach(function(id, index){
    try {
      const file = DriveApp.getFileById(id);
      const blob = file.getBlob();
      const ext = (file.getName().match(/\.[A-Za-z0-9]{2,5}$/) || ['.jpg'])[0];
      blob.setName('Bild_' + String(index + 1).padStart(2,'0') + ext);
      blobs.push(blob);
    } catch (e) {
      throw new Error('Ein ausgewaehltes Bild konnte nicht geladen werden.');
    }
  });

  const extraAttachments=regieAttachmentRows_(ids);
  extraAttachments.forEach(function(a,index){try{const f=DriveApp.getFileById(a.fileId),b=f.getBlob();b.setName('Zusatzdatei_'+String(index+1).padStart(2,'0')+'_'+safeFilePart_(a.name||f.getName()));blobs.push(b);}catch(e){throw new Error('Eine Zusatzdatei konnte nicht geladen werden.');}});

  const firstDate = normalizeDate_(rows[0][2]);
  const zipName = 'Regiebericht_' + safeFilePart_(displayCustomer) + '_' + firstDate.replace(/-/g,'') + '.zip';
  const zip = Utilities.zip(blobs, zipName);
  return {
    fileName: zipName,
    reportCount: rows.length,
    signatureCount: signatureIds.length,
    photoCount: selectedPhotoIds.length,
    attachmentCount: extraAttachments.length,
    base64: Utilities.base64Encode(zip.getBytes())
  };
}

function markRegieObjectBilled(employee, employeePin, objectId, force) {
  objectId = clean_(objectId);
  if (!objectId) throw new Error('Objekt-ID fehlt.');
  const r = markRegieObjectsBilled(employee, employeePin, [objectId], force);
  r.objectId = objectId;
  return r;
}

function combineDateTime_(dateStr, timeStr) {
  const dateParts = dateStr.split('-').map(Number);
  const timeParts = timeStr.split(':').map(Number);

  return new Date(
    dateParts[0],
    dateParts[1] - 1,
    dateParts[2],
    timeParts[0],
    timeParts[1],
    0,
    0
  );
}

function buildDayMail_(employee, date, entries, total, pauseMinutes, netTotal) {
  let text =
    'Mitarbeiter: ' + employee + '\n' +
    'Datum: ' + formatDateDE_(date) + '\n\n';

  entries.forEach(function(entry, index) {
    text +=
      'Auftrag ' + (index + 1) + (entry.isAdditionalAssignment ? ' (Mitarbeit, eingetragen von ' + entry.assignedBy + ')' : '') + '\n' +
      'Kunde/Baustelle: ' + entry.customer + '\n' +
      'Zeit: ' + entry.start + ' bis ' + entry.end + '\n' +
      'Stunden: ' + formatHours_(entry.hours) + '\n' +
      'Ausgeführte Tätigkeit: ' + entry.activity + '\n' +
      'Material verbaut: ' + (entry.materialUsed ? 'Ja' : 'Nein') + '\n';

    if (entry.materialUsed && entry.material) {
      text += 'Material: ' + entry.material + '\n';
    }

    text +=
      'Weitere Mitarbeiter anwesend: ' +
      ((entry.additionalEmployees || []).length ? 'Ja' : 'Nein') + '\n';

    if ((entry.additionalEmployees || []).length) {
      text +=
        'Weitere Mitarbeiter: ' +
        entry.additionalEmployees.join(', ') +
        '\n';
    }

    text +=
      'Kundenunterschrift: ' +
      (entry.customerSignatureUrl ? 'vorhanden' : 'nicht vorhanden') + '\n' +
      'Bilder: ' + Number(entry.photoCount || 0) + '\n\n';
  });

  text +=
    'Gesamtstunden brutto: ' + formatHours_(total) + '\n' +
    'Pause: ' + formatHours_(Number(pauseMinutes || 0) / 60) + ' Std.\n' +
    'Arbeitszeit netto: ' + formatHours_(netTotal == null ? total : netTotal) + '\n\n' +
    'Der Arbeitstag wurde digital abgeschlossen.';

  return text;
}

function buildMonthMail_(employee, year, month, rows, total) {
  let text =
    'Monatsauswertung\n\n' +
    'Mitarbeiter: ' + employee + '\n' +
    'Monat: ' + monthNameDE_(month) + ' ' + year + '\n\n';

  rows.forEach(function(row) {
    text +=
      formatDateDE_(row.date) +
      ' | ' +
      row.customer +
      ' | ' +
      formatHours_(row.hours) +
      ' Std. | ' +
      (row.closed ? 'abgeschlossen' : 'offen') +
      '\n';
  });

  if (arguments.length >= 6 && Array.isArray(arguments[5]) && arguments[5].length) {
    text += '\nAbwesenheiten / Tagesstatus:\n';

    arguments[5].forEach(function(item) {
      text +=
        formatDateDE_(item.date) +
        ' | ' +
        item.status +
        (Number(item.creditedHours || 0) ? ' | ' + formatHours_(item.creditedHours) + ' Std. Gutschrift' : '') +
        '\n';
    });
  }

  text +=
    '\nGesamtstunden: ' +
    formatHours_(total);

  return text;
}

function normalizeEntryTime_(value){const text=clean_(value);const m=text.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);if(!m)return '';const h=Number(m[1]),min=Number(m[2]);if(h<0||h>23||min<0||min>59)return '';return String(h).padStart(2,'0')+':'+String(min).padStart(2,'0')}

function calculateEntryHours_(startValue,endValue){const s=normalizeEntryTime_(startValue),e=normalizeEntryTime_(endValue);if(!s||!e)return 0;const sp=s.split(':').map(Number),ep=e.split(':').map(Number),sm=sp[0]*60+sp[1];let em=ep[0]*60+ep[1];if(em===sm)return 0;if(em<sm)em+=1440;const mins=em-sm;return mins>0&&mins<1440?round2_(mins/60):0}

function validateEntry_(data) {
  if (!data) {
    throw new Error('Keine Daten uebermittelt.');
  }

  if (!clean_(data.employee)) {
    throw new Error('Mitarbeiter fehlt.');
  }

  if (!validDate3_(data.date)) {
    throw new Error('Ungueltiges Datum.');
  }

  if (!clean_(data.customer)) {
    throw new Error('Kunde/Baustelle fehlt.');
  }

  // v27: Zeit primär als Minutenwerte übernehmen. Das vermeidet Browser-/Formatprobleme bei type=time.
  const startMinutes = Number(data.startMinutes);
  const endMinutes = Number(data.endMinutes);
  if (Number.isFinite(startMinutes) && Number.isFinite(endMinutes) && startMinutes >= 0 && startMinutes < 1440 && endMinutes >= 0 && endMinutes < 1440) {
    data.start = String(Math.floor(startMinutes / 60)).padStart(2,'0') + ':' + String(startMinutes % 60).padStart(2,'0');
    data.end = String(Math.floor(endMinutes / 60)).padStart(2,'0') + ':' + String(endMinutes % 60).padStart(2,'0');
  } else {
    data.start=normalizeEntryTime_(data.start);data.end=normalizeEntryTime_(data.end);
  }
  if (!data.start || !data.end) throw new Error('Bitte gueltige Von-/Bis-Zeit eintragen.');
  const hours=calculateEntryHours_(data.start,data.end);
  if (!(hours > 0 && hours <= 24)) throw new Error('Die Arbeitsstunden sind ungueltig.');
  data.hours=hours;

  if (!clean_(data.activity)) {
    throw new Error('Bitte die ausgefuehrte Taetigkeit eintragen.');
  }

  if (data.materialUsed && !clean_(data.material)) {
    throw new Error('Bitte das verbaute Material eintragen.');
  }

}

function normalizeAdditionalEmployeeHours_(items, allowedEmployees) {
  if (!Array.isArray(items)) return [];
  const allowed = {};
  (allowedEmployees || []).forEach(function(name) { allowed[name] = true; });
  const result = [];
  const seen = {};
  items.forEach(function(item) {
    const name = clean_(item && item.name);
    const hours = Number(item && item.hours);
    if (!name || !allowed[name] || seen[name] || !(hours > 0 && hours <= 24)) return;
    seen[name] = true;
    result.push({ name: name, hours: round2_(hours) });
  });
  return result;
}

function parseAdditionalEmployeeHours_(value) {
  const text = clean_(value);
  if (!text) return [];
  return text.split('|').map(function(part) {
    const m = clean_(part).match(/^(.*?):\s*([0-9]+(?:[.,][0-9]+)?)$/);
    return m ? { name: clean_(m[1]), hours: Number(m[2].replace(',', '.')) || 0 } : null;
  }).filter(Boolean);
}

function normalizeAdditionalEmployees_(employees, primaryEmployee) {
  if (!Array.isArray(employees)) {
    employees = clean_(employees)
      ? clean_(employees).split(',')
      : [];
  }

  const result = [];
  const seen = {};

  employees.forEach(function(name) {
    name = clean_(name);

    if (
      !name ||
      name === clean_(primaryEmployee) ||
      !getEmployees().includes(name) ||
      seen[name]
    ) {
      return;
    }

    seen[name] = true;
    result.push(name);
  });

  return result;
}

function normalizeDate_(value) {
  if (!value) return '';

  if (value instanceof Date) {
    return Utilities.formatDate(value, CONFIG.TZ, 'yyyy-MM-dd');
  }

  const text = String(value);
  const match = text.match(/^(\d{4})-(\d{2})-(\d{2})/);

  return match
    ? `${match[1]}-${match[2]}-${match[3]}`
    : text;
}

function normalizeTime_(value) {
  if (!value) return '';

  if (value instanceof Date) {
    return Utilities.formatDate(value, CONFIG.TZ, 'HH:mm');
  }

  const text = String(value);
  const match = text.match(/(\d{1,2}):(\d{2})/);

  return match
    ? `${String(match[1]).padStart(2, '0')}:${match[2]}`
    : text;
}

function formatDateDE_(date) {
  const parts = String(date).split('-');
  if (parts.length !== 3) return String(date);
  return parts[2] + '.' + parts[1] + '.' + parts[0];
}

function formatHours_(value) {
  return Number(value || 0).toFixed(2).replace('.', ',');
}

function round2_(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function clean_(value) {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function formatDateTimeDE_(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return clean_(value);
  return Utilities.formatDate(d, CONFIG.TZ, 'dd.MM.yyyy HH:mm');
}

function safeFilePart_(value) {
  return (
    clean_(value)
      .replace(/[^a-zA-Z0-9_-]+/g, '_')
      .replace(/^_+|_+$/g, '') ||
    'Datei'
  );
}

function hash_(value) {
  const digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    String(value),
    Utilities.Charset.UTF_8
  );
  return Utilities.base64Encode(digest);
}

function monthNameDE_(month) {
  return [
    '',
    'Januar',
    'Februar',
    'Maerz',
    'April',
    'Mai',
    'Juni',
    'Juli',
    'August',
    'September',
    'Oktober',
    'November',
    'Dezember'
  ][Number(month)];
}

function ensureInquirySheet_(){
  const ss=getSpreadsheet_(); let sh=ss.getSheetByName('Anfragen');
  const headers=['ID','Quelle','Gmail-IDs','Kunde','E-Mail','Telefon','PLZ','Ort','Betreff','Beschreibung','Eingang','Status','Gelesen','Erstellt am','Geaendert am','Geaendert von','Interne Notiz','Erledigt-Grund','Kontakt am','Kontaktperson','Kontakt-Vermerk','Angebots-ID','Externer Link','Telefon-Link','Dropbox-Link','AQON-Termin-Link','AQON-Details','AQON-Antwort gesendet'];
  if(!sh){sh=ss.insertSheet('Anfragen');sh.appendRow(headers);sh.setFrozenRows(1);}
  else if(sh.getMaxColumns()<headers.length){sh.insertColumnsAfter(sh.getMaxColumns(),headers.length-sh.getMaxColumns());sh.getRange(1,1,1,headers.length).setValues([headers]);}
  else {sh.getRange(1,1,1,headers.length).setValues([headers]);}
  return sh;
}

function ensureOrderSheet_(){
  const ss=getSpreadsheet_(); let sh=ss.getSheetByName('AuftragsStamm');
  const headers=['ID','Kunde','Adresse','Telefon','E-Mail','Beschreibung','Quelle','Anfrage-ID','Status','Erstellt am','Gestartet am','Abgeschlossen am','Geaendert am','Geaendert von','Interne Notiz'];
  if(!sh){sh=ss.insertSheet('AuftragsStamm');sh.appendRow(headers);sh.setFrozenRows(1);}
  else if(sh.getMaxColumns()<headers.length){sh.insertColumnsAfter(sh.getMaxColumns(),headers.length-sh.getMaxColumns());sh.getRange(1,1,1,headers.length).setValues([headers]);}
  else {sh.getRange(1,1,1,headers.length).setValues([headers]);}
  return sh;
}

function inquiryNorm_(v){return clean_(v).toLowerCase().replace(/ß/g,'ss').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]+/g,' ').trim();}

function inquiryDate_(d){return d?Utilities.formatDate(new Date(d),CONFIG.TZ,'yyyy-MM-dd HH:mm:ss'):'';}

function parseWebsiteInquiry_(m){
  const body=String(m.getPlainBody()||''),sub=String(m.getSubject()||'');
  const name=(body.match(/(?:^|\n)Name:\s*([^\n\r]+)/i)||[])[1]||((sub.match(/[–-]\s*(.+)$/)||[])[1]||'');
  const email=(body.match(/(?:E-Mail|Ihre E-Mail):\s*([^\s\n\r]+)/i)||[])[1]||'';
  const phone=(body.match(/Telefon(?:\s*\(optional\))?:\s*([^\n\r]+)/i)||[])[1]||'';
  let desc=(body.split(/Nachricht:\s*/i)[1]||'').trim(); if(desc.length>3000)desc=desc.slice(0,3000);
  return {source:'Webseite',customer:clean_(name),email:clean_(email),phone:clean_(phone),postalCode:'',city:'',subject:sub,description:desc};
}

function parseCheck24Inquiry_(m){
  const body=String(m.getPlainBody()||''),sub=String(m.getSubject()||'');
  let name=((sub.match(/Neue Kontaktdaten von (.+?) erhalten/i)||[])[1]||'').trim();
  if(!name)name=((sub.match(/Sie haben eine neue Nachricht von (.+?) erhalten/i)||[])[1]||'').trim();
  if(!name)name=((body.match(/Kontakt zu\s+([^\n\r]+?)\s+auf(?:,|\s|$)/i)||[])[1]||'').trim();
  if(!name)name=((body.match(/Nachricht von\s+([^\n\r]+?)\s+auf CHECK24/i)||[])[1]||'').trim();
  if(!name)name=((body.match(/([A-Z\u00c4\u00d6\u00dc][^\n\r]{1,60}) hat Kontaktdaten geteilt/i)||[])[1]||'').trim();
  const loc=body.match(/\bin\s+(\d{5})\s+([A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df\- ]{2,45})[.\n\r]/);
  const mails=(body.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/ig)||[]).filter(x=>!/@check24\.de$/i.test(x));
  let ph=(body.match(/(?:Telefon|Mobil|Tel.?)[^+0-9]{0,15}(\+?[0-9][0-9 ()\/-]{6,})/i)||[])[1]||'';
  if(String(ph).replace(/\D/g,'').endsWith('30220127917'))ph='';
  const external=clean_((body.match(/https:\/\/experts\.handwerk\.check24\.de\/plink\/craftsmen\/sp\/messenger\/[A-Za-z0-9_-]+/i)||[])[0]||'');
  let desc=sub;
  const job=(body.match(/(Sanit\u00e4r[^\n\r]{0,200}|Heizung[^\n\r]{0,200}|Klimaanlage[^\n\r]{0,200}|W\u00e4rmepumpe[^\n\r]{0,200})/i)||[])[1];
  if(job)desc+=' - '+job.trim();
  if(/neue Nachricht/i.test(sub)&&external)desc+=' - Nachricht im CHECK24-Postfach \u00f6ffnen';
  return {source:'CHECK24',customer:clean_(name),email:clean_(mails[0]||''),phone:clean_(ph),postalCode:clean_(loc&&loc[1]||''),city:clean_(loc&&loc[2]||''),subject:sub,description:clean_(desc),externalUrl:external};
}
function parseTrustlocalInquiry_(m){
  const body=String(m.getPlainBody()||''),sub=String(m.getSubject()||'');
  if(!/^Anfrage von .+ für eine\(n\)/i.test(sub))return null;
  const name=clean_(((sub.match(/^Anfrage von\s+(.+?)\s+für eine\(n\)/i)||[])[1]||''));
  const field=function(label){const rx=new RegExp('(?:^|\\n)'+label+'\\s+([^\\n\\r]+)','i');return clean_((body.match(rx)||[])[1]||'');};
  const city=field('Ort');
  const request=field('Anfrage für');
  const kind=field('Art der Anfrage');
  const service=field('Dienstleistung');
  const building=field('Gebäudeart');
  const sanitary=field('Sanitäranlagen');
  const water=field('Wasseranschlüsse vorhanden\\?');
  const note=clean_((body.match(/(?:^|\n)Anmerkungen\s+([\s\S]*?)(?:\n\s*\[Vollständige Anfrage ansehen\]|\n\s*Vollständige Anfrage ansehen|\n\s*Sie können mich)/i)||[])[1]||'');
  const external=clean_((body.match(/https:\/\/trustlocal\.de\/login-portal\/pro\/messages\/\d+\/\?token=[^\s\])]+/i)||[])[0]||'');
  const phoneLink=clean_((body.match(/https:\/\/trustlocal\.de\/login-portal\/pro\/messages\/\d+\/(?:telefoonnummer|telefonnummer)\/\?token=[^\s\])]+/i)||[])[0]||'');
  const parts=[request,kind&&('Art: '+kind),service&&('Dienstleistung: '+service),building&&('Gebäudeart: '+building),sanitary&&('Sanitäranlagen: '+sanitary),water&&('Wasseranschlüsse: '+water),note&&('Anmerkung: '+note)].filter(Boolean);
  return {source:'Trustlocal',customer:name,email:'',phone:'',postalCode:'',city:city,subject:sub,description:parts.join(' · ').slice(0,3000),externalUrl:external,phoneUrl:phoneLink};
}







function parseAqonInquiry_(m){
  const body=String(m.getPlainBody()||''),sub=String(m.getSubject()||'');
  if(!/^Neuer Einbauauftrag für AQON PURE bei /i.test(sub))return null;
  const field=function(rx){return clean_((body.match(rx)||[])[1]||'');};
  const name=field(/(?:^|\n)Name:\s*([^\n\r]+)/i);
  const street=field(/(?:^|\n)Straße \+ Hausnummer:\s*([^\n\r]+)/i);
  const plzOrt=field(/(?:^|\n)PLZ \+ Ort:\s*([^\n\r]+)/i);
  const loc=plzOrt.match(/^(\d{5})\s+(.+)$/);
  const phone=field(/(?:^|\n)Telefon:\s*([^\n\r]+)/i);
  const email=field(/(?:^|\n)E-Mail:\s*([^\n\r]+)/i);
  const material=field(/(?:^|\n)Rohrmaterial \/ Hersteller:\s*([^\n\r]+)/i);
  const dimension=field(/(?:^|\n)Dimension:\s*([^\n\r]+)/i);
  const dropbox=clean_((body.match(/https:\/\/www\.dropbox\.com\/[^\s]+/i)||[])[0]||'');
  const appointment=clean_((body.match(/https:\/\/aqonpure\.wufoo\.com\/forms\/[^\s]+/i)||[])[0]||'');
  let details=clean_((body.match(/Die Kontaktdaten des Kunden lauten:\s*([\s\S]*?)(?:\n\s*Über eine positive Rückmeldung|\n\s*Mit freundlichen Grüßen)/i)||[])[1]||'');
  if(details)details='Die Kontaktdaten des Kunden lauten:\n'+details;
  const billing=clean_((body.match(/Hinweis zur Abrechnung\s*([\s\S]*?)(?:\n\s*Sollten Sie den Einbautermin)/i)||[])[1]||'');
  const desc=['AQON PURE Einbauauftrag',street&&('Adresse: '+street),plzOrt,material&&('Rohrmaterial: '+material),dimension&&('Dimension: '+dimension),billing&&('Abrechnung: '+billing)].filter(Boolean).join(' · ').slice(0,3000);
  return {source:'AQON PURE',customer:name,email:email,phone:phone,postalCode:clean_(loc&&loc[1]||''),city:clean_(loc&&loc[2]||''),subject:sub,description:desc,dropboxUrl:dropbox,aqonAppointmentUrl:appointment,aqonDetails:details};
}

const INQUIRY_GMAIL_LABEL_='\u00dcbertragen zur App';
const AQON_GMAIL_LABEL_='AQON WATER';
const AQON_AUTO_REPLY_='wird \u00fcbernommen , vielen Dank f\u00fcr Ihren Auftrag';
const INQUIRY_AUTO_ACTOR_='Gmail-Automatik';
const DIRECT_INQUIRY_SOURCE_='E-Mail direkt';
const DIRECT_CLASSIFIER_VERSION_='DGMAIL-2026-09-16-v2';
function directMailSender_(m){
  const raw=String(m&&m.getFrom?m.getFrom():'').trim();
  let email='';
  const angle=raw.match(/<\s*([^>\s]+@[^>\s]+)\s*>/i),plain=raw.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  email=clean_(angle&&angle[1]||plain&&plain[0]||'').toLowerCase();
  let name=raw.replace(/<[^>]+>/g,'').replace(/^\s*["']|["']\s*$/g,'').trim();
  if(!name||/@/.test(name)){
    const local=(email.split('@')[0]||'').replace(/[._-]+/g,' ').trim();
    name=local.replace(/\b\w/g,function(c){return c.toUpperCase();});
  }
  return {name:clean_(name),email:email,raw:raw};
}
function directMailBody_(m){
  let body=String(m&&m.getPlainBody?m.getPlainBody():'').replace(/\r/g,'').trim();
  body=body.split(/\n(?:Von:|From:|-----Original Message-----|-----Urspr(?:\u00fc|u)ngliche Nachricht-----|Am .{0,120} schrieb:)/i)[0].trim();
  if(body.length>5000)body=body.slice(0,5000);
  return body;
}
function directMailAttachmentNames_(m){
  try{return (m.getAttachments({includeInlineImages:false,includeAttachments:true})||[]).map(function(a){return clean_(a.getName());}).filter(Boolean).slice(0,10);}catch(_e){return [];}
}
function ensureDirectMailAuditSheet_(){
  const ss=getSpreadsheet_();let sh=ss.getSheetByName('GmailImportLog');
  const h=['Zeit','Classifier','Gmail-ID','Absender','E-Mail','Betreff','Entscheidung','Score','Grund'];
  if(!sh){sh=ss.insertSheet('GmailImportLog');sh.appendRow(h);sh.setFrozenRows(1);}
  else if(sh.getMaxColumns()<h.length)sh.insertColumnsAfter(sh.getMaxColumns(),h.length-sh.getMaxColumns());
  return sh;
}
function logDirectMailClassification_(m,c){
  try{
    if(!m||!c)return;const mid=clean_(m.getId()),sh=ensureDirectMailAuditSheet_(),last=Math.max(2,sh.getLastRow()-300),count=Math.max(0,sh.getLastRow()-last+1);
    if(count){const ids=sh.getRange(last,3,count,1).getValues();for(let i=0;i<ids.length;i++)if(clean_(ids[i][0])===mid)return;}
    sh.appendRow([new Date(),DIRECT_CLASSIFIER_VERSION_,mid,clean_(c.sender&&c.sender.name),clean_(c.sender&&c.sender.email),clean_(c.subject),clean_(c.decision),Number(c.score||0),clean_(c.reason)]);
  }catch(_e){}
}
function directMailClassify_(m,knownOpenEmail){
  const sender=directMailSender_(m),sub=String(m&&m.getSubject?m.getSubject():'').trim(),body=directMailBody_(m),attachments=directMailAttachmentNames_(m);
  const text=(sub+'\n'+body+'\n'+attachments.join(' ')).toLowerCase(),email=sender.email,known=!!(knownOpenEmail&&knownOpenEmail[inquiryNorm_(email)]);
  const result=function(decision,score,reason){return {accept:decision==='import',decision:decision,score:score,reason:reason,sender:sender,subject:sub,body:body,attachments:attachments};};
  if(!email)return result('skip',-99,'no-email');
  if(/(?:kontakt@delgesso\.info|delgessomichael@gmail\.com)$/i.test(email))return result('skip',-99,'own-mail');
  if(/(?:no-?reply|noreply|mailer-daemon|postmaster|newsletter)/i.test(email))return result('skip',-30,'system-mail');
  if(/@(vaillant\.(?:de|com)|gc-gruppe\.de|mail\.verivox\.de)$/i.test(email))return result('skip',-30,'known-supplier');
  if(/\b(rechnung(?:_|\b)|lieferschein|gutschrift|mahnung|zahlungserinnerung|kredit|newsletter|rabattaktion|produktzusammenstellung|bewerbung|lebenslauf|kontoauszug|bestellbest(?:\u00e4|a)tigung)\b/i.test(text))return result('skip',-20,'admin-or-supplier');
  if(/\b(nachbesserung|rechnungskl(?:\u00e4|a)rung|zahlungserinnerung|angebot\s*(?:nr\.?|nummer)?\s*[0-9-]+.{0,80}(?:nehme|nehmen).{0,20}an|erteile.{0,30}auftrag.{0,60}angebot)\b/i.test(text))return result('skip',-15,'existing-case');
  if(known&&/^(re:|aw:|antwort:)/i.test(sub)&&!/(neue|weiter(?:e|er)|zus(?:\u00e4|a)tzlich(?:e|er)).{0,40}(anfrage|auftrag|arbeit|reparatur|austausch)/i.test(text))return result('skip',-10,'reply-to-open-case');

  const subjectStrong=/\b(anfrage|angebot|reparatur|austausch|erneuerung|defekt|st(?:\u00f6|o)rung|sanit(?:\u00e4|a)r|heizung|klima|w(?:\u00e4|a)rmepumpe|wc|toilette|dusche|bad|wasserhahn|zapfstelle|rohr|abfluss|wartung|montage|installation|therme|warmwasser|heizk(?:\u00f6|o)rper|hauswasserstation|speicher|boiler)\b/i.test(sub);
  const requestPhrase=/\b(k(?:\u00f6|o)nnten sie|k(?:\u00f6|o)nnen sie|k(?:\u00f6|o)nnten wir|ich m(?:\u00f6|o)chte|wir m(?:\u00f6|o)chten|ich ben(?:\u00f6|o)tige|wir ben(?:\u00f6|o)tigen|ich brauche|wir brauchen|bitte um (?:ein )?angebot|bitte um termin|termin vereinbaren|haben sie kapazit(?:\u00e4|a)ten|bitte um r(?:\u00fc|u)ckmeldung|bitte melden|unterst(?:\u00fc|u)tzung|arbeiten (?:uebernehmen|\u00fcbernehmen)|k(?:\u00f6|o)nnen sie sich das ansehen|was w(?:\u00fc|u)rde .* kosten|preis(?:angebot)?|kostenvoranschlag)\b/i.test(text);
  const workTerm=/\b(reparatur|austausch|erneuer|defekt|kaputt|undicht|leck|verstopf|st(?:\u00f6|o)rung|sanit(?:\u00e4|a)r|heizung|therme|warmwasser|wasserhahn|zapfstelle|wc|toilette|dusche|bad|heizk(?:\u00f6|o)rper|klimaanlage|klima|w(?:\u00e4|a)rmepumpe|rohr|abfluss|enth(?:\u00e4|a)rt|hauswasserstation|speicher|boiler|fu(?:\u00df|ss)bodenheizung|wartung|montage|installation|sp(?:\u00fc|u)lkasten|armatur|waschtisch|badewanne)\b/ig;
  const terms=text.match(workTerm)||[];
  const unique=Array.from(new Set(terms.map(function(x){return x.toLowerCase();}))).length;
  let score=0;
  score+=Math.min(5,unique);
  if(subjectStrong)score+=3;
  if(requestPhrase)score+=4;
  if(/\b(anfrage|angebot|kostenvoranschlag)\b/i.test(sub))score+=2;
  if(/\b(foto|fotos|bild|bilder|anhang|anbei)\b/i.test(text)&&attachments.length)score+=1;
  if(/\b\d{5}\s+[A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df-]{2,}/.test(body))score+=1;
  if(/\+?[0-9][0-9 ()\/-]{6,}/.test(body))score+=1;
  if(/@(gmail\.com|gmx\.(?:de|net)|t-online\.de|web\.de|outlook\.(?:de|com)|hotmail\.(?:de|com)|mail\.de|kabelmail\.de)$/i.test(email))score+=1;
  if(known)score+=1;
  if(/^(re:|aw:|wg:|fwd:)/i.test(sub)&&!known)score-=2;

  if(subjectStrong&&requestPhrase)return result('import',99,'clear-subject-and-request');
  if(score>=6)return result('import',score,'customer-inquiry');
  if(score>=3)return result('review',score,'possible-customer-inquiry');
  return result('skip',score,'not-customer-inquiry');
}
function parseDirectCustomerInquiry_(m,knownOpenEmail,classify){
  const c=classify||directMailClassify_(m,knownOpenEmail);if(!c.accept)return null;
  const sender=c.sender,body=c.body,sub=c.subject;
  const ph=(body.match(/(?:Telefon|Mobil|Tel\.?|Handy)?[^+0-9]{0,12}(\+?[0-9][0-9 ()\/-]{6,})/i)||[])[1]||'';
  const loc=body.match(/\b(\d{5})\s+([A-Za-z\u00c4\u00d6\u00dc\u00e4\u00f6\u00fc\u00df\- ]{2,45})(?:[,.\n]|$)/);
  let external='';try{const tid=m.getThread().getId();if(tid)external='https://mail.google.com/mail/u/0/#all/'+tid;}catch(_e){}
  let desc=body||sub;if(c.attachments&&c.attachments.length)desc+='\n\nAnhang/Anh\u00e4nge in Gmail: '+c.attachments.join(', ');if(desc.length>5000)desc=desc.slice(0,5000);
  return {source:DIRECT_INQUIRY_SOURCE_,customer:sender.name||sender.email,email:sender.email,phone:clean_(ph),postalCode:clean_(loc&&loc[1]||''),city:clean_(loc&&loc[2]||''),subject:sub,description:desc,externalUrl:external,directScore:c.score};
}
function shouldScanDirectInquiries_(){return true;}
function inquiryTransferLabel_(){return GmailApp.getUserLabelByName(INQUIRY_GMAIL_LABEL_)||GmailApp.createLabel(INQUIRY_GMAIL_LABEL_);}
function aqonTransferLabel_(){return GmailApp.getUserLabelByName(AQON_GMAIL_LABEL_)||GmailApp.createLabel(AQON_GMAIL_LABEL_);}
function archiveInquiryGmailMessage_(message,label){try{if(!message)return false;const thread=message.getThread();if(typeof thread.isInTrash==='function'&&thread.isInTrash())return true;(label||inquiryTransferLabel_()).addToThread(thread);thread.markRead();thread.moveToArchive();return true;}catch(_e){return false;}}
function replyAqonOnce_(message,sh,row){try{if(clean_(sh.getRange(row,28).getValue()))return true;message.reply(AQON_AUTO_REPLY_);sh.getRange(row,28).setValue(new Date());SpreadsheetApp.flush();return true;}catch(_e){return false;}}
function inquiryGmailIdsByRow_(row){return String(row&&row[2]||'').split('|').map(clean_).filter(Boolean);}
function trashInquiryGmailIds_(ids){const done={};let moved=0,failed=0;(ids||[]).forEach(function(mid){try{const m=GmailApp.getMessageById(clean_(mid));if(!m)return;const t=m.getThread(),tid=t.getId();if(done[tid])return;done[tid]=1;t.moveToTrash();moved++;}catch(_e){failed++;}});return {moved:moved,failed:failed};}

// \u00dcbertragene Anfragen bleiben im Gmail-Archiv. Eine automatische L\u00f6schung nach 30 Tagen
// ist ausdr\u00fccklich deaktiviert; nur die bewusste Aktion "Ablehnen" verschiebt eine Mail in den Papierkorb.
function cleanupTransferredInquiryMails(){return 0;}
function ensureInquiryCleanupTrigger_(){return ensureInquiryAutomationTrigger_();}
function ensureInquiryAutomationTrigger_(){
  try{
    let hasSync=false;
    ScriptApp.getProjectTriggers().forEach(function(t){
      const h=t.getHandlerFunction();
      if(h==='cleanupTransferredInquiryMails'){try{ScriptApp.deleteTrigger(t);}catch(_e){}}
      if(h==='automaticInquirySync')hasSync=true;
    });
    if(!hasSync)ScriptApp.newTrigger('automaticInquirySync').timeBased().everyMinutes(5).create();
    return true;
  }catch(_e){return false;}
}
function inquiryOpenCountFromSheet_(sh){
  const v=sh.getDataRange().getValues();let n=0;
  for(let i=1;i<v.length;i++){
    const st=clean_(v[i][11])||'Neu';
    if(['Erledigt','Gel\u00f6scht','\u00dcbernommen','Archiviert','Reminder'].indexOf(st)<0)n++;
  }
  return n;
}
function syncCustomerInquiriesCore_(actor){
  actor=clean_(actor)||INQUIRY_AUTO_ACTOR_;
  const sh=ensureInquirySheet_(),v=sh.getDataRange().getValues(),label=inquiryTransferLabel_(),aqonLabel=aqonTransferLabel_();
  const byMsg={},checkByKey={},checkByName={},openByEmail={};
  for(let i=1;i<v.length;i++){
    String(v[i][2]||'').split('|').filter(Boolean).forEach(id=>byMsg[id]=i+1);
    const existingStatus=clean_(v[i][11])||'Neu',existingEmail=clean_(v[i][4]).toLowerCase();
    if(existingEmail&&['Erledigt','Gel\u00f6scht','\u00dcbernommen','Archiviert','Reminder'].indexOf(existingStatus)<0)openByEmail[inquiryNorm_(existingEmail)]=i+1;
    if(clean_(v[i][1])==='CHECK24'){
      const nk=inquiryNorm_(v[i][3]),plz=clean_(v[i][6]);
      if(nk){
        if(!Object.prototype.hasOwnProperty.call(checkByName,nk))checkByName[nk]=i+1;
        else if(checkByName[nk]!==i+1)checkByName[nk]=-1;
        if(plz)checkByKey[nk+'|'+plz]=i+1;
      }
    }
  }
  const regularThreads=GmailApp.search('in:inbox newer_than:30d {from:kontakt@delgesso.info from:handwerk@check24.de from:noreply@trustlocal.de}',0,100);
  const aqonThreads=GmailApp.search('in:inbox newer_than:30d from:info@aqon-pure.com',0,100);
  const directWindow=clean_(actor)===INQUIRY_AUTO_ACTOR_?'14d':'30d';
  const directThreads=shouldScanDirectInquiries_(actor)?GmailApp.search('in:inbox newer_than:'+directWindow+' to:kontakt@delgesso.info -label:"'+INQUIRY_GMAIL_LABEL_+'" -from:kontakt@delgesso.info -from:delgessomichael@gmail.com -from:handwerk@check24.de -from:noreply@trustlocal.de -from:info@aqon-pure.com -category:promotions -category:social',0,100):[];
  const regularIds={};regularThreads.forEach(function(t){regularIds[t.getId()]=true;});
  const aqonThreadIds={};aqonThreads.forEach(function(t){aqonThreadIds[t.getId()]=true;});
  const directThreadIds={};directThreads.forEach(function(t){directThreadIds[t.getId()]=true;});
  const allById={};regularThreads.concat(aqonThreads).concat(directThreads).forEach(function(t){allById[t.getId()]=t;});
  const threads=Object.keys(allById).map(function(id){return allById[id];});
  let imported=0,updated=0,gmailFiled=0,gmailFileErrors=0,aqonReplied=0,aqonReplyErrors=0,ignored=0,directImported=0,directIgnored=0;
  threads.forEach(function(t){
    const allMessages=t.getMessages(),isAqonInbox=!!aqonThreadIds[t.getId()],isDirectInbox=!!directThreadIds[t.getId()]&&!regularIds[t.getId()]&&!aqonThreadIds[t.getId()];
    let messages=isAqonInbox?(allMessages.length?[allMessages[allMessages.length-1]]:[]):allMessages;
    if(isDirectInbox){
      let latest=null;for(let mi=allMessages.length-1;mi>=0;mi--){const fm=String(allMessages[mi].getFrom()||'');if(!/(kontakt@delgesso\.info|delgessomichael@gmail\.com)/i.test(fm)){latest=allMessages[mi];break;}}
      messages=latest?[latest]:[];
    }
    messages.forEach(function(m){
      const mid=m.getId(),from=String(m.getFrom()||''),sub=String(m.getSubject()||''),knownRow=byMsg[mid]||0;
      if(knownRow){
        const known=sh.getRange(knownRow,1,1,28).getValues()[0];
        if(clean_(known[1])==='AQON PURE'){
          const replied=replyAqonOnce_(m,sh,knownRow);
          if(replied){aqonReplied++;if(archiveInquiryGmailMessage_(m,aqonLabel))gmailFiled++;else gmailFileErrors++;}else aqonReplyErrors++;
        }else{if(archiveInquiryGmailMessage_(m,label))gmailFiled++;else gmailFileErrors++;}
        return;
      }
      let x=null;
      if(/kontakt@delgesso\.info/i.test(from)&&(/^(Anfrage:|Kontaktanfrage)/i.test(sub)))x=parseWebsiteInquiry_(m);
      else if(/handwerk@check24\.de/i.test(from)&&(/Neuer Kunde|Neue Kontaktdaten|neue Nachricht/i.test(sub)))x=parseCheck24Inquiry_(m);
      else if(/noreply@trustlocal\.de/i.test(from)&&/^Anfrage von .+ f\u00fcr eine\(n\)/i.test(sub))x=parseTrustlocalInquiry_(m);
      else if(/info@aqon-pure\.com/i.test(from)&&/^Neuer Einbauauftrag f\u00fcr AQON PURE bei /i.test(sub))x=parseAqonInquiry_(m);
      else if(isDirectInbox){const dc=directMailClassify_(m,openByEmail);logDirectMailClassification_(m,dc);x=parseDirectCustomerInquiry_(m,openByEmail,dc);}
      if(!x||!x.customer){ignored++;if(isDirectInbox)directIgnored++;return;}
      let row=0;
      if(x.source===DIRECT_INQUIRY_SOURCE_&&x.email&&/^(re:|aw:|antwort:)/i.test(clean_(x.subject)))row=openByEmail[inquiryNorm_(x.email)]||0;
      if(x.source==='CHECK24'){
        const nk=inquiryNorm_(x.customer),exact=x.postalCode?checkByKey[nk+'|'+x.postalCode]:0;
        if(exact)row=exact;
        else{
          const nr=checkByName[nk]||0;
          if(nr>0){const oldPlz=clean_(sh.getRange(nr,7).getValue());if(!x.postalCode||!oldPlz)row=nr;}
        }
      }
      if(row){
        const old=sh.getRange(row,1,1,28).getValues()[0],ids=String(old[2]||'').split('|').filter(Boolean);ids.push(mid);old[2]=Array.from(new Set(ids)).join('|');
        if(!old[4]&&x.email)old[4]=x.email;if(!old[5]&&x.phone)old[5]=x.phone;if(!old[6]&&x.postalCode)old[6]=x.postalCode;if(!old[7]&&x.city)old[7]=x.city;
        if(x.description&&String(old[9]||'').indexOf(x.description)<0)old[9]=[old[9],x.description].filter(Boolean).join(' / ');
        if(!old[22]&&x.externalUrl)old[22]=x.externalUrl;if(!old[23]&&x.phoneUrl)old[23]=x.phoneUrl;if(!old[24]&&x.dropboxUrl)old[24]=x.dropboxUrl;if(!old[25]&&x.aqonAppointmentUrl)old[25]=x.aqonAppointmentUrl;if(!old[26]&&x.aqonDetails)old[26]=x.aqonDetails;
        old[14]=new Date();old[15]=actor;sh.getRange(row,1,1,28).setValues([old]);SpreadsheetApp.flush();updated++;byMsg[mid]=row;
        if(x.source==='CHECK24'){
          const nk=inquiryNorm_(x.customer),plz=clean_(old[6]);
          if(nk&&checkByName[nk]!==-1)checkByName[nk]=row;if(nk&&plz)checkByKey[nk+'|'+plz]=row;
        }
        if(x.email)openByEmail[inquiryNorm_(x.email)]=row;
        if(x.source===DIRECT_INQUIRY_SOURCE_)directImported++;
        if(archiveInquiryGmailMessage_(m,label))gmailFiled++;else gmailFileErrors++;
        return;
      }
      const id='ANF-'+Utilities.getUuid().slice(0,12);
      sh.appendRow([id,x.source,mid,x.customer,x.email,x.phone,x.postalCode,x.city,x.subject,x.description,m.getDate(),'Neu','Nein',new Date(),new Date(),actor,'','','','','','',clean_(x.externalUrl),clean_(x.phoneUrl),clean_(x.dropboxUrl),clean_(x.aqonAppointmentUrl),String(x.aqonDetails||''),'']);
      SpreadsheetApp.flush();imported++;const newRow=sh.getLastRow();byMsg[mid]=newRow;
      if(x.email)openByEmail[inquiryNorm_(x.email)]=newRow;
      if(x.source===DIRECT_INQUIRY_SOURCE_)directImported++;
      if(x.source==='CHECK24'){
        const nk=inquiryNorm_(x.customer),plz=clean_(x.postalCode);
        if(nk){if(!Object.prototype.hasOwnProperty.call(checkByName,nk))checkByName[nk]=newRow;else if(checkByName[nk]!==newRow)checkByName[nk]=-1;if(plz)checkByKey[nk+'|'+plz]=newRow;}
      }
      if(x.source==='AQON PURE'){
        const replied=replyAqonOnce_(m,sh,newRow);
        if(replied){aqonReplied++;if(archiveInquiryGmailMessage_(m,aqonLabel))gmailFiled++;else gmailFileErrors++;}else aqonReplyErrors++;
      }else{if(archiveInquiryGmailMessage_(m,label))gmailFiled++;else gmailFileErrors++;}
    });
  });
  return {ok:true,imported:imported,updated:updated,directImported:directImported,directIgnored:directIgnored,ordersImported:0,openCount:inquiryOpenCountFromSheet_(sh),gmailFiled:gmailFiled,gmailFileErrors:gmailFileErrors,aqonReplied:aqonReplied,aqonReplyErrors:aqonReplyErrors,ignored:ignored,label:INQUIRY_GMAIL_LABEL_,aqonLabel:AQON_GMAIL_LABEL_};
}
function syncCustomerInquiries(employee,employeePin){
  requireChef_(employee,employeePin);
  const autoInstalled=ensureInquiryAutomationTrigger_();
  const r=syncCustomerInquiriesCore_(employee);r.automationInstalled=autoInstalled;return r;
}
function automaticInquirySync(){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(15000))return {ok:true,skipped:true,reason:'busy'};
  try{return syncCustomerInquiriesCore_(INQUIRY_AUTO_ACTOR_);}finally{try{lock.releaseLock();}catch(_e){}}
}

function getCustomerInquiries(employee,employeePin,status){
  requireChef_(employee,employeePin);const sh=ensureInquirySheet_(),v=sh.getDataRange().getValues(),out=[];
  for(let i=1;i<v.length;i++){const r=v[i],st=clean_(r[11])||'Neu';if(status==='Offen'&&['Erledigt','Gelöscht','Übernommen','Archiviert','Reminder'].indexOf(st)>=0)continue;if(status&&status!=='Offen'&&status!=='Alle'&&st!==status)continue;out.push({id:clean_(r[0]),source:clean_(r[1]),customer:clean_(r[3]),email:clean_(r[4]),phone:clean_(r[5]),postalCode:clean_(r[6]),city:clean_(r[7]),subject:clean_(r[8]),description:clean_(r[9]),receivedAt:inquiryDate_(r[10]),status:st,read:clean_(r[12])==='Ja',internalNote:clean_(r[16]),doneReason:clean_(r[17]),contactAt:inquiryDate_(r[18]),contactPerson:clean_(r[19]),contactNote:clean_(r[20]),offerId:clean_(r[21]),externalUrl:clean_(r[22]),phoneUrl:clean_(r[23]),dropboxUrl:clean_(r[24]),aqonAppointmentUrl:clean_(r[25]),aqonDetails:String(r[26]||''),aqonRepliedAt:inquiryDate_(r[27])});}
  out.sort((a,b)=>String(b.receivedAt).localeCompare(String(a.receivedAt)));return out;
}

function updateCustomerInquiry(employee,employeePin,id,status,markRead){
  requireChef_(employee,employeePin);const sh=ensureInquirySheet_(),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(clean_(v[i][0])===clean_(id)){if(status)sh.getRange(i+1,12).setValue(clean_(status));if(markRead!==false)sh.getRange(i+1,13).setValue('Ja');sh.getRange(i+1,15,1,2).setValues([[new Date(),employee]]);return {ok:true};}throw new Error('Anfrage nicht gefunden.');
}

function saveCustomerInquiryNote(employee,employeePin,id,note){requireChef_(employee,employeePin);const sh=ensureInquirySheet_(),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(clean_(v[i][0])===clean_(id)){sh.getRange(i+1,17).setValue(String(note||''));sh.getRange(i+1,15,1,2).setValues([[new Date(),employee]]);return {ok:true};}throw new Error('Anfrage nicht gefunden.');}

function completeCustomerInquiry(employee,employeePin,id,reason,note){requireChef_(employee,employeePin);const sh=ensureInquirySheet_(),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(clean_(v[i][0])===clean_(id)){sh.getRange(i+1,12).setValue('Erledigt');sh.getRange(i+1,13).setValue('Ja');if(note!==undefined)sh.getRange(i+1,17).setValue(String(note||''));sh.getRange(i+1,18).setValue(clean_(reason));sh.getRange(i+1,15,1,2).setValues([[new Date(),employee]]);return {ok:true};}throw new Error('Anfrage nicht gefunden.');}

function saveCustomerInquiryContact(employee,employeePin,id,date,time,person,note){
  requireChef_(employee,employeePin);const sh=ensureInquirySheet_(),v=sh.getDataRange().getValues();
  for(let i=1;i<v.length;i++)if(clean_(v[i][0])===clean_(id)){
    let when=new Date();const ds=clean_(date),ts=clean_(time);if(ds){const a=ds.split('-').map(Number),b=(ts||'12:00').split(':').map(Number);when=new Date(a[0],a[1]-1,a[2],b[0]||0,b[1]||0,0,0);}
    sh.getRange(i+1,12).setValue('Kontaktiert');sh.getRange(i+1,13).setValue('Ja');sh.getRange(i+1,19,1,3).setValues([[when,clean_(person),String(note||'')]]);sh.getRange(i+1,15,1,2).setValues([[new Date(),employee]]);return {ok:true};
  }throw new Error('Anfrage nicht gefunden.');
}

function ensureInquiryOfferSheet_(){const ss=getSpreadsheet_();let sh=ss.getSheetByName('AnfrageAngebote');const h=['Angebots-ID','Anfrage-ID','Kunde','Telefon','E-Mail','Beschreibung','Quelle','Erstellt am','Status','Geaendert am','Geaendert von','Kalender-Event-ID'];if(!sh){sh=ss.insertSheet('AnfrageAngebote');sh.appendRow(h);sh.setFrozenRows(1);}else{if(sh.getMaxColumns()<h.length)sh.insertColumnsAfter(sh.getMaxColumns(),h.length-sh.getMaxColumns());sh.getRange(1,1,1,h.length).setValues([h]);}return sh;}

function inquiryToOffer(employee,employeePin,id,customer,phone){
  requireChef_(employee,employeePin);customer=clean_(customer);phone=clean_(phone);if(!customer)throw new Error('Kundenname fehlt.');if(String(phone).replace(/\D/g,'').length<6)throw new Error('Telefonnummer fehlt.');
  const ish=ensureInquirySheet_(),v=ish.getDataRange().getValues();let r=null,row=0;for(let i=1;i<v.length;i++)if(clean_(v[i][0])===clean_(id)){r=v[i];row=i+1;break;}if(!r)throw new Error('Anfrage nicht gefunden.');
  const prior=getInquiryOffers(employee,employeePin,'Alle').find(x=>x.inquiryId===id&&x.status!=='Verworfen');if(prior)return {ok:true,offerId:prior.offerId,existing:true};
  const offerId='ANFANG-'+Utilities.getUuid().slice(0,12),now=new Date(),osh=ensureInquiryOfferSheet_();osh.appendRow([offerId,id,customer,phone,clean_(r[4]),clean_(r[9])||clean_(r[8]),clean_(r[1]),now,'Offen',now,employee]);
  const rem=ensureOfferReminderSheet_(),due=reminderDueDateFromDays_(5),rid='REM-'+Utilities.getUuid();rem.appendRow([rid,offerId,customer,'Anfrage',phone,clean_(r[4]),clean_(r[9])||clean_(r[8]),now,due,'Offen','',now,employee]);
  ish.getRange(row,4).setValue(customer);ish.getRange(row,6).setValue(phone);ish.getRange(row,12).setValue('Angebot erstellt');ish.getRange(row,13).setValue('Ja');ish.getRange(row,22).setValue(offerId);ish.getRange(row,15,1,2).setValues([[now,employee]]);return {ok:true,offerId:offerId,reminderId:rid};
}

function getInquiryOffers(employee,employeePin,status){requireChef_(employee,employeePin);const sh=ensureInquiryOfferSheet_(),v=sh.getDataRange().getValues(),out=[];for(let i=1;i<v.length;i++){const r=v[i],st=clean_(r[8])||'Offen';if(status&&status!=='Alle'&&st!==status)continue;out.push({offerId:clean_(r[0]),inquiryId:clean_(r[1]),customer:clean_(r[2]),phone:clean_(r[3]),email:clean_(r[4]),description:clean_(r[5]),source:clean_(r[6]),createdAt:inquiryDate_(r[7]),status:st});}return out;}

function deleteCustomerInquiry(employee,employeePin,id){requireChef_(employee,employeePin);return updateCustomerInquiry(employee,employeePin,id,'Gelöscht',true);}

function saveManualOrder(employee,employeePin,item){
  requireChef_(employee,employeePin);item=item||{};const sh=ensureOrderSheet_(),id=clean_(item.id)||('AUF-'+Utilities.getUuid().slice(0,12)),now=new Date(),status=clean_(item.status)||'Offen';
  const row=[id,clean_(item.customer),clean_(item.address),clean_(item.phone),clean_(item.email),clean_(item.description),clean_(item.source)||'Manuell',clean_(item.inquiryId),status,now,status==='Laufend'?now:'',status==='Abgeschlossen'?now:'',now,employee,String(item.internalNote||'')];
  if(!row[1])throw new Error('Kundenname fehlt.');const v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(clean_(v[i][0])===id){row[9]=v[i][9]||now;row[10]=v[i][10]||row[10];row[11]=v[i][11]||row[11];if(item.internalNote===undefined)row[14]=v[i][14]||'';sh.getRange(i+1,1,1,15).setValues([row]);return {ok:true,id:id};}sh.appendRow(row);if(item.inquiryId&&!/^AQON:/.test(String(item.inquiryId)))updateCustomerInquiry(employee,employeePin,item.inquiryId,'Übernommen',true);return {ok:true,id:id};
}

function getManualOrders(employee,employeePin,status){requireChef_(employee,employeePin);const sh=ensureOrderSheet_(),v=sh.getDataRange().getValues(),out=[];for(let i=1;i<v.length;i++){const r=v[i],st=clean_(r[8])||'Offen';if(status&&status!=='Alle'&&st!==status)continue;out.push({id:clean_(r[0]),customer:clean_(r[1]),address:clean_(r[2]),phone:clean_(r[3]),email:clean_(r[4]),description:clean_(r[5]),source:clean_(r[6]),inquiryId:clean_(r[7]),status:st,createdAt:inquiryDate_(r[9]),startedAt:inquiryDate_(r[10]),completedAt:inquiryDate_(r[11]),internalNote:clean_(r[14])});}return out;}

function saveManualOrderNote(employee,employeePin,id,note){requireChef_(employee,employeePin);const sh=ensureOrderSheet_(),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(clean_(v[i][0])===clean_(id)){sh.getRange(i+1,15).setValue(String(note||''));sh.getRange(i+1,13,1,2).setValues([[new Date(),employee]]);return {ok:true};}throw new Error('Auftrag nicht gefunden.');}

function setManualOrderStatus(employee,employeePin,id,status){requireChef_(employee,employeePin);const allowed=['Ohne Termin','Termin zu vereinbaren','Offen','Laufend','Abgeschlossen','In Regiebericht uebernommen','Offenes Angebot','Angebot Abgelehnt','Angebot zu erstellen'];if(allowed.indexOf(status)<0)throw new Error('Ungültiger Auftragsstatus.');const sh=ensureOrderSheet_(),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(clean_(v[i][0])===clean_(id)){sh.getRange(i+1,9).setValue(status);if(status==='Laufend'&&!v[i][10])sh.getRange(i+1,11).setValue(new Date());if(status==='Abgeschlossen')sh.getRange(i+1,12).setValue(new Date());sh.getRange(i+1,13,1,2).setValues([[new Date(),employee]]);return {ok:true,id:id,status:status};}throw new Error('Auftrag nicht gefunden.');}

function deleteManualOrder(employee,employeePin,id){requireChef_(employee,employeePin);const sh=ensureOrderSheet_(),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(clean_(v[i][0])===clean_(id)){if(clean_(v[i][8])==='Laufend')throw new Error('Laufende Aufträge bitte zuerst auf Offen setzen oder abschließen.');sh.deleteRow(i+1);return {ok:true};}throw new Error('Auftrag nicht gefunden.');}


function inquiryRow_(id){const sh=ensureInquirySheet_(),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(clean_(v[i][0])===clean_(id))return {sheet:sh,row:i+1,values:v[i]};return null;}
function archiveCustomerInquiry(employee,employeePin,id){requireChef_(employee,employeePin);const rec=inquiryRow_(id);if(!rec)throw new Error('Anfrage nicht gefunden.');rec.sheet.getRange(rec.row,12).setValue('Archiviert');rec.sheet.getRange(rec.row,13).setValue('Ja');rec.sheet.getRange(rec.row,18).setValue('Termin vereinbart');rec.sheet.getRange(rec.row,15,1,2).setValues([[new Date(),employee]]);return {ok:true};}
function rejectCustomerInquiry(employee,employeePin,id){requireChef_(employee,employeePin);const rec=inquiryRow_(id);if(!rec)throw new Error('Anfrage nicht gefunden.');const gmail=trashInquiryGmailIds_(inquiryGmailIdsByRow_(rec.values));rec.sheet.getRange(rec.row,12).setValue('Gelöscht');rec.sheet.getRange(rec.row,13).setValue('Ja');rec.sheet.getRange(rec.row,18).setValue('Abgelehnt');rec.sheet.getRange(rec.row,15,1,2).setValues([[new Date(),employee]]);return {ok:true,gmail:gmail};}
function ensureInquiryReminderSheet_(){const ss=getSpreadsheet_();let sh=ss.getSheetByName('AnfragenReminder');const h=['Reminder-ID','Anfrage-ID','Kundenname','Telefon','E-Mail','Beschreibung','Quelle','Erstellt am','Faellig am','Status','Ergebnis','Geaendert am','Geaendert von'];if(!sh){sh=ss.insertSheet('AnfragenReminder');sh.appendRow(h);sh.setFrozenRows(1);}else{if(sh.getMaxColumns()<h.length)sh.insertColumnsAfter(sh.getMaxColumns(),h.length-sh.getMaxColumns());sh.getRange(1,1,1,h.length).setValues([h]);}return sh;}
function inquiryReminderRow_(sh,id){const v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(clean_(v[i][0])===clean_(id))return {row:i+1,values:v[i]};return null;}
function inquiryReminderByInquiry_(sh,id){const v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(clean_(v[i][1])===clean_(id)&&clean_(v[i][9])==='Offen')return {row:i+1,values:v[i]};return null;}
function createInquiryReminder(employee,employeePin,id,days,reminderId){requireChef_(employee,employeePin);days=Number(days)||0;if(days<1||days>10)throw new Error('Reminder muss zwischen 1 und 10 Tagen liegen.');const rec=inquiryRow_(id);if(!rec)throw new Error('Anfrage nicht gefunden.');const st=clean_(rec.values[11])||'Neu';if(['Gelöscht','Archiviert','Übernommen','Erledigt'].indexOf(st)>=0)throw new Error('Diese Anfrage ist nicht mehr offen.');const sh=ensureInquiryReminderSheet_(),now=new Date(),due=reminderDueDateFromDays_(days),existing=inquiryReminderByInquiry_(sh,id),rid=existing?clean_(existing.values[0]):(clean_(reminderId)||('ANFREM-'+Utilities.getUuid()));const row=[rid,id,clean_(rec.values[3]),clean_(rec.values[5]),clean_(rec.values[4]),clean_(rec.values[9])||clean_(rec.values[8]),clean_(rec.values[1]),now,due,'Offen','',now,employee];if(existing)sh.getRange(existing.row,1,1,row.length).setValues([row]);else sh.appendRow(row);rec.sheet.getRange(rec.row,12).setValue('Reminder');rec.sheet.getRange(rec.row,13).setValue('Ja');rec.sheet.getRange(rec.row,15,1,2).setValues([[new Date(),employee]]);return {ok:true,reminderId:rid,dueDate:Utilities.formatDate(due,CONFIG.TZ,'yyyy-MM-dd')};}
function getInquiryReminders(employee,employeePin,includeDone){requireChef_(employee,employeePin);const sh=ensureInquiryReminderSheet_(),v=sh.getDataRange().getValues(),today=Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd'),out=[];for(let i=1;i<v.length;i++){const st=clean_(v[i][9])||'Offen';if(!includeDone&&st!=='Offen')continue;const due=normalizeDate_(v[i][8]),rec=inquiryRow_(clean_(v[i][1]));out.push({id:clean_(v[i][0]),inquiryId:clean_(v[i][1]),customer:clean_(v[i][2]),phone:clean_(v[i][3]),email:clean_(v[i][4]),description:clean_(v[i][5]),source:clean_(v[i][6]),createdAt:v[i][7]?formatDateTimeDE_(v[i][7]):'',dueDate:due,status:st,result:clean_(v[i][10]),internalNote:rec?clean_(rec.values[16]):'',externalUrl:rec?clean_(rec.values[22]):'',phoneUrl:rec?clean_(rec.values[23]):'',isDue:!!due&&due<=today,isOverdue:!!due&&due<today});}out.sort(function(a,b){return String(a.dueDate).localeCompare(String(b.dueDate))||a.customer.localeCompare(b.customer,'de');});return out;}
function finishInquiryReminder_(employee,reminderId,result,newStatus){const sh=ensureInquiryReminderSheet_(),rem=inquiryReminderRow_(sh,reminderId);if(!rem)throw new Error('Anfrage-Reminder wurde nicht gefunden.');if(clean_(rem.values[9])!=='Offen')throw new Error('Reminder ist bereits erledigt.');const rec=inquiryRow_(clean_(rem.values[1]));if(!rec)throw new Error('Zugehörige Anfrage wurde nicht gefunden.');rec.sheet.getRange(rec.row,12).setValue(newStatus);rec.sheet.getRange(rec.row,13).setValue('Ja');if(newStatus==='Archiviert')rec.sheet.getRange(rec.row,18).setValue('Termin vereinbart');rec.sheet.getRange(rec.row,15,1,2).setValues([[new Date(),employee]]);sh.getRange(rem.row,10,1,4).setValues([['Erledigt',result,new Date(),employee]]);return {ok:true,inquiryId:clean_(rem.values[1])};}
function reopenInquiryReminder(employee,employeePin,reminderId){requireChef_(employee,employeePin);return finishInquiryReminder_(employee,reminderId,'Zurück zu offenen Anfragen','Neu');}
function archiveInquiryReminder(employee,employeePin,reminderId){requireChef_(employee,employeePin);return finishInquiryReminder_(employee,reminderId,'Termin vereinbart','Archiviert');}
function rejectInquiryReminder(employee,employeePin,reminderId){requireChef_(employee,employeePin);const sh=ensureInquiryReminderSheet_(),rem=inquiryReminderRow_(sh,reminderId);if(!rem)throw new Error('Anfrage-Reminder wurde nicht gefunden.');const result=rejectCustomerInquiry(employee,employeePin,clean_(rem.values[1]));sh.getRange(rem.row,10,1,4).setValues([['Erledigt','Abgelehnt',new Date(),employee]]);return result;}



// ===== DG 6.0.3: Eigene Reminder mit Spracheingabe im Frontend und Dateianhaengen =====
function ensureOwnReminderSheet_(){
  const ss=getSpreadsheet_();let sh=ss.getSheetByName('EigeneReminder');
  const h=['Reminder-ID','Text','Faellig am','Status','Ergebnis','Erstellt am','Erstellt von','Geaendert am','Geaendert von','Anhaenge JSON','Interne Notiz'];
  if(!sh){sh=ss.insertSheet('EigeneReminder');sh.appendRow(h);sh.setFrozenRows(1);}else{if(sh.getMaxColumns()<h.length)sh.insertColumnsAfter(sh.getMaxColumns(),h.length-sh.getMaxColumns());sh.getRange(1,1,1,h.length).setValues([h]);}
  return sh;
}
function ensureOwnReminderFolder_(){
  const parent=ensurePhotoFolder_(),it=parent.getFoldersByName('Eigene Reminder');
  if(!it.hasNext())return parent.createFolder('Eigene Reminder');
  const folder=it.next();if(it.hasNext())throw new Error('Mehrere Unterordner „Eigene Reminder“ gefunden. Bitte Speicherpfad bereinigen.');
  return folder;
}
function ownReminderRow_(sh,id){const v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(clean_(v[i][0])===clean_(id))return{row:i+1,values:v[i]};return null;}
function ownReminderAttachments_(value){try{const x=JSON.parse(String(value||'[]'));return Array.isArray(x)?x:[];}catch(_e){return[];}}
function ownReminderDueDate_(value){const due=normalizeDate_(value);if(!validDate3_(due))throw new Error('Bitte ein gültiges Fälligkeitsdatum wählen.');const today=Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd');if(due<today)throw new Error('Das Fälligkeitsdatum darf nicht in der Vergangenheit liegen.');const p=due.split('-').map(Number);return{date:new Date(p[0],p[1]-1,p[2],12,0,0,0),text:due};}
function saveOwnReminderFiles_(employee,reminderId,files){
  if(!Array.isArray(files)||!files.length)return[];
  if(files.length>5)throw new Error('Maximal 5 Bilder oder Dateien pro Reminder.');
  const folder=ensureOwnReminderFolder_(),out=[],now=new Date();
  try{
    files.forEach(function(f,i){
      const dataUrl=String(f&&f.dataUrl||''),m=dataUrl.match(/^data:([^;]+);base64,(.+)$/);if(!m)throw new Error('Eine Datei konnte nicht verarbeitet werden.');
      const original=clean_(f.name)||('Datei_'+(i+1)),mime=clean_(m[1]||f.type||'application/octet-stream').toLowerCase(),ext=(original.match(/\.([A-Za-z0-9]{1,8})$/)||[])[1]||'';
      const okMime=/^image\/(jpeg|jpg|png|webp|heic|heif)$/.test(mime)||['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.ms-excel','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/csv','application/zip','application/x-zip-compressed','application/octet-stream'].includes(mime);
      const okExt=!ext||/^(jpg|jpeg|png|webp|heic|heif|pdf|doc|docx|xls|xlsx|txt|csv|zip)$/i.test(ext);
      if(!okMime||!okExt)throw new Error('Dateityp nicht erlaubt: '+original+'. Erlaubt sind Bilder, PDF, Word, Excel, TXT, CSV und ZIP.');
      const bytes=Utilities.base64Decode(m[2]);if(bytes.length>5*1024*1024)throw new Error('Eine Datei ist größer als 5 MB: '+original);
      const name='Reminder_'+safeFilePart_(reminderId)+'_'+Utilities.formatDate(now,CONFIG.TZ,'yyyyMMdd_HHmmss')+'_'+(i+1)+'_'+safeFilePart_(original);
      const file=folder.createFile(Utilities.newBlob(bytes,mime,name));
      out.push({fileId:file.getId(),url:file.getUrl(),name:original,mime:mime,size:bytes.length});
    });
    return out;
  }catch(err){
    out.forEach(function(a){try{if(a.fileId)DriveApp.getFileById(a.fileId).setTrashed(true);}catch(_e){}});
    throw err;
  }
}
function createOwnReminder(employee,employeePin,item){
  requireChef_(employee,employeePin);item=item||{};const text=String(item.text||'').trim();if(!text)throw new Error('Bitte einen Reminder-Text eingeben.');if(text.length>5000)throw new Error('Der Reminder-Text ist zu lang.');
  const due=ownReminderDueDate_(item.dueDate),sh=ensureOwnReminderSheet_(),id=clean_(item.id)||('EIGREM-'+Utilities.getUuid()),now=new Date();let attachments=[];
  try{
    attachments=saveOwnReminderFiles_(employee,id,item.files||[]);
    sh.appendRow([id,text,due.date,'Offen','',now,clean_(employee),now,clean_(employee),JSON.stringify(attachments),'']);SpreadsheetApp.flush();
    return{ok:true,id:id,dueDate:due.text,attachmentCount:attachments.length};
  }catch(err){
    attachments.forEach(function(a){try{if(a.fileId)DriveApp.getFileById(a.fileId).setTrashed(true);}catch(_e){}});
    throw err;
  }
}
function getOwnReminders(employee,employeePin,includeDone){
  requireChef_(employee,employeePin);const sh=ensureOwnReminderSheet_(),v=sh.getDataRange().getValues(),today=Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd'),out=[];
  for(let i=1;i<v.length;i++){const st=clean_(v[i][3])||'Offen';if(!includeDone&&st!=='Offen')continue;const due=normalizeDate_(v[i][2]);out.push({id:clean_(v[i][0]),text:clean_(v[i][1]),dueDate:due,status:st,result:clean_(v[i][4]),createdAt:v[i][5]?formatDateTimeDE_(v[i][5]):'',createdBy:clean_(v[i][6]),changedAt:v[i][7]?formatDateTimeDE_(v[i][7]):'',changedBy:clean_(v[i][8]),attachments:ownReminderAttachments_(v[i][9]),internalNote:clean_(v[i][10]),isDue:!!due&&due<=today,isOverdue:!!due&&due<today});}
  out.sort(function(a,b){return String(a.dueDate).localeCompare(String(b.dueDate))||a.text.localeCompare(b.text,'de');});return out;
}
function saveOwnReminderInternalNote(employee,employeePin,reminderId,note){
  requireChef_(employee,employeePin);
  note=String(note==null?'':note).trim();
  if(note.length>5000)throw new Error('Die interne Notiz ist zu lang.');
  const sh=ensureOwnReminderSheet_(),rec=ownReminderRow_(sh,reminderId);
  if(!rec)throw new Error('Eigener Reminder wurde nicht gefunden.');
  if((clean_(rec.values[3])||'Offen')!=='Offen')throw new Error('Reminder ist bereits erledigt.');
  sh.getRange(rec.row,11).setValue(note);
  sh.getRange(rec.row,8,1,2).setValues([[new Date(),clean_(employee)]]);
  SpreadsheetApp.flush();
  return{ok:true,id:clean_(reminderId),internalNote:note};
}
function rescheduleOwnReminder(employee,employeePin,reminderId,dueDate){
  requireChef_(employee,employeePin);const sh=ensureOwnReminderSheet_(),rec=ownReminderRow_(sh,reminderId);if(!rec)throw new Error('Eigener Reminder wurde nicht gefunden.');if((clean_(rec.values[3])||'Offen')!=='Offen')throw new Error('Reminder ist bereits erledigt.');const due=ownReminderDueDate_(dueDate);sh.getRange(rec.row,3).setValue(due.date);sh.getRange(rec.row,8,1,2).setValues([[new Date(),clean_(employee)]]);return{ok:true,id:clean_(reminderId),dueDate:due.text};
}
function completeOwnReminder(employee,employeePin,reminderId){
  requireChef_(employee,employeePin);const sh=ensureOwnReminderSheet_(),rec=ownReminderRow_(sh,reminderId);if(!rec)throw new Error('Eigener Reminder wurde nicht gefunden.');if((clean_(rec.values[3])||'Offen')!=='Offen')throw new Error('Reminder ist bereits erledigt.');sh.getRange(rec.row,4,1,6).setValues([['Erledigt','Erledigt',rec.values[5],rec.values[6],new Date(),clean_(employee)]]);return{ok:true,id:clean_(reminderId)};
}
function deleteOwnReminder(employee,employeePin,reminderId){
  requireChef_(employee,employeePin);const sh=ensureOwnReminderSheet_(),rec=ownReminderRow_(sh,reminderId);if(!rec)throw new Error('Eigener Reminder wurde nicht gefunden.');ownReminderAttachments_(rec.values[9]).forEach(function(a){try{if(a.fileId)DriveApp.getFileById(a.fileId).setTrashed(true);}catch(_e){}});sh.getRange(rec.row,4,1,6).setValues([['Gelöscht','Gelöscht',rec.values[5],rec.values[6],new Date(),clean_(employee)]]);return{ok:true,id:clean_(reminderId)};
}


function ensureRegieAttachmentSheet_(){
  const ss=getSpreadsheet_();let sh=ss.getSheetByName('RegieZusatzdateien');
  const h=['ID','Objekt-IDs','Kunde','Datei-ID','URL','Dateiname','MIME','Hochgeladen am','Hochgeladen von'];
  if(!sh){sh=ss.insertSheet('RegieZusatzdateien');sh.appendRow(h);sh.setFrozenRows(1);}else{if(sh.getMaxColumns()<h.length)sh.insertColumnsAfter(sh.getMaxColumns(),h.length-sh.getMaxColumns());sh.getRange(1,1,1,h.length).setValues([h]);}return sh;
}
function ensureRegieAttachmentFolder_(){
  const parent=ensurePhotoFolder_(),it=parent.getFoldersByName('Regieanlagen');
  if(!it.hasNext())return parent.createFolder('Regieanlagen');
  const folder=it.next();if(it.hasNext())throw new Error('Mehrere Unterordner „Regieanlagen“ gefunden. Bitte Speicherpfad bereinigen.');
  return folder;
}
function regieAttachmentRows_(objectIds){
  const ids=(objectIds||[]).map(clean_).filter(Boolean),wanted={};ids.forEach(id=>wanted[id]=1);if(!ids.length)return [];
  const sh=ensureRegieAttachmentSheet_(),v=sh.getDataRange().getValues(),out=[];
  for(let i=1;i<v.length;i++){const rowIds=String(v[i][1]||'').split('|').map(clean_).filter(Boolean);if(!rowIds.some(id=>wanted[id]))continue;out.push({id:clean_(v[i][0]),objectIds:rowIds,customer:clean_(v[i][2]),fileId:clean_(v[i][3]),url:clean_(v[i][4]),name:clean_(v[i][5]),mime:clean_(v[i][6]),uploadedAt:v[i][7]?formatDateTimeDE_(v[i][7]):'',uploadedBy:clean_(v[i][8])});}
  return out;
}
function getRegieAttachments(employee,employeePin,objectIds){requireChef_(employee,employeePin);return regieAttachmentRows_(objectIds);}
function addRegieAttachments(employee,employeePin,objectIds,customer,files){
  requireChef_(employee,employeePin);const ids=Array.from(new Set((objectIds||[]).map(clean_).filter(Boolean)));if(!ids.length)throw new Error('Objekt-ID fehlt.');if(!Array.isArray(files)||!files.length)throw new Error('Keine Datei ausgewählt.');if(files.length>5)throw new Error('Maximal 5 Dateien pro Upload.');
  const folder=ensureRegieAttachmentFolder_(),sh=ensureRegieAttachmentSheet_(),now=new Date(),out=[];
  files.forEach(function(f,i){const dataUrl=String(f&&f.dataUrl||''),m=dataUrl.match(/^data:([^;]+);base64,(.+)$/);if(!m)throw new Error('Eine Datei konnte nicht verarbeitet werden.');const mime=clean_(m[1]).toLowerCase();if(!(mime==='application/pdf'||/^image\/(jpeg|jpg|png|webp)$/.test(mime)))throw new Error('Erlaubt sind PDF, JPG, PNG und WEBP.');const bytes=Utilities.base64Decode(m[2]);if(bytes.length>5*1024*1024)throw new Error('Eine Datei ist größer als 5 MB.');const original=clean_(f.name)||('Datei_'+(i+1));const safe=safeFilePart_(original.replace(/\.[^.]+$/,''));const ext=(original.match(/\.[A-Za-z0-9]{2,5}$/)||[mime==='application/pdf'?'.pdf':'.jpg'])[0];const name='Regieanlage_'+safeFilePart_(customer||'Objekt')+'_'+Utilities.formatDate(now,CONFIG.TZ,'yyyyMMdd_HHmmss')+'_'+(i+1)+'_'+safe+ext;const file=folder.createFile(Utilities.newBlob(bytes,mime,name));const rid='REGATT-'+Utilities.getUuid();sh.appendRow([rid,ids.join('|'),clean_(customer),file.getId(),file.getUrl(),original,mime,now,clean_(employee)]);out.push({id:rid,fileId:file.getId(),url:file.getUrl(),name:original,mime:mime,uploadedAt:formatDateTimeDE_(now),uploadedBy:clean_(employee)});});
  return out;
}

// DG 5.1 Performance: nur die fuer eine Aktion benoetigten Schemata vorbereiten.
function dg51NeedsMaintenanceSchema_(action){
  action=clean_(action);
  return /maintenance/i.test(action)||action==='getRegieReports'||action==='systemHealthCheck';
}
function dg51NeedsPlannerSchema_(action){
  action=clean_(action);
  return /planner/i.test(action)||/ExternalGoogleEvent/.test(action)||action==='transferPlannerEvent'||action==='planRequest3'||dg51NeedsMaintenanceSchema_(action)||action==='systemHealthCheck';
}
function dg51CacheGetJson_(key){try{const raw=CacheService.getScriptCache().get(key);return raw?JSON.parse(raw):null;}catch(_e){return null;}}
function dg51CachePutJson_(key,value,seconds){try{CacheService.getScriptCache().put(key,JSON.stringify(value),seconds);}catch(_e){}}
function dg51SafeCacheKey_(value){return String(value||'').replace(/[^A-Za-z0-9_.-]/g,'_').slice(0,120);}

function dg51GetDayData_(employee,date,pin,force){
  const key='DG51_DAY_'+dg51SafeCacheKey_(employee)+'_'+dg51SafeCacheKey_(date);
  if(!force){const cached=dg51CacheGetJson_(key);if(cached)return cached;}
  const data=getDayData(employee,date,pin);dg51CachePutJson_(key,data,20);return data;
}
function dg51GetEmployeeCalendarEvents_(employee,pin,startDate,days,force){
  const key='DG51_CAL_'+dg51SafeCacheKey_(employee)+'_'+dg51SafeCacheKey_(startDate)+'_'+Number(days||3);
  if(!force){const cached=dg51CacheGetJson_(key);if(cached)return cached;}
  const data=getEmployeeCalendarEvents(employee,pin,startDate,days);dg51CachePutJson_(key,data,30);return data;
}
function dg51CurrentMaintenanceOpen_(employee,pin){
  requireChef_(employee,pin);ensureMaintenanceSchema37_();ensurePlannerSheets_();
  const current=Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM');
  const due=maintenanceDevices37_().filter(function(d){return d.active&&d.nextMaintenanceDue===current;});
  if(!due.length)return 0;
  const planned={};getPlannerEventRows_().forEach(function(e){if(e.type==='Wartung'&&e.maintenanceDeviceId&&String(e.date||'').slice(0,7)===current)planned[e.maintenanceDeviceId]=1;});
  return due.filter(function(d){return !planned[d.id];}).length;
}
function getDashboardSummary51_(employee,pin,force){
  requireChef_(employee,pin);
  const key='DG51_DASH_'+dg51SafeCacheKey_(employee);
  if(!force){const cached=dg51CacheGetJson_(key);if(cached)return cached;}
  const d=new Date(),year=d.getFullYear(),month=d.getMonth()+1;
  // Fuer die Kacheln reicht der alte, schlanke Regiebericht ohne Wartungs-Anreicherung.
  const reports=(typeof dg50GetRegieReportsBase_==='function'?dg50GetRegieReportsBase_:getRegieReports)(employee,pin,'Offen',0,0)||[];
  const offers=getOfferReports(employee,pin,'Zu erstellen')||[];
  const days=getBossDayClosures(employee,pin,year,month)||[];
  const reminders=getOfferReminders(employee,pin,false)||[];
  const inquiryReminders=getInquiryReminders(employee,pin,false)||[];
  const ownReminders=getOwnReminders(employee,pin,false)||[];
  const inquiries=getCustomerInquiries(employee,pin,'Offen')||[];
  const out={
    running:reports.filter(function(g){return g.jobStatus==='Laufend';}).length,
    completed:reports.filter(function(g){return g.jobStatus!=='Laufend';}).length,
    offers:offers.length,
    days:days.reduce(function(n,x){return n+(x.days||[]).filter(function(z){return !z.closed;}).length;},0),
    reminders:reminders.filter(function(x){return x.isDue;}).length+inquiryReminders.filter(function(x){return x.isDue;}).length+ownReminders.filter(function(x){return x.isDue;}).length,
    inquiries:inquiries.length,
    maintenance:dg51CurrentMaintenanceOpen_(employee,pin)
  };
  dg51CachePutJson_(key,out,180);return out;
}


/* DG 10.0 migration export: read-only, chef-authenticated, paginated.
   These functions never modify production data. */
function migrationCell10_(value) {
  if (value instanceof Date) {
    return {type:'date', value:Utilities.formatDate(value, 'UTC', "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")};
  }
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') return {type:'number', value:value};
  if (typeof value === 'boolean') return {type:'boolean', value:value};
  return {type:'string', value:String(value)};
}

function getMigrationManifest10_(employee, employeePin) {
  requireChef_(employee, employeePin);
  const ss = getSpreadsheet_();
  const props = PropertiesService.getScriptProperties();
  const sheets = ss.getSheets().map(function(sheet){
    const lastRow = sheet.getLastRow();
    const lastColumn = sheet.getLastColumn();
    let headers = [];
    if (lastRow >= 1 && lastColumn >= 1) {
      headers = sheet.getRange(1,1,1,lastColumn).getDisplayValues()[0];
    }
    return {
      name: sheet.getName(),
      sheetId: sheet.getSheetId(),
      lastRow: lastRow,
      lastColumn: lastColumn,
      dataRows: Math.max(0,lastRow-1),
      headers: headers,
      frozenRows: sheet.getFrozenRows(),
      frozenColumns: sheet.getFrozenColumns()
    };
  });
  return {
    source:'Google-GS',
    version:DG_BACKEND_VERSION,
    spreadsheetName:ss.getName(),
    spreadsheetId:ss.getId(),
    generatedAt:new Date().toISOString(),
    sheets:sheets,
    scriptPropertyKeys:props.getKeys().sort()
  };
}

function getMigrationSheetPage10_(employee, employeePin, sheetName, startRow, maxRows) {
  requireChef_(employee, employeePin);
  sheetName = clean_(sheetName);
  if (!sheetName) throw new Error('Tabellenname fehlt.');
  const ss = getSpreadsheet_();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) throw new Error('Tabelle nicht gefunden: '+sheetName);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  startRow = Math.max(2, Number(startRow)||2);
  maxRows = Math.max(1, Math.min(250, Number(maxRows)||200));
  if (lastRow < startRow || lastColumn < 1) {
    return {sheetName:sheetName,startRow:startRow,nextRow:0,lastRow:lastRow,lastColumn:lastColumn,rows:[]};
  }
  const count = Math.min(maxRows, lastRow-startRow+1);
  const range = sheet.getRange(startRow,1,count,lastColumn);
  const values = range.getValues();
  const formulas = range.getFormulas();
  const rows = values.map(function(row,ri){
    return row.map(function(value,ci){
      const out = migrationCell10_(value);
      const formula = formulas[ri][ci];
      if (formula) return {cell:out, formula:String(formula)};
      return {cell:out};
    });
  });
  const nextRow = startRow + count <= lastRow ? startRow + count : 0;
  return {
    sheetName:sheetName,
    startRow:startRow,
    nextRow:nextRow,
    lastRow:lastRow,
    lastColumn:lastColumn,
    rows:rows
  };
}

function doPost(e) {
  let data = {};
  let action = '';
  let writeLock = null;
  try {
    data = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    action = clean_(data.action);
    validateDates3_(data);
    ensureV58SchemaOnce_();
    ensureV61SchemaOnce_(); // v61 ergaenzt Stundenlohn-Spalte
    ensureV520SchemaOnce_(); // v5.2 Lohnprofil, Monatspruefung und Abschluss
    ensureDG70StorageHardening_(); // 7.0: Textspalten und Speicherpfade einmalig absichern
    if (dg51NeedsPlannerSchema_(action)) ensurePlannerSheets_();
    if (dg51NeedsMaintenanceSchema_(action)) ensureMaintenanceSchema37_();

    // v53: zentrale Rechtepruefung fuer alle Buero-/Chef-Aktionen.
    // Damit reicht es nicht, nur die Oberflaeche zu manipulieren: das Backend prueft selbst.
    const chefActions = {
      getEmployeeAdminData:1, saveEmployeeAdmin:1, setEmployeeActive:1, deleteEmployeeAdmin:1, getMonthPayrollAudit:1, getPayrollCycleState:1, completePayrollCycle:1, forceCompletePayrollCycle:1, markPayrollIssueReviewed:1, setPayrollMonthStatus:1, updateBossDayEntry:1,
      saveAbsence:1, endSicknessAbsence:1, getAbsenceOverview:1, getSicknessAlerts:1, getTimeBankAccount:1, saveTimeBankManual:1, applyTimeBankToMonth:1, bankMonthSurplus:1,
      getAbsences:1, deleteAbsence:1, syncHolidays:1, saveVacationEntitlement:1, getVacationAccount:1, getVacationAccounts:1,
      getChefEmployeeMonthData:1, getBossDayClosures:1, manualCloseBossDay:1, deleteBossDayEntry:1, getRegieReports:1, getRegieAttachments:1, addRegieAttachments:1, updateRegieReport:1, getDashboardSummary51:1,
      markRegieReportBilled:1, markRegieObjectBilled:1, markRegieObjectsBilled:1, setRegieObjectJobStatus:1, markRegieObjectCompleted:1, mergeRegieObjects:1,
      checkRegieBillingRisk:1, getBossMonthData:1, saveMonthlyAdjustment:1, deleteMonthlyAdjustment:1, markConflictReviewed:1,
      setMonthClosureStatus:1, getObjectReports:1, createTaxAdvisorPdf:1, createRegiePhotoZip:1, createRegieReportZip:1,
      getPlannerWorkers:1, getPlannerAvailability:1, getMaintenanceContracts:1, getMaintenanceOverview:1, searchMaintenanceCustomers:1, getMaintenanceCustomer:1, getMaintenanceArchive:1, saveMaintenanceCustomer:1, deleteMaintenanceDevice:1, deleteMaintenanceCustomer:1, addMaintenanceRepair:1, findMaintenanceDeviceByInternalId:1, reserveMaintenanceDeviceId:1, getMaintenanceAttachment:1, deleteMaintenanceAttachment:1, planRequest3:1,savePlannerWorker:1, movePlannerWorker:1, setPlannerWorkerActive:1, getPlannerEvents:1, savePlannerEvent:1, deletePlannerEvent:1, saveExternalGoogleEvent:1, deleteExternalGoogleEvent:1,
      getOfferReports:1, getMigrationManifest10:1, getMigrationSheetPage10:1, createInspectionOffer:1, setRegieReportsOfferStatus:1, discardOfferPermanently:1, getObjectInternalNote:1, getObjectInternalNotes:1, saveObjectInternalNote:1, acceptOfferAsRunning:1, saveOfferCreatedWithReminder:1, moveOfferBackToCreate:1, getOfferReminders:1, rescheduleOfferReminder:1, declineOfferFromReminder:1, acceptOfferFromReminder:1, getOfferStatistics:1, getOwnReminders:1, createOwnReminder:1, saveOwnReminderInternalNote:1, rescheduleOwnReminder:1, completeOwnReminder:1, deleteOwnReminder:1, transferPlannerEvent:1, getMapsBrowserConfig:1, systemHealthCheck:1, syncCustomerInquiries:1, getCustomerInquiries:1, updateCustomerInquiry:1, saveCustomerInquiryNote:1, completeCustomerInquiry:1, deleteCustomerInquiry:1, saveCustomerInquiryContact:1, archiveCustomerInquiry:1, rejectCustomerInquiry:1, createInquiryReminder:1, getInquiryReminders:1, reopenInquiryReminder:1, archiveInquiryReminder:1, rejectInquiryReminder:1, inquiryToOffer:1, saveManualOrder:1, getManualOrders:1, saveManualOrderNote:1, setManualOrderStatus:1, deleteManualOrder:1
    };
    if (chefActions[action]) requireChef_(clean_(data.employee), clean_(data.employeePin));

    // 1.0 Testphase: Schreibzugriffe serialisieren. Verhindert Doppelungen/Teilzustände,
    // wenn mehrere Monteure oder das Büro nahezu gleichzeitig speichern.
    const writeActions = {
      planRequest3:1,saveMaintenanceCustomer:1,deleteMaintenanceDevice:1,deleteMaintenanceCustomer:1,addMaintenanceRepair:1,reserveMaintenanceDeviceId:1,deleteMaintenanceAttachment:1,savePlannerWorker:1, movePlannerWorker:1, setPlannerWorkerActive:1, savePlannerEvent:1, deletePlannerEvent:1,
      saveExternalGoogleEvent:1, deleteExternalGoogleEvent:1, saveEmployeeAdmin:1, setEmployeeActive:1, deleteEmployeeAdmin:1, markPayrollIssueReviewed:1, setPayrollMonthStatus:1, completePayrollCycle:1, forceCompletePayrollCycle:1, updateBossDayEntry:1,
      saveAbsence:1, endSicknessAbsence:1, deleteAbsence:1, syncHolidays:1, saveVacationEntitlement:1, saveTimeBankManual:1, applyTimeBankToMonth:1,
      bankMonthSurplus:1, manualCloseBossDay:1, deleteBossDayEntry:1, addRegieAttachments:1, updateRegieReport:1, markRegieReportBilled:1, setRegieObjectJobStatus:1,
      markRegieObjectCompleted:1, markRegieObjectBilled:1, markRegieObjectsBilled:1, mergeRegieObjects:1, saveObjectInternalNote:1,
      createInspectionOffer:1, setRegieReportsOfferStatus:1, discardOfferPermanently:1, acceptOfferAsRunning:1, saveOfferCreatedWithReminder:1, moveOfferBackToCreate:1,
      rescheduleOfferReminder:1, declineOfferFromReminder:1, acceptOfferFromReminder:1, createOwnReminder:1, saveOwnReminderInternalNote:1, rescheduleOwnReminder:1, completeOwnReminder:1, deleteOwnReminder:1, transferPlannerEvent:1,
      setDayStatus:1, confirmEmployeeAssignment:1, reportEmployeeAssignmentIssue:1, saveEntry:1, updateEmployeeEntry:1,
      deleteEntry:1, closeDay:1, refreshClosedDay:1, saveMonthlyAdjustment:1, deleteMonthlyAdjustment:1,
      markConflictReviewed:1, setMonthClosureStatus:1, syncCustomerInquiries:1, updateCustomerInquiry:1, saveCustomerInquiryNote:1, completeCustomerInquiry:1, deleteCustomerInquiry:1, saveCustomerInquiryContact:1, archiveCustomerInquiry:1, rejectCustomerInquiry:1, createInquiryReminder:1, reopenInquiryReminder:1, archiveInquiryReminder:1, rejectInquiryReminder:1, inquiryToOffer:1, saveManualOrder:1, saveManualOrderNote:1, setManualOrderStatus:1, deleteManualOrder:1
    };
    if (writeActions[action]) {
      writeLock = LockService.getScriptLock();
      if (!writeLock.tryLock(20000)) throw new Error('Das System verarbeitet gerade eine andere Speicherung. Bitte in wenigen Sekunden erneut versuchen.');
    }

    if(action==='planRequest3')return jsonResponse_({ok:true,data:planRequest3(clean_(data.employee),clean_(data.employeePin),clean_(data.kind),clean_(data.id),Boolean(data.offer),data.item||{})});
    if (action === 'ping') {
      return jsonResponse_({ ok: true, message: 'DG Backend erreichbar', version: DG_BACKEND_VERSION });
    }

    if (action === 'getDashboardSummary51') {
      return jsonResponse_({ok:true,data:getDashboardSummary51_(clean_(data.employee),clean_(data.employeePin),Boolean(data.force))});
    }

    if (action === 'getMigrationManifest10') {
      return jsonResponse_({ok:true,data:getMigrationManifest10_(clean_(data.employee),clean_(data.employeePin))});
    }
    if (action === 'getMigrationSheetPage10') {
      return jsonResponse_({ok:true,data:getMigrationSheetPage10_(clean_(data.employee),clean_(data.employeePin),clean_(data.sheetName),Number(data.startRow)||2,Number(data.maxRows)||200)});
    }


    if (action === 'getEmployees') {
      return jsonResponse_({ ok:true, data:getEmployees() });
    }

    if (action === 'getMinimumWage') {
      const checkDate = clean_(data.date) || Utilities.formatDate(new Date(), CONFIG.TZ, 'yyyy-MM-dd');
      return jsonResponse_({ok:true,data:getMinimumWageForDate_(checkDate)});
    }

    if (action === 'getPlannerWorkers') {
      return jsonResponse_({ok:true,data:getPlannerWorkers(clean_(data.employee),clean_(data.employeePin))});
    }
    if (action === 'getPlannerAvailability') {
      return jsonResponse_({ok:true,data:getPlannerAvailability733_(clean_(data.employee),clean_(data.employeePin),clean_(data.startDate),clean_(data.endDate))});
    }
    if (action === 'getMaintenanceContracts') {
      return jsonResponse_({ok:true,data:getMaintenanceContracts(clean_(data.employee),clean_(data.employeePin))});
    }
    if (action === 'getMaintenanceOverview') {
      return jsonResponse_({ok:true,data:getMaintenanceOverview37_(clean_(data.employee),clean_(data.employeePin))});
    }
    if (action === 'searchMaintenanceCustomers') {
      return jsonResponse_({ok:true,data:searchMaintenanceCustomers37_(clean_(data.employee),clean_(data.employeePin),clean_(data.query))});
    }
    if (action === 'getMaintenanceCustomer') {
      return jsonResponse_({ok:true,data:getMaintenanceCustomer37_(clean_(data.employee),clean_(data.employeePin),clean_(data.id))});
    }
    if (action === 'findMaintenanceDeviceByInternalId') {
      return jsonResponse_({ok:true,data:findMaintenanceDeviceByInternalId39_(clean_(data.employee),clean_(data.employeePin),clean_(data.internalDeviceId))});
    }
    if (action === 'reserveMaintenanceDeviceId') {
      return jsonResponse_({ok:true,data:{internalDeviceId:reserveMaintenanceDeviceId39_(clean_(data.employee),clean_(data.employeePin))}});
    }
    if (action === 'getMaintenanceAttachment') {
      return jsonResponse_({ok:true,data:getMaintenanceAttachment501_(clean_(data.employee),clean_(data.employeePin),clean_(data.id))});
    }
    if (action === 'deleteMaintenanceAttachment') {
      return jsonResponse_({ok:true,data:deleteMaintenanceAttachment501_(clean_(data.employee),clean_(data.employeePin),clean_(data.id))});
    }
    if (action === 'saveMaintenanceCustomer') {
      return jsonResponse_({ok:true,data:saveMaintenanceCustomer37_(clean_(data.employee),clean_(data.employeePin),data.item||{})});
    }
    if (action === 'deleteMaintenanceDevice') {
      return jsonResponse_({ok:true,data:deleteMaintenanceDevice38_(clean_(data.employee),clean_(data.employeePin),clean_(data.id))});
    }
    if (action === 'deleteMaintenanceCustomer') {
      return jsonResponse_({ok:true,data:deleteMaintenanceCustomer38_(clean_(data.employee),clean_(data.employeePin),clean_(data.id))});
    }
    if (action === 'addMaintenanceRepair') {
      return jsonResponse_({ok:true,data:addMaintenanceRepair37_(clean_(data.employee),clean_(data.employeePin),clean_(data.deviceId),clean_(data.date),clean_(data.description))});
    }
    if (action === 'getMaintenanceArchive') {
      return jsonResponse_({ok:true,data:getMaintenanceArchive37_(clean_(data.employee),clean_(data.employeePin),clean_(data.query))});
    }
    if (action === 'addManualMaintenanceCount') {
      return jsonResponse_({ok:true,data:addManualMaintenanceCount502_(clean_(data.employee),clean_(data.employeePin),clean_(data.date),Number(data.count)||0,clean_(data.note))});
    }
    if (action === 'savePlannerWorker') {
      return jsonResponse_({ok:true,data:savePlannerWorker(clean_(data.employee),clean_(data.employeePin),data.item||{})});
    }
    if (action === 'movePlannerWorker') {
      return jsonResponse_({ok:true,data:movePlannerWorker(clean_(data.employee),clean_(data.employeePin),clean_(data.id),Number(data.direction)||0)});
    }
    if (action === 'setPlannerWorkerActive') {
      return jsonResponse_({ok:true,data:setPlannerWorkerActive(clean_(data.employee),clean_(data.employeePin),clean_(data.id),Boolean(data.active))});
    }
    if (action === 'getPlannerEvents') {
      return jsonResponse_({ok:true,data:getPlannerEvents(clean_(data.employee),clean_(data.employeePin),clean_(data.startDate),clean_(data.endDate))});
    }
    if (action === 'savePlannerEvent') {
      return jsonResponse_({ok:true,data:savePlannerEvent(clean_(data.employee),clean_(data.employeePin),data.item||{})});
    }
    if (action === 'deletePlannerEvent') {
      return jsonResponse_({ok:true,data:deletePlannerEvent(clean_(data.employee),clean_(data.employeePin),clean_(data.id))});
    }
    if (action === 'saveExternalGoogleEvent') {
      return jsonResponse_({ok:true,data:saveExternalGoogleEvent(clean_(data.employee),clean_(data.employeePin),data.item||{})});
    }
    if (action === 'deleteExternalGoogleEvent') {
      return jsonResponse_({ok:true,data:deleteExternalGoogleEvent(clean_(data.employee),clean_(data.employeePin),data.item||{})});
    }
    if (action === 'transferPlannerEvent') {
      return jsonResponse_({ok:true,data:transferPlannerEvent(clean_(data.employee),clean_(data.employeePin),data.item||{})});
    }
    if (action === 'getMapsBrowserConfig') {
      return jsonResponse_({ok:true,data:getMapsBrowserConfig(clean_(data.employee),clean_(data.employeePin))});
    }
    if (action === 'systemHealthCheck') {
      return jsonResponse_({ok:true,data:systemHealthCheck(clean_(data.employee),clean_(data.employeePin))});
    }
    if (action === 'syncCustomerInquiries') {
      return jsonResponse_({ok:true,data:syncCustomerInquiries(clean_(data.employee),clean_(data.employeePin))});
    }
    if (action === 'getCustomerInquiries') {
      return jsonResponse_({ok:true,data:getCustomerInquiries(clean_(data.employee),clean_(data.employeePin),clean_(data.status)||'Offen')});
    }
    if (action === 'archiveCustomerInquiry') {
      return jsonResponse_({ok:true,data:archiveCustomerInquiry(clean_(data.employee),clean_(data.employeePin),clean_(data.id))});
    }
    if (action === 'rejectCustomerInquiry') {
      return jsonResponse_({ok:true,data:rejectCustomerInquiry(clean_(data.employee),clean_(data.employeePin),clean_(data.id))});
    }
    if (action === 'createInquiryReminder') {
      return jsonResponse_({ok:true,data:createInquiryReminder(clean_(data.employee),clean_(data.employeePin),clean_(data.id),Number(data.days)||0,clean_(data.reminderId))});
    }
    if (action === 'getInquiryReminders') {
      return jsonResponse_({ok:true,data:getInquiryReminders(clean_(data.employee),clean_(data.employeePin),Boolean(data.includeDone))});
    }
    if (action === 'reopenInquiryReminder') {
      return jsonResponse_({ok:true,data:reopenInquiryReminder(clean_(data.employee),clean_(data.employeePin),clean_(data.reminderId))});
    }
    if (action === 'archiveInquiryReminder') {
      return jsonResponse_({ok:true,data:archiveInquiryReminder(clean_(data.employee),clean_(data.employeePin),clean_(data.reminderId))});
    }
    if (action === 'rejectInquiryReminder') {
      return jsonResponse_({ok:true,data:rejectInquiryReminder(clean_(data.employee),clean_(data.employeePin),clean_(data.reminderId))});
    }
    if (action === 'updateCustomerInquiry') {
      return jsonResponse_({ok:true,data:updateCustomerInquiry(clean_(data.employee),clean_(data.employeePin),clean_(data.id),clean_(data.status),data.markRead!==false)});
    }
    if (action === 'saveCustomerInquiryNote') {
      return jsonResponse_({ok:true,data:saveCustomerInquiryNote(clean_(data.employee),clean_(data.employeePin),clean_(data.id),data.note)});
    }
    if (action === 'completeCustomerInquiry') {
      return jsonResponse_({ok:true,data:completeCustomerInquiry(clean_(data.employee),clean_(data.employeePin),clean_(data.id),clean_(data.reason),data.note)});
    }
    if (action === 'deleteCustomerInquiry') {
      return jsonResponse_({ok:true,data:deleteCustomerInquiry(clean_(data.employee),clean_(data.employeePin),clean_(data.id))});
    }
    if (action === 'saveCustomerInquiryContact') {
      return jsonResponse_({ok:true,data:saveCustomerInquiryContact(clean_(data.employee),clean_(data.employeePin),clean_(data.id),clean_(data.date),clean_(data.time),clean_(data.person),data.note)});
    }
    if (action === 'inquiryToOffer') {
      return jsonResponse_({ok:true,data:inquiryToOffer(clean_(data.employee),clean_(data.employeePin),clean_(data.id),clean_(data.customer),clean_(data.phone))});
    }
    if (action === 'getInquiryOffers') {
      return jsonResponse_({ok:true,data:getInquiryOffers(clean_(data.employee),clean_(data.employeePin),clean_(data.status)||'Offen')});
    }
    if (action === 'saveManualOrder') {
      return jsonResponse_({ok:true,data:saveManualOrder(clean_(data.employee),clean_(data.employeePin),data.item||{})});
    }
    if (action === 'getManualOrders') {
      return jsonResponse_({ok:true,data:getManualOrders(clean_(data.employee),clean_(data.employeePin),clean_(data.status)||'Alle')});
    }
    if (action === 'saveManualOrderNote') {
      return jsonResponse_({ok:true,data:saveManualOrderNote(clean_(data.employee),clean_(data.employeePin),clean_(data.id),data.note)});
    }
    if (action === 'setManualOrderStatus') {
      return jsonResponse_({ok:true,data:setManualOrderStatus(clean_(data.employee),clean_(data.employeePin),clean_(data.id),clean_(data.status))});
    }
    if (action === 'deleteManualOrder') {
      return jsonResponse_({ok:true,data:deleteManualOrder(clean_(data.employee),clean_(data.employeePin),clean_(data.id))});
    }

    if (action === 'getEmployeeAdminData') {
      return jsonResponse_({ok:true,data:getEmployeeAdminData(clean_(data.employee),clean_(data.employeePin))});
    }
    if (action === 'getMonthPayrollAudit') {
      return jsonResponse_({ok:true,data:getMonthPayrollAudit(clean_(data.employee),clean_(data.employeePin),Number(data.year),Number(data.month))});
    }
    if (action === 'getPayrollCycleState') {
      return jsonResponse_({ok:true,data:getPayrollCycleState73_(clean_(data.employee),clean_(data.employeePin),Number(data.year),Number(data.month))});
    }
    if (action === 'completePayrollCycle') {
      return jsonResponse_({ok:true,data:completePayrollCycle73_(clean_(data.employee),clean_(data.employeePin),Number(data.year),Number(data.month))});
    }
    if (action === 'forceCompletePayrollCycle') {
      return jsonResponse_({ok:true,data:forceCompletePayrollCycle736_(clean_(data.employee),clean_(data.employeePin),Number(data.year),Number(data.month),clean_(data.reason))});
    }
    if (action === 'markPayrollIssueReviewed') {
      return jsonResponse_({ok:true,data:markPayrollIssueReviewed(clean_(data.employee),clean_(data.employeePin),clean_(data.issueId),clean_(data.targetEmployee),Number(data.year),Number(data.month),clean_(data.date),clean_(data.note))});
    }
    if (action === 'setPayrollMonthStatus') {
      return jsonResponse_({ok:true,data:setPayrollMonthStatus(clean_(data.employee),clean_(data.employeePin),Number(data.year),Number(data.month),clean_(data.payrollAction),clean_(data.reason))});
    }
    if (action === 'saveEmployeeAdmin') {
      return jsonResponse_({ok:true,data:saveEmployeeAdmin(clean_(data.employee),clean_(data.employeePin),data.item||{})});
    }
    if (action === 'setEmployeeActive') {
      return jsonResponse_({ok:true,data:setEmployeeActive(clean_(data.employee),clean_(data.employeePin),clean_(data.targetName),Boolean(data.active))});
    }
    if (action === 'deleteEmployeeAdmin') {
      return jsonResponse_({ok:true,data:deleteEmployeeAdmin(clean_(data.employee),clean_(data.employeePin),clean_(data.targetName),clean_(data.confirmationPin))});
    }
    if (action === 'saveAbsence') {
      return jsonResponse_({ok:true,data:saveAbsence(clean_(data.employee),clean_(data.employeePin),clean_(data.targetEmployee),clean_(data.type),clean_(data.startDate),clean_(data.endDate),clean_(data.sicknessMode),clean_(data.continuationCaseId))});
    }
    if (action === 'endSicknessAbsence') {
      return jsonResponse_({ok:true,data:endSicknessAbsence734_(clean_(data.employee),clean_(data.employeePin),clean_(data.id),clean_(data.returnDate))});
    }
    if (action === 'getObjectInternalNotes') {
      return jsonResponse_({ok:true,data:getObjectInternalNotes(clean_(data.employee),clean_(data.employeePin),Array.isArray(data.objectIds)?data.objectIds:[])});
    }
    if (action === 'getAbsenceOverview') {
      return jsonResponse_({ok:true,data:getAbsenceOverview734_(clean_(data.employee),clean_(data.employeePin),clean_(data.targetEmployee),Number(data.year)||Number(Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy')))});
    }
    if (action === 'getSicknessAlerts') {
      return jsonResponse_({ok:true,data:getSicknessAlerts734_(clean_(data.employee),clean_(data.employeePin))});
    }
    if (action === 'getTimeBankAccount') {
      return jsonResponse_({ok:true,data:getTimeBankAccount(clean_(data.employee),clean_(data.employeePin),clean_(data.targetEmployee))});
    }
    if (action === 'getMyTimeBank') {
      return jsonResponse_({ok:true,data:getMyTimeBank(clean_(data.employee),clean_(data.pin))});
    }
    if (action === 'saveTimeBankManual') {
      return jsonResponse_({ok:true,data:saveTimeBankManual(clean_(data.employee),clean_(data.employeePin),clean_(data.targetEmployee),Number(data.hours),clean_(data.timeBankAction),clean_(data.reason))});
    }
    if (action === 'applyTimeBankToMonth') {
      return jsonResponse_({ok:true,data:applyTimeBankToMonth(clean_(data.employee),clean_(data.employeePin),clean_(data.targetEmployee),Number(data.year),Number(data.month),Number(data.hours||0))});
    }
    if (action === 'bankMonthSurplus') {
      return jsonResponse_({ok:true,data:bankMonthSurplus(clean_(data.employee),clean_(data.employeePin),clean_(data.targetEmployee),Number(data.year),Number(data.month))});
    }
    if (action === 'getAbsences') {
      return jsonResponse_({ok:true,data:getAbsences(clean_(data.employee),clean_(data.employeePin))});
    }
    if (action === 'deleteAbsence') {
      return jsonResponse_({ok:true,data:deleteAbsence(clean_(data.employee),clean_(data.employeePin),clean_(data.id))});
    }
    if (action === 'syncHolidays') {
      requireChef_(clean_(data.employee),clean_(data.employeePin));
      const ss=getSpreadsheet_(); ensureHolidayStatusesForYear_(ss,Number(data.year));
      return jsonResponse_({ok:true,data:{ok:true,year:Number(data.year)}});
    }

    if (action === 'saveVacationEntitlement') {
      return jsonResponse_({ok:true,data:saveVacationEntitlement(clean_(data.employee),clean_(data.employeePin),clean_(data.targetEmployee),Number(data.year),Number(data.entitlement))});
    }
    if (action === 'getVacationAccount') {
      return jsonResponse_({ok:true,data:getVacationAccount(clean_(data.employee),clean_(data.employeePin),clean_(data.targetEmployee),Number(data.year))});
    }
    if (action === 'getVacationAccounts') {
      return jsonResponse_({ok:true,data:getVacationAccounts(clean_(data.employee),clean_(data.employeePin),Number(data.year))});
    }

    if (action === 'getChefEmployeeMonthData') {
      return jsonResponse_({ok:true,data:getChefEmployeeMonthData(clean_(data.employee),clean_(data.employeePin),clean_(data.targetEmployee),Number(data.year),Number(data.month))});
    }
    if (action === 'getBossDayClosures') {
      return jsonResponse_({ok:true,data:getBossDayClosures(clean_(data.employee),clean_(data.employeePin),Number(data.year),Number(data.month))});
    }
    if (action === 'manualCloseBossDay') {
      return jsonResponse_({ok:true,data:manualCloseBossDay(clean_(data.employee),clean_(data.employeePin),clean_(data.targetEmployee),clean_(data.date))});
    }
    if (action === 'deleteBossDayEntry') {
      return jsonResponse_({ok:true,data:deleteBossDayEntry(clean_(data.employee),clean_(data.employeePin),clean_(data.targetEmployee),clean_(data.date),clean_(data.entryId),clean_(data.reason))});
    }
    if (action === 'updateBossDayEntry') {
      return jsonResponse_({ok:true,data:updateBossDayEntry(clean_(data.employee),clean_(data.employeePin),clean_(data.targetEmployee),clean_(data.date),clean_(data.entryId),clean_(data.start),clean_(data.end),clean_(data.reason))});
    }
    if (action === 'getRegieReports') {
      return jsonResponse_({ok:true,data:getRegieReports(clean_(data.employee),clean_(data.employeePin),clean_(data.status),Number(data.year||0),Number(data.month||0))});
    }
    if (action === 'getRegieAttachments') {
      return jsonResponse_({ok:true,data:getRegieAttachments(clean_(data.employee),clean_(data.employeePin),data.objectIds||[])});
    }
    if (action === 'addRegieAttachments') {
      return jsonResponse_({ok:true,data:addRegieAttachments(clean_(data.employee),clean_(data.employeePin),data.objectIds||[],clean_(data.customer),data.files||[])});
    }
    if (action === 'updateRegieReport') {
      return jsonResponse_({ok:true,data:updateRegieReport(clean_(data.employee),clean_(data.employeePin),clean_(data.entryId),data.item||{})});
    }
    if (action === 'markRegieReportBilled') {
      return jsonResponse_({ok:true,data:markRegieReportBilled(clean_(data.employee),clean_(data.employeePin),clean_(data.entryId))});
    }
    if (action === 'setRegieObjectJobStatus') {
      return jsonResponse_({ok:true,data:setRegieObjectJobStatus(clean_(data.employee),clean_(data.employeePin),clean_(data.objectId),clean_(data.jobStatus))});
    }
    if (action === 'markRegieObjectCompleted') {
      return jsonResponse_({ok:true,data:markRegieObjectCompleted(clean_(data.employee),clean_(data.employeePin),clean_(data.objectId))});
    }
    if (action === 'checkRegieBillingRisk') {
      return jsonResponse_({ok:true,data:checkRegieBillingRisk(clean_(data.employee),clean_(data.employeePin),data.objectIds || [])});
    }
    if (action === 'markRegieObjectBilled') {
      return jsonResponse_({ok:true,data:markRegieObjectBilled(clean_(data.employee),clean_(data.employeePin),clean_(data.objectId),Boolean(data.force))});
    }
    if (action === 'markRegieObjectsBilled') {
      return jsonResponse_({ok:true,data:markRegieObjectsBilled(clean_(data.employee),clean_(data.employeePin),data.objectIds || [],Boolean(data.force))});
    }
    if (action === 'createRegiePhotoZip') {
      return jsonResponse_({ok:true,data:createRegiePhotoZip(clean_(data.employee),clean_(data.employeePin),data.fileIds || [],clean_(data.customer))});
    }
    if (action === 'createRegieReportZip') {
      return jsonResponse_({ok:true,data:createRegieReportZip(clean_(data.employee),clean_(data.employeePin),data.objectIds || [],data.fileIds || [],clean_(data.customer),data.entryIds)});
    }
    if (action === 'mergeRegieObjects') {
      return jsonResponse_({ok:true,data:mergeRegieObjects(clean_(data.employee),clean_(data.employeePin),data.objectIds || [])});
    }
    if (action === 'getObjectInternalNote') {
      return jsonResponse_({ok:true,data:getObjectInternalNote(clean_(data.employee),clean_(data.employeePin),clean_(data.objectId))});
    }
    if (action === 'saveObjectInternalNote') {
      return jsonResponse_({ok:true,data:saveObjectInternalNote(clean_(data.employee),clean_(data.employeePin),clean_(data.objectId),data.note)});
    }
    if (action === 'acceptOfferAsRunning') {
      return jsonResponse_({ok:true,data:acceptOfferAsRunning(clean_(data.employee),clean_(data.employeePin),clean_(data.offerId))});
    }
    if (action === 'createInspectionOffer') {
      return jsonResponse_({ok:true,data:createInspectionOffer(clean_(data.employee),clean_(data.employeePin),data.item||{})});
    }
    if (action === 'getOfferReports') {
      return jsonResponse_({ok:true,data:getOfferReports(clean_(data.employee),clean_(data.employeePin),clean_(data.stage))});
    }
    if (action === 'setRegieReportsOfferStatus') {
      return jsonResponse_({ok:true,data:setRegieReportsOfferStatus(clean_(data.employee),clean_(data.employeePin),data.entryIds || [],clean_(data.offerStatus),clean_(data.offerId))});
    }
    if (action === 'discardOfferPermanently') {
      return jsonResponse_({ok:true,data:discardOfferPermanently(clean_(data.employee),clean_(data.employeePin),clean_(data.offerId))});
    }
    if (action === 'saveOfferCreatedWithReminder') {
      return jsonResponse_({ok:true,data:saveOfferCreatedWithReminder(clean_(data.employee),clean_(data.employeePin),clean_(data.offerId),data.item||{})});
    }
    if (action === 'moveOfferBackToCreate') {
      return jsonResponse_({ok:true,data:moveOfferBackToCreate(clean_(data.employee),clean_(data.employeePin),clean_(data.offerId))});
    }
    if (action === 'getOfferReminders') {
      return jsonResponse_({ok:true,data:getOfferReminders(clean_(data.employee),clean_(data.employeePin),Boolean(data.includeDone))});
    }
    if (action === 'getOwnReminders') {
      return jsonResponse_({ok:true,data:getOwnReminders(clean_(data.employee),clean_(data.employeePin),Boolean(data.includeDone))});
    }
    if (action === 'createOwnReminder') {
      return jsonResponse_({ok:true,data:createOwnReminder(clean_(data.employee),clean_(data.employeePin),data.item||{})});
    }
    if (action === 'saveOwnReminderInternalNote') {
      return jsonResponse_({ok:true,data:saveOwnReminderInternalNote(clean_(data.employee),clean_(data.employeePin),clean_(data.reminderId),data.note)});
    }
    if (action === 'rescheduleOwnReminder') {
      return jsonResponse_({ok:true,data:rescheduleOwnReminder(clean_(data.employee),clean_(data.employeePin),clean_(data.reminderId),clean_(data.dueDate))});
    }
    if (action === 'completeOwnReminder') {
      return jsonResponse_({ok:true,data:completeOwnReminder(clean_(data.employee),clean_(data.employeePin),clean_(data.reminderId))});
    }
    if (action === 'deleteOwnReminder') {
      return jsonResponse_({ok:true,data:deleteOwnReminder(clean_(data.employee),clean_(data.employeePin),clean_(data.reminderId))});
    }
    if (action === 'rescheduleOfferReminder') {
      return jsonResponse_({ok:true,data:rescheduleOfferReminder(clean_(data.employee),clean_(data.employeePin),clean_(data.reminderId),Number(data.days||0),clean_(data.dueDate))});
    }
    if (action === 'declineOfferFromReminder') {
      return jsonResponse_({ok:true,data:declineOfferFromReminder(clean_(data.employee),clean_(data.employeePin),clean_(data.reminderId))});
    }
    if (action === 'acceptOfferFromReminder') {
      return jsonResponse_({ok:true,data:acceptOfferFromReminder(clean_(data.employee),clean_(data.employeePin),clean_(data.reminderId),Boolean(data.asRunning))});
    }
    if (action === 'getOfferStatistics') {
      return jsonResponse_({ok:true,data:getOfferStatistics(clean_(data.employee),clean_(data.employeePin))});
    }

    if (action === 'employeeLogin') {
      const employee = clean_(data.employee);
      const pin = clean_(data.pin);
      verifyEmployeePin(employee, pin);
      const sessionToken = data.createDeviceSession ? dg511CreateDeviceSession_(employee) : '';
      return jsonResponse_({
        ok: true,
        employee: employee,
        chefAccess: canAccessChef_(employee),
        deviceSessionToken: sessionToken,
        message: 'Anmeldung erfolgreich',
        backendVersion: DG_BACKEND_VERSION
      });
    }
    if (action === 'employeeLogout') {
      return jsonResponse_({ok:true,data:dg511RevokeDeviceSession_(clean_(data.employee),clean_(data.deviceSessionToken))});
    }

    if (action === 'getDayData') {
      return jsonResponse_({
        ok: true,
        data: dg51GetDayData_(clean_(data.employee), clean_(data.date), clean_(data.pin), Boolean(data.force))
      });
    }

    if (action === 'setDayStatus') {
      return jsonResponse_({
        ok: true,
        data: setDayStatus(
          clean_(data.employee),
          clean_(data.date),
          clean_(data.pin),
          clean_(data.status)
        )
      });
    }

    if (action === 'getEmployeeCalendarEvents') {
      return jsonResponse_({
        ok: true,
        data: dg51GetEmployeeCalendarEvents_(
          clean_(data.employee),
          clean_(data.pin),
          clean_(data.startDate),
          Number(data.days || 3),
          Boolean(data.force)
        )
      });
    }

    if (action === 'confirmEmployeeAssignment') {
      return jsonResponse_({ok:true,data:confirmEmployeeAssignment(clean_(data.employee),clean_(data.pin),clean_(data.assignmentId))});
    }
    if (action === 'reportEmployeeAssignmentIssue') {
      return jsonResponse_({ok:true,data:reportEmployeeAssignmentIssue(clean_(data.employee),clean_(data.pin),clean_(data.assignmentId),clean_(data.note))});
    }

    if (action === 'checkEntryConflict') {
      return jsonResponse_({
        ok: true,
        data: checkEntryConflict(
          clean_(data.employee),
          clean_(data.pin),
          clean_(data.date),
          clean_(data.customer),
          clean_(data.start),
          clean_(data.end)
        )
      });
    }

    if (action === 'saveEntry') {
      const entry = data.entry || {};
      entry.employee = clean_(data.employee || entry.employee);
      entry.employeePin = clean_(data.pin || entry.employeePin);
      return jsonResponse_({ ok: true, data: saveEntry(entry) });
    }

    if (action === 'updateEmployeeEntry') {
      return jsonResponse_({
        ok: true,
        data: updateEmployeeEntry(
          clean_(data.employee),
          clean_(data.pin),
          clean_(data.entryId),
          data.item || {}
        )
      });
    }

    if (action === 'deleteEntry') {
      return jsonResponse_({
        ok: true,
        data: deleteEntry(
          clean_(data.id),
          clean_(data.employee),
          clean_(data.date),
          clean_(data.pin)
        )
      });
    }

    if (action === 'closeDay') {
      return jsonResponse_({
        ok: true,
        data: closeDay(
          clean_(data.employee),
          clean_(data.date),
          clean_(data.pin),
          data.signatureDataUrl || '',
          Number(data.pauseHours || 0)
        )
      });
    }
    if (action === 'refreshClosedDay') {
      return jsonResponse_({ok:true,data:refreshClosedDay(clean_(data.employee),clean_(data.date),clean_(data.pin))});
    }

    if (action === 'getMonthData') {
      return jsonResponse_({
        ok: true,
        data: getMonthData(
          clean_(data.employee),
          Number(data.year),
          Number(data.month),
          clean_(data.pin)
        )
      });
    }

    if (action === 'getWeekData') {
      return jsonResponse_({ok:true,data:getWeekData(clean_(data.employee),clean_(data.pin),clean_(data.referenceDate))});
    }

    if (action === 'sendMonthReport') {
      return jsonResponse_({
        ok: true,
        data: sendMonthReport(
          clean_(data.employee),
          Number(data.year),
          Number(data.month),
          clean_(data.pin)
        )
      });
    }

    if (action === 'chefLogin') {
      const employee = clean_(data.employee);
      const employeePin = clean_(data.employeePin);
      requireChef_(employee, employeePin);
      return jsonResponse_({
        ok: true,
        message: 'Chef-Zugriff bestätigt'
      });
    }

    if (action === 'saveMonthlyAdjustment') {
      return jsonResponse_({
        ok: true,
        data: saveMonthlyAdjustment(
          clean_(data.employee),
          clean_(data.employeePin),
          clean_(data.targetEmployee),
          Number(data.year),
          Number(data.month),
          Number(data.hours),
          clean_(data.reason),
          clean_(data.adjustmentId)
        )
      });
    }

    if (action === 'deleteMonthlyAdjustment') {
      return jsonResponse_({
        ok: true,
        data: deleteMonthlyAdjustment(
          clean_(data.employee),
          clean_(data.employeePin),
          clean_(data.adjustmentId)
        )
      });
    }

    if (action === 'markConflictReviewed') {
      return jsonResponse_({ok:true,data:markConflictReviewed(clean_(data.employee),clean_(data.employeePin),clean_(data.conflictId),clean_(data.targetEmployee),Number(data.year),Number(data.month),clean_(data.date))});
    }
    if (action === 'setMonthClosureStatus') {
      return jsonResponse_({ok:true,data:setMonthClosureStatus(clean_(data.employee),clean_(data.employeePin),clean_(data.targetEmployee),Number(data.year),Number(data.month),clean_(data.closureAction),clean_(data.reason))});
    }
    if (action === 'getObjectReports') {
      return jsonResponse_({ok:true,data:getObjectReports(clean_(data.employee),clean_(data.employeePin),clean_(data.objectId),clean_(data.customer))});
    }
    if (action === 'createTaxAdvisorPdf') {
      return jsonResponse_({ok:true,data:createTaxAdvisorPdf(clean_(data.employee),clean_(data.employeePin),Number(data.year),Number(data.month))});
    }

    if (action === 'getBossMonthData') {
      const employee = clean_(data.employee);
      const employeePin = clean_(data.employeePin);

      verifyEmployeePin(employee, employeePin);

      if (!canAccessChef_(employee)) {
        throw new Error('Kein Zugriff auf Büro / Chef.');
      }

      return jsonResponse_({
        ok: true,
        data: getBossMonthData(
          employee,
          employeePin,
          Number(data.year),
          Number(data.month)
        )
      });
    }

    return jsonResponse_({ ok: false, error: 'Unbekannte Aktion.' });

  } catch (err) {
    const message = String((err && err.message) || err);
    try { logBackendError_(action, clean_(data && data.employee), message); } catch (_logErr) {}
    return jsonResponse_({ ok: false, error: message });
  } finally {
    if (writeLock) { try { writeLock.releaseLock(); } catch (_lockErr) {} }
  }
}

function logBackendError_(action, employee, message) {
  const ss = getSpreadsheetRaw_();
  const name = 'Fehlerprotokoll';
  let sh = ss.getSheetByName(name);
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.appendRow(['Zeitpunkt','Aktion','Mitarbeiter','Fehler']);
    sh.setFrozenRows(1);
  }
  sh.appendRow([new Date(), clean_(action) || '(ohne Aktion)', clean_(employee), clean_(message).slice(0,1000)]);
}

function jsonResponse_(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function ensurePlannerSheets_() {
  const ss = getSpreadsheetRaw_();
  let ws = ss.getSheetByName('KalenderMitarbeiter');
  const wh = ['ID','Mitarbeiter intern','Anzeigename','Anbieter','Kalender-ID','Aktiv','Reihenfolge','Erstellt am','Aktualisiert am'];
  if (!ws) ws = ss.insertSheet('KalenderMitarbeiter');
  if (ws.getLastRow() === 0) { ws.getRange(1,1,1,wh.length).setValues([wh]); ws.setFrozenRows(1); }
  else ws.getRange(1,1,1,wh.length).setValues([wh]);

  let es = ss.getSheetByName('KalenderTermine');
  const eh = ['ID','Kundenname','Adresse','Was ist zu tun','Datum','Von','Bis','Mitarbeiter IDs','Mitarbeiter Namen','Google Event IDs','Erstellt am','Aktualisiert am','Aktualisiert von','Terminart','Wartung Kunden-ID','Wartung Objekt-ID','Wartung Geräte-ID'];
  if (!es) es = ss.insertSheet('KalenderTermine');
  if (es.getLastRow() === 0) { es.getRange(1,1,1,eh.length).setValues([eh]); es.setFrozenRows(1); }
  else es.getRange(1,1,1,eh.length).setValues([eh]);

  seedPlannerWorkers_(ws);
}

function seedPlannerWorkers_(sheet) {
  if (sheet.getLastRow() > 1) return;
  const seeds = [
    ['Del Gesso Michael','Michael Del Gesso'],
    ['Sharifi Habibullah','Sharifi Habibullah'],
    ['Arapoglu David','Arapoglu David'],
    ['Del Gesso Marco','Marco Del Gesso']
  ];
  const rows=[];
  seeds.forEach(function(x,i){
    const rec=getEmployeeRecord_(x[0]);
    const calendarId=rec&&rec.calendarId?rec.calendarId:(CONFIG.EMPLOYEE_CALENDARS[x[0]]||'');
    rows.push(['KW-'+Utilities.getUuid(),x[0],x[1],'google',calendarId,'Ja',i+1,new Date(),new Date()]);
  });
  if(rows.length) sheet.getRange(2,1,rows.length,rows[0].length).setValues(rows);
}

function getPlannerWorkerRows_() {
  ensurePlannerSheets_();
  const sh=getSpreadsheetRaw_().getSheetByName('KalenderMitarbeiter');
  const v=sh.getDataRange().getValues(), out=[];
  for(let i=1;i<v.length;i++){
    if(!clean_(v[i][0])) continue;
    out.push({id:clean_(v[i][0]),employeeName:clean_(v[i][1]),displayName:clean_(v[i][2])||clean_(v[i][1]),provider:clean_(v[i][3])||'google',calendarId:clean_(v[i][4]),active:String(v[i][5]).toLowerCase()!=='nein',sortOrder:Number(v[i][6])||999,row:i+1});
  }
  out.sort(function(a,b){return a.sortOrder-b.sortOrder || a.displayName.localeCompare(b.displayName,'de')});
  return out;
}

function getPlannerWorkers(employee,employeePin){requireChef_(employee,employeePin);return getPlannerWorkerRows_().map(function(x){return{id:x.id,employeeName:x.employeeName,displayName:x.displayName,provider:x.provider,calendarId:x.calendarId,active:x.active,sortOrder:x.sortOrder}})}

function findPlannerWorker_(id){const a=getPlannerWorkerRows_();for(let i=0;i<a.length;i++)if(a[i].id===id)return a[i];return null}

function savePlannerWorker(employee,employeePin,item){
  requireChef_(employee,employeePin); item=item||{};
  let display=clean_(item.displayName), internal=clean_(item.employeeName)||display, provider=(clean_(item.provider)||'google').toLowerCase(), cal=clean_(item.calendarId);
  if(!display)throw new Error('Mitarbeitername fehlt.'); if(provider!=='google')throw new Error('In Version 6.0 ist als Kalenderanbieter nur Google freigeschaltet.'); if(!cal)throw new Error('Google Kalender-ID fehlt.');
  const gc=CalendarApp.getCalendarById(cal); if(!gc)throw new Error('Google Kalender-ID konnte nicht geöffnet werden. Bitte Freigabe und ID prüfen.');
  // Wenn der Anzeigename einem vorhandenen Mitarbeiter entspricht, dessen internen Login-Namen verwenden.
  const employees=getEmployeeRecords_(true); let match=employees.find(function(x){return x.name===internal||x.name===display});
  if(!match){ const parts=display.split(/\s+/); if(parts.length>1){ const swapped=parts.slice(1).join(' ')+' '+parts[0]; match=employees.find(function(x){return x.name===swapped}); } }
  if(match) internal=match.name;
  const sh=getSpreadsheetRaw_().getSheetByName('KalenderMitarbeiter'), rows=getPlannerWorkerRows_();
  const id=clean_(item.id)||('KW-'+Utilities.getUuid()); let existing=rows.find(function(x){return x.id===id});
  let order=existing?existing.sortOrder:(rows.length?Math.max.apply(null,rows.map(function(x){return x.sortOrder}))+1:1);
  const row=[id,internal,display,provider,cal,item.active===false?'Nein':'Ja',order,existing?sh.getRange(existing.row,8).getValue()||new Date():new Date(),new Date()];
  if(existing)sh.getRange(existing.row,1,1,row.length).setValues([row]);else sh.appendRow(row);
  return getPlannerWorkers(employee,employeePin);
}

function movePlannerWorker(employee,employeePin,id,direction){requireChef_(employee,employeePin);const rows=getPlannerWorkerRows_();const idx=rows.findIndex(function(x){return x.id===id});if(idx<0)throw new Error('Kalender-Mitarbeiter nicht gefunden.');const ni=idx+(direction<0?-1:1);if(ni<0||ni>=rows.length)return getPlannerWorkers(employee,employeePin);const sh=getSpreadsheetRaw_().getSheetByName('KalenderMitarbeiter');const a=rows[idx],b=rows[ni],tmp=a.sortOrder;sh.getRange(a.row,7).setValue(b.sortOrder);sh.getRange(b.row,7).setValue(tmp);return getPlannerWorkers(employee,employeePin)}

function setPlannerWorkerActive(employee,employeePin,id,active){requireChef_(employee,employeePin);const w=findPlannerWorker_(id);if(!w)throw new Error('Kalender-Mitarbeiter nicht gefunden.');const sh=getSpreadsheetRaw_().getSheetByName('KalenderMitarbeiter');sh.getRange(w.row,6).setValue(active?'Ja':'Nein');sh.getRange(w.row,9).setValue(new Date());return getPlannerWorkers(employee,employeePin)}

function plannerParseJson_(s,fallback){try{const x=JSON.parse(clean_(s)||'');return x&&typeof x==='object'?x:fallback}catch(_e){return fallback}}

function getPlannerEventRows_(){ensurePlannerSheets_();const sh=getSpreadsheetRaw_().getSheetByName('KalenderTermine'),v=sh.getDataRange().getValues(),out=[];for(let i=1;i<v.length;i++){const id=clean_(v[i][0]);if(!id)continue;const task=clean_(v[i][3]),storedType=clean_(v[i][13]);const type=storedType==='Wartung'||/^\[WARTUNG\]/i.test(task)?'Wartung':'Auftrag';out.push({id:id,customer:clean_(v[i][1]),address:clean_(v[i][2]),task:task.replace(/^\[WARTUNG\]\s*/i,''),type:type,date:normalizeDate_(v[i][4]),start:normalizeTime_(v[i][5]),end:normalizeTime_(v[i][6]),employeeIds:plannerParseJson_(v[i][7],[]),employeeNames:plannerParseJson_(v[i][8],[]),googleEventIds:plannerParseJson_(v[i][9],{}),createdAt:v[i][10],updatedAt:v[i][11],updatedBy:clean_(v[i][12]),maintenanceCustomerId:clean_(v[i][14]),maintenanceObjectId:clean_(v[i][15]),maintenanceDeviceId:clean_(v[i][16]),row:i+1})}return out}

function plannerTitle_(ev){return ev&&ev.type==='Wartung'?'🔧 WARTUNG · '+clean_(ev.customer):clean_(ev&&ev.customer)}
function plannerDescription_(task,id,type,ev){let d='Terminart: '+(type==='Wartung'?'Wartung':'Auftrag')+'\nWas ist zu tun:\n'+clean_(task).replace(/^\[WARTUNG\]\s*/i,'')+'\n\nDG-Termin-ID: '+id;if(type==='Wartung'&&ev){if(ev.maintenanceCustomerId)d+='\nWartung-Kunden-ID: '+ev.maintenanceCustomerId;if(ev.maintenanceObjectId)d+='\nWartung-Objekt-ID: '+ev.maintenanceObjectId;if(ev.maintenanceDeviceId){d+='\nWartung-Geraet-ID: '+ev.maintenanceDeviceId;try{const md=findMaintenanceDevice37_(ev.maintenanceDeviceId);if(md&&md.internalDeviceId)d+='\nGeräte-ID: '+md.internalDeviceId;}catch(_e){}}}return d}
function plannerTypeFromDescription_(d){return /(?:^|\n)Terminart:\s*Wartung(?:\n|$)/i.test(String(d||''))||/\[WARTUNG\]/i.test(String(d||''))?'Wartung':'Auftrag'}
function plannerTaskFromDescription_(d){return clean_(String(d||'').replace(/(?:^|\n)Terminart:\s*(?:Wartung|Auftrag)\s*/gi,'\n').replace(/\n?DG-Termin-ID:\s*[^\n]+/gi,'').replace(/(?:^|\n)Was ist zu tun:\s*/gi,'\n').replace(/^(?:Was ist zu tun:\s*)+/i,'').replace(/^\[WARTUNG\]\s*/i,''))}

function plannerMarkerId_(d){const m=String(d||'').match(/DG-Termin-ID:\s*([^\s\n]+)/i);return m?clean_(m[1]):''}

function plannerGoogleCalendar_(w){if(!w||w.provider!=='google'||!w.calendarId)return null;return CalendarApp.getCalendarById(w.calendarId)}







function getExternalGoogleEvent_(workerId,googleEventId){
  const w=findPlannerWorker_(clean_(workerId));
  if(!w||!w.active||w.provider!=='google')throw new Error('Kalender-Mitarbeiter nicht gefunden oder nicht aktiv.');
  const cal=plannerGoogleCalendar_(w);if(!cal)throw new Error('Google Kalender für '+(w.displayName||w.employeeName)+' ist nicht erreichbar.');
  let ge=null;try{ge=cal.getEventById(clean_(googleEventId))}catch(_e){ge=null}
  if(!ge)throw new Error('Google-Termin wurde nicht gefunden. Bitte Kalender neu synchronisieren.');
  return {worker:w,calendar:cal,event:ge};
}

function saveExternalGoogleEvent(employee,employeePin,item){
  requireChef_(employee,employeePin);item=item||{};
  const workerId=clean_(item.workerId),googleEventId=clean_(item.googleEventId),customer=clean_(item.customer),address=clean_(item.address),task=clean_(item.task),date=clean_(item.date),start=clean_(item.start),end=clean_(item.end);
  if(!workerId||!googleEventId)throw new Error('Google-Termin-Zuordnung fehlt. Bitte Kalender neu synchronisieren.');
  if(!customer)throw new Error('Kundenname / Termintitel fehlt.');
  if(!validDate3_(date)||!/^\d{2}:\d{2}$/.test(start)||!/^\d{2}:\d{2}$/.test(end))throw new Error('Datum oder Uhrzeit ist ungültig.');
  if(end<=start)throw new Error('Bis muss nach Von liegen.');
  const x=getExternalGoogleEvent_(workerId,googleEventId),ge=x.event;
  ge.setTitle(customer);ge.setTime(combineDateTime_(date,start),combineDateTime_(date,end));
  try{ge.setLocation(address)}catch(_e){}
  try{ge.setDescription(task)}catch(_e){}
  return {ok:true,external:true,workerId:workerId,googleEventId:googleEventId};
}

function deleteExternalGoogleEvent(employee,employeePin,item){
  requireChef_(employee,employeePin);item=item||{};const x=getExternalGoogleEvent_(clean_(item.workerId),clean_(item.googleEventId));x.event.deleteEvent();return {ok:true,external:true};
}

function syncPlannerFromGoogle_(startDate,endDate){
  const all=getPlannerEventRows_(),byMaster={};all.forEach(function(e){byMaster[e.id]=e});
  const workers=getPlannerWorkerRows_().filter(function(w){return w.active&&w.provider==='google'&&w.calendarId});const external=[];
  const rs=combineDateTime_(startDate,'00:00'),re=combineDateTime_(endDate,'23:59');
  workers.forEach(function(w){
    const cal=plannerGoogleCalendar_(w);if(!cal)throw new Error('Kalender nicht erreichbar: '+w.displayName);let ges=cal.getEvents(rs,re);
    ges.forEach(function(ge){
      const marker=plannerMarkerId_(ge.getDescription());
      if(!marker){
        const st=ge.getStartTime(),en=ge.getEndTime();external.push({
          id:'GOOGLE-'+w.id+'-'+ge.getId(),external:true,source:'google',googleEventId:ge.getId(),workerId:w.id,calendarId:w.calendarId,
          customer:clean_(ge.getTitle()).replace(/^🔧 WARTUNG ·\s*/i,''),address:clean_(ge.getLocation()),task:plannerTaskFromDescription_(ge.getDescription()),type:plannerTypeFromDescription_(ge.getDescription()),
          date:Utilities.formatDate(st,CONFIG.TZ,'yyyy-MM-dd'),start:Utilities.formatDate(st,CONFIG.TZ,'HH:mm'),end:Utilities.formatDate(en,CONFIG.TZ,'HH:mm'),employeeIds:[w.id],employeeNames:[w.displayName]
        });return;
      }
      const m=byMaster[marker];if(!m)return;
      const changed=clean_(ge.getTitle())!==plannerTitle_(m)||clean_(ge.getLocation())!==m.address||plannerTaskFromDescription_(ge.getDescription())!==m.task||plannerTypeFromDescription_(ge.getDescription())!==m.type||Utilities.formatDate(ge.getStartTime(),CONFIG.TZ,'yyyy-MM-dd')!==m.date||Utilities.formatDate(ge.getStartTime(),CONFIG.TZ,'HH:mm')!==m.start||Utilities.formatDate(ge.getEndTime(),CONFIG.TZ,'HH:mm')!==m.end;
      if(!changed)return;let newer=true;try{if(typeof ge.getLastUpdated==='function'&&m.updatedAt)newer=ge.getLastUpdated().getTime()>new Date(m.updatedAt).getTime()+1500}catch(_e){}if(!newer)return;
      m.customer=clean_(ge.getTitle()).replace(/^🔧 WARTUNG ·\s*/i,'');m.address=clean_(ge.getLocation());m.task=plannerTaskFromDescription_(ge.getDescription());m.type=plannerTypeFromDescription_(ge.getDescription());m.date=Utilities.formatDate(ge.getStartTime(),CONFIG.TZ,'yyyy-MM-dd');m.start=Utilities.formatDate(ge.getStartTime(),CONFIG.TZ,'HH:mm');m.end=Utilities.formatDate(ge.getEndTime(),CONFIG.TZ,'HH:mm');m.updatedAt=new Date();m.updatedBy='Google Kalender';
      syncPlannerEventToGoogle_(m);try{writePlanner3_(m)}catch(e){if(m.rollback3)m.rollback3();throw e;}
    })
  });return external;
}

function transferPlannerEvent(employee,employeePin,item){
  requireChef_(employee,employeePin);item=item||{};
  const sourceId=clean_(item.sourceId),targetWorkerId=clean_(item.targetWorkerId),date=clean_(item.date);
  if(!sourceId||!targetWorkerId)throw new Error('Quelltermin oder Zielmitarbeiter fehlt.');
  const target=findPlannerWorker_(targetWorkerId);if(!target||!target.active)throw new Error('Zielmitarbeiter ist nicht aktiv.');
  if(sourceId.indexOf('KT-')===0){
    const ev=getPlannerEventRows_().find(function(x){return x.id===sourceId});if(!ev)throw new Error('DG-Termin wurde nicht gefunden.');
    return savePlannerEvent(employee,employeePin,{id:ev.id,customer:ev.customer,address:ev.address,task:ev.task,type:ev.type,date:ev.date,start:ev.start,end:ev.end,employeeIds:[targetWorkerId]});
  }
  if(sourceId.indexOf('GOOGLE-')===0){
    if(!validDate3_(date))throw new Error('Datum des Google-Termins fehlt.');
    const workers=getPlannerWorkerRows_().filter(function(w){return w.active&&w.provider==='google'&&w.calendarId});
    const rs=combineDateTime_(date,'00:00'),re=combineDateTime_(date,'23:59');let found=null;
    for(let i=0;i<workers.length&&!found;i++){
      const w=workers[i],cal=plannerGoogleCalendar_(w);if(!cal)continue;let ges=[];try{ges=cal.getEvents(rs,re)}catch(_e){continue}
      for(let j=0;j<ges.length;j++){const ge=ges[j],synthetic='GOOGLE-'+w.id+'-'+ge.getId();if(synthetic===sourceId){found={worker:w,event:ge};break}}
    }
    if(!found)throw new Error('Google-Termin wurde nicht gefunden. Bitte Kalender neu synchronisieren.');
    const ge=found.event,st=ge.getStartTime(),en=ge.getEndTime(),task=plannerTaskFromDescription_(ge.getDescription());
    const created=savePlannerEvent(employee,employeePin,{customer:clean_(ge.getTitle())||'Termin',address:clean_(ge.getLocation())||'-',task:task||'Termin',type:plannerTypeFromDescription_(ge.getDescription()),date:Utilities.formatDate(st,CONFIG.TZ,'yyyy-MM-dd'),start:Utilities.formatDate(st,CONFIG.TZ,'HH:mm'),end:Utilities.formatDate(en,CONFIG.TZ,'HH:mm'),employeeIds:[targetWorkerId]});
    try{ge.deleteEvent();}catch(e){try{deletePlannerEvent(employee,employeePin,created.id);}catch(undo){calendarJournal3_(created.id,'Transfer/Ruecknahme: '+e.message+' / '+undo.message);}throw new Error('Quelltermin nicht entfernt. Transfer fehlgeschlagen: '+e.message);}return {ok:true,id:created.id,externalTransferred:true};
  }
  throw new Error('Unbekannter Kalendertyp.');
}

function getMapsBrowserConfig(employee,employeePin){
  requireChef_(employee,employeePin);const key=clean_(PropertiesService.getScriptProperties().getProperty('GOOGLE_MAPS_BROWSER_KEY'));
  return {configured:Boolean(key),key:key};
}

function getMaintenanceContracts(employee,employeePin){
  requireChef_(employee,employeePin);
  const planned=getPlannerEventRows_().filter(function(e){return e.type==='Wartung';});
  const sh=getSpreadsheet_().getSheetByName(CONFIG.TIME_SHEET),v=sh.getDataRange().getValues(),latest={};
  for(let i=1;i<v.length;i++){
    if(clean_(v[i][32])!=='Ja')continue;
    const customer=clean_(v[i][3]),due=clean_(v[i][33]),date=normalizeDate_(v[i][2]);if(!customer)continue;
    const key=normalizedCustomerKey_(customer);if(!latest[key]||date>=latest[key].lastDate)latest[key]={id:'M-'+clean_(v[i][25]||v[i][0]),customer:customer,address:'',task:clean_(v[i][7]),status:'Wartungsvertrag',lastDate:date,nextMaintenanceDue:due,employees:[clean_(v[i][1])],plannedDate:'',source:'entry'};
  }
  planned.forEach(function(e){const key=normalizedCustomerKey_(e.customer);if(!latest[key])latest[key]={id:e.id,customer:e.customer,address:e.address,task:e.task,status:'Geplante Wartung',lastDate:'',nextMaintenanceDue:'',employees:e.employeeNames||[],plannedDate:e.date,source:'planner'};else{latest[key].plannedDate=e.date;latest[key].address=latest[key].address||e.address;latest[key].employees=e.employeeNames||latest[key].employees;}});
  const out=Object.keys(latest).map(function(k){return latest[k];});out.sort(function(a,b){return (a.nextMaintenanceDue||a.plannedDate||'9999-99').localeCompare(b.nextMaintenanceDue||b.plannedDate||'9999-99');});return out;
}

function systemHealthCheck(employee,employeePin){
  requireChef_(employee,employeePin);const ss=getSpreadsheet_(),errors=[],warnings=[],checks=[];
  function ok(name,detail){checks.push({name:name,ok:true,level:'ok',detail:detail||''})}
  function bad(name,detail){checks.push({name:name,ok:false,level:'error',detail:detail||''});errors.push(name+': '+detail)}
  function warn(name,detail){checks.push({name:name,ok:true,level:'warn',detail:detail||''});warnings.push(name+': '+detail)}
  const required=[CONFIG.TIME_SHEET,CONFIG.CLOSE_SHEET,CONFIG.STATUS_SHEET,CONFIG.EMPLOYEE_SHEET,'KalenderMitarbeiter','KalenderTermine','AngebotsReminder','InterneVermerke','Anfragen','AuftragsStamm','Wartungskunden','Wartungsobjekte','Wartungsgeraete','Wartungsreparaturen'];
  required.forEach(function(name){const sh=ss.getSheetByName(name);if(sh)ok('Tabelle '+name,sh.getLastRow()+' Zeilen');else bad('Tabelle '+name,'fehlt')});
  const time=ss.getSheetByName(CONFIG.TIME_SHEET);if(time){const v=time.getDataRange().getValues(),ids={},dup=[];let blankObj=0;for(let i=1;i<v.length;i++){const id=clean_(v[i][0]);if(id){if(ids[id])dup.push(id);ids[id]=1}if((clean_(v[i][22])||'Offen')==='Offen'&&!clean_(v[i][25]))blankObj++;}if(dup.length)bad('Zeit-IDs','Doppelte IDs: '+dup.slice(0,5).join(', '));else ok('Zeit-IDs','keine Duplikate');if(blankObj)warn('Objekt-IDs',blankObj+' offene Zeitzeilen ohne Objekt-ID');else ok('Objekt-IDs','vollstaendig')}
  const ps=getSpreadsheetRaw_().getSheetByName('KalenderTermine');if(ps){const v=ps.getDataRange().getValues(),ids={},dup=[],jsonErrors=[];for(let i=1;i<v.length;i++){const id=clean_(v[i][0]);if(id){if(ids[id])dup.push(id);ids[id]=1}try{JSON.parse(clean_(v[i][7])||'[]');JSON.parse(clean_(v[i][9])||'{}')}catch(_e){jsonErrors.push(i+1)}}if(dup.length)bad('Kalender-IDs','Doppelte IDs');else ok('Kalender-IDs','keine Duplikate');if(jsonErrors.length)bad('Kalender-JSON','Fehler in Zeile(n) '+jsonErrors.slice(0,10).join(', '));else ok('Kalender-JSON','gueltig')}
  const workers=getPlannerWorkerRows_();const missing=workers.filter(function(w){return w.active&&!w.calendarId});if(missing.length)bad('Kalender-Mitarbeiter',missing.length+' aktive Mitarbeiter ohne Kalender-ID');else ok('Kalender-Mitarbeiter',workers.filter(function(w){return w.active}).length+' aktiv');
  const rem=ensureOfferReminderSheet_(),rv=rem.getDataRange().getValues(),rid={},roid={},dupR=[],dupO=[];let openNoDue=0;for(let i=1;i<rv.length;i++){const a=clean_(rv[i][0]),o=clean_(rv[i][1]),st=clean_(rv[i][9])||'Offen';if(a){if(rid[a])dupR.push(a);rid[a]=1}if(o&&st==='Offen'){if(roid[o])dupO.push(o);roid[o]=1;if(!normalizeDate_(rv[i][8]))openNoDue++;}}if(dupR.length)bad('Reminder-IDs','Doppelte Reminder-ID');else ok('Reminder-IDs','keine Duplikate');if(dupO.length)warn('Reminder-Angebote','Mehrere offene Reminder fuer dasselbe Angebot');if(openNoDue)bad('Reminder-Faelligkeit',openNoDue+' offene Reminder ohne Datum');else ok('Reminder-Faelligkeit','vollstaendig');
  [['PHOTO_FOLDER_ID','Fotoordner'],['SIGNATURE_FOLDER_ID','Unterschriftenordner']].forEach(function(p){const id=PropertiesService.getScriptProperties().getProperty(p[0]);if(!id){warn(p[1],'Keine feste ID konfiguriert');return;}try{const f=DriveApp.getFolderById(id);f.getName();if(f.isTrashed())throw new Error('Papierkorb');ok(p[1],'Gespeicherte ID erreichbar');}catch(e){bad(p[1],'ID/Freigabe pruefen, kein Ersatzordner angelegt');}});
  const maps=clean_(PropertiesService.getScriptProperties().getProperty('GOOGLE_MAPS_BROWSER_KEY'));if(maps)ok('Google Places Key','in Script Properties konfiguriert');else warn('Google Places Key','noch nicht zentral in Script Properties gespeichert');
  return {ok:errors.length===0,version:DG_BACKEND_VERSION,checks:checks,warnings:warnings,errors:errors,checkedAt:formatDateTimeDE_(new Date())};
}

function getPlannerAvailability733_(employee,employeePin,startDate,endDate){
  requireChef_(employee,employeePin);
  startDate=clean_(startDate);endDate=clean_(endDate);
  if(!validDate3_(startDate)||!validDate3_(endDate)||endDate<startDate)throw new Error('Ungültiger Kalenderzeitraum.');
  const ss=getSpreadsheet_(),sy=Number(startDate.slice(0,4)),ey=Number(endDate.slice(0,4));
  for(let y=sy;y<=ey;y++)ensureHolidayStatusesForYear_(ss,y);
  const workers=getPlannerWorkerRows_().filter(function(w){return w.active;});
  const names={};workers.forEach(function(w){const n=clean_(w.employeeName||w.displayName);if(n)names[n]=true;});
  const map={};
  function put(emp,date,status,source){
    emp=clean_(emp);date=normalizeDate_(date);status=clean_(status);source=clean_(source);
    if(!emp||!names[emp]||!validDate3_(date)||date<startDate||date>endDate||!status||status==='Arbeiten')return;
    map[emp+'|'+date]={employee:emp,date:date,status:status,source:source};
  }
  const abs=ensureAbsenceSheet_(ss),av=abs.getDataRange().getValues();
  for(let i=1;i<av.length;i++){
    if(String(av[i][7]).toLowerCase()==='nein')continue;
    const emp=clean_(av[i][1]),type=clean_(av[i][2]),from=normalizeDate_(av[i][3]),to=normalizeDate_(av[i][4]);
    if(!names[emp]||!from||!to||to<startDate||from>endDate)continue;
    const a=from.split('-').map(Number),b=to.split('-').map(Number),cur=new Date(a[0],a[1]-1,a[2]),last=new Date(b[0],b[1]-1,b[2]);
    while(cur<=last){const d=isoDate_(cur);if(d>=startDate&&d<=endDate)put(emp,d,type,'Abwesenheit');cur.setDate(cur.getDate()+1);}
  }
  const st=ss.getSheetByName(CONFIG.STATUS_SHEET),sv=st&&st.getLastRow()>=2?st.getDataRange().getValues():[];
  for(let i=1;i<sv.length;i++)put(clean_(sv[i][0]),normalizeDate_(sv[i][1]),clean_(sv[i][2]),clean_(sv[i][4]));
  return Object.keys(map).map(function(k){return map[k];}).sort(function(a,b){return a.date.localeCompare(b.date)||a.employee.localeCompare(b.employee,'de');});
}

function getPlannerEvents(employee,employeePin,startDate,endDate){
  requireChef_(employee,employeePin);if(!validDate3_(startDate)||!validDate3_(endDate))throw new Error('Kalenderzeitraum ungültig.');
  const external=syncPlannerFromGoogle_(startDate,endDate),all=getPlannerEventRows_().filter(function(e){return e.date>=startDate&&e.date<=endDate}).map(function(e){return{id:e.id,customer:e.customer,address:e.address,task:e.task,type:e.type,date:e.date,start:e.start,end:e.end,employeeIds:e.employeeIds,employeeNames:e.employeeNames,maintenanceCustomerId:e.maintenanceCustomerId||'',maintenanceObjectId:e.maintenanceObjectId||'',maintenanceDeviceId:e.maintenanceDeviceId||'',external:false,source:'dg'}});
  return all.concat(external).sort(function(a,b){return(a.date+' '+a.start).localeCompare(b.date+' '+b.start)});
}
// DG 3.0 helpers. Existing project properties and all business records stay intact.
function validDate3_(s){s=String(s||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const p=s.split('-').map(Number),d=new Date(Date.UTC(p[0],p[1]-1,p[2]));return p[0]>=1900&&p[0]<=2200&&d.getUTCFullYear()===p[0]&&d.getUTCMonth()===p[1]-1&&d.getUTCDate()===p[2];}
function validateDates3_(data){[data,data.item,data.entry].filter(Boolean).forEach(function(o){['date','startDate','endDate','dueDate','birthDate','entryDate','exitDate'].forEach(function(k){if(o[k]!==undefined&&o[k]!==null&&o[k]!==''&&!validDate3_(o[k]))throw new Error('Ungueltiges Kalenderdatum: '+k);});});}
function fixedFolder3_(prop,name){
  const ps=PropertiesService.getScriptProperties(),id=clean_(ps.getProperty(prop));
  if(id){
    try{const f=DriveApp.getFolderById(id);f.getName();if(f.isTrashed())throw new Error('Papierkorb');return f;}
    catch(e){throw new Error('Speicherordner '+prop+' nicht erreichbar. ID/Freigabe pruefen. Es wird kein Ersatzordner angelegt.');}
  }
  const it=DriveApp.getFoldersByName(name);if(!it.hasNext())throw new Error('Speicherordner '+name+' fehlt. Bitte den bestehenden Ordner anlegen/zuordnen und '+prop+' setzen. Es wird kein zweiter Speicherpfad angelegt.');
  const folder=it.next();if(it.hasNext())throw new Error('Mehrere Ordner namens '+name+'. Bitte '+prop+' eindeutig konfigurieren.');
  ps.setProperty(prop,folder.getId());return folder;
}
function inquiryOffer3_(id){const sh=getSpreadsheet_().getSheetByName('AnfrageAngebote');if(!sh)return null;const rows=sh.getDataRange().getValues();for(let i=1;i<rows.length;i++)if(clean_(rows[i][0])===clean_(id))return {sheet:sh,row:i+1,values:rows[i]};return null;}
function setInquiryOffer3_(employee,id,status){const r=inquiryOffer3_(id);if(!r)return null;const map={'Offenes Angebot':'Offen','Angebot Angenommen':'Angenommen','Angebot Abgelehnt':'Abgelehnt','Angebot zu erstellen':'Zu erstellen'};if(!map[status])throw new Error('Ungueltiger Angebotsstatus.');r.sheet.getRange(r.row,9,1,3).setValues([[map[status],new Date(),employee]]);if(status==='Angebot Angenommen')closeOpenReminderByOfferId_(employee,id,'Angenommen - Archiv');if(status==='Angebot Abgelehnt')closeOpenReminderByOfferId_(employee,id,'Kein Auftrag');return {ok:true,offerId:id,status:status,count:1};}
function inquiryOfferGroups3_(stage){const sh=getSpreadsheet_().getSheetByName('AnfrageAngebote');if(!sh)return [];const v=sh.getDataRange().getValues(),out=[];for(let i=1;i<v.length;i++){const r=v[i],st=clean_(r[8])||'Offen';if(stage==='Offen'&&st!=='Offen'||stage==='Zu erstellen'&&st!=='Zu erstellen'||stage==='Archiv'&&!['Angenommen','Abgelehnt'].includes(st))continue;const d=normalizeDate_(r[7]);out.push({offerId:clean_(r[0]),inquiryId:clean_(r[1]),customer:clean_(r[2]),phone:clean_(r[3]),email:clean_(r[4]),description:clean_(r[5]),source:clean_(r[6]),status:st==='Angenommen'?'Angebot Angenommen':st==='Abgelehnt'?'Angebot Abgelehnt':st==='Zu erstellen'?'Angebot zu erstellen':'Offenes Angebot',totalHours:0,reportCount:0,employees:[],reports:[],firstDate:d,lastDate:d,changedAt:r[9]?formatDateTimeDE_(r[9]):'',changedBy:clean_(r[10])});}return out;}
function calendarJournal3_(id,message){try{const ss=getSpreadsheetRaw_();let sh=ss.getSheetByName('KalenderSyncJournal');if(!sh){sh=ss.insertSheet('KalenderSyncJournal');sh.appendRow(['Zeitpunkt','Termin-ID','Meldung']);}sh.appendRow([new Date(),id,message]);}catch(e){console.error('Kalender '+id+': '+message);}}
function snapshotEvent3_(g){return {title:g.getTitle(),start:g.getStartTime(),end:g.getEndTime(),location:g.getLocation(),description:g.getDescription()};}
function restoreEvent3_(g,s){g.setTitle(s.title);g.setTime(s.start,s.end);g.setLocation(s.location);g.setDescription(s.description);}
function writePlanner3_(e){const sh=getSpreadsheetRaw_().getSheetByName('KalenderTermine'),row=[e.id,e.customer,e.address,e.task,e.date,e.start,e.end,JSON.stringify(e.employeeIds),JSON.stringify(e.employeeNames),JSON.stringify(e.googleEventIds),e.createdAt,e.updatedAt,e.updatedBy,e.type==='Wartung'?'Wartung':'Auftrag',clean_(e.maintenanceCustomerId),clean_(e.maintenanceObjectId),clean_(e.maintenanceDeviceId)];if(e.row)sh.getRange(e.row,1,1,row.length).setValues([row]);else sh.appendRow(row);SpreadsheetApp.flush();}
function planRequest3(employee,pin,kind,id,offer,item){requireChef_(employee,pin);if(!item||!item.id)throw new Error('Termin-ID fehlt.');if(kind!=='inquiry'&&kind!=='order')throw new Error('Ungueltige Quelle.');const source=(kind==='inquiry'?getCustomerInquiries(employee,pin,'Alle'):getManualOrders(employee,pin,'Alle')).find(function(x){return x.id===id});if(!source)throw new Error('Anfrage/Auftrag nicht mehr vorhanden.');const old=getPlannerEventRows_().find(function(x){return x.id===item.id});const result=savePlannerEvent(employee,pin,item);try{if(kind==='inquiry')updateCustomerInquiry(employee,pin,id,offer?'Besichtigung geplant':'Termin geplant',true);else setManualOrderStatus(employee,pin,id,'Offen');}catch(e){try{if(old)savePlannerEvent(employee,pin,old);else deletePlannerEvent(employee,pin,result.id);}catch(undo){calendarJournal3_(result.id,'Quellstatus/Ruecknahme fehlgeschlagen: '+e.message+' / '+undo.message);throw new Error('Teilweise gespeichert. Termin nicht nochmals anlegen, KalenderSyncJournal pruefen.');}throw e;}return {ok:true,id:result.id};}

function syncPlannerEventToGoogle_(ev){
 const workers=getPlannerWorkerRows_(),byId={};workers.forEach(w=>byId[w.id]=w);
 const previous=getPlannerEventRows_().find(x=>x.id===ev.id)||null,ids=Object.assign({},ev.googleEventIds||{}),originalIds=Object.assign({},ids),assigned=new Set(ev.employeeIds||[]),calendars={},existing={},undo=[];
 // Validate every source/target before the first write. Destination first, source last.
 Array.from(new Set(Object.keys(ids).concat(ev.employeeIds||[]))).forEach(wid=>{const w=byId[wid],c=plannerGoogleCalendar_(w);if(!c)throw new Error('Kalender nicht erreichbar: '+(w&&(w.displayName||w.employeeName)||wid));c.getName();calendars[wid]=c;if(ids[wid])existing[wid]=c.getEventById(ids[wid]);});
 let rolledBack=false;
 function rollback(){if(rolledBack)return;rolledBack=true;const errors=[];for(let i=undo.length-1;i>=0;i--)try{undo[i]();}catch(e){errors.push(e.message);}if(previous){previous.googleEventIds=originalIds;try{writePlanner3_(previous);}catch(e){errors.push(e.message);}}if(errors.length){calendarJournal3_(ev.id,'Rueckabwicklung unvollstaendig: '+errors.join('; '));throw new Error('Kalenderfehler. Rueckabwicklung im KalenderSyncJournal pruefen.');}}
 try{const start=combineDateTime_(ev.date,ev.start),end=combineDateTime_(ev.date,ev.end);
  (ev.employeeIds||[]).forEach(wid=>{let g=existing[wid];const c=calendars[wid];if(g){const s=snapshotEvent3_(g);undo.push(()=>restoreEvent3_(g,s));restoreEvent3_(g,{title:plannerTitle_(ev),start:start,end:end,location:ev.address,description:plannerDescription_(ev.task,ev.id,ev.type,ev)});}else{g=c.createEvent(plannerTitle_(ev),start,end,{location:ev.address,description:plannerDescription_(ev.task,ev.id,ev.type,ev)});undo.push(()=>g.deleteEvent());}ids[wid]=g.getId();});
  Object.keys(originalIds).forEach(wid=>{if(assigned.has(wid))return;const g=existing[wid],c=calendars[wid];if(g){const s=snapshotEvent3_(g);g.deleteEvent();undo.push(()=>{originalIds[wid]=c.createEvent(s.title,s.start,s.end,{location:s.location,description:s.description}).getId();});}delete ids[wid];});
  ev.googleEventIds=ids;Object.defineProperty(ev,'rollback3',{value:rollback,enumerable:false,configurable:true});return ev;
 }catch(e){rollback();throw e;}
}
function savePlannerEvent(employee,pin,item){requireChef_(employee,pin);item=item||{};validateDates3_({item:item});const id=clean_(item.id)||'KT-'+Utilities.getUuid(),customer=clean_(item.customer),address=clean_(item.address),rawTask=clean_(item.task),type=(clean_(item.type)==='Wartung'||/^\[WARTUNG\]/i.test(rawTask))?'Wartung':'Auftrag',task=rawTask.replace(/^\[WARTUNG\]\s*/i,''),date=clean_(item.date),start=clean_(item.start),end=clean_(item.end),employeeIds=Array.from(new Set((Array.isArray(item.employeeIds)?item.employeeIds:[]).map(clean_).filter(Boolean)));if(!customer||!address||!task)throw new Error('Kunde, Adresse und Taetigkeit sind Pflichtfelder.');if(!validDate3_(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(end)||end<=start)throw new Error('Ungueltiges Datum oder Von/Bis.');if(!employeeIds.length)throw new Error('Mindestens einen Mitarbeiter auswaehlen.');const workers=getPlannerWorkerRows_(),names=employeeIds.map(wid=>{const w=workers.find(x=>x.id===wid&&x.active);if(!w)throw new Error('Mitarbeiter nicht aktiv.');return w.displayName;});const old=getPlannerEventRows_().find(x=>x.id===id);const maintenanceCustomerId=type==='Wartung'?clean_(item.maintenanceCustomerId||(old&&old.maintenanceCustomerId)||''):'',maintenanceObjectId=type==='Wartung'?clean_(item.maintenanceObjectId||(old&&old.maintenanceObjectId)||''):'',maintenanceDeviceId=type==='Wartung'?clean_(item.maintenanceDeviceId||(old&&old.maintenanceDeviceId)||''):'';if(maintenanceDeviceId){const d=findMaintenanceDevice37_(maintenanceDeviceId);if(!d||!d.active)throw new Error('Das zugeordnete Wartungsgeraet wurde nicht gefunden oder ist inaktiv.');}let ev={id:id,customer:customer,address:address,task:task,type:type,date:date,start:start,end:end,employeeIds:employeeIds,employeeNames:names,googleEventIds:old?old.googleEventIds:{},maintenanceCustomerId:maintenanceCustomerId,maintenanceObjectId:maintenanceObjectId,maintenanceDeviceId:maintenanceDeviceId,createdAt:old?old.createdAt:new Date(),updatedAt:new Date(),updatedBy:employee,row:old?old.row:0};ev=syncPlannerEventToGoogle_(ev);try{writePlanner3_(ev);return {ok:true,id:id,type:type,maintenanceDeviceId:maintenanceDeviceId};}catch(e){ev.rollback3();throw e;}}
function deletePlannerEvent(employee,pin,id){requireChef_(employee,pin);const ev=getPlannerEventRows_().find(x=>x.id===id);if(!ev)throw new Error('Termin nicht gefunden.');const workers=getPlannerWorkerRows_();const plan=Object.keys(ev.googleEventIds||{}).map(wid=>{const c=plannerGoogleCalendar_(workers.find(w=>w.id===wid));if(!c)throw new Error('Kalender nicht erreichbar: '+wid);c.getName();const g=c.getEventById(ev.googleEventIds[wid]);return {wid,c,g,s:g?snapshotEvent3_(g):null};}),deleted=[];try{plan.forEach(x=>{if(x.g){x.g.deleteEvent();deleted.push(x);}});getSpreadsheetRaw_().getSheetByName('KalenderTermine').deleteRow(ev.row);return {ok:true,id:id};}catch(e){const failures=[];deleted.forEach(x=>{try{ev.googleEventIds[x.wid]=x.c.createEvent(x.s.title,x.s.start,x.s.end,{location:x.s.location,description:x.s.description}).getId();}catch(err){failures.push(err.message);}});try{writePlanner3_(ev);}catch(err){failures.push(err.message);}if(failures.length)calendarJournal3_(id,'Loeschen/Ruecknahme fehlgeschlagen: '+failures.join('; '));throw new Error('Termin nicht vollstaendig geloescht: '+e.message+(failures.length?' KalenderSyncJournal pruefen.':''));}}


// ===== DG 3.7 Wartungsvertragsverwaltung =====
function ensureMaintenanceSheets_(){
  const ss=getSpreadsheetRaw_();
  const defs={
    Wartungskunden:['ID','Name/Firma','Rechnungsstraße','Rechnungs-PLZ','Rechnungsort','E-Mail','Telefon','Aktiv','Erstellt am','Aktualisiert am','Aktualisiert von'],
    Wartungsobjekte:['ID','Kunden-ID','Objektbezeichnung','Straße','PLZ','Ort','Interner Vermerk','Aktiv','Erstellt am','Aktualisiert am','Aktualisiert von'],
    Wartungsgeraete:['ID','Objekt-ID','Kunden-ID','Geräteart','Beschreibung Sonstiges','Hersteller','Typ/Modell','Seriennummer','Baujahr','Mieter Name','Mieter Telefon','Mieter E-Mail','Ersatzteil-Hersteller','Ersatzteil-Seriennummer','Interne Vermerke','Nächste Wartung fällig','Aktiv','Erstellt am','Aktualisiert am','Aktualisiert von','Interne Geräte-ID'],
    Wartungsreparaturen:['ID','Geräte-ID','Kunden-ID','Objekt-ID','Datum','Beschreibung','Erstellt am','Erstellt von'],
    Wartungsanhaenge:['ID','Geräte-ID','Kunden-ID','Objekt-ID','Art','Dateiname','MIME','Dateigröße','Drive-Datei-ID','Drive-URL','Aktiv','Erstellt am','Erstellt von']
    ,Wartungsmanuell:['ID','Datum','Anzahl','Vermerk','Erstellt am','Erstellt von']
  };
  Object.keys(defs).forEach(function(name){let sh=ss.getSheetByName(name);if(!sh)sh=ss.insertSheet(name);const h=defs[name];if(sh.getLastRow()===0){sh.getRange(1,1,1,h.length).setValues([h]);sh.setFrozenRows(1);}else sh.getRange(1,1,1,h.length).setValues([h]);});
}
function ensureMaintenanceSchema37_(){
  ensureMaintenanceSheets_();const ps=PropertiesService.getScriptProperties();
  if(ps.getProperty('DG37_MAINT_SCHEMA')!=='1'){
    const sh=getSpreadsheetRaw_().getSheetByName(CONFIG.TIME_SHEET);if(sh&&sh.getLastRow()>1){const v=sh.getRange(2,1,sh.getLastRow()-1,Math.max(37,sh.getLastColumn())).getValues(),fix=[];for(let i=0;i<v.length;i++){if(clean_(v[i][29])==='Ja'&&!clean_(v[i][32])&&/^\d{4}-\d{2}$/.test(clean_(v[i][30]))){fix.push({row:i+2,due:clean_(v[i][30])});}}fix.forEach(function(x){sh.getRange(x.row,33,1,2).setValues([['Ja',x.due]]);sh.getRange(x.row,30,1,2).clearContent();});}
    ps.setProperty('DG37_MAINT_SCHEMA','1');
  }
  if(ps.getProperty('DG371_MAINT_MONTH_SCHEMA')!=='1'){
    const ds=getSpreadsheetRaw_().getSheetByName('Wartungsgeraete');
    if(ds&&ds.getLastRow()>1){const rg=ds.getRange(2,16,ds.getLastRow()-1,1),vals=rg.getValues().map(function(r){return[maintenanceMonth37_(r[0])];});rg.setNumberFormat('@');rg.setValues(vals);}
    ps.setProperty('DG371_MAINT_MONTH_SCHEMA','1');
  }
  if(ps.getProperty('DG39_DEVICE_ID_SCHEMA')!=='1'){
    const ds=getSpreadsheetRaw_().getSheetByName('Wartungsgeraete');let next=1000;
    if(ds&&ds.getLastRow()>1){
      const n=ds.getLastRow()-1,ids=ds.getRange(2,21,n,1).getValues(),used={};
      ids.forEach(function(r){const v=Number(clean_(r[0]));if(Number.isFinite(v)&&v>=1000){used[v]=1;if(v>=next)next=v+1;}});
      for(let i=0;i<n;i++){if(clean_(ids[i][0]))continue;while(used[next])next++;ids[i][0]=String(next);used[next]=1;next++;}
      ds.getRange(2,21,n,1).setNumberFormat('@').setValues(ids);
    }
    ps.setProperty('DG39_NEXT_DEVICE_ID',String(next));ps.setProperty('DG39_DEVICE_ID_SCHEMA','1');
  }
}
function maintenanceRows37_(name){ensureMaintenanceSheets_();const sh=getSpreadsheetRaw_().getSheetByName(name),v=sh.getDataRange().getValues();return{sheet:sh,values:v};}
function active37_(v){return String(v||'').toLowerCase()!=='nein';}
function maintenanceCustomers37_(){const x=maintenanceRows37_('Wartungskunden'),out=[];for(let i=1;i<x.values.length;i++){const r=x.values[i];if(!clean_(r[0]))continue;out.push({id:clean_(r[0]),name:clean_(r[1]),billingStreet:clean_(r[2]),billingZip:clean_(r[3]),billingCity:clean_(r[4]),email:clean_(r[5]),phone:clean_(r[6]),active:active37_(r[7]),createdAt:r[8],updatedAt:r[9],updatedBy:clean_(r[10]),row:i+1});}return out;}
function maintenanceObjects37_(){const x=maintenanceRows37_('Wartungsobjekte'),out=[];for(let i=1;i<x.values.length;i++){const r=x.values[i];if(!clean_(r[0]))continue;out.push({id:clean_(r[0]),customerId:clean_(r[1]),name:clean_(r[2]),street:clean_(r[3]),zip:clean_(r[4]),city:clean_(r[5]),notes:clean_(r[6]),active:active37_(r[7]),createdAt:r[8],updatedAt:r[9],updatedBy:clean_(r[10]),row:i+1});}return out;}
function maintenanceDevices37_(){const x=maintenanceRows37_('Wartungsgeraete'),out=[];for(let i=1;i<x.values.length;i++){const r=x.values[i];if(!clean_(r[0]))continue;out.push({id:clean_(r[0]),objectId:clean_(r[1]),customerId:clean_(r[2]),deviceType:clean_(r[3]),otherDescription:clean_(r[4]),manufacturer:clean_(r[5]),model:clean_(r[6]),serialNumber:clean_(r[7]),year:clean_(r[8]),tenantName:clean_(r[9]),tenantPhone:clean_(r[10]),tenantEmail:clean_(r[11]),sparePartManufacturer:clean_(r[12]),sparePartSerialNumber:clean_(r[13]),internalNotes:clean_(r[14]),nextMaintenanceDue:maintenanceMonth37_(r[15]),active:active37_(r[16]),createdAt:r[17],updatedAt:r[18],updatedBy:clean_(r[19]),internalDeviceId:clean_(r[20]),row:i+1});}return out;}
function maintenanceRepairs37_(){const x=maintenanceRows37_('Wartungsreparaturen'),out=[];for(let i=1;i<x.values.length;i++){const r=x.values[i];if(!clean_(r[0]))continue;out.push({id:clean_(r[0]),deviceId:clean_(r[1]),customerId:clean_(r[2]),objectId:clean_(r[3]),date:normalizeDate_(r[4]),description:clean_(r[5]),createdAt:r[6],createdBy:clean_(r[7]),row:i+1});}return out;}
function maintenanceAttachments501_(){const x=maintenanceRows37_('Wartungsanhaenge'),out=[];for(let i=1;i<x.values.length;i++){const r=x.values[i];if(!clean_(r[0]))continue;out.push({id:clean_(r[0]),deviceId:clean_(r[1]),customerId:clean_(r[2]),objectId:clean_(r[3]),kind:clean_(r[4]),name:clean_(r[5]),mime:clean_(r[6]),size:Number(r[7])||0,fileId:clean_(r[8]),url:clean_(r[9]),active:active37_(r[10]),createdAt:r[11]?formatDateTimeDE_(r[11]):'',createdBy:clean_(r[12]),row:i+1});}return out;}
function ensureMaintenanceAttachmentFolder501_(){return fixedFolder3_('MAINTENANCE_ATTACHMENT_FOLDER_ID','DG Wartungsunterlagen');}
function saveMaintenanceAttachments501_(employee,device,items){
  if(!Array.isArray(items)||!items.length)return [];
  const prepared=items.map(function(a,index){
    const dataUrl=clean_(a&&a.dataUrl),m=dataUrl.match(/^data:([^;]+);base64,(.+)$/);if(!m)throw new Error('Eine Wartungsunterlage konnte nicht verarbeitet werden.');
    const bytes=Utilities.base64Decode(m[2]);if(bytes.length>12*1024*1024)throw new Error('Eine Wartungsunterlage ist größer als 12 MB.');
    const mime=clean_(a.mime)||m[1]||'application/octet-stream',kind=clean_(a.kind)==='Bild'?'Bild':'Datei',rawName=clean_(a.name)||((kind==='Bild'?'Bild':'Datei')+'_'+(index+1));
    return{bytes:bytes,mime:mime,kind:kind,rawName:rawName};
  });
  const folder=ensureMaintenanceAttachmentFolder501_(),sh=getSpreadsheetRaw_().getSheetByName('Wartungsanhaenge'),out=[];
  prepared.forEach(function(a){
    const name='Geraet_'+safeFilePart_(device.internalDeviceId||device.id)+'_'+safeFilePart_(a.rawName),file=folder.createFile(Utilities.newBlob(a.bytes,a.mime,name)),id='MA-'+Utilities.getUuid();
    try{
      sh.appendRow([id,device.id,device.customerId,device.objectId,a.kind,a.rawName,a.mime,a.bytes.length,file.getId(),file.getUrl(),'Ja',new Date(),employee]);
      out.push({id:id,kind:a.kind,name:a.rawName,mime:a.mime,size:a.bytes.length,fileId:file.getId(),url:file.getUrl()});
    }catch(err){
      try{file.setTrashed(true);}catch(_e){}
      throw err;
    }
  });
  return out;
}
function getMaintenanceAttachment501_(employee,pin,id){requireChef_(employee,pin);ensureMaintenanceSchema37_();const a=maintenanceAttachments501_().find(function(x){return x.id===clean_(id)&&x.active;});if(!a)throw new Error('Wartungsunterlage nicht gefunden.');const file=DriveApp.getFileById(a.fileId),blob=file.getBlob();return{id:a.id,name:a.name||file.getName(),mime:a.mime||blob.getContentType(),base64:Utilities.base64Encode(blob.getBytes())};}
function deleteMaintenanceAttachment501_(employee,pin,id){requireChef_(employee,pin);ensureMaintenanceSchema37_();const a=maintenanceAttachments501_().find(function(x){return x.id===clean_(id)&&x.active;});if(!a)throw new Error('Wartungsunterlage nicht gefunden.');const sh=getSpreadsheetRaw_().getSheetByName('Wartungsanhaenge');sh.getRange(a.row,11).setValue('Nein');try{DriveApp.getFileById(a.fileId).setTrashed(true);}catch(_e){}return{ok:true,id:a.id,deviceId:a.deviceId};}
function findMaintenanceDevice37_(id){return maintenanceDevices37_().find(function(x){return x.id===clean_(id);})||null;}
function nextMaintenanceDeviceInternalId39_(){const ps=PropertiesService.getScriptProperties(),all=maintenanceDevices37_(),used={},nums=[];all.forEach(function(d){const n=Number(d.internalDeviceId);if(Number.isFinite(n)&&n>=1000){used[n]=1;nums.push(n);}});let n=Math.max(1000,Number(ps.getProperty('DG39_NEXT_DEVICE_ID'))||1000,nums.length?Math.max.apply(null,nums)+1:1000);while(used[n])n++;ps.setProperty('DG39_NEXT_DEVICE_ID',String(n+1));return String(n);}
function reserveMaintenanceDeviceId39_(employee,pin){requireChef_(employee,pin);ensureMaintenanceSchema37_();return nextMaintenanceDeviceInternalId39_();}
function findMaintenanceDeviceByInternalId39_(employee,pin,internalId){requireChef_(employee,pin);ensureMaintenanceSchema37_();internalId=clean_(internalId);const d=maintenanceDevices37_().find(function(x){return x.active&&x.internalDeviceId===internalId;});if(!d)throw new Error('Keine Wartungsanlage mit Geräte-ID '+internalId+' gefunden.');const c=maintenanceCustomers37_().find(function(x){return x.id===d.customerId&&x.active;})||{},o=maintenanceObjects37_().find(function(x){return x.id===d.objectId&&x.active;})||{};return{internalDeviceId:d.internalDeviceId,deviceId:d.id,customerId:d.customerId,objectId:d.objectId,customerName:c.name||'',objectName:o.name||'',address:maintenanceAddress37_(o),deviceType:d.deviceType,otherDescription:d.otherDescription,manufacturer:d.manufacturer,model:d.model,serialNumber:d.serialNumber,nextMaintenanceDue:d.nextMaintenanceDue};}
function maintenanceAddress37_(o){return [o.street,[o.zip,o.city].filter(Boolean).join(' ')].filter(Boolean).join(', ');}
function maintenanceDeviceLabel37_(d){return [d.deviceType==='Sonstiges'?(d.otherDescription||'Sonstiges'):d.deviceType,d.manufacturer,d.model,d.serialNumber?('SN '+d.serialNumber):''].filter(Boolean).join(' · ');}
function maintenanceMonth37_(value){if(value instanceof Date&&!isNaN(value.getTime()))return Utilities.formatDate(value,CONFIG.TZ,'yyyy-MM');const s=clean_(value);let m=s.match(/^(\d{4})-(0[1-9]|1[0-2])(?:-\d{1,2})?$/);if(m)return m[1]+'-'+m[2];if(!s)return '';const d=new Date(value);return isNaN(d.getTime())?'':Utilities.formatDate(d,CONFIG.TZ,'yyyy-MM');}
function monthShift37_(key,delta){const p=key.split('-').map(Number),d=new Date(p[0],p[1]-1+delta,1,12);return Utilities.formatDate(d,CONFIG.TZ,'yyyy-MM');}
function monthName37_(key){const p=key.split('-').map(Number),names=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];return names[p[1]-1]+' '+p[0];}
function getMaintenanceCalendarLink37_(employee,eventId){eventId=clean_(eventId);const none={maintenance:false,customerId:'',objectId:'',deviceId:''};if(!eventId)return none;try{const w=getPlannerWorkerRows_().find(function(x){return clean_(x.employeeName)===clean_(employee);});if(!w)return none;const e=getPlannerEventRows_().find(function(x){return clean_(x.googleEventIds&&x.googleEventIds[w.id])===eventId;});if(!e)return none;return{maintenance:e.type==='Wartung',customerId:e.maintenanceCustomerId||'',objectId:e.maintenanceObjectId||'',deviceId:e.maintenanceDeviceId||''};}catch(_e){return none;}}
function updateMaintenanceDeviceDue37_(deviceId,due,employee){due=maintenanceMonth37_(due);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(due))return;const d=findMaintenanceDevice37_(deviceId);if(!d)return;const sh=getSpreadsheetRaw_().getSheetByName('Wartungsgeraete');sh.getRange(d.row,16,1,5).setValues([[due,d.active?'Ja':'Nein',d.createdAt||new Date(),new Date(),employee]]);sh.getRange(d.row,16).setNumberFormat('@').setValue(due);}
function maintenanceHistory37_(deviceId){const sh=getSpreadsheetRaw_().getSheetByName(CONFIG.TIME_SHEET),v=sh.getDataRange().getValues(),out=[];for(let i=1;i<v.length;i++){if(clean_(v[i][32])!=='Ja'||clean_(v[i][36])!==clean_(deviceId))continue;out.push({id:clean_(v[i][0]),date:normalizeDate_(v[i][2]),employee:clean_(v[i][1]),description:clean_(v[i][7]),hours:Number(v[i][6])||0,nextMaintenanceDue:maintenanceMonth37_(v[i][33])});}out.sort(function(a,b){return b.date.localeCompare(a.date);});return out;}
function getMaintenanceCustomer37_(employee,pin,id){requireChef_(employee,pin);ensureMaintenanceSchema37_();const c=maintenanceCustomers37_().find(function(x){return x.id===clean_(id)&&x.active;});if(!c)throw new Error('Wartungskunde wurde nicht gefunden.');const objs=maintenanceObjects37_().filter(function(x){return x.customerId===c.id&&x.active;}),devices=maintenanceDevices37_(),repairs=maintenanceRepairs37_(),attachments=maintenanceAttachments501_().filter(function(x){return x.active;});return{id:c.id,name:c.name,billingStreet:c.billingStreet,billingZip:c.billingZip,billingCity:c.billingCity,email:c.email,phone:c.phone,objects:objs.map(function(o){return{id:o.id,name:o.name,street:o.street,zip:o.zip,city:o.city,notes:o.notes,devices:devices.filter(function(d){return d.objectId===o.id&&d.active;}).map(function(d){const z=Object.assign({},d);z.repairs=repairs.filter(function(r){return r.deviceId===d.id;}).sort(function(a,b){return b.date.localeCompare(a.date);});z.history=maintenanceHistory37_(d.id);z.attachments=attachments.filter(function(a){return a.deviceId===d.id;}).map(function(a){return{id:a.id,kind:a.kind,name:a.name,mime:a.mime,size:a.size,url:a.url,createdAt:a.createdAt,createdBy:a.createdBy};});return z;})};})};}
function saveMaintenanceCustomer37_(employee,pin,item){requireChef_(employee,pin);ensureMaintenanceSchema37_();item=item||{};validateMaintenanceCustomer603_(item);const name=clean_(item.name),bs=clean_(item.billingStreet),bz=clean_(item.billingZip),bc=clean_(item.billingCity);if(!name||!bs||!bz||!bc)throw new Error('Name und vollständige Rechnungsadresse sind Pflicht.');if(!Array.isArray(item.objects)||!item.objects.length)throw new Error('Mindestens ein Objekt ist erforderlich.');const now=new Date(),cs=getSpreadsheetRaw_().getSheetByName('Wartungskunden'),customers=maintenanceCustomers37_(),cid=clean_(item.id)||('WK-'+Utilities.getUuid()),oldC=customers.find(function(x){return x.id===cid;});const crow=[cid,name,bs,bz,bc,clean_(item.email),clean_(item.phone),'Ja',oldC?oldC.createdAt||now:now,now,employee];if(oldC)cs.getRange(oldC.row,1,1,crow.length).setValues([crow]);else cs.appendRow(crow);
  const os=getSpreadsheetRaw_().getSheetByName('Wartungsobjekte'),ds=getSpreadsheetRaw_().getSheetByName('Wartungsgeraete'),oldObjs=maintenanceObjects37_().filter(function(x){return x.customerId===cid;}),oldDevs=maintenanceDevices37_().filter(function(x){return x.customerId===cid;}),keepO={},keepD={};
  item.objects.forEach(function(o,oi){const oid=clean_(o.id)||('WO-'+Utilities.getUuid()),on=clean_(o.name),st=clean_(o.street),zip=clean_(o.zip),city=clean_(o.city);if(!on||!st||!zip||!city)throw new Error('Objekt '+(oi+1)+': Bezeichnung und vollständige Adresse fehlen.');const oldO=oldObjs.find(function(x){return x.id===oid;}),orow=[oid,cid,on,st,zip,city,clean_(o.notes),'Ja',oldO?oldO.createdAt||now:now,now,employee];if(oldO)os.getRange(oldO.row,1,1,orow.length).setValues([orow]);else os.appendRow(orow);keepO[oid]=1;if(!Array.isArray(o.devices)||!o.devices.length)throw new Error('Objekt '+(oi+1)+': Mindestens ein Gerät erforderlich.');o.devices.forEach(function(d,di){const did=clean_(d.id)||('WG-'+Utilities.getUuid()),kind=clean_(d.deviceType);if(!kind)throw new Error('Objekt '+(oi+1)+', Gerät '+(di+1)+': Geräteart fehlt.');if(kind==='Sonstiges'&&!clean_(d.otherDescription))throw new Error('Bei Geräteart Sonstiges ist die Beschreibung Pflicht.');const due=maintenanceMonth37_(d.nextMaintenanceDue);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(due))throw new Error('Objekt '+(oi+1)+', Gerät '+(di+1)+': Nächste Wartung Monat/Jahr fehlt.');const oldD=oldDevs.find(function(x){return x.id===did;}),requestedInternal=clean_(d.internalDeviceId),usedInternal=maintenanceDevices37_().find(function(x){return x.internalDeviceId===requestedInternal&&x.id!==did;}),internalId=oldD&&oldD.internalDeviceId?oldD.internalDeviceId:(requestedInternal&&/^\d+$/.test(requestedInternal)&&!usedInternal?requestedInternal:nextMaintenanceDeviceInternalId39_()),drow=[did,oid,cid,kind,clean_(d.otherDescription),clean_(d.manufacturer),clean_(d.model),clean_(d.serialNumber),clean_(d.year),clean_(d.tenantName),clean_(d.tenantPhone),clean_(d.tenantEmail),clean_(d.sparePartManufacturer),clean_(d.sparePartSerialNumber),clean_(d.internalNotes),due,'Ja',oldD?oldD.createdAt||now:now,now,employee,internalId],targetRow=oldD?oldD.row:ds.getLastRow()+1;if(oldD)ds.getRange(oldD.row,1,1,drow.length).setValues([drow]);else ds.appendRow(drow);ds.getRange(targetRow,16).setNumberFormat('@').setValue(due);ds.getRange(targetRow,21).setNumberFormat('@').setValue(internalId);if(Array.isArray(d.newAttachments)&&d.newAttachments.length)saveMaintenanceAttachments501_(employee,{id:did,customerId:cid,objectId:oid,internalDeviceId:internalId},d.newAttachments);keepD[did]=1;});});
  oldObjs.forEach(function(o){if(!keepO[o.id])os.getRange(o.row,8,1,4).setValues([['Nein',o.createdAt||now,now,employee]]);});oldDevs.forEach(function(d){if(!keepD[d.id])ds.getRange(d.row,17,1,4).setValues([['Nein',d.createdAt||now,now,employee]]);});SpreadsheetApp.flush();return getMaintenanceCustomer37_(employee,pin,cid);}

function deleteMaintenanceDevice38_(employee,pin,id){requireChef_(employee,pin);ensureMaintenanceSchema37_();const d=findMaintenanceDevice37_(id);if(!d||!d.active)throw new Error('Wartungsgerät wurde nicht gefunden.');const now=new Date(),sh=getSpreadsheetRaw_().getSheetByName('Wartungsgeraete');sh.getRange(d.row,17,1,4).setValues([['Nein',d.createdAt||now,now,employee]]);return{ok:true,id:d.id,customerId:d.customerId,objectId:d.objectId};}
function deleteMaintenanceCustomer38_(employee,pin,id){requireChef_(employee,pin);ensureMaintenanceSchema37_();const cid=clean_(id),c=maintenanceCustomers37_().find(function(x){return x.id===cid&&x.active;});if(!c)throw new Error('Wartungskunde wurde nicht gefunden.');const now=new Date(),ss=getSpreadsheetRaw_(),cs=ss.getSheetByName('Wartungskunden'),os=ss.getSheetByName('Wartungsobjekte'),ds=ss.getSheetByName('Wartungsgeraete');cs.getRange(c.row,8,1,4).setValues([['Nein',c.createdAt||now,now,employee]]);maintenanceObjects37_().filter(function(x){return x.customerId===cid&&x.active;}).forEach(function(o){os.getRange(o.row,8,1,4).setValues([['Nein',o.createdAt||now,now,employee]]);});maintenanceDevices37_().filter(function(x){return x.customerId===cid&&x.active;}).forEach(function(d){ds.getRange(d.row,17,1,4).setValues([['Nein',d.createdAt||now,now,employee]]);});return{ok:true,id:cid};}
function searchMaintenanceCustomers37_(employee,pin,q){requireChef_(employee,pin);ensureMaintenanceSchema37_();q=clean_(q).toLowerCase();const cs=maintenanceCustomers37_().filter(function(x){return x.active;}),os=maintenanceObjects37_().filter(function(x){return x.active;}),ds=maintenanceDevices37_().filter(function(x){return x.active;});return cs.filter(function(c){if(!q)return true;const parts=[c.name,c.billingStreet,c.billingZip,c.billingCity,c.email,c.phone];os.filter(function(o){return o.customerId===c.id;}).forEach(function(o){parts.push(o.name,o.street,o.zip,o.city);ds.filter(function(d){return d.objectId===o.id;}).forEach(function(d){parts.push(d.internalDeviceId,d.deviceType,d.otherDescription,d.manufacturer,d.model,d.serialNumber,d.tenantName);});});return parts.join(' ').toLowerCase().includes(q);}).map(function(c){return{id:c.id,name:c.name,billingCity:c.billingCity,objectCount:os.filter(function(o){return o.customerId===c.id;}).length,deviceCount:ds.filter(function(d){return d.customerId===c.id;}).length};}).sort(function(a,b){return a.name.localeCompare(b.name,'de');});}
function addMaintenanceRepair37_(employee,pin,deviceId,date,description){requireChef_(employee,pin);ensureMaintenanceSchema37_();const d=findMaintenanceDevice37_(deviceId);if(!d||!d.active)throw new Error('Wartungsgerät nicht gefunden.');if(!validDate3_(date))throw new Error('Reparaturdatum ist ungültig.');if(!clean_(description))throw new Error('Reparaturbeschreibung fehlt.');const sh=getSpreadsheetRaw_().getSheetByName('Wartungsreparaturen'),id='WR-'+Utilities.getUuid();sh.appendRow([id,d.id,d.customerId,d.objectId,date,clean_(description),new Date(),employee]);return{id:id};}
function manualMaintenanceRows502_(){const x=maintenanceRows37_('Wartungsmanuell'),out=[];for(let i=1;i<x.values.length;i++){const r=x.values[i];if(!clean_(r[0]))continue;out.push({id:clean_(r[0]),date:normalizeDate_(r[1]),count:Math.max(0,Number(r[2])||0),note:clean_(r[3]),createdAt:r[4],createdBy:clean_(r[5]),row:i+1});}return out;}
function addManualMaintenanceCount502_(employee,pin,date,count,note){requireChef_(employee,pin);ensureMaintenanceSchema37_();date=clean_(date)||Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd');if(!validDate3_(date))throw new Error('Datum ist ungültig.');count=Math.floor(Number(count)||0);if(count<1||count>99)throw new Error('Bitte eine Anzahl zwischen 1 und 99 eintragen.');const sh=getSpreadsheetRaw_().getSheetByName('Wartungsmanuell'),id='WM-'+Utilities.getUuid();sh.appendRow([id,date,count,clean_(note),new Date(),employee]);return{id:id,date:date,count:count,note:clean_(note)};}
function getMaintenanceOverview37_(employee,pin){requireChef_(employee,pin);ensureMaintenanceSchema37_();const now=new Date(),current=Utilities.formatDate(now,CONFIG.TZ,'yyyy-MM'),year=Number(Utilities.formatDate(now,CONFIG.TZ,'yyyy')),keys=[];for(let i=-3;i<=3;i++)keys.push(monthShift37_(current,i));const customers=maintenanceCustomers37_().filter(function(x){return x.active;}),objects=maintenanceObjects37_().filter(function(x){return x.active;}),devices=maintenanceDevices37_().filter(function(x){return x.active;}),events=getPlannerEventRows_().filter(function(e){return e.type==='Wartung'&&e.maintenanceDeviceId;});const cBy={},oBy={};customers.forEach(function(c){cBy[c.id]=c;});objects.forEach(function(o){oBy[o.id]=o;});const months=keys.map(function(key){const items=devices.filter(function(d){return d.nextMaintenanceDue===key;}).map(function(d){const c=cBy[d.customerId]||{},o=oBy[d.objectId]||{},plans=events.filter(function(e){return e.maintenanceDeviceId===d.id&&e.date.slice(0,7)===key;}).sort(function(a,b){return a.date.localeCompare(b.date)||a.start.localeCompare(b.start);}),p=plans[0]||null;return{customerId:d.customerId,objectId:d.objectId,deviceId:d.id,internalDeviceId:d.internalDeviceId,customerName:c.name||'',objectName:o.name||'',address:maintenanceAddress37_(o),deviceType:d.deviceType,otherDescription:d.otherDescription,manufacturer:d.manufacturer,model:d.model,serialNumber:d.serialNumber,nextMaintenanceDue:d.nextMaintenanceDue,scheduled:Boolean(p),plannedDate:p?p.date:'',employeeNames:p?p.employeeNames:[]};});return{key:key,label:monthName37_(key),current:key===current,items:items,openCount:items.filter(function(x){return!x.scheduled;}).length,scheduledCount:items.filter(function(x){return x.scheduled;}).length,total:items.length};});const currentMonth=months.find(function(m){return m.current;})||{openCount:0};const completedKeys={};let completed=0;const tsh=getSpreadsheetRaw_().getSheetByName(CONFIG.TIME_SHEET),tv=tsh&&tsh.getLastRow()>1?tsh.getDataRange().getValues():[];for(let i=1;i<tv.length;i++){if(clean_(tv[i][32])!=='Ja')continue;const dt=normalizeDate_(tv[i][2]);if(!dt||Number(dt.slice(0,4))!==year)continue;const did=clean_(tv[i][36]),src=clean_(tv[i][21]),k=(did||clean_(tv[i][3]))+'|'+(src||dt);if(completedKeys[k])continue;completedKeys[k]=1;completed++;}const manualRows=manualMaintenanceRows502_().filter(function(x){return x.date&&Number(x.date.slice(0,4))===year;}),manualCompleted=manualRows.reduce(function(sum,x){return sum+(Number(x.count)||0);},0);completed+=manualCompleted;const open=devices.filter(function(d){return String(d.nextMaintenanceDue||'').slice(0,4)===String(year);}).length;return{currentMonth:current,currentMonthOpen:currentMonth.openCount,months:months,windowLabel:monthName37_(keys[0])+' – '+monthName37_(keys[keys.length-1]),yearStats:{year:year,total:completed+open,completed:completed,open:open,manualCompleted:manualCompleted}};}
function getMaintenanceArchive37_(employee,pin,q){requireChef_(employee,pin);ensureMaintenanceSchema37_();q=clean_(q).toLowerCase();const cs=maintenanceCustomers37_(),os=maintenanceObjects37_(),ds=maintenanceDevices37_(),cBy={},oBy={},dBy={};cs.forEach(function(x){cBy[x.id]=x;});os.forEach(function(x){oBy[x.id]=x;});ds.forEach(function(x){dBy[x.id]=x;});const out=[];manualMaintenanceRows502_().forEach(function(r){out.push({kind:'ManualMaintenance',date:r.date,customerName:'Manuell erfasste Wartungen',objectName:'',deviceLabel:'',description:(r.count+' Wartung(en)'+(r.note?' · '+r.note:'')),employee:r.createdBy,count:r.count});});maintenanceRepairs37_().forEach(function(r){const d=dBy[r.deviceId]||{},o=oBy[r.objectId]||{},c=cBy[r.customerId]||{};out.push({kind:'Repair',date:r.date,customerName:c.name||'',objectName:o.name||'',deviceLabel:maintenanceDeviceLabel37_(d),description:r.description,employee:r.createdBy});});const sh=getSpreadsheetRaw_().getSheetByName(CONFIG.TIME_SHEET),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++){if(clean_(v[i][32])!=='Ja')continue;const did=clean_(v[i][36]),d=dBy[did]||{},o=oBy[clean_(v[i][35])]||{},c=cBy[clean_(v[i][34])]||{};out.push({kind:'Maintenance',date:normalizeDate_(v[i][2]),customerName:c.name||clean_(v[i][3]),objectName:o.name||'',deviceLabel:maintenanceDeviceLabel37_(d),description:clean_(v[i][7]),employee:clean_(v[i][1]),nextMaintenanceDue:maintenanceMonth37_(v[i][33])});}const f=q?out.filter(function(x){return[x.customerName,x.objectName,x.deviceLabel,x.description,x.employee].join(' ').toLowerCase().includes(q);}):out;f.sort(function(a,b){return(b.date||'').localeCompare(a.date||'');});return f.slice(0,500);}


// ===== DG 5.0 FINALISIERUNG =====
function dg50CleanPlannerText_(value){
  return String(value||'').replace(/\r/g,'\n')
    .replace(/Terminart:\s*(?:Wartung|Auftrag)/gi,' ')
    .replace(/Was ist zu tun:\s*/gi,' ')
    .replace(/DG-Termin-ID:\s*[A-Za-z0-9@._-]+/gi,' ')
    .replace(/Wartung-Kunden-ID:\s*[A-Za-z0-9-]+/gi,' ')
    .replace(/Wartung-Objekt-ID:\s*[A-Za-z0-9-]+/gi,' ')
    .replace(/Wartung-(?:Geraet|Gerät)-ID:\s*[A-Za-z0-9-]+/gi,' ')
    .replace(/Geräte-ID:\s*\d+/gi,' ')
    .replace(/^\[WARTUNG\]\s*/i,' ')
    .replace(/\s+/g,' ').trim();
}
function dg50InternalDeviceIdFromDescription_(value){const m=String(value||'').match(/Geräte-ID:\s*(\d+)/i);return m?clean_(m[1]):'';}
plannerTaskFromDescription_=function(d){return dg50CleanPlannerText_(d);};
plannerDescription_=function(task,id,type,ev){
  let d='Terminart: '+(type==='Wartung'?'Wartung':'Auftrag')+'\nWas ist zu tun:\n'+dg50CleanPlannerText_(task)+'\n\nDG-Termin-ID: '+id;
  if(type==='Wartung'&&ev){
    if(ev.maintenanceCustomerId)d+='\nWartung-Kunden-ID: '+ev.maintenanceCustomerId;
    if(ev.maintenanceObjectId)d+='\nWartung-Objekt-ID: '+ev.maintenanceObjectId;
    if(ev.maintenanceDeviceId){d+='\nWartung-Geraet-ID: '+ev.maintenanceDeviceId;try{const md=findMaintenanceDevice37_(ev.maintenanceDeviceId);if(md&&md.internalDeviceId)d+='\nGeräte-ID: '+md.internalDeviceId;}catch(_e){}}
  }
  return d;
};

const dg50GetEmployeeCalendarEventsBase_=getEmployeeCalendarEvents;
getEmployeeCalendarEvents=function(employee,employeePin,startDate,days){
  return dg50GetEmployeeCalendarEventsBase_(employee,employeePin,startDate,days).map(function(x){
    const raw=x.description||'';x.internalDeviceId=dg50InternalDeviceIdFromDescription_(raw);x.description=dg50CleanPlannerText_(raw);return x;
  });
};

// Nach einem komplett leeren Wartungsstamm beginnt die Nummerierung garantiert wieder bei 1000.
nextMaintenanceDeviceInternalId39_=function(){
  const ps=PropertiesService.getScriptProperties(),all=maintenanceDevices37_().filter(function(d){return d.active;}),used={},nums=[];
  all.forEach(function(d){const n=Number(d.internalDeviceId);if(Number.isFinite(n)&&n>=1000){used[n]=1;nums.push(n);}});
  if(!nums.length){ps.setProperty('DG39_NEXT_DEVICE_ID','1001');return '1000';}
  let n=Math.max(1000,Math.max.apply(null,nums)+1);while(used[n])n++;ps.setProperty('DG39_NEXT_DEVICE_ID',String(n+1));return String(n);
};

function dg50MaintenanceMaps_(){
  const cs=maintenanceCustomers37_(),os=maintenanceObjects37_(),ds=maintenanceDevices37_(),c={},o={},d={};
  cs.forEach(function(x){c[x.id]=x;});os.forEach(function(x){o[x.id]=x;});ds.forEach(function(x){d[x.id]=x;});return{c:c,o:o,d:d};
}
const dg50GetRegieReportsBase_=getRegieReports;
getRegieReports=function(employee,employeePin,status,year,month){
  const out=dg50GetRegieReportsBase_(employee,employeePin,status,year,month),maps=dg50MaintenanceMaps_(),sh=getSpreadsheet_().getSheetByName(CONFIG.TIME_SHEET),v=sh&&sh.getLastRow()>1?sh.getDataRange().getValues():[],byId={};
  for(let i=1;i<v.length;i++)if(clean_(v[i][0]))byId[clean_(v[i][0])]=v[i];
  out.forEach(function(g){(g.reports||[]).forEach(function(r){
    const row=byId[r.id];if(!row||clean_(row[32])!=='Ja')return;
    const cid=clean_(row[34]),oid=clean_(row[35]),did=clean_(row[36]),c=maps.c[cid]||{},o=maps.o[oid]||{},d=maps.d[did]||{};
    r.maintenance=true;r.maintenanceCustomerId=cid;r.maintenanceObjectId=oid;r.maintenanceDeviceId=did;r.internalDeviceId=d.internalDeviceId||'';
    r.billingName=c.name||'';r.billingStreet=c.billingStreet||'';r.billingZip=c.billingZip||'';r.billingCity=c.billingCity||'';r.billingEmail=c.email||'';r.billingPhone=c.phone||'';
    r.executionObjectName=o.name||'';r.executionAddress=maintenanceAddress37_(o);r.activity=dg50CleanPlannerText_(r.activity||'');
  });});return out;
};

const dg50SystemHealthBase_=systemHealthCheck;
systemHealthCheck=function(employee,pin){const r=dg50SystemHealthBase_(employee,pin);r.version=DG_BACKEND_VERSION;r.checks=r.checks||[];r.checks.push({name:'Versionseinheit',ok:true,level:'ok',detail:'App/Backend Zielstand 9.0'});return r;};

// ===== DG 7.0 FINAL PRODUCTION HARDENING =====
function validateMaintenanceCustomer603_(item){
  item=item||{};
  if(!clean_(item.name)||!clean_(item.billingStreet)||!clean_(item.billingZip)||!clean_(item.billingCity))throw new Error('Name und vollständige Rechnungsadresse sind Pflicht.');
  if(!Array.isArray(item.objects)||!item.objects.length)throw new Error('Mindestens ein Objekt ist erforderlich.');
  item.objects.forEach(function(o,oi){
    if(!clean_(o&&o.name)||!clean_(o&&o.street)||!clean_(o&&o.zip)||!clean_(o&&o.city))throw new Error('Objekt '+(oi+1)+': Bezeichnung und vollständige Adresse fehlen.');
    if(!Array.isArray(o.devices)||!o.devices.length)throw new Error('Objekt '+(oi+1)+': Mindestens ein Gerät erforderlich.');
    o.devices.forEach(function(d,di){
      const kind=clean_(d&&d.deviceType);if(!kind)throw new Error('Objekt '+(oi+1)+', Gerät '+(di+1)+': Geräteart fehlt.');
      if(kind==='Sonstiges'&&!clean_(d.otherDescription))throw new Error('Bei Geräteart Sonstiges ist die Beschreibung Pflicht.');
      const due=maintenanceMonth37_(d.nextMaintenanceDue);if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(due))throw new Error('Objekt '+(oi+1)+', Gerät '+(di+1)+': Nächste Wartung Monat/Jahr fehlt.');
      (Array.isArray(d.newAttachments)?d.newAttachments:[]).forEach(function(a){const m=clean_(a&&a.dataUrl).match(/^data:([^;]+);base64,(.+)$/);if(!m)throw new Error('Eine Wartungsunterlage konnte nicht verarbeitet werden.');if(Math.ceil(m[2].length*3/4)>12*1024*1024)throw new Error('Eine Wartungsunterlage ist größer als 12 MB.');});
    });
  });
}

function ensureDG70StorageHardening_(){
  const props=PropertiesService.getScriptProperties(),key='DG_STORAGE_SCHEMA_VERSION';
  if(props.getProperty(key)==='7.0-final')return;
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(5000))return;
  try{
    if(props.getProperty(key)==='7.0-final')return;
    const ss=getSpreadsheetRaw_();
    const specs={
      'Anfragen':[6,7],
      'AngebotsReminder':[4,5],
      'Wartungskunden':[4,7],
      'Wartungsobjekte':[5],
      'Wartungsgeraete':[8,11,14,16,21],
      'AnfrageAngebote':[4],
      'AuftragsStamm':[4],
      'AnfragenReminder':[4],
      'KalenderMitarbeiter':[5],
      'KalenderTermine':[8,9,10,15,16,17],
      'EigeneReminder':[10],
      'Mitarbeiter':[2,18,20,22,23,26,27,28,30,35]
    };
    Object.keys(specs).forEach(function(name){
      const sh=ss.getSheetByName(name);if(!sh)return;const rows=Math.max(0,sh.getMaxRows()-1);if(!rows)return;
      specs[name].forEach(function(col){if(col<=sh.getMaxColumns())sh.getRange(2,col,rows,1).setNumberFormat('@');});
    });
    props.setProperty(key,'7.0-final');
  }finally{lock.releaseLock();}
}



// ===== DG 7.2 - URLAUB/FEIERTAG-AUTOMATIK + BESICHTIGUNGSZEITEN =====
(function(){
'use strict';

function dg72AutoStatus_(status){return status==='Urlaub'||status==='Feiertag';}
function dg72AutoNote_(status){return 'Automatisch: '+status;}
function dg72AutoClosureRow_(ss,employee,date,status,credit,source){
  employee=clean_(employee);date=clean_(date);status=clean_(status);credit=round2_(Math.max(0,Number(credit)||0));
  if(!employee||!validDate3_(date)||!dg72AutoStatus_(status))return {ok:false,reason:'not-eligible'};
  if(hasWorkEntryOnDate_(ss,employee,date))return {ok:false,reason:'work-entry'};
  const sh=ss.getSheetByName(CONFIG.CLOSE_SHEET);if(!sh)return {ok:false,reason:'missing-close-sheet'};
  const info=getDayClosureInfo_(ss,employee,date),note=dg72AutoNote_(status)+(source?' · '+clean_(source):'');
  if(info.closed&&info.row){
    const oldNote=clean_(sh.getRange(info.row,5).getValue());
    if(/^Automatisch:\s*(Urlaub|Feiertag)/i.test(oldNote)){
      sh.getRange(info.row,3,1,8).setValues([[new Date(),credit,note,'',0,credit,new Date(),'DG 7.2 Statusautomatik']]);
      return {ok:true,updated:true};
    }
    return {ok:true,existing:true};
  }
  sh.appendRow([employee,date,new Date(),credit,note,'',0,credit,'','DG 7.2 Statusautomatik']);
  return {ok:true,created:true};
}
function dg72RemoveAutoClosure_(ss,employee,date,status){
  const sh=ss.getSheetByName(CONFIG.CLOSE_SHEET);if(!sh||sh.getLastRow()<2)return false;
  const v=sh.getDataRange().getValues();let removed=false;
  for(let i=v.length-1;i>=1;i--){
    if(clean_(v[i][0])!==clean_(employee)||normalizeDate_(v[i][1])!==clean_(date))continue;
    const note=clean_(v[i][4]);
    if(!/^Automatisch:\s*(Urlaub|Feiertag)/i.test(note))continue;
    if(status&&note.toLowerCase().indexOf(clean_(status).toLowerCase())<0)continue;
    sh.deleteRow(i+1);removed=true;
  }
  return removed;
}
function dg72SyncAutoClosures_(ss,year){
  year=Number(year)||0;const sh=ss.getSheetByName(CONFIG.STATUS_SHEET);if(!sh||sh.getLastRow()<2)return 0;
  const v=sh.getDataRange().getValues();let n=0;
  for(let i=1;i<v.length;i++){
    const employee=clean_(v[i][0]),date=normalizeDate_(v[i][1]),status=clean_(v[i][2]);
    if(!employee||!date||!dg72AutoStatus_(status))continue;
    if(date<PRODUCTIVE_START_DATE)continue;
    if(year&&Number(date.slice(0,4))!==year)continue;
    let credit=Number(v[i][6])||0;
    if(v[i][6]===''||v[i][6]===null||v[i][6]===undefined)credit=weekdayHoursForDate_(employee,date);
    const r=dg72AutoClosureRow_(ss,employee,date,status,credit,clean_(v[i][4]));if(r&&r.ok)n++;
  }
  return n;
}

const dg72HolidayBase_=ensureHolidayStatusesForYear_;
ensureHolidayStatusesForYear_=function(ss,year){const r=dg72HolidayBase_(ss,year);dg72SyncAutoClosures_(ss,year);return r;};

const dg72SaveAbsenceBase_=saveAbsence;
saveAbsence=function(employee,employeePin,targetEmployee,type,startDate,endDate){
  const r=dg72SaveAbsenceBase_.apply(this,arguments),ss=getSpreadsheet_();
  if(clean_(type)==='Urlaub'){const sy=Number(String(startDate||'').slice(0,4))||0,ey=Number(String(endDate||'').slice(0,4))||sy;for(let y=sy;y<=ey;y++)dg72SyncAutoClosures_(ss,y);}
  return r;
};

const dg72DeleteAbsenceBase_=deleteAbsence;
deleteAbsence=function(employee,employeePin,id){
  const ss=getSpreadsheet_(),st=ss.getSheetByName(CONFIG.STATUS_SHEET),affected=[];
  if(st&&st.getLastRow()>=2){const v=st.getDataRange().getValues();for(let i=1;i<v.length;i++)if(clean_(v[i][5])===clean_(id)&&dg72AutoStatus_(clean_(v[i][2])))affected.push({employee:clean_(v[i][0]),date:normalizeDate_(v[i][1]),status:clean_(v[i][2])});}
  const r=dg72DeleteAbsenceBase_.apply(this,arguments);affected.forEach(function(x){dg72RemoveAutoClosure_(ss,x.employee,x.date,x.status);});return r;
};

const dg72SetDayStatusBase_=setDayStatus;
setDayStatus=function(employee,date,employeePin,status){
  const oldStatus=getStatusInfo_(getSpreadsheet_(),employee,date).status,r=dg72SetDayStatusBase_.apply(this,arguments),ss=getSpreadsheet_();
  if(dg72AutoStatus_(status)){const info=getStatusInfo_(ss,employee,date);dg72AutoClosureRow_(ss,employee,date,status,info.creditedHours,info.source);}
  else if(status==='Arbeiten'&&dg72AutoStatus_(oldStatus))dg72RemoveAutoClosure_(ss,employee,date,oldStatus);
  return r;
};

const dg72SaveEntryBase_=saveEntry;
saveEntry=function(data){
  if(data&&clean_(data.employee)&&validDate3_(clean_(data.date))){const st=getDayStatus_(getSpreadsheet_(),clean_(data.employee),clean_(data.date));if(st!=='Arbeiten')throw new Error('Dieser Tag ist als '+st+' fest hinterlegt. Arbeitszeiteingaben sind für diesen Tag vollständig gesperrt.');}
  return dg72SaveEntryBase_.apply(this,arguments);
};

const dg72DayDataBase_=getDayData;
getDayData=function(employee,date,employeePin){
  const r=dg72DayDataBase_.apply(this,arguments),ss=getSpreadsheet_();
  if(dg72AutoStatus_(r.status)){
    dg72AutoClosureRow_(ss,employee,date,r.status,r.creditedHours,r.statusSource);
    r.closed=isDayClosed_(ss,employee,date);
    r.statusReport={id:'STATUS-'+clean_(employee)+'-'+clean_(date),status:r.status,hours:round2_(Number(r.creditedHours)||0),activity:r.status+' – automatische Zeitgutschrift',automatic:true,closed:r.closed};
  }
  return r;
};

const dg72BossMonthBase_=getBossMonthData;
getBossMonthData=function(employee,employeePin,year,month){
  const rows=dg72BossMonthBase_.apply(this,arguments),ss=getSpreadsheet_();
  (rows||[]).forEach(function(x){
    const dates={};(x.entries||[]).forEach(function(e){if(e.date)dates[e.date]=true;});
    (x.statuses||[]).forEach(function(st){if(dg72AutoStatus_(st.status)&&st.date)dates[st.date]=true;});
    const list=Object.keys(dates);x.days=list.length;x.closedDays=list.filter(function(d){return isDayClosed_(ss,x.employee,d);}).length;x.openDays=Math.max(0,x.days-x.closedDays);
  });
  return rows;
};

const dg72BossDayClosuresBase_=getBossDayClosures;
getBossDayClosures=function(employee,employeePin,year,month){
  const base=dg72BossDayClosuresBase_.apply(this,arguments)||[],ss=getSpreadsheet_(),by={};
  base.forEach(function(e){by[e.employee]=e;e.days=e.days||[];});
  getEmployeeRecords_(true).forEach(function(emp){if(!by[emp.name])by[emp.name]={employee:emp.name,active:emp.active!==false,days:[]};});
  const st=ss.getSheetByName(CONFIG.STATUS_SHEET),v=st&&st.getLastRow()>=2?st.getDataRange().getValues():[];
  for(let i=1;i<v.length;i++){
    const emp=clean_(v[i][0]),date=normalizeDate_(v[i][1]),status=clean_(v[i][2]);if(!emp||!date||!dg72AutoStatus_(status))continue;
    const p=date.split('-');if(Number(p[0])!==Number(year)||Number(p[1])!==Number(month))continue;
    const target=by[emp]||(by[emp]={employee:emp,active:true,days:[]});if(target.days.some(function(d){return d.date===date;}))continue;
    const credit=round2_(Number(v[i][6])||0);dg72AutoClosureRow_(ss,emp,date,status,credit,clean_(v[i][4]));
    target.days.push({date:date,hours:credit,grossHours:credit,pauseHours:0,entryCount:1,closed:isDayClosed_(ss,emp,date),status:status,reports:[{id:'STATUS-'+emp+'-'+date,customer:status,start:'',end:'',hours:credit,activity:status+' – automatische Zeitgutschrift',transmittedAt:'Automatisch',materialUsed:false,material:'',billingStatus:'',isAdditionalAssignment:false,assignedBy:'',assignmentStatus:'',isSupplement:false,supplementCreatedAt:'',isStatusCredit:true,statusType:status}]});
  }
  return Object.keys(by).map(function(k){by[k].days.sort(function(a,b){return a.date.localeCompare(b.date);});return by[k];}).filter(function(x){return x.days.length>0;}).sort(function(a,b){return a.employee.localeCompare(b.employee,'de');});
};

const dg72SyncClosedBase_=syncClosedDayTotals_;
syncClosedDayTotals_=function(ss,employee,date,reason){
  const r=dg72SyncClosedBase_.apply(this,arguments),info=getStatusInfo_(ss,employee,date);
  if(dg72AutoStatus_(info.status)&&!hasWorkEntryOnDate_(ss,employee,date))dg72AutoClosureRow_(ss,employee,date,info.status,info.creditedHours,info.source);
  return r;
};

function dg72EnsureInquiryOfferColumns_(){
  const sh=ensureInquiryOfferSheet_(),headers=['Besichtigungsdatum','Zeitaufwand Std.','Tätigkeitsnotiz'];
  if(sh.getMaxColumns()<15)sh.insertColumnsAfter(sh.getMaxColumns(),15-sh.getMaxColumns());
  sh.getRange(1,13,1,3).setValues([headers]);return sh;
}
function dg72MinutesToTime_(mins){mins=((Math.round(Number(mins)||0)%1440)+1440)%1440;return String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');}
function dg72InspectionTimes_(item,hours,hintDate){
  item=item||{};const ev=item.event||{},mins=Math.max(1,Math.round(Number(hours||0)*60));let s=normalizeEntryTime_(item.start||ev.startTime||''),e=normalizeEntryTime_(item.end||ev.endTime||'');
  if(s){const p=s.split(':').map(Number),sm=p[0]*60+p[1];return {start:s,end:dg72MinutesToTime_(sm+mins)};}
  if(e){const p=e.split(':').map(Number),em=p[0]*60+p[1];return {start:dg72MinutesToTime_(em-mins),end:e};}
  let d=hintDate instanceof Date?hintDate:new Date(),em=d.getHours()*60+d.getMinutes();return {start:dg72MinutesToTime_(em-mins),end:dg72MinutesToTime_(em)};
}
function dg72HasInspectionTime_(ss,offerId){const sh=ss.getSheetByName(CONFIG.TIME_SHEET),v=sh&&sh.getLastRow()>=2?sh.getDataRange().getValues():[];for(let i=1;i<v.length;i++)if(clean_(v[i][29])===clean_(offerId))return {row:i+1,id:clean_(v[i][0]),hours:Number(v[i][6])||0};return null;}
function dg72AppendInspectionTime_(ss,offerId,employee,date,hours,activity,customer,sourceCalendarEventId,item,createdAt){
  const old=dg72HasInspectionTime_(ss,offerId);if(old)return {ok:true,existing:true,id:old.id,hours:round2_(old.hours)};
  employee=clean_(employee);date=normalizeDate_(date);hours=round2_(Number(hours)||0);customer=clean_(customer);activity=String(activity==null?'':activity).trim();
  if(!employee||!getEmployeeRecord_(employee)||!validDate3_(date)||!(hours>0)||!customer)return {ok:false,reason:'incomplete'};
  const dayStatus=getDayStatus_(ss,employee,date);if(dayStatus!=='Arbeiten')return {ok:false,reason:'day-status',status:dayStatus};
  if(!activity)activity='Besichtigungstermin';
  const t=dg72InspectionTimes_(item||{},hours,createdAt),closed=isDayClosed_(ss,employee,date),now=createdAt instanceof Date?createdAt:new Date(),id='BESZEIT-'+Utilities.getUuid();
  const sh=ss.getSheetByName(CONFIG.TIME_SHEET),objectId=getOrCreateObjectId_(ss,customer);
  sh.appendRow([id,employee,date,customer,t.start,t.end,hours,activity,'',now,closed,'Nein','', '', '',0,'','', 'Nein','','',clean_(sourceCalendarEventId),'Offen','','',objectId,'Angebot zu erstellen',closed?'Ja':'Nein',closed?new Date():'',clean_(offerId),now,employee,'Nein','','','','']);
  SpreadsheetApp.flush();if(closed)syncClosedDayTotals_(ss,employee,date,'Besichtigungszeit nachgetragen');
  return {ok:true,id:id,hours:hours,start:t.start,end:t.end};
}
function dg72InspectionActivityFromDetails_(details){const s=String(details||'');let m=s.match(/Tätigkeitsnotiz:\s*(.*?)(?:\s*·\s*Übertragen von:|$)/i);if(m&&clean_(m[1]))return clean_(m[1]);m=s.match(/Termininformation:\s*(.*?)(?:\s*·\s*Übertragen von:|$)/i);return m?clean_(m[1]):'Besichtigungstermin';}
function dg72InspectionHoursFromDetails_(details){const m=String(details||'').match(/Zeitaufwand:\s*([0-9]+(?:[.,][0-9]+)?)/i);return m?Number(String(m[1]).replace(',','.')):0;}
function dg72RepairInspectionTimes_(){
  const lock=LockService.getScriptLock();if(!lock.tryLock(3000))return 0;let made=0;
  try{const ss=getSpreadsheet_(),sh=dg72EnsureInquiryOfferColumns_(),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++){
    const offerId=clean_(v[i][0]),source=clean_(v[i][6]),status=clean_(v[i][8])||'Offen';if(!offerId||source!=='Besichtigung'||status==='Verworfen'||dg72HasInspectionTime_(ss,offerId))continue;
    const created=v[i][7] instanceof Date?v[i][7]:new Date(),date=normalizeDate_(v[i][12])||normalizeDate_(created),hours=Number(v[i][13])||dg72InspectionHoursFromDetails_(v[i][5]),activity=clean_(v[i][14])||dg72InspectionActivityFromDetails_(v[i][5]);
    const r=dg72AppendInspectionTime_(ss,offerId,clean_(v[i][10]),date,hours,activity,clean_(v[i][2]),clean_(v[i][11]),{},created);if(r&&r.ok&&!r.existing)made++;
  }return made;}finally{try{lock.releaseLock();}catch(_e){}}
}

const dg72CreateInspectionBase_=createInspectionOffer;
createInspectionOffer=function(employee,employeePin,item){
  item=item||{};const date=normalizeDate_(item.date)||Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd'),ss=getSpreadsheet_(),status=getDayStatus_(ss,employee,date);
  if(status!=='Arbeiten')throw new Error('Der '+formatDateDE_(date)+' ist als '+status+' gesperrt. Eine Besichtigung kann an diesem Tag nicht als Arbeitszeit gebucht werden.');
  const r=dg72CreateInspectionBase_.apply(this,arguments),offerId=clean_(r&&r.offerId),activity=String(item.activity||item.note||(item.event&&item.event.description)||'Besichtigungstermin').trim(),hours=Number(item.hours)||0;
  if(offerId){
    const sh=dg72EnsureInquiryOfferColumns_(),v=sh.getDataRange().getValues();for(let i=1;i<v.length;i++)if(clean_(v[i][0])===offerId){let details=String(v[i][5]||'');if(activity&&!/Tätigkeitsnotiz:/i.test(details))details+=(details?' · ':'')+'Tätigkeitsnotiz: '+activity;sh.getRange(i+1,6).setValue(details);sh.getRange(i+1,13,1,3).setValues([[date,hours,activity]]);break;}
    const t=dg72AppendInspectionTime_(ss,offerId,employee,date,hours,activity,clean_(item.customer),clean_(item.sourceCalendarEventId||(item.event&&item.event.id)),item,new Date());
    if(!t.ok)throw new Error(t.reason==='day-status'?'Besichtigungszeit konnte wegen Tagesstatus '+t.status+' nicht gebucht werden.':'Besichtigungszeit konnte nicht gebucht werden.');
    r.timeEntryId=t.id;r.hoursBooked=t.hours;r.activity=activity;
  }
  return r;
};

const dg72SetOfferStatusBase_=setRegieReportsOfferStatus;
setRegieReportsOfferStatus=function(employee,employeePin,entryIds,offerStatus,offerId){
  const inquiry=inquiryOffer3_(offerId);if(!inquiry)return dg72SetOfferStatusBase_.apply(this,arguments);
  requireChef_(employee,employeePin);offerStatus=clean_(offerStatus);if(!offerStatuses_().includes(offerStatus))throw new Error('Ungueltiger Angebotsstatus.');
  setInquiryOffer3_(employee,offerId,offerStatus);
  const ss=getSpreadsheet_(),sh=ss.getSheetByName(CONFIG.TIME_SHEET),v=sh.getDataRange().getValues();let count=0;
  for(let i=1;i<v.length;i++)if(clean_(v[i][29])===clean_(offerId)){sh.getRange(i+1,27).setValue(offerStatus);sh.getRange(i+1,31,1,2).setValues([[new Date(),clean_(employee)]]);count++;}
  SpreadsheetApp.flush();return {ok:true,offerId:clean_(offerId),status:offerStatus,count:Math.max(1,count),changedAt:formatDateTimeDE_(new Date()),changedBy:clean_(employee)};
};

const dg72DiscardOfferBase_=discardOfferPermanently;
discardOfferPermanently=function(employee,employeePin,offerId){
  const inquiry=inquiryOffer3_(offerId);if(!inquiry)return dg72DiscardOfferBase_.apply(this,arguments);
  requireChef_(employee,employeePin);inquiry.sheet.getRange(inquiry.row,9,1,3).setValues([['Verworfen',new Date(),clean_(employee)]]);
  const ss=getSpreadsheet_(),sh=ss.getSheetByName(CONFIG.TIME_SHEET),v=sh.getDataRange().getValues();let count=0;for(let i=1;i<v.length;i++)if(clean_(v[i][29])===clean_(offerId)){sh.getRange(i+1,27).setValue('Verworfen');count++;}
  SpreadsheetApp.flush();return {ok:true,count:Math.max(1,count)};
};

const dg72AcceptRunningBase_=acceptOfferAsRunning;
acceptOfferAsRunning=function(employee,employeePin,offerId){const r=dg72AcceptRunningBase_.apply(this,arguments),inq=inquiryOffer3_(offerId);if(inq)inq.sheet.getRange(inq.row,9,1,3).setValues([['Angenommen',new Date(),clean_(employee)]]);return r;};

const dg72GetOfferReportsBase_=getOfferReports;
getOfferReports=function(employee,employeePin,stage){
  dg72RepairInspectionTimes_();const rows=dg72GetOfferReportsBase_.apply(this,arguments)||[],map={},order=[];
  rows.forEach(function(x){const id=clean_(x.offerId)||Utilities.getUuid();if(!map[id]){map[id]=x;order.push(id);return;}const a=map[id],prefer=(Number(x.reportCount)||0)>(Number(a.reportCount)||0)?x:a,other=prefer===x?a:x;['phone','email','description','source','inquiryId'].forEach(function(k){if(!prefer[k]&&other[k])prefer[k]=other[k];});if((Number(other.reportCount)||0)>(Number(prefer.reportCount)||0)){prefer.reportCount=other.reportCount;prefer.totalHours=other.totalHours;prefer.reports=other.reports;prefer.employees=other.employees;}map[id]=prefer;});
  return order.map(function(id){return map[id];});
};

function automaticStatusSync72(){const ss=getSpreadsheet_(),y=Number(Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy'));ensureHolidayStatusesForYear_(ss,y);ensureHolidayStatusesForYear_(ss,y+1);dg72SyncAutoClosures_(ss,y);dg72SyncAutoClosures_(ss,y+1);return {ok:true,year:y};}
function ensureDG72DailyStatusTrigger_(){const props=PropertiesService.getScriptProperties();if(props.getProperty('DG72_STATUS_TRIGGER')==='1')return;let found=false;ScriptApp.getProjectTriggers().forEach(function(t){if(t.getHandlerFunction()==='automaticStatusSync72')found=true;});if(!found)ScriptApp.newTrigger('automaticStatusSync72').timeBased().everyDays(1).atHour(2).create();props.setProperty('DG72_STATUS_TRIGGER','1');}

const dg72DoPostBase_=doPost;
doPost=function(e){try{ensureDG72DailyStatusTrigger_();}catch(_e){}return dg72DoPostBase_(e);};

})();


// ===== DG 7.2.1: Angebotsentscheidung eindeutig -> laufender Auftrag oder Archiv =====
(function(){
'use strict';

function dg721OfferSnapshot_(offerId){
  offerId=clean_(offerId);
  const ss=getSpreadsheet_(),sh=ss.getSheetByName(CONFIG.TIME_SHEET),v=sh&&sh.getLastRow()>=2?sh.getDataRange().getValues():[];
  const rows=[];let totalHours=0,customer='',description='',phone='',email='';
  for(let i=1;i<v.length;i++){
    if(clean_(v[i][29])!==offerId)continue;
    const st=clean_(v[i][26]);
    if(!['Offenes Angebot','Angebot Angenommen','Angebot zu erstellen'].includes(st))continue;
    rows.push(i+1);totalHours+=Number(v[i][6])||0;
    if(!customer)customer=clean_(v[i][3]);
    if(!description)description=clean_(v[i][7]);
  }
  const inquiry=inquiryOffer3_(offerId);
  if(inquiry){
    const r=inquiry.values;
    customer=clean_(r[2])||customer;phone=clean_(r[3]);email=clean_(r[4]);description=clean_(r[5])||description;
  }
  return {ss:ss,rows:rows,totalHours:round2_(totalHours),customer:customer,description:description,phone:phone,email:email,inquiry:inquiry};
}

function dg721DecisionReminder_(employee,offerId,data){
  const sh=ensureOfferReminderSheet_(),existing=findReminderByOfferId_(sh,offerId),now=new Date(),result='Angenommen - Laufender Auftrag';
  if(existing){
    sh.getRange(existing.row,10,1,4).setValues([['Erledigt',result,now,clean_(employee)]]);
    return clean_(existing.values[0]);
  }
  const rid='REM-'+Utilities.getUuid();
  sh.appendRow([rid,clean_(offerId),clean_(data&&data.customer),'',clean_(data&&data.phone),clean_(data&&data.email),clean_(data&&data.description),now,now,'Erledigt',result,now,clean_(employee)]);
  return rid;
}

function dg721InquiryAddress_(employee,employeePin,inquiryId,description){
  inquiryId=clean_(inquiryId);let address='';
  if(inquiryId){
    try{
      const q=getCustomerInquiries(employee,employeePin,'Alle').find(function(x){return clean_(x.id)===inquiryId;});
      if(q)address=[clean_(q.postalCode),clean_(q.city)].filter(Boolean).join(' ');
    }catch(_e){}
  }
  if(!address){const m=String(description||'').match(/Adresse:\s*(.*?)(?:\s*·\s*(?:Termininformation|Tätigkeitsnotiz|Übertragen von):|$)/i);if(m)address=clean_(m[1]);}
  return address;
}

acceptOfferAsRunning=function(employee,employeePin,offerId){
  requireChef_(employee,employeePin);offerId=clean_(offerId);if(!offerId)throw new Error('Angebots-ID fehlt.');
  const snap=dg721OfferSnapshot_(offerId),now=new Date();
  if(snap.rows.length){
    const sh=snap.ss.getSheetByName(CONFIG.TIME_SHEET);
    snap.rows.forEach(function(row){
      sh.getRange(row,27).setValue('Laufend');
      sh.getRange(row,30,1,3).setValues([[offerId,now,clean_(employee)]]);
    });
    if(snap.inquiry)snap.inquiry.sheet.getRange(snap.inquiry.row,9,1,3).setValues([['Laufend',now,clean_(employee)]]);
    dg721DecisionReminder_(employee,offerId,snap);
    SpreadsheetApp.flush();
    return {ok:true,offerId:offerId,count:snap.rows.length,totalHours:snap.totalHours,mode:'Regieberichte',status:'Laufend'};
  }

  if(snap.inquiry){
    const r=snap.inquiry.values,inquiryId=clean_(r[1]),description=clean_(r[5]),orderId='AUF-ANG-'+offerId;
    let internalNote='';
    if(inquiryId){try{const q=getCustomerInquiries(employee,employeePin,'Alle').find(function(x){return clean_(x.id)===inquiryId;});if(q)internalNote=clean_(q.internalNote);}catch(_e){}}
    saveManualOrder(employee,employeePin,{id:orderId,customer:clean_(r[2]),address:dg721InquiryAddress_(employee,employeePin,inquiryId,description),phone:clean_(r[3]),email:clean_(r[4]),description:description,source:clean_(r[6])||'Angebot',inquiryId:inquiryId,status:'Laufend',internalNote:internalNote});
    snap.inquiry.sheet.getRange(snap.inquiry.row,9,1,3).setValues([['Laufend',now,clean_(employee)]]);
    dg721DecisionReminder_(employee,offerId,{customer:clean_(r[2]),phone:clean_(r[3]),email:clean_(r[4]),description:description});
    SpreadsheetApp.flush();
    return {ok:true,offerId:offerId,count:1,totalHours:0,mode:'Manueller Auftrag',manualOrderId:orderId,status:'Laufend'};
  }

  throw new Error('Offenes Angebot wurde nicht gefunden.');
};

acceptOfferFromReminder=function(employee,employeePin,reminderId,asRunning){
  requireChef_(employee,employeePin);
  const sh=ensureOfferReminderSheet_(),rec=findReminderRow_(sh,reminderId);if(!rec)throw new Error('Reminder wurde nicht gefunden.');
  const offerId=clean_(rec.values[1]),result=acceptOfferAsRunning(employee,employeePin,offerId);
  markReminderResult_(employee,reminderId,'Angenommen - Laufender Auftrag');
  return {ok:true,offerId:offerId,totalHours:Number(result.totalHours)||0,asRunning:true,mode:result.mode||'Laufend'};
};

})();


// ===== DG 7.3.2: automatischer Lohn-Stichtag, vorgezogene Uebergabe und automatischer Zaehler-Neustart =====
function payrollCycleRange73_(year,month){
  year=Number(year);month=Number(month);if(!(year>0&&month>=1&&month<=12))throw new Error('Ungueltiger Abrechnungsmonat.');
  let py=year,pm=month-1;if(pm===0){pm=12;py--;}
  const prevDue=payrollDueDate73_(py,pm),end=payrollDueDate73_(year,month),pp=prevDue.split('-').map(Number);
  let start=isoDate_(addDays_(new Date(pp[0],pp[1]-1,pp[2],12,0,0,0),1));
  if(start<PRODUCTIVE_START_DATE)start=PRODUCTIVE_START_DATE;
  return {year:year,month:month,start:start,end:end,regularStart:String(py)+'-'+String(pm).padStart(2,'0')+'-21',regularEnd:String(year)+'-'+String(month).padStart(2,'0')+'-20'};
}
function payrollDueDate73_(year,month){
  year=Number(year);month=Number(month);let d=new Date(year,month-1,20,12,0,0,0);
  const h={};bavariaNurembergHolidays_(year).forEach(function(x){h[x.date]=true;});
  while(d.getDay()===0||d.getDay()===6||h[isoDate_(d)])d=addDays_(d,-1);
  return isoDate_(d);
}
function nextPayrollCycle73_(year,month){month=Number(month)+1;year=Number(year);if(month===13){month=1;year++;}return {year:year,month:month,dueDate:payrollDueDate73_(year,month),range:payrollCycleRange73_(year,month)};}
function lastCompletedPayrollCycle73_(ss){
  const sh=ensurePayrollCloseSheet_(ss),v=sh.getDataRange().getValues();let best=null;
  for(let i=1;i<v.length;i++){
    const action=clean_(v[i][3]);if(action!=='Uebergeben'&&action!=='Monatsabschluss erfolgt')continue;
    const y=Number(v[i][1]),m=Number(v[i][2]);if(!(y>0&&m>=1&&m<=12))continue;
    const key=y*100+m;if(!best||key>best.key||(key===best.key&&i>best.row))best={year:y,month:m,key:key,row:i,at:v[i][4]?formatDateTimeDE_(v[i][4]):'',by:clean_(v[i][5])};
  }
  return best;
}
function activePayrollCycle73_(referenceDate){
  const ref=clean_(referenceDate)||Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd');if(!validDate3_(ref))throw new Error('Ungueltiges Bezugsdatum.');
  const p=ref.split('-').map(Number),year=p[0],month=p[1],due=payrollDueDate73_(year,month);
  if(ref<=due){
    let py=year,pm=month-1;if(pm===0){pm=12;py--;}
    const prevDue=payrollDueDate73_(py,pm),x=prevDue.split('-').map(Number),start=isoDate_(addDays_(new Date(x[0],x[1]-1,x[2],12,0,0,0),1));
    return {start:start<PRODUCTIVE_START_DATE?PRODUCTIVE_START_DATE:start,end:due,dueDate:due,year:year,month:month};
  }
  let ny=year,nm=month+1;if(nm===13){nm=1;ny++;}
  const x=due.split('-').map(Number),start=isoDate_(addDays_(new Date(x[0],x[1]-1,x[2],12,0,0,0),1));
  return {start:start<PRODUCTIVE_START_DATE?PRODUCTIVE_START_DATE:start,end:payrollDueDate73_(ny,nm),dueDate:payrollDueDate73_(ny,nm),year:ny,month:nm};
}
function payrollCounterStart73_(ss,referenceDate){
  return activePayrollCycle73_(referenceDate).start;
}
function dayHoursFromRecord73_(rec,date){
  if(!rec||!date)return 0;const p=String(date).split('-').map(Number),dow=new Date(p[0],p[1]-1,p[2]).getDay(),field={1:'monday',2:'tuesday',3:'wednesday',4:'thursday',5:'friday'}[dow];
  return field?Number(rec[field]||0):0;
}
function isFlexibleEmployment73_(rec){
  const t=clean_(rec&&rec.employmentType);
  return t==='Aushilfe'||t==='Minijob';
}
function flexibleCalendarDates73_(rec,start,end){
  const out={};
  if(!isFlexibleEmployment73_(rec)||!rec||!clean_(rec.calendarId))return out;
  try{
    const cal=CalendarApp.getCalendarById(clean_(rec.calendarId));if(!cal)return out;
    const a=start.split('-').map(Number),b=end.split('-').map(Number);
    const from=new Date(a[0],a[1]-1,a[2],0,0,0,0),to=new Date(b[0],b[1]-1,b[2]+1,0,0,0,0);
    (cal.getEvents(from,to)||[]).forEach(function(ev){
      try{
        if(ev.isAllDayEvent&&ev.isAllDayEvent())return;
        const title=clean_(ev.getTitle&&ev.getTitle());
        // Von der App erzeugte Arbeitszeit-Termine nicht doppelt als Einsatz werten.
        if(/^Arbeitszeit\s*-\s*/i.test(title))return;
        const sd=ev.getStartTime&&ev.getStartTime();if(!sd)return;
        const iso=Utilities.formatDate(sd,CONFIG.TZ,'yyyy-MM-dd');if(iso>=start&&iso<=end)out[iso]=true;
      }catch(_e){}
    });
  }catch(_e){}
  return out;
}
function targetHoursRange73_(rec,start,end){
  if(!rec||!start||!end||start>end)return 0;if(isFlexibleEmployment73_(rec))return 0;const a=start.split('-').map(Number),b=end.split('-').map(Number),d=new Date(a[0],a[1]-1,a[2]),last=new Date(b[0],b[1]-1,b[2]);let total=0;
  while(d<=last){const iso=isoDate_(d);if(iso>=PRODUCTIVE_START_DATE&&(!rec.entryDate||iso>=rec.entryDate)&&(!rec.exitDate||iso<=rec.exitDate))total+=dayHoursFromRecord73_(rec,iso);d.setDate(d.getDate()+1);}return round2_(total);
}
function getPayrollCycleState73_(employee,pin,year,month){
  requireChef_(employee,pin);const ss=getSpreadsheet_(),range=payrollCycleRange73_(year,month),dueDate=payrollDueDate73_(year,month),state=payrollMonthState_(ss,year,month,'');const next=nextPayrollCycle73_(year,month),last=lastCompletedPayrollCycle73_(ss);
  return {year:Number(year),month:Number(month),cycleStart:range.start,cycleEnd:range.end,dueDate:dueDate,state:state,lastCompleted:last,nextYear:next.year,nextMonth:next.month,nextDueDate:next.dueDate,nextCycleStart:next.range.start,nextCycleEnd:next.range.end,counterStart:payrollCounterStart73_(ss)};
}
function fastPayrollRows73_(employee,pin,year,month){
  requireChef_(employee,pin);year=Number(year);month=Number(month);const range=payrollCycleRange73_(year,month),ss=getSpreadsheet_();
  const sy=Number(range.start.slice(0,4)),ey=Number(range.end.slice(0,4));ensureHolidayStatusesForYear_(ss,sy);if(ey!==sy)ensureHolidayStatusesForYear_(ss,ey);
  const employees=getEmployeeRecords_(true),byName={};employees.forEach(function(x){byName[x.name]=x;});
  const tsh=ss.getSheetByName(CONFIG.TIME_SHEET),ssh=ss.getSheetByName(CONFIG.STATUS_SHEET),csh=ss.getSheetByName(CONFIG.CLOSE_SHEET),ash=ensureAssignmentSheet_(ss),adjSh=ensureAdjustmentSheet_(ss);
  const tv=tsh&&tsh.getLastRow()?tsh.getDataRange().getValues():[],sv=ssh&&ssh.getLastRow()?ssh.getDataRange().getValues():[],cv=csh&&csh.getLastRow()?csh.getDataRange().getValues():[],av=ash&&ash.getLastRow()?ash.getDataRange().getValues():[],adjv=adjSh&&adjSh.getLastRow()?adjSh.getDataRange().getValues():[];
  const closed={};for(let i=1;i<cv.length;i++){const n=clean_(cv[i][0]),d=normalizeDate_(cv[i][1]);if(n&&d)closed[n+'|'+d]={pauseMinutes:Number(cv[i][6])||0,netHours:Number(cv[i][7])||0,row:i+1};}
  const statuses={};employees.forEach(function(e){statuses[e.name]=[];});
  for(let i=1;i<sv.length;i++){
    const n=clean_(sv[i][0]),d=normalizeDate_(sv[i][1]),st=clean_(sv[i][2]);if(!byName[n]||!d||d<range.start||d>range.end)continue;const rec=byName[n];let cr=(sv[i][6]===''||sv[i][6]===null||sv[i][6]===undefined)?dayHoursFromRecord73_(rec,d):(Number(sv[i][6])||0);if(st==='Feiertag'&&(rec.employmentType==='Aushilfe'||!rec.holidayCredit))cr=0;statuses[n].push({date:d,status:st,source:clean_(sv[i][4]),creditedHours:round2_(cr)});
  }
  const sourceById=getSourceRowsById_(tv),entries={};employees.forEach(function(e){entries[e.name]=[];});
  for(let i=1;i<tv.length;i++){
    const row=tv[i],d=normalizeDate_(row[2]),n=clean_(row[1]);if(!entries[n]||!d||d<range.start||d>range.end||d<PRODUCTIVE_START_DATE)continue;const x=buildOwnEntryFromRow_(row);x.closed=Boolean(closed[n+'|'+d]);entries[n].push(x);
  }
  for(let i=1;i<av.length;i++){
    const id=clean_(av[i][0]),sourceId=clean_(av[i][1]),n=clean_(av[i][2]),hours=Number(av[i][3])||0,status=clean_(av[i][4])||'Zugeordnet';if(!id||status==='Ersetzt'||!entries[n])continue;const row=sourceById[sourceId];if(!row)continue;const d=normalizeDate_(row[2]);if(!d||d<range.start||d>range.end||d<PRODUCTIVE_START_DATE)continue;
    entries[n].push({id:'assigned:'+id,assignmentId:id,sourceEntryId:sourceId,employee:n,date:d,customer:clean_(row[3]),start:normalizeTime_(row[4]),end:normalizeTime_(row[5]),hours:hours,activity:clean_(row[7]),transmittedAt:row[9]?formatDateTimeDE_(row[9]):'',materialUsed:false,material:'',isAdditionalAssignment:true,assignedBy:clean_(av[i][6])||clean_(row[1]),assignmentStatus:status,assignmentNote:clean_(av[i][9]),closed:Boolean(closed[n+'|'+d])});
  }
  const adjustments={};employees.forEach(function(e){adjustments[e.name]=[];});
  for(let i=1;i<adjv.length;i++){const n=clean_(adjv[i][1]);if(!adjustments[n]||Number(adjv[i][2])!==year||Number(adjv[i][3])!==month)continue;adjustments[n].push({id:clean_(adjv[i][0]),hours:round2_(Number(adjv[i][4])||0),reason:clean_(adjv[i][5]),createdAt:adjv[i][6]?formatDateTimeDE_(adjv[i][6]):'',createdBy:clean_(adjv[i][7])});}
  const out=[];
  employees.forEach(function(rec){
    const rows=entries[rec.name]||[],sts=statuses[rec.name]||[];rows.sort(function(a,b){return (a.date+' '+a.start).localeCompare(b.date+' '+b.start);});sts.sort(function(a,b){return a.date.localeCompare(b.date);});if(!rows.length&&!sts.length&&!rec.active)return;
    const grossBy={};rows.forEach(function(x){grossBy[x.date]=(grossBy[x.date]||0)+Number(x.hours||0);});let gross=0,pause=0;Object.keys(grossBy).forEach(function(d){const g=round2_(grossBy[d]);gross+=g;pause+=automaticPauseHours_(g);});const work=round2_(gross-pause),statusCredit=round2_(sts.reduce(function(a,x){return a+Number(x.creditedHours||0);},0)),credit=statusCredit,adjs=adjustments[rec.name]||[],adj=round2_(adjs.reduce(function(a,x){return a+Number(x.hours||0);},0)),actual=round2_(work+credit+adj),target=targetHoursRange73_(rec,range.start,range.end),dates={};rows.forEach(function(x){dates[x.date]=1;});
    out.push({employee:rec.name,active:rec.active,employmentType:rec.employmentType,personnelNumber:rec.personnelNumber,entryDate:rec.entryDate,exitDate:rec.exitDate,hourlyWage:rec.hourlyWage,payrollType:rec.payrollType,monthlySalary:rec.monthlySalary,payrollRelevant:rec.payrollRelevant,weeklyHours:rec.weeklyHours,targetTotal:target,actualTotal:actual,actualBeforeAdjustment:round2_(work+credit),adjustmentTotal:adj,adjustments:adjs,balance:round2_(actual-target),total:actual,payableHours:round2_(actual),workTotal:work,workTotalGross:round2_(gross),automaticPauseTotal:round2_(pause),creditedTotal:credit,statusCredit:statusCredit,timeBankMonthCredit:0,timeBankBalance:0,monthSurplusBanked:false,days:Object.keys(dates).length,closedDays:Object.keys(dates).filter(function(d){return !!closed[rec.name+'|'+d];}).length,entries:rows,statuses:sts,sickDays:sts.filter(function(x){return x.status==='Krank';}).length,vacationDays:sts.filter(function(x){return x.status==='Urlaub';}).length,holidayDays:sts.filter(function(x){return x.status==='Feiertag';}).length,compensatoryHours:round2_(sts.filter(function(x){return x.status==='Freizeitausgleich';}).reduce(function(a,x){return a+Number(x.creditedHours||0);},0))});
  });
  out.sort(function(a,b){return a.employee.localeCompare(b.employee,'de');});return {range:range,rows:out,closedMap:closed,employeeMap:byName};
}

// Der bisherige Monatsaudit las mehrere Tabellen und Stammdaten in tiefen Schleifen erneut.
// 7.3 liest jede benoetigte Tabelle einmal und prueft danach nur noch im Speicher.
getMonthPayrollAudit=function(employee,employeePin,year,month){
  requireChef_(employee,employeePin);year=Number(year);month=Number(month);const pack=fastPayrollRows73_(employee,employeePin,year,month),rows=pack.rows,range=pack.range,closures=pack.closedMap,recMap=pack.employeeMap,ss=getSpreadsheet_(),reviewed=payrollReviewedMap_(ss,year,month),issues=[],payrollRows=[];
  const today=Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd'),checkThrough=today<range.end?today:range.end;
  function addIssue(severity,type,r,date,title,detail,extra){const id=payrollIssueId_([year,month,r.employee,date,type,(extra&&extra.key)||'']),rev=reviewed[id]||null;issues.push(Object.assign({id:id,severity:severity,type:type,employee:r.employee,date:date||'',title:title,detail:detail||'',reviewed:Boolean(rev),reviewedInfo:rev},extra||{}));}
  rows.forEach(function(r){
    const rec=recMap[r.employee]||{},byDate={},statusBy={},flexDates=flexibleCalendarDates73_(rec,range.start,checkThrough);(r.entries||[]).forEach(function(e){(byDate[e.date]||(byDate[e.date]=[])).push(e);});(r.statuses||[]).forEach(function(st){statusBy[st.date]=st;});
    Object.keys(byDate).sort().forEach(function(d){
      const es=byDate[d],gross=round2_(es.reduce(function(a,e){return a+Number(e.hours||0);},0)),net=netWorkHours_(gross),closure=closures[r.employee+'|'+d];
      if(net>10.0001)addIssue('error','daily_over_10',r,d,'Mehr als 10 Stunden Arbeitszeit','Netto-Arbeitszeit '+formatHours_(net)+' Std. (Bruttozeit '+formatHours_(gross)+' Std.).');else if(net>8.0001)addIssue('warn','daily_over_8',r,d,'Mehr als 8 Stunden Arbeitszeit','Netto-Arbeitszeit '+formatHours_(net)+' Std.');
      if(!closure)addIssue('error','day_not_closed',r,d,'Tagesabschluss fehlt','Fuer diesen Arbeitstag wurde kein Tagesabschluss gefunden.');else{const req=statutoryPauseMinutes_(net);if(req>0&&Number(closure.pauseMinutes||0)<req)addIssue('error','pause_short',r,d,'Pause zu kurz','Erfasst '+Number(closure.pauseMinutes||0)+' Min.; erforderlich mindestens '+req+' Min.');}
      const st=statusBy[d];if(st&&st.status&&st.status!=='Arbeiten')addIssue(st.status==='Feiertag'?'warn':'error','work_and_status',r,d,'Arbeitszeit und '+st.status+' am selben Tag','Es sind '+formatHours_(net)+' Arbeitsstunden erfasst und der Tag ist zugleich als '+st.status+' markiert.');
      if(rec.entryDate&&d<rec.entryDate)addIssue('error','before_entry',r,d,'Arbeitszeit vor Eintrittsdatum','Eintrittsdatum: '+formatDateDE_(rec.entryDate)+'.');if(rec.exitDate&&d>rec.exitDate)addIssue('error','after_exit',r,d,'Arbeitszeit nach Austrittsdatum','Austrittsdatum: '+formatDateDE_(rec.exitDate)+'.');if(rec.active===false)addIssue('warn','inactive_time',r,d,'Arbeitszeit bei inaktivem Mitarbeiter','Mitarbeiter ist aktuell als inaktiv gekennzeichnet.');
      es.forEach(function(e){const sm=timeToMinutes_(e.start),em=timeToMinutes_(e.end);if(!(Number(e.hours)>0)||sm===null||em===null)addIssue('error','invalid_entry',r,d,'Unplausibler Zeiteintrag',(e.customer||'Ohne Kunde')+' · '+(e.start||'?')+'–'+(e.end||'?')+' · '+formatHours_(e.hours)+' Std.',{entryId:e.id,start:e.start,end:e.end,customer:e.customer,key:e.id});});
      for(let i=0;i<es.length;i++)for(let j=i+1;j<es.length;j++)if(normalizedCustomerKey_(es[i].customer)===normalizedCustomerKey_(es[j].customer)&&es[i].start===es[j].start&&es[i].end===es[j].end)addIssue('warn','duplicate_entry',r,d,'Moeglicher Doppeleintrag',(es[i].customer||'Ohne Kunde')+' · '+es[i].start+'–'+es[i].end,{entryId:es[j].id,start:es[j].start,end:es[j].end,customer:es[j].customer,key:es[i].id+'|'+es[j].id});
      const target=dayHoursFromRecord73_(rec,d);if(d<=checkThrough&&!st&&target>0&&Math.abs(net-target)>2.5)addIssue('warn','target_deviation',r,d,'Starke Abweichung von Tages-Soll','Soll '+formatHours_(target)+' Std. · Ist '+formatHours_(net)+' Std.');
    });
    const a=range.start.split('-').map(Number),b=checkThrough.split('-').map(Number),cur=new Date(a[0],a[1]-1,a[2]),last=new Date(b[0],b[1]-1,b[2]),flex=isFlexibleEmployment73_(rec);while(cur<=last){const d=isoDate_(cur),inEmployment=(!rec.entryDate||d>=rec.entryDate)&&(!rec.exitDate||d<=rec.exitDate);if(inEmployment&&!byDate[d]&&!statusBy[d]){if(!flex&&dayHoursFromRecord73_(rec,d)>0)addIssue('error','missing_workday',r,d,'Arbeitstag ohne Stunden oder Abwesenheit','Fuer diesen Soll-Arbeitstag ('+formatHours_(dayHoursFromRecord73_(rec,d))+' Std.) fehlen Arbeitszeit und Tagesstatus.');else if(flex&&flexDates[d])addIssue('error','calendar_without_time',r,d,'Kalendertermin ohne Arbeitszeit/Tagesabschluss','Aushilfe/Minijob hat an diesem Tag einen Kalendereinsatz. Bitte Arbeitszeit erfassen und den Tag abschliessen.');}cur.setDate(cur.getDate()+1);}
    const dates=Object.keys(byDate).sort();for(let di=0;di<dates.length;di++){const es=byDate[dates[di]];for(let i=0;i<es.length;i++)for(let j=i+1;j<es.length;j++)if(timesOverlap_(es[i].start,es[i].end,es[j].start,es[j].end))addIssue('error','overlap',r,dates[di],'Ueberschneidende Uhrzeiten',es[i].customer+' '+es[i].start+'–'+es[i].end+' / '+es[j].customer+' '+es[j].start+'–'+es[j].end,{key:es[i].id+'|'+es[j].id});}
    for(let i=1;i<dates.length;i++){const prev=byDate[dates[i-1]].slice().sort(function(a,b){return (a.end||'').localeCompare(b.end||'');}).pop(),next=byDate[dates[i]].slice().sort(function(a,b){return (a.start||'').localeCompare(b.start||'');})[0],rest=previousToNextRestHours_(prev&&prev.end,next&&next.start);if(rest!==null&&rest<11)addIssue('warn','rest_under_11',r,dates[i],'Ruhezeit unter 11 Stunden','Zwischen '+formatDateDE_(dates[i-1])+' '+(prev.end||'?')+' und '+formatDateDE_(dates[i])+' '+(next.start||'?')+' liegen nur '+formatHours_(rest)+' Std.');}
    if(r.payrollRelevant!==false){if(!r.employmentType)addIssue('error','master_employment',r,'','Beschaeftigungsart fehlt','Bitte Mitarbeiter-Stammdaten ergaenzen.');if(r.payrollType==='Festgehalt'&&!(Number(r.monthlySalary)>0))addIssue('error','master_salary',r,'','Monatsgehalt fehlt','Fuer Festgehalt muss ein Brutto-Monatsgehalt hinterlegt sein.');if((r.payrollType||'Stundenlohn')==='Stundenlohn'&&r.employmentType!=='Azubi'&&!(Number(r.hourlyWage)>0))addIssue('error','master_wage',r,'','Stundenlohn fehlt','Bitte Brutto-Stundenlohn hinterlegen.');}
    const grossEstimate=r.payrollRelevant===false?0:(r.payrollType==='Festgehalt'?Number(r.monthlySalary||0):round2_(Number(r.payableHours||0)*Number(r.hourlyWage||0))),minijobLimit=minijobMonthlyLimitForDate_(range.end);if(r.employmentType==='Minijob'&&grossEstimate>minijobLimit+0.001)addIssue('error','minijob_limit',r,'','Minijob-Grenze ueberschritten','Rechnerisch '+grossEstimate.toFixed(2).replace('.',',')+' EUR bei Monatsgrenze '+minijobLimit.toFixed(2).replace('.',',')+' EUR.');
    payrollRows.push({employee:r.employee,personnelNumber:r.personnelNumber||'',employmentType:r.employmentType||'',payrollType:r.payrollType||'Stundenlohn',payrollRelevant:r.payrollRelevant!==false,hourlyWage:Number(r.hourlyWage)||0,monthlySalary:Number(r.monthlySalary)||0,targetHours:Number(r.targetTotal)||0,actualHours:Number(r.actualTotal)||0,workHours:Number(r.workTotal)||0,payrollHours:Number(r.payableHours)||0,grossEstimate:round2_(grossEstimate),vacationDays:Number(r.vacationDays)||0,sickDays:Number(r.sickDays)||0,compensatoryHours:Number(r.compensatoryHours)||0,timeBankBalance:0,monthClosure:'Offen',minijobLimit:minijobLimit});
  });
  issues.sort(function(a,b){const rank={error:0,warn:1,info:2};return (rank[a.severity]-rank[b.severity])||(a.employee+a.date+a.type).localeCompare(b.employee+b.date+b.type,'de');});
  const openErrors=issues.filter(function(x){return x.severity==='error';}).length,openWarnings=issues.filter(function(x){return x.severity==='warn'&&!x.reviewed;}).length,reviewedWarnings=issues.filter(function(x){return x.severity==='warn'&&x.reviewed;}).length,fingerprint=payrollFingerprint_(rows),state=payrollMonthState_(ss,year,month,fingerprint),dueDate=payrollDueDate73_(year,month),next=nextPayrollCycle73_(year,month);
  return {year:year,month:month,dueDate:dueDate,cycleStart:range.start,cycleEnd:range.end,nextDueDate:next.dueDate,nextYear:next.year,nextMonth:next.month,checkThrough:checkThrough,summary:{errors:openErrors,warnings:openWarnings,reviewedWarnings:reviewedWarnings,totalIssues:issues.length,employees:payrollRows.length},issues:issues,payrollRows:payrollRows,fingerprint:fingerprint,state:state,canRelease:openErrors===0&&openWarnings===0};
};

function completePayrollCycle73_(employee,pin,year,month){
  requireChef_(employee,pin);year=Number(year);month=Number(month);const audit=getMonthPayrollAudit(employee,pin,year,month);if(audit.state&&audit.state.status==='Uebergeben')return {ok:true,alreadyCompleted:true,audit:audit,counterStart:payrollCounterStart73_(getSpreadsheet_(),Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd'))};if(!audit.canRelease)throw new Error('Monatsabschluss noch nicht moeglich: '+audit.summary.errors+' Fehler und '+audit.summary.warnings+' ungepruefte Hinweise. Bitte zuerst Monatspruefung abschliessen.');
  const ss=getSpreadsheet_(),sh=ensurePayrollCloseSheet_(ss);sh.appendRow([Utilities.getUuid(),year,month,'Uebergeben',new Date(),clean_(employee),'Monatsabschluss erfolgt',audit.fingerprint]);SpreadsheetApp.flush();const range=payrollCycleRange73_(year,month),next=nextPayrollCycle73_(year,month),state=payrollMonthState_(ss,year,month,audit.fingerprint);audit.state=state;
  return {ok:true,audit:audit,cycleStart:range.start,cycleEnd:range.end,counterStart:payrollCounterStart73_(ss,Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd')),nextYear:next.year,nextMonth:next.month,nextDueDate:next.dueDate,nextCycleStart:next.range.start,nextCycleEnd:next.range.end};
}

function forceCompletePayrollCycle736_(employee,pin,year,month,reason){
  requireChef_(employee,pin);year=Number(year);month=Number(month);reason=clean_(reason);
  if(!reason)throw new Error('Bitte einen Grund fuer die manuelle Freigabe eintragen.');
  const audit=getMonthPayrollAudit(employee,pin,year,month);
  if(audit.state&&audit.state.status==='Uebergeben'&&!audit.state.changedSinceApproval){
    return {ok:true,alreadyCompleted:true,forced:Boolean(audit.state.last&&String(audit.state.last.reason||'').indexOf('MANUELLE FREIGABE')===0),audit:audit,counterStart:payrollCounterStart73_(getSpreadsheet_(),Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd'))};
  }
  const ss=getSpreadsheet_(),sh=ensurePayrollCloseSheet_(ss),errors=Number(audit.summary&&audit.summary.errors||0),warnings=Number(audit.summary&&audit.summary.warnings||0);
  const logReason='MANUELLE FREIGABE TROTZ AUFFAELLIGKEITEN: '+reason+' | Fehler: '+errors+' | ungepruefte Hinweise: '+warnings;
  sh.appendRow([Utilities.getUuid(),year,month,'Uebergeben',new Date(),clean_(employee),logReason,audit.fingerprint]);
  SpreadsheetApp.flush();
  const range=payrollCycleRange73_(year,month),next=nextPayrollCycle73_(year,month),state=payrollMonthState_(ss,year,month,audit.fingerprint);
  audit.state=state;
  audit.forcedRelease={forced:true,by:clean_(employee),reason:reason,errors:errors,warnings:warnings,at:formatDateTimeDE_(new Date())};
  return {ok:true,forced:true,audit:audit,cycleStart:range.start,cycleEnd:range.end,counterStart:payrollCounterStart73_(ss,Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd')),nextYear:next.year,nextMonth:next.month,nextDueDate:next.dueDate,nextCycleStart:next.range.start,nextCycleEnd:next.range.end};
}

// Wochen- und Monatsstunden werden automatisch am Tag nach dem tatsaechlichen Lohn-Stichtag neu gezaehlt; ein manueller Monatsabschluss ist dafuer nicht erforderlich.
getWeekData=function(employee,employeePin,referenceDate){
  verifyEmployeePin(employee,employeePin);
  const ref=clean_(referenceDate)||Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd');if(!validDate3_(ref))throw new Error('Ungueltiges Bezugsdatum.');
  const p=ref.split('-').map(Number),d=new Date(p[0],p[1]-1,p[2]),dow=d.getDay(),monday=addDays_(d,dow===0?-6:1-dow),sunday=addDays_(monday,6),normalStart=isoDate_(monday),end=isoDate_(sunday),ss=getSpreadsheet_(),floor=payrollCounterStart73_(ss,ref),start=(floor<=ref&&floor>normalStart)?floor:normalStart;
  if(floor>ref)return {start:normalStart,end:end,grossWorkTotal:0,automaticPauseTotal:0,workTotal:0,creditedHours:0,total:0,payrollReset:true,counterStart:floor,monthStart:floor,monthEnd:ref,monthTotal:0};
  const allEntries=getEntriesForEmployee_(ss,employee),sh=ss.getSheetByName(CONFIG.STATUS_SHEET),v=sh&&sh.getLastRow()?sh.getDataRange().getValues():[];
  function calcRange_(from,to){
    const entries=allEntries.filter(function(x){return x.date>=from&&x.date<=to;}),grossBy={};entries.forEach(function(x){grossBy[x.date]=(grossBy[x.date]||0)+Number(x.hours||0);});let gross=0,pause=0;Object.keys(grossBy).forEach(function(date){const g=round2_(grossBy[date]),b=automaticPauseHours_(g);gross+=g;pause+=b;});let credited=0;for(let i=1;i<v.length;i++){if(clean_(v[i][0])!==clean_(employee))continue;const date=normalizeDate_(v[i][1]);if(date<from||date>to)continue;credited+=Number(v[i][6])||0;}const net=round2_(gross-pause);return {gross:round2_(gross),pause:round2_(pause),work:net,credited:round2_(credited),total:round2_(net+credited)};
  }
  const week=calcRange_(start,end),month=calcRange_(floor,ref);
  return {start:start,end:end,grossWorkTotal:week.gross,automaticPauseTotal:week.pause,workTotal:week.work,creditedHours:week.credited,total:week.total,counterStart:floor,monthStart:floor,monthEnd:ref,monthTotal:month.total};
};

function getEmployeePayrollCycleData73_(employee,year,month){
  const ss=getSpreadsheet_(),range=payrollCycleRange73_(year,month),sy=Number(range.start.slice(0,4)),ey=Number(range.end.slice(0,4));ensureHolidayStatusesForYear_(ss,sy);if(ey!==sy)ensureHolidayStatusesForYear_(ss,ey);
  const close=ss.getSheetByName(CONFIG.CLOSE_SHEET),cv=close&&close.getLastRow()?close.getDataRange().getValues():[],closed={};for(let i=1;i<cv.length;i++)if(clean_(cv[i][0])===clean_(employee))closed[normalizeDate_(cv[i][1])]=true;
  const rows=getEntriesForEmployee_(ss,employee).filter(function(x){return x.date>=range.start&&x.date<=range.end&&x.date>=PRODUCTIVE_START_DATE;}).map(function(x){return {date:x.date,customer:x.customer,hours:Number(x.hours)||0,activity:x.activity||'',transmittedDate:x.transmittedDate||'',closed:Boolean(closed[x.date]),isAdditionalAssignment:Boolean(x.isAdditionalAssignment),assignedBy:x.assignedBy||'',assignmentStatus:x.assignmentStatus||'',assignmentNote:x.assignmentNote||'',isSupplement:Boolean(x.isSupplement),supplementCreatedAt:x.supplementCreatedAt||''};});rows.sort(function(a,b){return a.date.localeCompare(b.date);});
  const rec=getEmployeeRecord_(employee),sh=ss.getSheetByName(CONFIG.STATUS_SHEET),v=sh&&sh.getLastRow()?sh.getDataRange().getValues():[],statuses=[];for(let i=1;i<v.length;i++){if(clean_(v[i][0])!==clean_(employee))continue;const d=normalizeDate_(v[i][1]);if(d<range.start||d>range.end)continue;const st=clean_(v[i][2]);let cr=(v[i][6]===''||v[i][6]===null)?dayHoursFromRecord73_(rec,d):(Number(v[i][6])||0);if(st==='Feiertag'&&rec&&(rec.employmentType==='Aushilfe'||!rec.holidayCredit))cr=0;statuses.push({date:d,status:st,source:clean_(v[i][4]),creditedHours:round2_(cr)});}statuses.sort(function(a,b){return a.date.localeCompare(b.date);});
  const grossBy={};rows.forEach(function(r){grossBy[r.date]=(grossBy[r.date]||0)+Number(r.hours||0);});const dayTotals=Object.keys(grossBy).sort().map(function(date){const gross=round2_(grossBy[date]),pause=automaticPauseHours_(gross);return {date:date,grossHours:gross,pauseHours:pause,netHours:netWorkHours_(gross)};}),gross=round2_(dayTotals.reduce(function(s,x){return s+x.grossHours;},0)),pause=round2_(dayTotals.reduce(function(s,x){return s+x.pauseHours;},0)),work=round2_(gross-pause),statusCredit=round2_(statuses.reduce(function(s,x){return s+Number(x.creditedHours||0);},0)),total=round2_(work+statusCredit),yearSummary=getAnnualStatusSummary_(ss,employee,year,true);
  return {rows:rows,total:total,actualTotal:total,adjustmentTotal:0,workTotal:work,workTotalGross:gross,automaticPauseTotal:pause,dayTotals:dayTotals,creditedTotal:statusCredit,statusCredit:statusCredit,timeBankMonthCredit:0,timeBankBalance:0,statuses:statuses,cycleStart:range.start,cycleEnd:range.end,monthSummary:{vacationDays:statuses.filter(function(x){return x.status==='Urlaub';}).length,sickDays:statuses.filter(function(x){return x.status==='Krank';}).length,holidayDays:statuses.filter(function(x){return x.status==='Feiertag';}).length,compensatoryDays:statuses.filter(function(x){return x.status==='Freizeitausgleich';}).length,compensatoryHours:round2_(statuses.filter(function(x){return x.status==='Freizeitausgleich';}).reduce(function(s,x){return s+Number(x.creditedHours||0);},0))},yearSummary:yearSummary};
}
getMonthData=function(employee,year,month,employeePin){verifyEmployeePin(employee,employeePin);return getEmployeePayrollCycleData73_(employee,Number(year),Number(month));};

createTaxAdvisorPdf=function(employee,employeePin,year,month){
  requireChef_(employee,employeePin);year=Number(year);month=Number(month);const audit=getMonthPayrollAudit(employee,employeePin,year,month),lines=['Del Gesso Gebaeudetechnik','Lohnuebergabe / Abrechnungsmonat - '+monthNameDE_(month)+' '+year,'Abrechnungszeitraum '+formatDateDE_(audit.cycleStart)+' bis '+formatDateDE_(audit.cycleEnd),'Erstellt am '+formatDateTimeDE_(new Date())+' - erstellt von '+clean_(employee),'Lohnuebergabe faellig am '+formatDateDE_(audit.dueDate),'','Mitarbeiter | Status | Abrechnung | Soll | Ist | Lohn-Std | Satz/Gehalt | Brutto rechnerisch | Urlaub | Krank'];
  audit.payrollRows.forEach(function(r){const pay=r.payrollType==='Festgehalt'?(Number(r.monthlySalary||0).toFixed(2).replace('.',',')+' EUR/Monat'):(Number(r.hourlyWage||0).toFixed(2).replace('.',',')+' EUR/Std');lines.push([r.employee,r.employmentType,r.payrollType,formatHours_(r.targetHours),formatHours_(r.actualHours),formatHours_(r.payrollHours),pay,Number(r.grossEstimate||0).toFixed(2).replace('.',',')+' EUR',String(r.vacationDays||0),String(r.sickDays||0),formatHours_(r.timeBankBalance||0)].join(' | '));});lines.push('','Pruefung: '+audit.summary.errors+' Fehler | '+audit.summary.warnings+' offene Hinweise | '+audit.summary.reviewedWarnings+' bestaetigte Hinweise','Lohnstatus: '+(audit.state.status||'Offen'));const name='DG_Lohnuebergabe_'+year+'_'+String(month).padStart(2,'0')+'.pdf',pdf=buildSimplePdf_(lines).setName(name);return {fileName:name,base64:Utilities.base64Encode(pdf.getBytes())};
};


// ===== DG 7.3.4: Abwesenheiten, Krankheit und Entgeltfortzahlungs-Backup =====
function ensureAbsenceSheet_(ss) {
  let sheet=ss.getSheetByName(CONFIG.ABSENCE_SHEET);if(!sheet)sheet=ss.insertSheet(CONFIG.ABSENCE_SHEET);
  const headers=['ID','Mitarbeiter','Art','Von','Bis','Erfasst am','Erfasst von','Aktiv','Krankheitsfall-ID','Krankheitsmodus','AG-Fortzahlung bis','Zahler','Kranktage Fall','Hinweis'];
  if(sheet.getLastRow()===0){sheet.getRange(1,1,1,headers.length).setValues([headers]);sheet.setFrozenRows(1);}else sheet.getRange(1,1,1,headers.length).setValues([headers]);
  return sheet;
}
function dateList734_(startDate,endDate){
  const out=[],a=String(startDate).split('-').map(Number),b=String(endDate).split('-').map(Number),d=new Date(a[0],a[1]-1,a[2],12),last=new Date(b[0],b[1]-1,b[2],12);
  while(d<=last){out.push(isoDate_(d));d=addDays_(d,1);}return out;
}
function addMonths734_(iso,months){const p=String(iso||'').split('-').map(Number);if(p.length!==3)return '';const d=new Date(p[0],p[1]-1,p[2],12);d.setMonth(d.getMonth()+Number(months||0));return isoDate_(d);}
function activeSicknessRows734_(ss,employee){
  const sh=ensureAbsenceSheet_(ss),v=sh.getDataRange().getValues(),out=[];
  for(let i=1;i<v.length;i++){
    if(String(v[i][7]).toLowerCase()==='nein'||clean_(v[i][1])!==clean_(employee)||clean_(v[i][2])!=='Krank')continue;
    out.push({id:clean_(v[i][0]),employee:clean_(v[i][1]),start:normalizeDate_(v[i][3]),end:normalizeDate_(v[i][4]),caseId:clean_(v[i][8])||clean_(v[i][0]),mode:clean_(v[i][9])||'Altbestand',employerPayThrough:normalizeDate_(v[i][10]),payer:clean_(v[i][11]),caseDays:Number(v[i][12])||0,note:clean_(v[i][13])});
  }
  out.sort(function(a,b){return a.start.localeCompare(b.start);});return out;
}
function caseDates734_(rows,caseId){const seen={};(rows||[]).filter(function(r){return clean_(r.caseId)===clean_(caseId);}).forEach(function(r){dateList734_(r.start,r.end).forEach(function(d){seen[d]=true;});});return Object.keys(seen).sort();}
function statusCreditsByRef734_(ss){const out={},sh=ss.getSheetByName(CONFIG.STATUS_SHEET),v=sh&&sh.getLastRow()>=2?sh.getDataRange().getValues():[];for(let i=1;i<v.length;i++){const ref=clean_(v[i][5]);if(ref)out[ref]=round2_((out[ref]||0)+(Number(v[i][6])||0));}return out;}
function getAbsenceOverview734_(employee,employeePin,targetEmployee,year){
  requireChef_(employee,employeePin);targetEmployee=clean_(targetEmployee);year=Number(year)||Number(Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy'));if(!getEmployeeRecord_(targetEmployee))throw new Error('Mitarbeiter nicht gefunden.');
  const ss=getSpreadsheet_(),annual=getAnnualStatusSummary_(ss,targetEmployee,year),rows=activeSicknessRows734_(ss,targetEmployee),credits=statusCreditsByRef734_(ss),yearDays={},cases={},warnings=[];
  rows.forEach(function(r){
    dateList734_(r.start,r.end).forEach(function(d){if(Number(d.slice(0,4))===year)yearDays[d]=true;});
    const c=cases[r.caseId]||(cases[r.caseId]={caseId:r.caseId,mode:r.mode,start:r.start,end:r.end,periods:[],calendarDays:0,creditedHours:0,payer:r.payer||'',employerPayThrough:r.employerPayThrough||'',note:r.note||''});
    c.start=c.start<r.start?c.start:r.start;c.end=c.end>r.end?c.end:r.end;c.periods.push({id:r.id,start:r.start,end:r.end,payer:r.payer,creditedHours:round2_(credits[r.id]||0)});c.creditedHours=round2_(c.creditedHours+(credits[r.id]||0));if(r.payer)c.payer=r.payer;if(r.employerPayThrough)c.employerPayThrough=r.employerPayThrough;if(r.note)c.note=r.note;
  });
  const rec=getEmployeeRecord_(targetEmployee),eligibleFrom=rec&&rec.entryDate?isoDate_(addDays_(new Date(Number(rec.entryDate.slice(0,4)),Number(rec.entryDate.slice(5,7))-1,Number(rec.entryDate.slice(8,10)),12),28)):'';
  const caseList=Object.keys(cases).map(function(k){const c=cases[k],dates=caseDates734_(rows,k),eligible=dates.filter(function(d){return !eligibleFrom||d>=eligibleFrom;});c.calendarDays=dates.length;c.efzEligibleDays=eligible.length;c.remainingEmployerPayDays=Math.max(0,42-Math.min(42,eligible.length));if(c.mode==='Unklar')c.needsReview=true;return c;}).sort(function(a,b){return b.start.localeCompare(a.start);});
  caseList.forEach(function(c){if(c.needsReview)warnings.push({level:'warn',text:'Krankheitsfall ab '+formatDateDE_(c.start)+': Fortsetzungserkrankung ist unklar – Lohn/Krankenkasse prüfen.'});if(c.calendarDays>=42)warnings.push({level:'error',text:'Krankheitsfall ab '+formatDateDE_(c.start)+': 42 Kalendertage erreicht/überschritten. Krankengeld/Krankenkasse und Lohnfortzahlung prüfen.'});else if(c.calendarDays>=35)warnings.push({level:'warn',text:'Krankheitsfall ab '+formatDateDE_(c.start)+': '+c.calendarDays+' Kalendertage – Ende der 6-Wochen-Frist nähert sich.'});if(c.calendarDays>3)warnings.push({level:'info',text:'AU/eAU-Nachweis für den Krankheitszeitraum ab '+formatDateDE_(c.start)+' prüfen.'});});
  if(Object.keys(yearDays).length)warnings.push({level:'info',text:'U1-Erstattung bei der Krankenkasse prüfen, soweit der Betrieb am U1-Verfahren teilnimmt.'});
  return {employee:targetEmployee,year:year,vacationEntitlement:annual.vacationEntitlement,vacationUsed:annual.vacationUsed,vacationRemaining:annual.vacationRemaining,sickWorkDays:annual.sickDays,sickCalendarDays:Object.keys(yearDays).length,sicknessCases:caseList.slice(0,12),warnings:warnings};
}

function getSicknessAlerts734_(employee,employeePin){
  requireChef_(employee,employeePin);const ss=getSpreadsheet_(),today=Utilities.formatDate(new Date(),CONFIG.TZ,'yyyy-MM-dd'),employees=getEmployeeRecords_(false),alerts=[];
  employees.forEach(function(rec){
    const rows=activeSicknessRows734_(ss,rec.name),groups={};
    rows.forEach(function(r){(groups[r.caseId]||(groups[r.caseId]=[])).push(r);});
    Object.keys(groups).forEach(function(caseId){
      const group=groups[caseId],dates=caseDates734_(rows,caseId),last=group.slice().sort(function(a,b){return b.end.localeCompare(a.end);})[0],eligibleFrom=rec.entryDate?isoDate_(addDays_(new Date(Number(rec.entryDate.slice(0,4)),Number(rec.entryDate.slice(5,7))-1,Number(rec.entryDate.slice(8,10)),12),28)):'',eligible=dates.filter(function(d){return !eligibleFrom||d>=eligibleFrom;}),used=eligible.length,remaining=Math.max(0,42-Math.min(42,used));
      let level='',title='',detail='';
      if(group.some(function(x){return x.mode==='Unklar';})){level='error';title='Krankheitsfall ungeklärt';detail='Neuer Fall oder Fortsetzung derselben Erkrankung muss vor der Lohnabrechnung geklärt werden.';}
      else if(used>=42){level='error';title='6-Wochen-Frist erreicht';detail='Arbeitgeber-Entgeltfortzahlung ist für diesen Fall ausgeschöpft; Krankengeld/Krankenkasse prüfen.';}
      else if(used>=35){level='warn';title='6-Wochen-Frist nähert sich';detail='Noch '+remaining+' Kalendertag'+(remaining===1?'':'e')+' Arbeitgeber-Entgeltfortzahlung in diesem Krankheitsfall.';}
      if(level)alerts.push({employee:rec.name,caseId:caseId,level:level,title:title,detail:detail,start:group[0].start,end:last.end,usedDays:used,remainingDays:remaining,payer:last.payer||''});
    });
  });
  alerts.sort(function(a,b){const rank={error:0,warn:1,info:2};return (rank[a.level]-rank[b.level])||a.employee.localeCompare(b.employee,'de');});return {count:alerts.length,alerts:alerts,checkedAt:today};
}

saveAbsence=function(employee,employeePin,targetEmployee,type,startDate,endDate,sicknessMode,continuationCaseId){
  requireChef_(employee,employeePin);targetEmployee=clean_(targetEmployee);type=clean_(type);startDate=clean_(startDate);endDate=clean_(endDate);sicknessMode=clean_(sicknessMode);continuationCaseId=clean_(continuationCaseId);
  const rec=getEmployeeRecord_(targetEmployee);if(!rec)throw new Error('Mitarbeiter nicht gefunden.');
  if(!['Urlaub','Krank','Schulung','Freizeitausgleich'].includes(type))throw new Error('Als Abwesenheit sind Urlaub, Krankheit oder Schulung möglich.');
  if(!validDate3_(startDate)||!validDate3_(endDate)||endDate<startDate)throw new Error('Ungültiger Zeitraum.');
  const ss=getSpreadsheet_(),sy=Number(startDate.slice(0,4)),ey=Number(endDate.slice(0,4));for(let y=sy;y<=ey;y++)ensureHolidayStatusesForYear_(ss,y);
  const allCurrentDates=dateList734_(startDate,endDate),workDates=[],conflicts=[];
  allCurrentDates.forEach(function(iso){const p=iso.split('-').map(Number),dow=new Date(p[0],p[1]-1,p[2]).getDay();if(dow<1||dow>5)return;const st=getStatusInfo_(ss,targetEmployee,iso);if(st.status==='Feiertag')return;if(st.status&&st.status!=='Arbeiten')conflicts.push(iso);else if(hasWorkEntryOnDate_(ss,targetEmployee,iso))conflicts.push(iso);else workDates.push(iso);});
  if(conflicts.length)throw new Error('Für folgende Tage bestehen bereits Arbeitszeiten oder Abwesenheiten: '+conflicts.map(formatDateDE_).join(', ')+'. Bitte zuerst prüfen/löschen.');

  let caseId='',mode='',employerPayThrough='',payer='',caseDays=0,note='',paidSet={};
  if(type==='Krank'){
    mode=['Neu','Fortsetzung','Unklar'].includes(sicknessMode)?sicknessMode:'Neu';const prior=activeSicknessRows734_(ss,targetEmployee);
    if(mode==='Fortsetzung'){
      if(!continuationCaseId)throw new Error('Bitte den fortgesetzten Krankheitsfall auswählen.');
      const match=prior.find(function(r){return r.caseId===continuationCaseId||r.id===continuationCaseId;});if(!match)throw new Error('Der gewählte frühere Krankheitsfall wurde nicht gefunden.');caseId=match.caseId||match.id;
      const oldDates=caseDates734_(prior,caseId),first=oldDates[0]||'',last=oldDates[oldDates.length-1]||'';
      if((last&&startDate>=addMonths734_(last,6))||(first&&startDate>=addMonths734_(first,12))){
        note='Fortsetzungserkrankung nach 6-/12-Monats-Regel: neuer Entgeltfortzahlungsanspruch wurde als neuer Fristblock gestartet.';caseId=Utilities.getUuid();
      }
    }else caseId=Utilities.getUuid();
    if(mode==='Unklar')note='Fortsetzungserkrankung unklar – vor Lohnabrechnung prüfen.';
    const priorDates=caseDates734_(prior,caseId),seen={};priorDates.concat(allCurrentDates).forEach(function(d){seen[d]=true;});const caseDates=Object.keys(seen).sort();caseDays=caseDates.length;
    let eligibleFrom='';if(rec.entryDate){const ep=rec.entryDate.split('-').map(Number);eligibleFrom=isoDate_(addDays_(new Date(ep[0],ep[1]-1,ep[2],12),28));}
    const eligible=caseDates.filter(function(d){return !eligibleFrom||d>=eligibleFrom;});eligible.slice(0,42).forEach(function(d){paidSet[d]=true;});if(eligible.length>=42)employerPayThrough=eligible[41];
    const currentEligible=allCurrentDates.filter(function(d){return !eligibleFrom||d>=eligibleFrom;}),currentPaid=currentEligible.filter(function(d){return paidSet[d];});
    if(currentEligible.length===0)payer='Krankenkasse/prüfen (4-Wochen-Wartezeit)';else if(currentPaid.length===0)payer='Krankengeld/Krankenkasse';else if(currentPaid.length<currentEligible.length)payer='Arbeitgeber / Krankengeld';else payer='Arbeitgeber';
  }

  const credits=workDates.map(function(date){let h=weekdayHoursForDate_(targetEmployee,date);if(type==='Krank'&&!paidSet[date])h=0;return {date:date,hours:round2_(h)};});
  const totalCredit=round2_(credits.reduce(function(a,x){return a+Number(x.hours||0);},0));
  if(type==='Freizeitausgleich'){const available=getTimeBankBalance_(ss,targetEmployee);if(totalCredit<=0)throw new Error('Für diesen Zeitraum sind keine Sollstunden hinterlegt.');if(totalCredit>available+0.001)throw new Error('Nicht genügend Zeitguthaben.');}
  const id=Utilities.getUuid(),row=[id,targetEmployee,type,startDate,endDate,new Date(),employee,'Ja',caseId,mode,employerPayThrough,payer,caseDays,note];ensureAbsenceSheet_(ss).appendRow(row);
  credits.forEach(function(x){const source=type==='Krank'?(x.hours>0?'Chef Abwesenheit':'Krankengeld / keine AG-Gutschrift'):'Chef Abwesenheit';upsertStatus_(ss,targetEmployee,x.date,type,source,id,x.hours,true);});
  let timeBank=null;if(type==='Freizeitausgleich')timeBank=appendTimeBankTransaction_(ss,targetEmployee,-totalCredit,'Freizeitausgleich',Number(startDate.slice(0,4)),Number(startDate.slice(5,7)),'absence:'+id,'Freizeitausgleich '+formatDateDE_(startDate)+' bis '+formatDateDE_(endDate),employee);
  return {ok:true,id:id,days:workDates.length,creditedHours:totalCredit,timeBankBalance:timeBank?timeBank.balanceAfter:getTimeBankBalance_(ss,targetEmployee),sickness:type==='Krank'?{caseId:caseId,mode:mode,caseCalendarDays:caseDays,employerPayThrough:employerPayThrough,payer:payer,note:note}:null};
};

function endSicknessAbsence734_(employee,employeePin,id,returnDate){
  requireChef_(employee,employeePin);id=clean_(id);returnDate=clean_(returnDate);
  if(!id)throw new Error('Krankheitseintrag fehlt.');if(!validDate3_(returnDate))throw new Error('Bitte ein gueltiges Rueckkehrdatum waehlen.');
  const ss=getSpreadsheet_(),sh=ensureAbsenceSheet_(ss),v=sh.getDataRange().getValues();let rowIndex=-1,target='',start='',oldEnd='',caseId='';
  for(let i=1;i<v.length;i++){if(clean_(v[i][0])===id&&String(v[i][7]).toLowerCase()!=='nein'){if(clean_(v[i][2])!=='Krank')throw new Error('Gesundmeldung ist nur fuer Krankheitseintraege moeglich.');rowIndex=i+1;target=clean_(v[i][1]);start=normalizeDate_(v[i][3]);oldEnd=normalizeDate_(v[i][4]);caseId=clean_(v[i][8])||id;break;}}
  if(rowIndex<0)throw new Error('Aktiver Krankheitseintrag wurde nicht gefunden.');
  const p=returnDate.split('-').map(Number),newEnd=isoDate_(addDays_(new Date(p[0],p[1]-1,p[2],12),-1));
  if(returnDate>isoDate_(addDays_(new Date(Number(oldEnd.slice(0,4)),Number(oldEnd.slice(5,7))-1,Number(oldEnd.slice(8,10)),12),1)))return {ok:true,employee:target,returnDate:returnDate,oldEnd:oldEnd,changed:false,message:'Mitarbeiter war laut Eintrag bereits ab '+formatDateDE_(isoDate_(addDays_(new Date(Number(oldEnd.slice(0,4)),Number(oldEnd.slice(5,7))-1,Number(oldEnd.slice(8,10)),12),1)))+' gesund.'};
  if(returnDate<=start){sh.getRange(rowIndex,8).setValue('Nein');}else{sh.getRange(rowIndex,5).setValue(newEnd);sh.getRange(rowIndex,14).setValue('Gesund gemeldet ab '+formatDateDE_(returnDate)+' durch '+clean_(employee));}
  const st=ss.getSheetByName(CONFIG.STATUS_SHEET);if(st&&st.getLastRow()>=2){const sv=st.getDataRange().getValues();for(let i=sv.length-1;i>=1;i--){if(clean_(sv[i][5])===id&&normalizeDate_(sv[i][1])>=returnDate)st.deleteRow(i+1);}}
  SpreadsheetApp.flush();
  const active=activeSicknessRows734_(ss,target),dates=caseDates734_(active,caseId),rec=getEmployeeRecord_(target);let eligibleFrom='';
  if(rec&&rec.entryDate){const ep=rec.entryDate.split('-').map(Number);eligibleFrom=isoDate_(addDays_(new Date(ep[0],ep[1]-1,ep[2],12),28));}
  const eligible=dates.filter(function(d){return !eligibleFrom||d>=eligibleFrom;}),payThrough=eligible.length>=42?eligible[41]:'',paid={};eligible.slice(0,42).forEach(function(d){paid[d]=true;});
  const vv=sh.getDataRange().getValues();for(let i=1;i<vv.length;i++){if(String(vv[i][7]).toLowerCase()==='nein'||clean_(vv[i][1])!==target||clean_(vv[i][2])!=='Krank'||(clean_(vv[i][8])||clean_(vv[i][0]))!==caseId)continue;const rs=normalizeDate_(vv[i][3]),re=normalizeDate_(vv[i][4]),period=dateList734_(rs,re),periodEligible=period.filter(function(d){return !eligibleFrom||d>=eligibleFrom;}),periodPaid=periodEligible.filter(function(d){return paid[d];}),payer=periodEligible.length===0?'Krankenkasse/prüfen (4-Wochen-Wartezeit)':periodPaid.length===0?'Krankengeld/Krankenkasse':periodPaid.length<periodEligible.length?'Arbeitgeber / Krankengeld':'Arbeitgeber';sh.getRange(i+1,11,1,3).setValues([[payThrough,payer,dates.length]]);}
  SpreadsheetApp.flush();
  return {ok:true,employee:target,returnDate:returnDate,oldEnd:oldEnd,newEnd:returnDate<=start?'':newEnd,changed:true,removedEntire:returnDate<=start,hoursCountFrom:returnDate};
}

getAbsences=function(employee,employeePin){
  requireChef_(employee,employeePin);const ss=getSpreadsheet_(),sheet=ensureAbsenceSheet_(ss),values=sheet.getDataRange().getValues(),out=[],credits=statusCreditsByRef734_(ss);
  for(let i=1;i<values.length;i++)if(String(values[i][7]).toLowerCase()!=='nein'){
    const id=clean_(values[i][0]);out.push({id:id,employee:clean_(values[i][1]),type:clean_(values[i][2]),start:normalizeDate_(values[i][3]),end:normalizeDate_(values[i][4]),creditedHours:round2_(credits[id]||0),sickCaseId:clean_(values[i][8]),sicknessMode:clean_(values[i][9]),employerPayThrough:normalizeDate_(values[i][10]),payer:clean_(values[i][11]),caseDays:Number(values[i][12])||0,note:clean_(values[i][13])});
  }
  out.sort(function(a,b){return b.start.localeCompare(a.start);});return out;
};