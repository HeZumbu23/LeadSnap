(() => {
  "use strict";

  const API = "cgi-bin/contacts.py";
  const EVENTS_API = "cgi-bin/events.py";
  const EXTRACT_API = "cgi-bin/extract_card.py";
  const AUTH_API = "cgi-bin/auth.py";
  const CURRENT_EVENT_KEY = "leadsnap_current_event_id";
  const TENANT_KEY = "leadsnap_tenant_id";
  const LAST_SESSION_KEY = "leadsnap_last_session";
  const DB = window.LeadSnapDB;
  const I18N = window.LeadSnapI18N;
  const t = I18N.t;
  const terr = (msg) => I18N.translateBackendError(msg);

  const views = {
    listView: document.getElementById("listView"),
    formView: document.getElementById("formView"),
    detailView: document.getElementById("detailView"),
    exportView: document.getElementById("exportView"),
    eventView: document.getElementById("eventView"),
    adminView: document.getElementById("adminView"),
  };

  let contacts = [];
  let events = [];
  let currentEventId = localStorage.getItem(CURRENT_EVENT_KEY) || "";
  let editingId = null;
  let editingEventId = null;
  let currentPhoto = "";
  let currentDetailId = null;
  let currentLocation = null; // {latitude, longitude, accuracy}
  let currentCapturedAt = "";
  let syncing = false;
  let lastSession = null;

  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function currentEvent() {
    return events.find((e) => e.id === currentEventId) || null;
  }

  function setCurrentEvent(id) {
    currentEventId = id || "";
    if (currentEventId) {
      localStorage.setItem(CURRENT_EVENT_KEY, currentEventId);
    } else {
      localStorage.removeItem(CURRENT_EVENT_KEY);
    }
    updateEventUi();
  }

  function updateEventUi() {
    const ev = currentEvent();
    const name = ev ? ev.name : t("header.chooseEvent");
    document.getElementById("currentEventName").textContent = name;
    document.getElementById("exportEventName").textContent = ev ? ev.name : "–";
    document.getElementById("noEventBanner").classList.toggle("hidden", !!ev);
    document.getElementById("fabAdd").classList.toggle("hidden", !ev);
  }

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => el.classList.toggle("hidden", key !== name));
    document.querySelectorAll(".navbtn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === name);
    });
  }

  // ---- Sync status bar ----

  async function updateSyncBar() {
    const bar = document.getElementById("syncBar");
    const text = document.getElementById("syncText");
    const outbox = await DB.getOutbox().catch(() => []);
    const pending = outbox.length;
    bar.classList.remove("offline", "syncing");
    if (!navigator.onLine) {
      bar.classList.add("offline");
      text.textContent = pending > 0
        ? t(pending === 1 ? "sync.offlinePending" : "sync.offlinePendingPlural", { n: pending })
        : t("sync.offline");
    } else if (syncing) {
      bar.classList.add("syncing");
      text.textContent = t("sync.syncing");
    } else if (pending > 0) {
      text.textContent = t(pending === 1 ? "sync.onlinePending" : "sync.onlinePendingPlural", { n: pending });
    } else {
      text.textContent = t("sync.allSynced");
    }
    const hint = document.getElementById("exportSyncHint");
    if (hint) {
      hint.innerHTML = pending > 0
        ? t(pending === 1 ? "export.pendingSingular" : "export.pendingPlural", { n: pending })
        : t("export.allSynced");
    }
  }

  // ---- Local-first data access ----

  async function loadEventsLocal() {
    events = (await DB.getAll("events")).sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }

  async function loadContactsLocal() {
    if (!currentEventId) {
      contacts = [];
      return;
    }
    const rows = await DB.getAllByIndex("contacts", "event_id", currentEventId);
    contacts = rows.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  }

  async function refreshEvents() {
    await loadEventsLocal();
    if (currentEventId && !events.some((e) => e.id === currentEventId)) {
      setCurrentEvent("");
    }
    if (!currentEventId) {
      const firstActive = events.find((e) => !e.archived);
      if (firstActive) setCurrentEvent(firstActive.id);
    }
    updateEventUi();
    renderEventList();
  }

  async function refreshContacts() {
    await loadContactsLocal();
    renderList(document.getElementById("searchBox").value);
  }

  // ---- Outbox / sync ----

  async function queueChange(kind, action, payload) {
    await DB.addOutbox({ kind, action, payload });
    updateSyncBar();
    syncNow();
  }

  async function postJson(url, body) {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body || {}),
    });
    return res;
  }

  async function flushOutbox() {
    const items = await DB.getOutbox();
    for (const item of items) {
      let res;
      try {
        if (item.kind === "contact") {
          if (item.action === "save") {
            res = await postJson(`${API}?action=save`, item.payload);
          } else if (item.action === "delete") {
            res = await postJson(`${API}?action=delete`, item.payload);
          } else if (item.action === "clear_all") {
            res = await postJson(`${API}?action=clear_all&event_id=${encodeURIComponent(item.payload.event_id)}`);
          }
        } else if (item.kind === "event") {
          if (item.action === "create") {
            res = await postJson(`${EVENTS_API}?action=create`, item.payload);
          } else if (item.action === "update") {
            res = await postJson(`${EVENTS_API}?action=update`, item.payload);
          } else if (item.action === "delete") {
            res = await postJson(`${EVENTS_API}?action=delete`, item.payload);
          }
        }
      } catch (err) {
        // network unreachable - stop, keep item queued for the next attempt
        return;
      }
      if (res && res.status === 401) {
        // session expired - keep the change queued, it will flush after re-login
        handleSessionExpired();
        return;
      }
      if (res && !res.ok && res.status < 500) {
        console.warn("Dropping invalid queued change", item, res.status);
      } else if (res && !res.ok) {
        return; // server error - retry later, keep order intact
      }
      await DB.deleteOutbox(item.seq);
    }
  }

  async function pullFromServer() {
    const evRes = await fetch(`${EVENTS_API}?action=list`);
    if (evRes.status === 401) {
      handleSessionExpired();
      return;
    }
    if (evRes.ok) {
      const data = await evRes.json();
      for (const ev of data.events || []) {
        await DB.put("events", ev);
      }
    }
    if (currentEventId) {
      const cRes = await fetch(`${API}?action=list&event_id=${encodeURIComponent(currentEventId)}`);
      if (cRes.status === 401) {
        handleSessionExpired();
        return;
      }
      if (cRes.ok) {
        const data = await cRes.json();
        for (const c of data.contacts || []) {
          await DB.put("contacts", c);
        }
      }
    }
  }

  let sessionExpiredShown = false;
  function handleSessionExpired() {
    if (sessionExpiredShown) return;
    sessionExpiredShown = true;
    localStorage.removeItem(LAST_SESSION_KEY);
    showAuth();
  }

  let syncPromise = null;
  function syncNow() {
    if (!navigator.onLine) {
      updateSyncBar();
      return Promise.resolve();
    }
    if (syncPromise) return syncPromise;
    syncing = true;
    updateSyncBar();
    syncPromise = (async () => {
      try {
        await flushOutbox();
        await pullFromServer();
      } catch (err) {
        console.warn("Sync failed:", err);
      } finally {
        syncing = false;
        syncPromise = null;
        await refreshEvents();
        await refreshContacts();
        await updateSyncBar();
      }
    })();
    return syncPromise;
  }

  window.addEventListener("online", () => { updateSyncBar(); syncNow(); });
  window.addEventListener("offline", () => { updateSyncBar(); });
  setInterval(() => { if (navigator.onLine) syncNow(); }, 45000);

  document.getElementById("syncNowBtn").addEventListener("click", () => {
    if (!navigator.onLine) {
      alert(t("export.offlineSyncAlert"));
      return;
    }
    syncNow();
  });

  const ICON_STAR = '<svg class="icon priority-star" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.5l2.9 6.1 6.6.7-4.9 4.6 1.3 6.6L12 17.3 6.1 20.5l1.3-6.6L2.5 9.3l6.6-.7z"/></svg>';
  const ICON_ARROW_DOWN = '<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6"/></svg>';
  const ICON_PERSON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7"/></svg>';

  function priorityFlag(p) {
    if (p === "hoch") return ICON_STAR;
    if (p === "niedrig") return ICON_ARROW_DOWN;
    return "";
  }

  function renderList(filter = "") {
    const list = document.getElementById("contactList");
    const empty = document.getElementById("emptyState");
    const q = filter.trim().toLowerCase();

    const filtered = contacts.filter((c) => {
      if (!q) return true;
      return [c.name, c.company, c.topic, c.notes, c.address]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    document.getElementById("contactCount").textContent =
      t(contacts.length === 1 ? "list.contactCount" : "list.contactCountPlural", { n: contacts.length });

    list.innerHTML = "";
    if (filtered.length === 0) {
      empty.classList.toggle("hidden", contacts.length !== 0 || !currentEventId);
      if (contacts.length !== 0 && q) {
        const li = document.createElement("li");
        li.className = "empty-state";
        li.textContent = t("list.noMatches", { q: filter });
        list.appendChild(li);
      }
      return;
    }
    empty.classList.add("hidden");

    filtered.forEach((c) => {
      const li = document.createElement("li");
      li.className = "contact-card";
      li.dataset.id = c.id;

      const thumbHtml = c.photo
        ? `<img class="card-thumb" src="${c.photo}" alt="">`
        : `<div class="card-thumb-placeholder">${ICON_PERSON}</div>`;

      const sub = [c.company, c.position].filter(Boolean).join(" · ");

      li.innerHTML = `
        ${thumbHtml}
        <div class="card-body">
          <div class="card-name">${escapeHtml(c.name)} ${priorityFlag(c.priority)}</div>
          <div class="card-sub">${escapeHtml(sub)}</div>
          ${c.topic ? `<div class="card-topic">${escapeHtml(c.topic)}</div>` : ""}
        </div>
      `;
      li.addEventListener("click", () => openDetail(c.id));
      list.appendChild(li);
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str.replace(/[&<>"']/g, (m) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[m]));
  }

  // ---- Geolocation ----

  function setLocationStatus(text) {
    const el = document.getElementById("locationStatus");
    el.textContent = text;
    el.classList.toggle("hidden", !text);
  }

  function captureLocation() {
    currentLocation = null;
    if (!("geolocation" in navigator)) {
      setLocationStatus(t("location.unsupported"));
      return;
    }
    if (window.isSecureContext === false) {
      setLocationStatus(t("location.needsHttps"));
      return;
    }
    setLocationStatus(t("location.locating"));
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        currentLocation = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        };
        setLocationStatus(t("location.captured", { acc: Math.round(pos.coords.accuracy) }));
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLocationStatus(t("location.denied"));
        } else if (err.code === err.TIMEOUT) {
          setLocationStatus(t("location.timeout"));
        } else {
          setLocationStatus(t("location.unavailable"));
        }
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 30000 }
    );
  }

  // ---- Form (add / edit) ----

  function resetForm() {
    editingId = null;
    currentPhoto = "";
    currentLocation = null;
    currentCapturedAt = "";
    document.getElementById("contactForm").reset();
    document.getElementById("photoPreview").classList.add("hidden");
    document.getElementById("photoPreview").src = "";
    document.getElementById("photoPlaceholder").classList.remove("hidden");
    document.getElementById("retakeBtn").classList.add("hidden");
    document.getElementById("photoInput").value = "";
    setLocationStatus("");
  }

  function openForm(contact = null) {
    resetForm();
    if (contact) {
      editingId = contact.id;
      currentPhoto = contact.photo || "";
      currentCapturedAt = contact.created_at || "";
      if (contact.latitude != null && contact.longitude != null) {
        currentLocation = {
          latitude: contact.latitude,
          longitude: contact.longitude,
          accuracy: contact.location_accuracy,
        };
        setLocationStatus(t("location.captured", { acc: contact.location_accuracy ? Math.round(contact.location_accuracy) : "?" }));
      }
      document.getElementById("f_name").value = contact.name || "";
      document.getElementById("f_company").value = contact.company || "";
      document.getElementById("f_position").value = contact.position || "";
      document.getElementById("f_phone").value = contact.phone || "";
      document.getElementById("f_email").value = contact.email || "";
      document.getElementById("f_address").value = contact.address || "";
      document.getElementById("f_topic").value = contact.topic || "";
      document.getElementById("f_notes").value = contact.notes || "";
      document.getElementById("f_priority").value = contact.priority || "normal";
      if (currentPhoto) {
        document.getElementById("photoPreview").src = currentPhoto;
        document.getElementById("photoPreview").classList.remove("hidden");
        document.getElementById("photoPlaceholder").classList.add("hidden");
        document.getElementById("retakeBtn").classList.remove("hidden");
      }
    } else {
      currentCapturedAt = new Date().toISOString();
      captureLocation();
    }
    showView("formView");
  }

  function resizeImage(file, maxDim = 1280, quality = 0.75) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();
      reader.onload = () => {
        img.onload = () => {
          let { width, height } = img;
          if (width > height && width > maxDim) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else if (height > maxDim) {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.onerror = reject;
        img.src = reader.result;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function setExtractStatus(mode, text) {
    const el = document.getElementById("extractStatus");
    el.classList.remove("hidden", "error", "success");
    if (mode === "loading") {
      el.innerHTML = `<span class="spinner"></span><span>${text}</span>`;
    } else {
      if (mode) el.classList.add(mode);
      el.textContent = text;
    }
  }

  function clearExtractStatus() {
    const el = document.getElementById("extractStatus");
    el.classList.add("hidden");
    el.textContent = "";
  }

  function fillIfEmpty(id, value) {
    if (!value) return;
    const el = document.getElementById(id);
    if (!el.value.trim()) el.value = value;
  }

  async function extractCardData(photoDataUrl) {
    if (!navigator.onLine) {
      setExtractStatus("error", t("extract.offline"));
      return;
    }
    setExtractStatus("loading", t("extract.analyzing"));
    try {
      const res = await fetch(`${EXTRACT_API}?action=extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: photoDataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(terr(data.error) || `HTTP ${res.status}`);
      }
      const f = data.fields || {};
      fillIfEmpty("f_name", f.name);
      fillIfEmpty("f_company", f.company);
      fillIfEmpty("f_position", f.position);
      fillIfEmpty("f_phone", f.phone);
      fillIfEmpty("f_email", f.email);
      fillIfEmpty("f_address", f.address);
      setExtractStatus("success", t("extract.success"));
      setTimeout(clearExtractStatus, 4000);
    } catch (err) {
      console.error(err);
      setExtractStatus("error", t("extract.failed", { msg: err.message }));
    }
  }

  document.getElementById("photoInput").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      currentPhoto = await resizeImage(file);
      document.getElementById("photoPreview").src = currentPhoto;
      document.getElementById("photoPreview").classList.remove("hidden");
      document.getElementById("photoPlaceholder").classList.add("hidden");
      document.getElementById("retakeBtn").classList.remove("hidden");
      if (!currentCapturedAt) currentCapturedAt = new Date().toISOString();
      if (!currentLocation) captureLocation();
      // Don't block on the AI lookup - let the rep jump straight to the
      // topic field while it runs in the background.
      extractCardData(currentPhoto);
      document.getElementById("f_topic").focus();
    } catch (err) {
      alert(t("form.photoError"));
    }
  });

  document.getElementById("retakeBtn").addEventListener("click", () => {
    document.getElementById("photoInput").click();
  });

  document.getElementById("cancelBtn").addEventListener("click", () => {
    showView("listView");
  });

  document.getElementById("contactForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!currentEventId) {
      alert(t("form.noEventSelected"));
      return;
    }
    const payload = {
      id: editingId || uuid(),
      event_id: currentEventId,
      name: document.getElementById("f_name").value.trim(),
      company: document.getElementById("f_company").value.trim(),
      position: document.getElementById("f_position").value.trim(),
      phone: document.getElementById("f_phone").value.trim(),
      email: document.getElementById("f_email").value.trim(),
      address: document.getElementById("f_address").value.trim(),
      topic: document.getElementById("f_topic").value.trim(),
      notes: document.getElementById("f_notes").value.trim(),
      priority: document.getElementById("f_priority").value,
      photo: currentPhoto,
      created_at: currentCapturedAt || new Date().toISOString(),
      latitude: currentLocation ? currentLocation.latitude : null,
      longitude: currentLocation ? currentLocation.longitude : null,
      location_accuracy: currentLocation ? currentLocation.accuracy : null,
    };
    if (!payload.name) {
      alert(t("form.nameMissing"));
      return;
    }
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await DB.put("contacts", payload);
      await queueChange("contact", "save", payload);
      await refreshContacts();
      showView("listView");
    } catch (err) {
      alert(t("form.saveFailed", { msg: err.message }));
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ---- Detail ----

  function priorityLabel(p) {
    if (p === "hoch") return t("form.priorityHigh");
    if (p === "niedrig") return t("form.priorityLow");
    return "";
  }

  function mapEmbedUrl(lat, lon, delta = 0.006) {
    const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
    return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lon}`;
  }

  function openMapModal(lat, lon) {
    document.getElementById("mapModalFrame").src = mapEmbedUrl(lat, lon);
    document.getElementById("mapModalOpenLink").href =
      `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
    document.getElementById("mapModal").classList.remove("hidden");
  }

  function openAddressSearch(address) {
    window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, "_blank", "noopener");
  }

  document.getElementById("mapModalClose").addEventListener("click", () => {
    document.getElementById("mapModal").classList.add("hidden");
    document.getElementById("mapModalFrame").src = "";
  });

  function openDetail(id) {
    const c = contacts.find((x) => x.id === id);
    if (!c) return;
    currentDetailId = id;
    const el = document.getElementById("detailContent");
    const created = c.created_at ? new Date(c.created_at).toLocaleString() : "";
    const hasCoords = c.latitude != null && c.longitude != null;

    // Topic/priority/notes are the actual sales-lead info reps act on, so
    // this box always renders (priority always has a value) rather than
    // disappearing whenever priority happens to be "normal".
    const leadItems = [];
    leadItems.push(`<div class="detail-row"><span class="k">${t("form.topic")}</span><span>${c.topic ? escapeHtml(c.topic) : "–"}</span></div>`);
    leadItems.push(`<div class="detail-row"><span class="k">${t("form.priority")}</span><span>${priorityFlag(c.priority) || ""} ${priorityLabel(c.priority) || t("form.priorityNormal")}</span></div>`);
    const leadBlock = `
      <div class="lead-box">
        ${leadItems.join("")}
        ${c.notes ? `<div class="detail-notes">${escapeHtml(c.notes)}</div>` : ""}
      </div>
    `;

    el.innerHTML = `
      ${c.photo ? `<img src="${c.photo}" alt="">` : ""}
      <div class="detail-row"><span class="k">${t("detail.name")}</span><span>${escapeHtml(c.name)}</span></div>
      ${c.company ? `<div class="detail-row"><span class="k">${t("detail.company")}</span><span>${escapeHtml(c.company)}</span></div>` : ""}
      ${c.position ? `<div class="detail-row"><span class="k">${t("detail.position")}</span><span>${escapeHtml(c.position)}</span></div>` : ""}
      ${c.phone ? `<div class="detail-row"><span class="k">${t("detail.phone")}</span><span><a href="tel:${escapeHtml(c.phone)}">${escapeHtml(c.phone)}</a></span></div>` : ""}
      ${c.email ? `<div class="detail-row"><span class="k">${t("detail.email")}</span><span><a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></span></div>` : ""}
      ${c.address ? `<div class="detail-row"><span class="k">${t("detail.address")}</span><span><a href="#" id="detailAddressLink">${escapeHtml(c.address)}</a></span></div>` : ""}
      ${created ? `<div class="detail-row"><span class="k">${t("detail.captured")}</span><span>${created}</span></div>` : ""}
      ${hasCoords ? `
        <div class="map-thumb-wrap" id="detailMapThumb">
          <iframe class="map-thumb" src="${mapEmbedUrl(c.latitude, c.longitude, 0.003)}" loading="lazy" tabindex="-1" title="${t("detail.location")}"></iframe>
          <div class="map-thumb-overlay"></div>
          <div class="map-thumb-hint">${t("detail.openMap")}${c.location_accuracy ? ` (±${Math.round(c.location_accuracy)} m)` : ""}</div>
        </div>
      ` : ""}
      ${leadBlock}
    `;

    if (hasCoords) {
      document.getElementById("detailMapThumb").addEventListener("click", () => openMapModal(c.latitude, c.longitude));
    }
    const addressLink = document.getElementById("detailAddressLink");
    if (addressLink) {
      // Always resolve the address itself (Google Maps search) here - the
      // captured GPS coords are where the rep stood, not the company's
      // address, so they must not be reused for this link.
      addressLink.addEventListener("click", (e) => {
        e.preventDefault();
        openAddressSearch(c.address);
      });
    }
    showView("detailView");
  }

  document.getElementById("detailEditBtn").addEventListener("click", () => {
    const c = contacts.find((x) => x.id === currentDetailId);
    if (c) openForm(c);
  });

  document.getElementById("detailDeleteBtn").addEventListener("click", async () => {
    if (!confirm(t("detail.confirmDelete"))) return;
    try {
      await DB.del("contacts", currentDetailId);
      await queueChange("contact", "delete", { id: currentDetailId });
      await refreshContacts();
      showView("listView");
    } catch (err) {
      alert(t("detail.deleteFailed", { msg: err.message }));
    }
  });

  // ---- Export ----

  function downloadFrom(url, filename) {
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function slugify(name) {
    return (name || "messe")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "messe";
  }

  function requireEvent() {
    if (!currentEventId) {
      alert(t("form.noEventSelected"));
      return false;
    }
    return true;
  }

  function requireOnlineExport() {
    if (!navigator.onLine) {
      alert(t("export.offlineExport"));
      return false;
    }
    return true;
  }

  document.getElementById("exportCsvBtn").addEventListener("click", () => {
    if (!requireEvent() || !requireOnlineExport()) return;
    const slug = slugify(currentEvent()?.name);
    downloadFrom(
      `${API}?action=export_csv&event_id=${encodeURIComponent(currentEventId)}&filename=leadsnap-${slug}.csv`,
      `leadsnap-${slug}.csv`
    );
  });
  document.getElementById("exportVcfBtn").addEventListener("click", () => {
    if (!requireEvent() || !requireOnlineExport()) return;
    const slug = slugify(currentEvent()?.name);
    downloadFrom(
      `${API}?action=export_vcf&event_id=${encodeURIComponent(currentEventId)}&filename=leadsnap-${slug}.vcf`,
      `leadsnap-${slug}.vcf`
    );
  });
  document.getElementById("exportJsonBtn").addEventListener("click", () => {
    if (!requireEvent()) return;
    const slug = slugify(currentEvent()?.name);
    const blob = new Blob([JSON.stringify(contacts, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    downloadFrom(url, `leadsnap-${slug}-backup.json`);
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  document.getElementById("clearAllBtn").addEventListener("click", async () => {
    if (!requireEvent()) return;
    if (!confirm(t("export.confirmClearAll", { name: currentEvent()?.name }))) return;
    try {
      await DB.clearByEventId("contacts", currentEventId);
      await queueChange("contact", "clear_all", { event_id: currentEventId });
      await refreshContacts();
    } catch (err) {
      alert(t("common.error", { msg: err.message }));
    }
  });

  // ---- Events (Messen) ----

  function formatDateRange(ev) {
    const parts = [];
    if (ev.start_date) parts.push(ev.start_date);
    if (ev.end_date && ev.end_date !== ev.start_date) parts.push(ev.end_date);
    const range = parts.join(" – ");
    return [ev.location, range].filter(Boolean).join(" · ");
  }

  function renderEventList() {
    const list = document.getElementById("eventList");
    list.innerHTML = "";
    if (events.length === 0) {
      const li = document.createElement("li");
      li.className = "empty-state";
      li.textContent = t("events.none");
      list.appendChild(li);
      return;
    }
    events.forEach((ev) => {
      const li = document.createElement("li");
      li.className = "event-card" + (ev.id === currentEventId ? " active" : "") + (ev.archived ? " archived" : "");
      const meta = formatDateRange(ev);
      li.innerHTML = `
        <div class="event-card-body">
          <div class="event-card-name">${escapeHtml(ev.name)}</div>
          ${meta ? `<div class="event-card-meta">${escapeHtml(meta)}</div>` : ""}
        </div>
        ${ev.id === currentEventId ? `<span class="active-badge">${t("events.active")}</span>` : ""}
        <div class="event-card-actions">
          <button type="button" data-act="edit" title="${t("events.edit")}">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
          </button>
          <button type="button" data-act="archive" title="${ev.archived ? t("events.reactivate") : t("events.archive")}">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/></svg>
          </button>
          <button type="button" data-act="delete" title="${t("events.delete")}">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>
          </button>
        </div>
      `;
      li.querySelector(".event-card-body").addEventListener("click", async () => {
        setCurrentEvent(ev.id);
        await refreshContacts();
        renderEventList();
        showView("listView");
        syncNow();
      });
      li.querySelector('[data-act="edit"]').addEventListener("click", (e) => {
        e.stopPropagation();
        openEventForm(ev);
      });
      li.querySelector('[data-act="archive"]').addEventListener("click", async (e) => {
        e.stopPropagation();
        const updated = { ...ev, archived: !ev.archived };
        try {
          await DB.put("events", updated);
          await queueChange("event", "update", updated);
          await refreshEvents();
        } catch (err) {
          alert(t("common.error", { msg: err.message }));
        }
      });
      li.querySelector('[data-act="delete"]').addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(t("events.confirmDelete", { name: ev.name }))) return;
        try {
          await DB.del("events", ev.id);
          await DB.clearByEventId("contacts", ev.id);
          await queueChange("event", "delete", { id: ev.id });
          await refreshEvents();
          if (currentEventId === ev.id || !currentEventId) {
            await refreshContacts();
          }
        } catch (err) {
          alert(t("common.error", { msg: err.message }));
        }
      });
      list.appendChild(li);
    });
  }

  function openEventForm(ev = null) {
    editingEventId = ev ? ev.id : null;
    document.getElementById("eventForm").classList.remove("hidden");
    document.getElementById("ev_name").value = ev ? ev.name : "";
    document.getElementById("ev_location").value = ev ? ev.location || "" : "";
    document.getElementById("ev_start").value = ev ? ev.start_date || "" : "";
    document.getElementById("ev_end").value = ev ? ev.end_date || "" : "";
    document.getElementById("ev_name").focus();
  }

  function closeEventForm() {
    editingEventId = null;
    document.getElementById("eventForm").classList.add("hidden");
    document.getElementById("eventForm").reset();
  }

  document.getElementById("addEventBtn").addEventListener("click", () => openEventForm());
  document.getElementById("eventFormCancelBtn").addEventListener("click", closeEventForm);

  document.getElementById("eventForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("ev_name").value.trim();
    if (!name) return;
    const isNew = !editingEventId;
    const record = {
      id: editingEventId || uuid(),
      name,
      location: document.getElementById("ev_location").value.trim(),
      start_date: document.getElementById("ev_start").value,
      end_date: document.getElementById("ev_end").value,
      archived: false,
      created_at: isNew ? new Date().toISOString() : (events.find((e) => e.id === editingEventId)?.created_at || new Date().toISOString()),
    };
    try {
      await DB.put("events", record);
      await queueChange("event", isNew ? "create" : "update", record);
      closeEventForm();
      await refreshEvents();
      if (isNew) {
        setCurrentEvent(record.id);
        await refreshContacts();
      }
    } catch (err) {
      alert(t("events.saveFailed", { msg: err.message }));
    }
  });

  document.getElementById("eventSwitcher").addEventListener("click", () => {
    renderEventList();
    showView("eventView");
  });
  document.getElementById("eventCloseBtn").addEventListener("click", () => {
    closeEventForm();
    showView("listView");
  });
  document.getElementById("noEventCreateBtn").addEventListener("click", () => {
    renderEventList();
    showView("eventView");
    openEventForm();
  });

  // ---- Navigation ----

  document.getElementById("fabAdd").addEventListener("click", () => openForm());

  document.querySelectorAll(".navbtn").forEach((btn) => {
    btn.addEventListener("click", () => {
      showView(btn.dataset.view);
      if (btn.dataset.view === "adminView") loadAdminStats();
    });
  });

  // ---- Admin backend tab ----

  const ADMIN_API = "cgi-bin/admin.py";

  async function loadAdminStats() {
    try {
      const res = await fetch(`${ADMIN_API}?action=stats`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(terr(data.error) || t("err.apiGeneric", { status: res.status }));
      }
      renderAdminStats(data);
    } catch (err) {
      alert(t("admin.loadFailed", { msg: err.message }));
    }
  }

  function renderAdminStats(data) {
    document.getElementById("statTenants").textContent = data.totals.tenants;
    document.getElementById("statUsers").textContent = data.totals.users;
    document.getElementById("statEvents").textContent = data.totals.events;
    document.getElementById("statContacts").textContent = data.totals.contacts;

    const list = document.getElementById("adminTenantList");
    list.innerHTML = "";
    data.tenants.forEach((tn) => {
      const li = document.createElement("li");
      li.className = "event-card";
      const created = tn.created_at ? new Date(tn.created_at).toLocaleDateString() : "";
      li.innerHTML = `
        <div class="event-card-body">
          <div class="event-card-name">${escapeHtml(tn.name)}</div>
          <div class="admin-tenant-meta">
            <span>${t("admin.users")}: ${tn.user_count}</span>
            <span>${t("admin.events")}: ${tn.event_count}</span>
            <span>${t("admin.contacts")}: ${tn.contact_count}</span>
            ${created ? `<span>${t("admin.createdAt", { date: created })}</span>` : ""}
          </div>
        </div>
      `;
      list.appendChild(li);
    });
  }

  document.getElementById("adminRefreshBtn").addEventListener("click", loadAdminStats);

  document.getElementById("searchBox").addEventListener("input", (e) => {
    renderList(e.target.value);
  });

  // ---- Auth / multi-tenancy ----

  async function authApi(action, options = {}) {
    return fetch(`${AUTH_API}?action=${action}`, options);
  }

  async function fetchSession() {
    // Distinguish "server said no" from "couldn't reach the server" - offline
    // must NOT log the rep out, or the app would be unusable without a
    // network connection despite everything being cached locally.
    try {
      const res = await authApi("me");
      if (res.status === 401) return { ok: false, reason: "unauthenticated" };
      if (!res.ok) return { ok: false, reason: "error" };
      const data = await res.json();
      return data.ok ? data : { ok: false, reason: "error" };
    } catch (err) {
      return { ok: false, reason: "network" };
    }
  }

  function showAuth() {
    document.getElementById("authView").classList.remove("hidden");
    document.getElementById("appShell").classList.add("hidden");
  }

  function showApp() {
    document.getElementById("authView").classList.add("hidden");
    document.getElementById("appShell").classList.remove("hidden");
  }

  async function resetLocalTenantScopeIfNeeded(tenantId) {
    const stored = localStorage.getItem(TENANT_KEY);
    if (stored && stored !== tenantId) {
      await DB.wipeAll();
      localStorage.removeItem(CURRENT_EVENT_KEY);
      currentEventId = "";
      events = [];
      contacts = [];
    }
    localStorage.setItem(TENANT_KEY, tenantId);
  }

  async function startApp(session) {
    sessionExpiredShown = false;
    lastSession = session;
    localStorage.setItem(LAST_SESSION_KEY, JSON.stringify({
      email: session.email, tenant_id: session.tenant_id, tenant_name: session.tenant_name,
      is_admin: !!session.is_admin,
    }));
    document.getElementById("accountHint").textContent =
      t("export.accountHint", { email: session.email, tenant: session.tenant_name });
    document.getElementById("adminNavBtn").classList.toggle("hidden", !session.is_admin);
    await resetLocalTenantScopeIfNeeded(session.tenant_id);
    showApp();
    await refreshEvents();
    await refreshContacts();
    await updateSyncBar();
    syncNow();
  }

  document.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const which = tab.dataset.tab;
      document.getElementById("loginForm").classList.toggle("hidden", which !== "login");
      document.getElementById("registerForm").classList.toggle("hidden", which !== "register");
    });
  });

  function showAuthError(elId, message) {
    const el = document.getElementById(elId);
    el.textContent = message;
    el.classList.remove("hidden");
  }

  document.getElementById("loginForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    document.getElementById("loginError").classList.add("hidden");
    const email = document.getElementById("login_email").value.trim();
    const password = document.getElementById("login_password").value;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await authApi("login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(terr(data.error) || t("err.apiGeneric", { status: res.status }));
      const session = await fetchSession();
      if (session && session.ok) await startApp(session);
    } catch (err) {
      showAuthError("loginError", err.message);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("registerForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    document.getElementById("registerError").classList.add("hidden");
    const email = document.getElementById("register_email").value.trim();
    const password = document.getElementById("register_password").value;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      const res = await authApi("register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) throw new Error(terr(data.error) || t("err.apiGeneric", { status: res.status }));
      const session = await fetchSession();
      if (session && session.ok) await startApp(session);
    } catch (err) {
      showAuthError("registerError", err.message);
    } finally {
      btn.disabled = false;
    }
  });

  document.getElementById("logoutBtn").addEventListener("click", async () => {
    if (!confirm(t("export.confirmLogout"))) return;
    try {
      await authApi("logout", { method: "POST" });
    } catch (err) {
      // ignore network errors on logout - still clear local state below
    }
    await DB.wipeAll();
    localStorage.removeItem(CURRENT_EVENT_KEY);
    localStorage.removeItem(TENANT_KEY);
    localStorage.removeItem(LAST_SESSION_KEY);
    currentEventId = "";
    events = [];
    contacts = [];
    showAuth();
  });

  // ---- Language switcher ----

  I18N.applyStatic();

  document.querySelectorAll(".lang-toggle").forEach((btn) => {
    btn.addEventListener("click", () => I18N.toggle());
  });

  I18N.onChange(async () => {
    updateEventUi();
    renderList(document.getElementById("searchBox").value);
    renderEventList();
    await updateSyncBar();
    if (lastSession) {
      document.getElementById("accountHint").textContent =
        t("export.accountHint", { email: lastSession.email, tenant: lastSession.tenant_name });
    }
    if (currentDetailId && !views.detailView.classList.contains("hidden")) {
      openDetail(currentDetailId);
    }
  });

  // ---- Init ----
  (async () => {
    const session = await fetchSession();
    if (session.ok) {
      await startApp(session);
      return;
    }
    if (session.reason === "network") {
      // Offline on launch: trust the last known session rather than locking
      // the rep out of their already-synced local data.
      const cached = localStorage.getItem(LAST_SESSION_KEY);
      if (cached) {
        await startApp(JSON.parse(cached));
        return;
      }
    } else {
      localStorage.removeItem(LAST_SESSION_KEY);
    }
    showAuth();
  })();
})();
