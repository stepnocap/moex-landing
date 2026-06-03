/* MOEX OTC smart-form demo.
   Loads a mock ProcessResponse, animates "recognition", renders the prefilled
   form with confidence-based highlighting, and shows validation errors.
   Field highlight logic mirrors proto/README.md. */

(() => {
  "use strict";

  const CONFIDENCE_THRESHOLD = 0.7;

  // The form layout lives in the catalog (assets/catalog.js), not here.
  // ML only decides whether a value is filled — composition/order/block/label/type
  // are properties of the field. 55 participant fields across 6 real ЛК blocks.
  const CATALOG = window.MOEX_CATALOG || { BLOCK_ORDER: [], FIELDS: {}, REFERENCE_OPTIONS: {} };
  const FIELDS = CATALOG.FIELDS;
  const BLOCK_ORDER = CATALOG.BLOCK_ORDER;

  // Codes grouped by block, preserving catalog insertion order within each block.
  const FIELDS_BY_BLOCK = (() => {
    const by = {};
    BLOCK_ORDER.forEach((b) => { by[b] = []; });
    Object.keys(FIELDS).forEach((code) => {
      const b = FIELDS[code].block;
      (by[b] || (by[b] = [])).push(code);
    });
    return by;
  })();

  function meta(code) { return FIELDS[code] || { label: code, block: "", kind: "text", required: false, placeholder: "—" }; }
  function isRequired(code) { return meta(code).required === true; }

  // Reference field → its demo options, or null if no dictionary is wired yet
  // (then it degrades to a free-text input — real справочники замещают это позже).
  function resolveOptions(code) {
    const opts = CATALOG.REFERENCE_OPTIONS[code];
    return Array.isArray(opts) && opts.length ? opts : null;
  }

  // DELIVERY_COUNTRY_NAME is required only because the doc marks export=Да.
  const REQUIRED_OVERRIDES = { DELIVERY_COUNTRY_NAME: true };

  const $ = (id) => document.getElementById(id);
  const stateEls = {
    drop: $("demo-drop"),
    proc: $("demo-proc"),
    form: $("demo-form"),
    done: $("demo-done"),
  };

  let mock = null;

  function show(name) {
    Object.entries(stateEls).forEach(([k, el]) => el.classList.toggle("hidden", k !== name));
  }

  async function loadMock() {
    if (mock) return mock;
    try {
      const res = await fetch("assets/mock-response.json");
      mock = await res.json();
    } catch (e) {
      console.error("Failed to load mock-response.json", e);
      mock = { fields: {}, validationErrors: [] };
    }
    return mock;
  }

  function boolText(v) { return v === "true" ? "Да" : v === "false" ? "Нет" : v; }

  // Returns one of: ok | warn | err | muted
  function fieldState(code, fv) {
    const required = isRequired(code) || REQUIRED_OVERRIDES[code] || false;
    if (!fv || fv.value === undefined || fv.value === "") {
      return required ? "err" : "muted";
    }
    if (meta(code).kind === "reference" && fv.referenceMatched === false) return "warn";
    return fv.confidence >= CONFIDENCE_THRESHOLD ? "ok" : "warn";
  }

  function tagFor(state, code, fv) {
    if (state === "ok") return { cls: "f-ok", tag: "распознано" };
    if (state === "warn") {
      const unmatched = fv && meta(code).kind === "reference" && fv.referenceMatched === false;
      return { cls: "f-warn", tag: unmatched ? "нет в справочнике" : "проверьте" };
    }
    if (state === "err") return { cls: "f-err", tag: "обязательное" };
    return { cls: "f-muted", tag: "не найдено" };
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function renderField(code, fv) {
    const m = meta(code);
    const label = m.label;
    const state = fieldState(code, fv);
    const { cls, tag } = tagFor(state, code, fv);
    const value = fv && fv.value !== undefined ? fv.value : "";
    const ph = m.placeholder || "—";
    const fieldId = "fld_" + code;

    let control;
    if (m.kind === "bool") {
      const opts = ["", "true", "false"]
        .map((v) => `<option value="${v}" ${v === value ? "selected" : ""}>${v === "" ? "—" : boolText(v)}</option>`)
        .join("");
      control = `<select id="${fieldId}" data-code="${code}" class="w-full bg-transparent text-[14px] font-medium text-moex-ink outline-none cursor-pointer">${opts}</select>`;
    } else if (m.kind === "reference" && resolveOptions(code)) {
      // Dictionary wired → select. No dictionary yet → falls through to free-text.
      const set = new Set(resolveOptions(code));
      if (value) set.add(value);
      const opts = ['<option value="">—</option>']
        .concat([...set].map((o) => `<option value="${escapeAttr(o)}" ${o === value ? "selected" : ""}>${escapeAttr(o)}</option>`))
        .join("");
      control = `<select id="${fieldId}" data-code="${code}" class="w-full bg-transparent text-[14px] font-medium text-moex-ink outline-none cursor-pointer">${opts}</select>`;
    } else {
      control = `<input id="${fieldId}" data-code="${code}" type="text" value="${escapeAttr(value)}" placeholder="${escapeAttr(ph)}"
        class="w-full bg-transparent text-[14px] font-medium text-moex-ink outline-none placeholder:text-moex-mute/55 placeholder:font-normal" />`;
    }

    return `
      <div class="f-field ${cls} rounded-xl border px-3.5 py-2.5 transition-shadow" data-field="${code}">
        <div class="flex items-center justify-between gap-2 mb-1">
          <label for="${fieldId}" class="text-[11.5px] font-medium text-moex-mute leading-tight">${label}</label>
          <span class="f-tag text-[10px] font-semibold rounded px-1.5 py-0.5 whitespace-nowrap">${tag}</span>
        </div>
        ${control}
      </div>`;
  }

  // Visibility border for progressive disclosure (concept B+C):
  // a field is shown up-front iff it has a value OR is required. Empty optional
  // fields are tucked under a per-block "показать все поля (ещё N)" toggle so a
  // field ML missed is never lost — just out of sight until expanded.
  function isVisibleUpFront(code, fv) {
    const hasValue = fv && fv.value !== undefined && fv.value !== "";
    return hasValue || isRequired(code) || REQUIRED_OVERRIDES[code] === true;
  }

  function renderForm(data) {
    const groupsEl = $("formGroups");

    // B — self-layout: walk the catalog's 6 blocks; a block draws only if the
    //     catalog assigns fields to it. The form is a function of the catalog,
    //     never of the ML payload.
    groupsEl.innerHTML = BLOCK_ORDER.map((block, bi) => {
      const codes = FIELDS_BY_BLOCK[block] || [];
      if (!codes.length) return "";

      const shown = codes.filter((c) => isVisibleUpFront(c, data.fields[c]));
      const hidden = codes.filter((c) => !isVisibleUpFront(c, data.fields[c]));
      const blockEmpty = shown.length === 0; // no value, nothing required → collapsed

      const shownCells = shown.map((c) => renderField(c, data.fields[c])).join("");
      const hiddenCells = hidden.map((c) => renderField(c, data.fields[c])).join("");

      const hiddenWrap = hidden.length
        ? `<div class="block-extra ${blockEmpty ? "" : "hidden"} grid sm:grid-cols-2 gap-3 ${blockEmpty ? "" : "mt-3"}" data-extra="${bi}">${hiddenCells}</div>`
        : "";

      // Per-block toggle. For a collapsed (fully empty) block it reads "заполнить",
      // otherwise "показать все поля (ещё N)".
      const toggle = hidden.length
        ? `<button type="button" class="block-toggle mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-moex-mute hover:text-moex-red transition-colors" data-toggle="${bi}" aria-expanded="${blockEmpty}">
             <svg class="chev shrink-0 ${blockEmpty ? "open" : ""}" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>
             <span class="toggle-label">${blockEmpty ? `Заполнить (${hidden.length})` : `Показать все поля (ещё ${hidden.length})`}</span>
           </button>`
        : "";

      const grid = shown.length
        ? `<div class="grid sm:grid-cols-2 gap-3">${shownCells}</div>`
        : "";

      return `
        <fieldset data-block="${bi}">
          <legend class="font-display font-semibold text-[14px] text-moex-ink mb-3 flex items-center gap-2">
            <span class="h-3.5 w-1 rounded-full ${blockEmpty ? "bg-moex-line" : "bg-moex-red"}"></span>${block}
            ${blockEmpty ? '<span class="text-[11.5px] font-normal text-moex-mute">— нет данных</span>' : ""}
          </legend>
          ${grid}${hiddenWrap}${toggle}
        </fieldset>`;
    }).join("");

    // Initial validation is computed live so it matches what the user can fix.
    renderValidation(computeErrors());
  }

  function renderValidation(errors) {
    const box = $("validationBox");
    if (!errors.length) { box.innerHTML = ""; return; }

    const items = errors.map((e) => {
      const isErr = e.severity === "SEVERITY_ERROR";
      const palette = isErr
        ? "border-[#f3b9bb] bg-[#FFFBFB]"
        : "border-[#ecd79a] bg-[#FFFDF6]";
      const iconColor = isErr ? "#A80016" : "#B5820A";
      const badge = isErr
        ? '<span class="text-[10px] font-bold uppercase tracking-wide text-moex-red-dark bg-moex-red-soft rounded px-1.5 py-0.5">Ошибка</span>'
        : '<span class="text-[10px] font-bold uppercase tracking-wide text-warn bg-warn-soft rounded px-1.5 py-0.5">Внимание</span>';
      const related = [e.field, ...(e.relatedFields || [])].filter(Boolean);
      return `
        <li class="rounded-xl border ${palette} px-4 py-3 flex items-start gap-3 cursor-pointer hover:shadow-card transition-shadow"
            data-related="${related.join(",")}">
          <svg class="mt-0.5 shrink-0" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="${iconColor}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
          <div>
            <div class="flex items-center gap-2 mb-0.5">${badge}<span class="text-[12px] text-moex-mute">${e.ruleCode || ""}</span></div>
            <p class="text-[13.5px] leading-snug text-moex-ink/85">${e.message}</p>
          </div>
        </li>`;
    }).join("");

    const errCount = errors.filter((e) => e.severity === "SEVERITY_ERROR").length;
    box.innerHTML = `
      <div class="rounded-2xl border border-moex-line bg-moex-mist/50 p-4 sm:p-5">
        <p class="font-display font-semibold text-[14px] mb-3 flex items-center gap-2">
          Проверка договора
          <span class="text-[12px] font-medium text-moex-mute">${errCount} ${plural(errCount, "ошибка", "ошибки", "ошибок")}, ${errors.length - errCount} ${plural(errors.length - errCount, "предупреждение", "предупреждения", "предупреждений")}</span>
        </p>
        <ul class="space-y-2.5">${items}</ul>
        <p class="text-[12px] text-moex-mute mt-3">Нажмите на сообщение, чтобы подсветить связанные поля.</p>
      </div>`;

    // Click an error → flash related fields.
    box.querySelectorAll("[data-related]").forEach((li) => {
      li.addEventListener("click", () => {
        const codes = li.getAttribute("data-related").split(",").filter(Boolean);
        codes.forEach((code) => {
          const el = document.querySelector(`[data-field="${code}"]`);
          if (!el) return;
          el.classList.add("f-flash");
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          setTimeout(() => el.classList.remove("f-flash"), 1400);
        });
      });
    });
  }

  function plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
    return many;
  }

  // ── Live validation ───────────────────────────────────
  // Reads the current value of a field from the rendered control (falls back to mock).
  function currentValue(code) {
    const el = document.getElementById("fld_" + code);
    if (el) return el.value;
    return mock && mock.fields[code] ? mock.fields[code].value : "";
  }

  // Re-evaluates the subset of MOEX rules the demo can check against live values.
  // Mirrors proto/docs/validation-rules.md; clears as the user fixes the inputs.
  function computeErrors() {
    const errs = [];
    const exportFlag = currentValue("IS_EXPORT_DELIVERY_FLAG");
    const country = currentValue("DELIVERY_COUNTRY_NAME");
    const basis = currentValue("DELIVERY_TYPE_NAME");
    const method = currentValue("DELIVERY_METHOD_NAME");
    const inn = currentValue("MANUFACTURER_INN");

    if (exportFlag === "true" && !country) {
      errs.push({
        field: "IS_EXPORT_DELIVERY_FLAG",
        message: "Признак экспорта «Да», но страна назначения не заполнена. Укажите страну назначения товара.",
        severity: "SEVERITY_ERROR", ruleCode: "RULE_EXPORT_COUNTRY_REQUIRED",
        relatedFields: ["DELIVERY_COUNTRY_NAME"],
      });
    }
    if (["FOB", "CIF", "CFR"].includes(basis) && method && method !== "Водный транспорт") {
      errs.push({
        field: "DELIVERY_TYPE_NAME",
        message: `Базис ${basis} предполагает только водный транспорт. Указан «${method}» — проверьте способ поставки.`,
        severity: "SEVERITY_ERROR", ruleCode: "RULE_FOB_WATER_ONLY",
        relatedFields: ["DELIVERY_METHOD_NAME"],
      });
    }
    if (!inn) {
      errs.push({
        field: "MANUFACTURER_INN",
        message: "ИНН производителя рекомендуется заполнять для исключения дублей договоров.",
        severity: "SEVERITY_WARNING", ruleCode: "RULE_MANUFACTURER_INN_RECOMMENDED",
        relatedFields: [],
      });
    }
    return errs;
  }

  // ── Flow ──────────────────────────────────────────────
  async function startDemo(fileName) {
    const data = await loadMock();
    show("proc");
    $("procFile").textContent = fileName || data.fileName || "Договор.pdf";

    const steps = ["Распознаём документ…", "Извлекаем поля…", "Сверяем со справочниками…", "Проверяем правила биржи…"];
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const stepMs = reduce ? 120 : 650;

    for (let i = 0; i < steps.length; i++) {
      $("procText").textContent = steps[i];
      // eslint-disable-next-line no-await-in-loop
      await wait(stepMs);
    }

    renderForm(data);
    show("form");
  }

  function wait(ms) { return new Promise((r) => setTimeout(r, ms)); }

  function submit() {
    // Block on unresolved required-empty fields and live ERROR-severity rules.
    const errFields = document.querySelectorAll(".f-field.f-err");
    const hardErrors = computeErrors().filter((e) => e.severity === "SEVERITY_ERROR");

    if (errFields.length || hardErrors.length) {
      // Flash everything that blocks submission.
      const codes = new Set();
      errFields.forEach((el) => codes.add(el.getAttribute("data-field")));
      hardErrors.forEach((e) => [e.field, ...(e.relatedFields || [])].forEach((c) => c && codes.add(c)));
      let first = null;
      codes.forEach((code) => {
        const el = document.querySelector(`[data-field="${code}"]`);
        if (!el) return;
        if (!first) first = el;
        el.classList.add("f-flash");
        setTimeout(() => el.classList.remove("f-flash"), 1600);
      });
      if (first) first.scrollIntoView({ behavior: "smooth", block: "center" });
      const btn = $("submitForm");
      btn.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-5px)" }, { transform: "translateX(5px)" }, { transform: "translateX(0)" }],
        { duration: 280 }
      );
      return;
    }
    show("done");
    stateEls.done.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function reset() { show("drop"); }

  // ── Wire up ──────────────────────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    const dz = $("dropzone");
    const fileInput = $("fileInput");

    $("useExample").addEventListener("click", (e) => { e.stopPropagation(); startDemo(); });

    dz.addEventListener("click", () => fileInput.click());
    dz.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener("change", () => {
      const f = fileInput.files[0];
      startDemo(f ? f.name : undefined);
    });
    ["dragover", "dragenter"].forEach((ev) =>
      dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("border-moex-red/60", "bg-moex-red-soft/40"); })
    );
    ["dragleave", "drop"].forEach((ev) =>
      dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove("border-moex-red/60", "bg-moex-red-soft/40"); })
    );
    dz.addEventListener("drop", (e) => {
      const f = e.dataTransfer && e.dataTransfer.files[0];
      startDemo(f ? f.name : undefined);
    });

    $("resetDemo").addEventListener("click", reset);
    $("restartDemo").addEventListener("click", reset);
    $("submitForm").addEventListener("click", submit);

    // Re-evaluate a field's highlight + live validation after manual edits.
    const onEdit = (e) => {
      const code = e.target.getAttribute && e.target.getAttribute("data-code");
      if (!code) return;
      const wrap = e.target.closest("[data-field]");
      const val = e.target.value;
      wrap.classList.remove("f-ok", "f-warn", "f-err", "f-muted");
      const required = isRequired(code) || REQUIRED_OVERRIDES[code] || false;
      const cls = !val ? (required ? "f-err" : "f-muted") : "f-ok";
      wrap.classList.add(cls);
      const tagEl = wrap.querySelector(".f-tag");
      if (tagEl) tagEl.textContent = !val ? (required ? "обязательное" : "не найдено") : "изменено вручную";
      // Recompute cross-field rules so errors clear as the user fixes inputs.
      renderValidation(computeErrors());
    };
    $("formGroups").addEventListener("input", onEdit);
    $("formGroups").addEventListener("change", onEdit);

    // Per-block progressive disclosure: reveal a block's empty optional fields.
    $("formGroups").addEventListener("click", (e) => {
      const btn = e.target.closest(".block-toggle");
      if (!btn) return;
      const bi = btn.getAttribute("data-toggle");
      const extra = document.querySelector(`.block-extra[data-extra="${bi}"]`);
      if (!extra) return;
      const opening = extra.classList.contains("hidden");
      extra.classList.toggle("hidden");
      extra.classList.toggle("mt-3", opening);
      btn.setAttribute("aria-expanded", String(opening));
      const chev = btn.querySelector(".chev");
      if (chev) chev.classList.toggle("open", opening);
      const lbl = btn.querySelector(".toggle-label");
      if (lbl) {
        const n = extra.children.length;
        lbl.textContent = opening ? "Свернуть пустые поля" : `Показать все поля (ещё ${n})`;
      }
    });

    // Scroll reveal for [data-io] elements. Gate the hiding CSS on JS being ready
    // so the content is never stuck invisible if scripts fail to run.
    document.documentElement.classList.add("js-io");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }),
      { threshold: 0.12 }
    );
    document.querySelectorAll("[data-io]").forEach((el) => io.observe(el));
  });
})();
