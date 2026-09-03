(() => {
  "use strict";

  const API = "cgi-bin/contacts.py";
  const EVENTS_API = "cgi-bin/events.py";
  const EXTRACT_API = "cgi-bin/extract_card.py";
  const CURRENT_EVENT_KEY = "leadsnap_current_event_id";

  const views = {
    listView: document.getElementById("listView"),
    formView: document.getElementById("formView"),
    detailView: document.getElementById("detailView"),
    exportView: document.getElementById("exportView"),
    eventView: document.getElementById("eventView"),
  };

  let contacts = [];
  let events = [];
  let currentEventId = localStorage.getItem(CURRENT_EVENT_KEY) || "";
  let editingId = null;
  let editingEventId = null;
  let currentPhoto = "";
  let currentDetailId = null;

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
    const name = ev ? ev.name : "Messe wählen";
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

  async function api(action, options = {}, extraQuery = "") {
    const res = await fetch(`${API}?action=${action}${extraQuery}`, options);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API-Fehler (${res.status}): ${text}`);
    }
    return res.json();
  }

  async function eventsApi(action, options = {}) {
    const res = await fetch(`${EVENTS_API}?action=${action}`, options);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API-Fehler (${res.status}): ${text}`);
    }
    return res.json();
  }

  async function loadEvents() {
    try {
      const data = await eventsApi("list");
      events = data.events || [];
    } catch (e) {
      console.error(e);
      alert("Messen konnten nicht geladen werden: " + e.message);
      events = [];
    }
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

  async function loadContacts() {
    if (!currentEventId) {
      contacts = [];
      renderList();
      return;
    }
    try {
      const data = await api("list", {}, `&event_id=${encodeURIComponent(currentEventId)}`);
      contacts = data.contacts || [];
    } catch (e) {
      console.error(e);
      alert("Kontakte konnten nicht geladen werden: " + e.message);
      contacts = [];
    }
    renderList();
  }

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
      return [c.name, c.company, c.topic, c.notes]
        .join(" ")
        .toLowerCase()
        .includes(q);
    });

    document.getElementById("contactCount").textContent = `${contacts.length} Kontakt${contacts.length === 1 ? "" : "e"}`;

    list.innerHTML = "";
    if (filtered.length === 0) {
      empty.classList.toggle("hidden", contacts.length !== 0);
      if (contacts.length !== 0 && q) {
        const li = document.createElement("li");
        li.className = "empty-state";
        li.textContent = "Keine Treffer für: " + filter;
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

  // ---- Form (add / edit) ----

  function resetForm() {
    editingId = null;
    currentPhoto = "";
    document.getElementById("contactForm").reset();
    document.getElementById("photoPreview").classList.add("hidden");
    document.getElementById("photoPreview").src = "";
    document.getElementById("photoPlaceholder").classList.remove("hidden");
    document.getElementById("retakeBtn").classList.add("hidden");
    document.getElementById("photoInput").value = "";
  }

  function openForm(contact = null) {
    resetForm();
    if (contact) {
      editingId = contact.id;
      currentPhoto = contact.photo || "";
      document.getElementById("f_name").value = contact.name || "";
      document.getElementById("f_company").value = contact.company || "";
      document.getElementById("f_position").value = contact.position || "";
      document.getElementById("f_phone").value = contact.phone || "";
      document.getElementById("f_email").value = contact.email || "";
      document.getElementById("f_topic").value = contact.topic || "";
      document.getElementById("f_notes").value = contact.notes || "";
      document.getElementById("f_priority").value = contact.priority || "normal";
      if (currentPhoto) {
        document.getElementById("photoPreview").src = currentPhoto;
        document.getElementById("photoPreview").classList.remove("hidden");
        document.getElementById("photoPlaceholder").classList.add("hidden");
        document.getElementById("retakeBtn").classList.remove("hidden");
      }
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
    setExtractStatus("loading", "Visitenkarte wird per KI ausgelesen…");
    try {
      const res = await fetch(`${EXTRACT_API}?action=extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photo: photoDataUrl }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const f = data.fields || {};
      fillIfEmpty("f_name", f.name);
      fillIfEmpty("f_company", f.company);
      fillIfEmpty("f_position", f.position);
      fillIfEmpty("f_phone", f.phone);
      fillIfEmpty("f_email", f.email);
      setExtractStatus("success", "Daten erkannt – bitte prüfen.");
      setTimeout(clearExtractStatus, 4000);
    } catch (err) {
      console.error(err);
      setExtractStatus(
        "error",
        `Automatische Erkennung fehlgeschlagen (${err.message}) – bitte manuell eingeben.`
      );
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
      extractCardData(currentPhoto);
    } catch (err) {
      alert("Foto konnte nicht verarbeitet werden.");
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
      alert("Bitte zuerst eine Messe auswählen.");
      return;
    }
    const payload = {
      id: editingId || undefined,
      event_id: currentEventId,
      name: document.getElementById("f_name").value.trim(),
      company: document.getElementById("f_company").value.trim(),
      position: document.getElementById("f_position").value.trim(),
      phone: document.getElementById("f_phone").value.trim(),
      email: document.getElementById("f_email").value.trim(),
      topic: document.getElementById("f_topic").value.trim(),
      notes: document.getElementById("f_notes").value.trim(),
      priority: document.getElementById("f_priority").value,
      photo: currentPhoto,
    };
    if (!payload.name) {
      alert("Bitte mindestens einen Namen eingeben.");
      return;
    }
    const submitBtn = e.target.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    try {
      await api("save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      await loadContacts();
      showView("listView");
    } catch (err) {
      alert("Speichern fehlgeschlagen: " + err.message);
    } finally {
      submitBtn.disabled = false;
    }
  });

  // ---- Detail ----

  function openDetail(id) {
    const c = contacts.find((x) => x.id === id);
    if (!c) return;
    currentDetailId = id;
    const el = document.getElementById("detailContent");
    const created = c.created_at ? new Date(c.created_at).toLocaleString() : "";
    el.innerHTML = `
      ${c.photo ? `<img src="${c.photo}" alt="">` : ""}
      <div class="detail-row"><span class="k">Name</span><span>${escapeHtml(c.name)} ${priorityFlag(c.priority)}</span></div>
      ${c.company ? `<div class="detail-row"><span class="k">Firma</span><span>${escapeHtml(c.company)}</span></div>` : ""}
      ${c.position ? `<div class="detail-row"><span class="k">Position</span><span>${escapeHtml(c.position)}</span></div>` : ""}
      ${c.phone ? `<div class="detail-row"><span class="k">Telefon</span><span><a href="tel:${escapeHtml(c.phone)}">${escapeHtml(c.phone)}</a></span></div>` : ""}
      ${c.email ? `<div class="detail-row"><span class="k">E-Mail</span><span><a href="mailto:${escapeHtml(c.email)}">${escapeHtml(c.email)}</a></span></div>` : ""}
      ${c.topic ? `<div class="detail-row"><span class="k">Thema</span><span>${escapeHtml(c.topic)}</span></div>` : ""}
      ${created ? `<div class="detail-row"><span class="k">Erfasst</span><span>${created}</span></div>` : ""}
      ${c.notes ? `<div class="detail-notes">${escapeHtml(c.notes)}</div>` : ""}
    `;
    showView("detailView");
  }

  document.getElementById("detailEditBtn").addEventListener("click", () => {
    const c = contacts.find((x) => x.id === currentDetailId);
    if (c) openForm(c);
  });

  document.getElementById("detailDeleteBtn").addEventListener("click", async () => {
    if (!confirm("Diesen Kontakt wirklich löschen?")) return;
    try {
      await api("delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: currentDetailId }),
      });
      await loadContacts();
      showView("listView");
    } catch (err) {
      alert("Löschen fehlgeschlagen: " + err.message);
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
      alert("Bitte zuerst eine Messe auswählen.");
      return false;
    }
    return true;
  }

  document.getElementById("exportCsvBtn").addEventListener("click", () => {
    if (!requireEvent()) return;
    const slug = slugify(currentEvent()?.name);
    downloadFrom(
      `${API}?action=export_csv&event_id=${encodeURIComponent(currentEventId)}&filename=leadsnap-${slug}.csv`,
      `leadsnap-${slug}.csv`
    );
  });
  document.getElementById("exportVcfBtn").addEventListener("click", () => {
    if (!requireEvent()) return;
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
    if (!confirm(`Wirklich ALLE Kontakte von "${currentEvent()?.name}" unwiderruflich löschen?`)) return;
    try {
      await api("clear_all", { method: "POST" }, `&event_id=${encodeURIComponent(currentEventId)}`);
      await loadContacts();
    } catch (err) {
      alert("Fehler: " + err.message);
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
      li.textContent = "Noch keine Messe angelegt.";
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
        ${ev.id === currentEventId ? '<span class="active-badge">Aktiv</span>' : ""}
        <div class="event-card-actions">
          <button type="button" data-act="edit" title="Bearbeiten">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
          </button>
          <button type="button" data-act="archive" title="${ev.archived ? "Reaktivieren" : "Archivieren"}">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v9a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9M10 13h4"/></svg>
          </button>
          <button type="button" data-act="delete" title="Löschen">
            <svg class="icon icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></svg>
          </button>
        </div>
      `;
      li.querySelector(".event-card-body").addEventListener("click", () => {
        setCurrentEvent(ev.id);
        loadContacts();
        renderEventList();
        showView("listView");
      });
      li.querySelector('[data-act="edit"]').addEventListener("click", (e) => {
        e.stopPropagation();
        openEventForm(ev);
      });
      li.querySelector('[data-act="archive"]').addEventListener("click", async (e) => {
        e.stopPropagation();
        try {
          await eventsApi("update", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...ev, archived: !ev.archived }),
          });
          await loadEvents();
        } catch (err) {
          alert("Fehler: " + err.message);
        }
      });
      li.querySelector('[data-act="delete"]').addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!confirm(`"${ev.name}" inklusive aller zugehörigen Kontakte wirklich löschen?`)) return;
        try {
          await eventsApi("delete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id: ev.id }),
          });
          await loadEvents();
          if (currentEventId === ev.id || !currentEventId) {
            await loadContacts();
          }
        } catch (err) {
          alert("Fehler: " + err.message);
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
    const payload = {
      id: editingEventId || undefined,
      name,
      location: document.getElementById("ev_location").value.trim(),
      start_date: document.getElementById("ev_start").value,
      end_date: document.getElementById("ev_end").value,
    };
    try {
      const action = editingEventId ? "update" : "create";
      const body = editingEventId ? { ...payload, archived: false } : payload;
      const result = await eventsApi(action, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      closeEventForm();
      await loadEvents();
      if (!editingEventId && result.id) {
        setCurrentEvent(result.id);
        await loadContacts();
      }
    } catch (err) {
      alert("Speichern fehlgeschlagen: " + err.message);
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
    btn.addEventListener("click", () => showView(btn.dataset.view));
  });

  document.getElementById("searchBox").addEventListener("input", (e) => {
    renderList(e.target.value);
  });

  // ---- Init ----
  (async () => {
    await loadEvents();
    await loadContacts();
  })();
})();
