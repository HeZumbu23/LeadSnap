window.LeadSnapI18N = (() => {
  "use strict";

  const LANG_KEY = "leadsnap_lang";

  const DICT = {
    de: {
      "auth.tabLogin": "Anmelden",
      "auth.tabRegister": "Registrieren",
      "auth.email": "E-Mail",
      "auth.password": "Passwort",
      "auth.loginBtn": "Anmelden",
      "auth.emailRequired": "E-Mail *",
      "auth.passwordRequired": "Passwort * (mind. 8 Zeichen)",
      "auth.registerBtn": "Konto erstellen",
      "auth.hint": "Jedes Team hat seinen eigenen, getrennten Datenbereich.",
      "header.switchEvent": "Messe wechseln",
      "header.chooseEvent": "Messe wählen",
      "header.newContact": "Neuer Kontakt",
      "list.searchPlaceholder": "Suchen (Name, Firma, Thema)…",
      "list.noEvent": "Noch keine Messe ausgewählt.",
      "list.createFirstEvent": "Erste Messe anlegen",
      "list.emptyTitle": "Noch keine Kontakte erfasst.",
      "list.emptyHint": "Tippe unten rechts auf <strong>+</strong>, um deinen ersten Kontakt aufzunehmen.",
      "list.contactCount": "{n} Kontakt",
      "list.contactCountPlural": "{n} Kontakte",
      "list.noMatches": "Keine Treffer für: {q}",
      "form.takePhoto": "Visitenkarte fotografieren",
      "form.newPhoto": "Neues Foto",
      "form.nameRequired": "Name *",
      "form.company": "Firma",
      "form.position": "Position",
      "form.phone": "Telefon",
      "form.email": "E-Mail",
      "form.address": "Adresse",
      "form.addressPlaceholder": "Straße, PLZ, Ort",
      "form.topic": "Thema / Interesse",
      "form.topicPlaceholder": "z.B. Produkt X, Kooperation",
      "form.notes": "Notizen",
      "form.notesPlaceholder": "Kurze Notizen zum Gespräch…",
      "form.priority": "Priorität",
      "form.priorityNormal": "Normal",
      "form.priorityHigh": "★ Hoch – dringend nachfassen",
      "form.priorityLow": "Niedrig",
      "form.photoError": "Foto konnte nicht verarbeitet werden.",
      "form.nameMissing": "Bitte mindestens einen Namen eingeben.",
      "form.noEventSelected": "Bitte zuerst eine Messe auswählen.",
      "form.saveFailed": "Speichern fehlgeschlagen: {msg}",
      "extract.analyzing": "Visitenkarte wird per KI ausgelesen…",
      "extract.offline": "Offline – automatische Erkennung nicht möglich. Bitte manuell eingeben.",
      "extract.success": "Daten erkannt – bitte prüfen.",
      "extract.failed": "Automatische Erkennung fehlgeschlagen ({msg}) – bitte manuell eingeben.",
      "location.unsupported": "📍 Standort: von diesem Browser nicht unterstützt",
      "location.needsHttps": "📍 Standort benötigt eine sichere (HTTPS-)Verbindung",
      "location.locating": "📍 Standort wird ermittelt… (Berechtigung ggf. im Browser bestätigen)",
      "location.captured": "📍 Standort erfasst (±{acc} m)",
      "location.denied": "📍 Standort-Zugriff verweigert – bitte in den Website-/Browser-Einstellungen für LeadSnap erlauben",
      "location.timeout": "📍 Standort-Ermittlung hat zu lange gedauert",
      "location.unavailable": "📍 Standort nicht verfügbar",
      "common.cancel": "Abbrechen",
      "common.save": "Speichern",
      "common.edit": "Bearbeiten",
      "common.delete": "Löschen",
      "common.close": "Schließen",
      "common.error": "Fehler: {msg}",
      "detail.name": "Name",
      "detail.company": "Firma",
      "detail.position": "Position",
      "detail.phone": "Telefon",
      "detail.email": "E-Mail",
      "detail.address": "Adresse",
      "detail.topic": "Thema",
      "detail.captured": "Erfasst",
      "detail.location": "Standort",
      "detail.openMap": "Karte öffnen",
      "detail.confirmDelete": "Diesen Kontakt wirklich löschen?",
      "detail.deleteFailed": "Löschen fehlgeschlagen: {msg}",
      "export.title": "Export",
      "export.syncNow": "Jetzt synchronisieren",
      "export.exportHint": "Exportiere die Kontakte von <strong id=\"exportEventName\">–</strong>.",
      "export.csv": "CSV exportieren (Excel)",
      "export.vcf": "vCard exportieren (Kontakte-App)",
      "export.json": "JSON-Backup exportieren",
      "export.clearAll": "Kontakte dieser Messe löschen",
      "export.logout": "Abmelden",
      "export.confirmClearAll": "Wirklich ALLE Kontakte von \"{name}\" unwiderruflich löschen?",
      "export.offlineExport": "Für den Server-Export wird eine Internetverbindung benötigt. Nutze in der Zwischenzeit das JSON-Backup, das auch offline funktioniert.",
      "export.offlineSyncAlert": "Kein Internetzugang – die Daten werden automatisch synchronisiert, sobald wieder eine Verbindung besteht.",
      "export.accountHint": "Angemeldet als {email} ({tenant})",
      "export.confirmLogout": "Wirklich abmelden?",
      "export.pendingSingular": "<strong>1</strong> lokale Änderung noch nicht mit dem Server synchronisiert.",
      "export.pendingPlural": "<strong>{n}</strong> lokale Änderungen noch nicht mit dem Server synchronisiert.",
      "export.allSynced": "Alle Daten sind mit dem Server synchronisiert.",
      "sync.offline": "Offline",
      "sync.offlinePending": "Offline – {n} Änderung wartet",
      "sync.offlinePendingPlural": "Offline – {n} Änderungen warten",
      "sync.syncing": "Synchronisiere…",
      "sync.onlinePending": "Online – {n} Änderung wird übertragen",
      "sync.onlinePendingPlural": "Online – {n} Änderungen werden übertragen",
      "sync.allSynced": "Online – alles synchronisiert",
      "events.title": "Messen",
      "events.add": "+ Neue Messe anlegen",
      "events.nameRequired": "Name der Messe *",
      "events.namePlaceholder": "z.B. Hannover Messe 2026",
      "events.location": "Ort",
      "events.locationPlaceholder": "z.B. Hannover",
      "events.start": "Start",
      "events.end": "Ende",
      "events.none": "Noch keine Messe angelegt.",
      "events.active": "Aktiv",
      "events.reactivate": "Reaktivieren",
      "events.archive": "Archivieren",
      "events.edit": "Bearbeiten",
      "events.delete": "Löschen",
      "events.confirmDelete": "\"{name}\" inklusive aller zugehörigen Kontakte wirklich löschen?",
      "events.saveFailed": "Speichern fehlgeschlagen: {msg}",
      "nav.list": "Liste",
      "nav.export": "Export",
      "nav.admin": "Backend",
      "admin.title": "Backend",
      "admin.hint": "Plattformweite Statistik über alle Teams.",
      "admin.tenants": "Teams",
      "admin.users": "Nutzer",
      "admin.events": "Messen",
      "admin.contacts": "Kontakte",
      "admin.refresh": "Aktualisieren",
      "admin.byTenant": "Nach Team",
      "admin.loadFailed": "Statistik konnte nicht geladen werden: {msg}",
      "admin.accessDenied": "Kein Zugriff.",
      "admin.createdAt": "erstellt {date}",
      "err.nameRequired": "Name ist erforderlich.",
      "err.eventIdRequired": "Bitte eine Messe auswählen.",
      "err.eventNotBelongTenant": "Diese Messe gehört nicht zu deinem Team.",
      "err.eventNotFound": "Messe nicht gefunden.",
      "err.idRequired": "ID ist erforderlich.",
      "err.emailRequired": "Bitte eine gültige E-Mail-Adresse angeben.",
      "err.passwordTooShort": "Das Passwort muss mindestens 8 Zeichen haben.",
      "err.emailExists": "Für diese E-Mail-Adresse existiert bereits ein Konto.",
      "err.wrongCredentials": "E-Mail oder Passwort ist falsch.",
      "err.notAuthenticated": "Nicht angemeldet. Bitte erneut einloggen.",
      "err.apiGeneric": "API-Fehler ({status})",
      "err.extractApiKeyMissing": "Automatische Erkennung ist serverseitig nicht konfiguriert.",
      "err.extractParseFailed": "Antwort der KI konnte nicht ausgewertet werden.",
      "err.extractApiError": "KI-Dienst nicht erreichbar.",
      "err.photoRequired": "Foto ist erforderlich.",
    },
    en: {
      "auth.tabLogin": "Sign in",
      "auth.tabRegister": "Sign up",
      "auth.email": "Email",
      "auth.password": "Password",
      "auth.loginBtn": "Sign in",
      "auth.emailRequired": "Email *",
      "auth.passwordRequired": "Password * (min. 8 characters)",
      "auth.registerBtn": "Create account",
      "auth.hint": "Every team gets its own, fully separate workspace.",
      "header.switchEvent": "Switch event",
      "header.chooseEvent": "Choose event",
      "header.newContact": "New contact",
      "list.searchPlaceholder": "Search (name, company, topic)…",
      "list.noEvent": "No event selected yet.",
      "list.createFirstEvent": "Create your first event",
      "list.emptyTitle": "No contacts captured yet.",
      "list.emptyHint": "Tap <strong>+</strong> in the bottom right to add your first contact.",
      "list.contactCount": "{n} contact",
      "list.contactCountPlural": "{n} contacts",
      "list.noMatches": "No matches for: {q}",
      "form.takePhoto": "Photograph business card",
      "form.newPhoto": "New photo",
      "form.nameRequired": "Name *",
      "form.company": "Company",
      "form.position": "Position",
      "form.phone": "Phone",
      "form.email": "Email",
      "form.address": "Address",
      "form.addressPlaceholder": "Street, ZIP, city",
      "form.topic": "Topic / interest",
      "form.topicPlaceholder": "e.g. Product X, partnership",
      "form.notes": "Notes",
      "form.notesPlaceholder": "Quick notes from the conversation…",
      "form.priority": "Priority",
      "form.priorityNormal": "Normal",
      "form.priorityHigh": "★ High – follow up urgently",
      "form.priorityLow": "Low",
      "form.photoError": "The photo could not be processed.",
      "form.nameMissing": "Please enter at least a name.",
      "form.noEventSelected": "Please select an event first.",
      "form.saveFailed": "Save failed: {msg}",
      "extract.analyzing": "Reading the business card with AI…",
      "extract.offline": "Offline – automatic recognition isn't possible. Please enter the details manually.",
      "extract.success": "Data recognized – please double-check.",
      "extract.failed": "Automatic recognition failed ({msg}) – please enter the details manually.",
      "location.unsupported": "📍 Location: not supported by this browser",
      "location.needsHttps": "📍 Location requires a secure (HTTPS) connection",
      "location.locating": "📍 Getting location… (confirm the browser permission if asked)",
      "location.captured": "📍 Location captured (±{acc} m)",
      "location.denied": "📍 Location access denied – please allow it for LeadSnap in your browser/site settings",
      "location.timeout": "📍 Locating took too long",
      "location.unavailable": "📍 Location not available",
      "common.cancel": "Cancel",
      "common.save": "Save",
      "common.edit": "Edit",
      "common.delete": "Delete",
      "common.close": "Close",
      "common.error": "Error: {msg}",
      "detail.name": "Name",
      "detail.company": "Company",
      "detail.position": "Position",
      "detail.phone": "Phone",
      "detail.email": "Email",
      "detail.address": "Address",
      "detail.topic": "Topic",
      "detail.captured": "Captured",
      "detail.location": "Location",
      "detail.openMap": "Open map",
      "detail.confirmDelete": "Really delete this contact?",
      "detail.deleteFailed": "Delete failed: {msg}",
      "export.title": "Export",
      "export.syncNow": "Sync now",
      "export.exportHint": "Export the contacts from <strong id=\"exportEventName\">–</strong>.",
      "export.csv": "Export CSV (Excel)",
      "export.vcf": "Export vCard (Contacts app)",
      "export.json": "Export JSON backup",
      "export.clearAll": "Delete this event's contacts",
      "export.logout": "Sign out",
      "export.confirmClearAll": "Really delete ALL contacts from \"{name}\" permanently?",
      "export.offlineExport": "The server export needs an internet connection. Use the JSON backup in the meantime - it also works offline.",
      "export.offlineSyncAlert": "No internet access - data will sync automatically once a connection is available again.",
      "export.accountHint": "Signed in as {email} ({tenant})",
      "export.confirmLogout": "Really sign out?",
      "export.pendingSingular": "<strong>1</strong> local change hasn't synced with the server yet.",
      "export.pendingPlural": "<strong>{n}</strong> local changes haven't synced with the server yet.",
      "export.allSynced": "Everything is synced with the server.",
      "sync.offline": "Offline",
      "sync.offlinePending": "Offline – {n} change pending",
      "sync.offlinePendingPlural": "Offline – {n} changes pending",
      "sync.syncing": "Syncing…",
      "sync.onlinePending": "Online – {n} change syncing",
      "sync.onlinePendingPlural": "Online – {n} changes syncing",
      "sync.allSynced": "Online – all synced",
      "events.title": "Events",
      "events.add": "+ Create new event",
      "events.nameRequired": "Event name *",
      "events.namePlaceholder": "e.g. Hannover Trade Fair 2026",
      "events.location": "Location",
      "events.locationPlaceholder": "e.g. Hannover",
      "events.start": "Start",
      "events.end": "End",
      "events.none": "No event created yet.",
      "events.active": "Active",
      "events.reactivate": "Reactivate",
      "events.archive": "Archive",
      "events.edit": "Edit",
      "events.delete": "Delete",
      "events.confirmDelete": "Really delete \"{name}\" including all its contacts?",
      "events.saveFailed": "Save failed: {msg}",
      "nav.list": "List",
      "nav.export": "Export",
      "nav.admin": "Backend",
      "admin.title": "Backend",
      "admin.hint": "Platform-wide statistics across all teams.",
      "admin.tenants": "Teams",
      "admin.users": "Users",
      "admin.events": "Events",
      "admin.contacts": "Contacts",
      "admin.refresh": "Refresh",
      "admin.byTenant": "By team",
      "admin.loadFailed": "Could not load stats: {msg}",
      "admin.accessDenied": "Access denied.",
      "admin.createdAt": "created {date}",
      "err.nameRequired": "Name is required.",
      "err.eventIdRequired": "Please select an event.",
      "err.eventNotBelongTenant": "This event doesn't belong to your team.",
      "err.eventNotFound": "Event not found.",
      "err.idRequired": "ID is required.",
      "err.emailRequired": "Please enter a valid email address.",
      "err.passwordTooShort": "The password must be at least 8 characters.",
      "err.emailExists": "An account already exists for this email address.",
      "err.wrongCredentials": "Email or password is incorrect.",
      "err.notAuthenticated": "Not signed in. Please log in again.",
      "err.apiGeneric": "API error ({status})",
      "err.extractApiKeyMissing": "Automatic recognition isn't configured on the server.",
      "err.extractParseFailed": "Could not parse the AI's response.",
      "err.extractApiError": "AI service unreachable.",
      "err.photoRequired": "Photo is required.",
    },
  };

  // Known backend error strings (we control these, they're always German)
  // mapped to translation keys so error messages respect the chosen language.
  const BACKEND_ERROR_MAP = [
    ["name is required", "err.nameRequired"],
    ["event_id is required", "err.eventIdRequired"],
    ["event does not belong to this tenant", "err.eventNotBelongTenant"],
    ["event not found", "err.eventNotFound"],
    ["id is required", "err.idRequired"],
    ["Bitte eine gültige E-Mail-Adresse angeben.", "err.emailRequired"],
    ["Das Passwort muss mindestens 8 Zeichen haben.", "err.passwordTooShort"],
    ["Für diese E-Mail-Adresse existiert bereits ein Konto.", "err.emailExists"],
    ["E-Mail oder Passwort ist falsch.", "err.wrongCredentials"],
    ["not authenticated", "err.notAuthenticated"],
    ["ANTHROPIC_API_KEY ist nicht konfiguriert.", "err.extractApiKeyMissing"],
    ["Antwort konnte nicht ausgewertet werden.", "err.extractParseFailed"],
    ["Claude API nicht erreichbar.", "err.extractApiError"],
    ["photo is required", "err.photoRequired"],
  ];

  function detectLang() {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored && DICT[stored]) return stored;
    const nav = (navigator.language || "de").toLowerCase();
    return nav.startsWith("de") ? "de" : "en";
  }

  let lang = detectLang();
  const listeners = [];

  function format(str, params) {
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, (m, key) => (key in params ? params[key] : m));
  }

  function t(key, params) {
    const str = (DICT[lang] && DICT[lang][key]) || (DICT.de[key]) || key;
    return format(str, params);
  }

  function translateBackendError(message) {
    if (!message) return message;
    for (const [needle, key] of BACKEND_ERROR_MAP) {
      if (message.includes(needle)) return t(key);
    }
    return message;
  }

  function setLang(newLang) {
    if (!DICT[newLang]) return;
    lang = newLang;
    localStorage.setItem(LANG_KEY, lang);
    applyStatic();
    listeners.forEach((fn) => fn(lang));
  }

  function toggle() {
    setLang(lang === "de" ? "en" : "de");
  }

  function onChange(fn) {
    listeners.push(fn);
  }

  function applyStatic(root = document) {
    root.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = t(el.getAttribute("data-i18n"));
    });
    root.querySelectorAll("[data-i18n-html]").forEach((el) => {
      el.innerHTML = t(el.getAttribute("data-i18n-html"));
    });
    root.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", t(el.getAttribute("data-i18n-placeholder")));
    });
    root.querySelectorAll("[data-i18n-title]").forEach((el) => {
      el.setAttribute("title", t(el.getAttribute("data-i18n-title")));
    });
    document.documentElement.lang = lang;
    document.querySelectorAll(".lang-toggle").forEach((btn) => {
      btn.textContent = lang === "de" ? "EN" : "DE";
    });
  }

  return { t, translateBackendError, setLang, toggle, onChange, applyStatic, get lang() { return lang; } };
})();
