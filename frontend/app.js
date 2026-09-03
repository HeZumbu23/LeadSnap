(() => {
  "use strict";

  const API = "cgi-bin/contacts.py";
  const EXTRACT_API = "cgi-bin/extract_card.py";

  const views = {
    listView: document.getElementById("listView"),
    formView: document.getElementById("formView"),
    detailView: document.getElementById("detailView"),
    exportView: document.getElementById("exportView"),
  };

  let contacts = [];
  let editingId = null;
  let currentPhoto = "";
  let currentDetailId = null;

  function showView(name) {
    Object.entries(views).forEach(([key, el]) => el.classList.toggle("hidden", key !== name));
    document.querySelectorAll(".navbtn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.view === name);
    });
  }

  async function api(action, options = {}) {
    const res = await fetch(`${API}?action=${action}`, options);
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`API-Fehler (${res.status}): ${text}`);
    }
    return res.json();
  }

  async function loadContacts() {
    try {
      const data = await api("list");
      contacts = data.contacts || [];
    } catch (e) {
      console.error(e);
      alert("Kontakte konnten nicht geladen werden: " + e.message);
      contacts = [];
    }
    renderList();
  }

  function priorityFlag(p) {
    if (p === "hoch") return "🔥";
    if (p === "niedrig") return "🔽";
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
        : `<div class="card-thumb-placeholder">👤</div>`;

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
      setExtractStatus("error", "Automatische Erkennung fehlgeschlagen – bitte manuell eingeben.");
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
    const payload = {
      id: editingId || undefined,
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

  document.getElementById("exportCsvBtn").addEventListener("click", () => {
    downloadFrom(`${API}?action=export_csv`, "leadsnap-kontakte.csv");
  });
  document.getElementById("exportVcfBtn").addEventListener("click", () => {
    downloadFrom(`${API}?action=export_vcf`, "leadsnap-kontakte.vcf");
  });
  document.getElementById("exportJsonBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(contacts, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    downloadFrom(url, "leadsnap-backup.json");
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  document.getElementById("clearAllBtn").addEventListener("click", async () => {
    if (!confirm("Wirklich ALLE Kontakte unwiderruflich löschen?")) return;
    try {
      await api("clear_all", { method: "POST" });
      await loadContacts();
    } catch (err) {
      alert("Fehler: " + err.message);
    }
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
  loadContacts();
})();
