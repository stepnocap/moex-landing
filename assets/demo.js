/* MOEX OTC smart-form demo.
   Loads a mock ProcessResponse, animates "recognition", renders the prefilled
   form, and shows validation errors. A field is highlighted by what we can
   verify objectively — справочник match + cross-field rules — never by a model
   self-confidence score (which is unreliable and was removed). */

(() => {
  "use strict";

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
  // No model-confidence is used: a filled field is "ok" by default; it only turns
  // "warn" for something we can check objectively — a reference value missing from
  // the справочник. Cross-field rule conflicts repaint warn/err later (applyFieldRules).
  function fieldState(code, fv) {
    const required = isRequired(code) || REQUIRED_OVERRIDES[code] || false;
    if (!fv || fv.value === undefined || fv.value === "") {
      return required ? "err" : "muted";
    }
    if (meta(code).kind === "reference" && fv.referenceMatched === false) return "warn";
    return "ok";
  }

  function tagFor(state) {
    // Base state only ("warn" here = reference value not in справочник; cross-field
    // rule warnings are applied separately and don't change this tag).
    if (state === "ok") return { cls: "f-ok", tag: "распознано" };
    if (state === "warn") return { cls: "f-warn", tag: "нет в справочнике" };
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
    const { cls, tag } = tagFor(state);
    const value = fv && fv.value !== undefined ? fv.value : "";
    const ph = m.placeholder || "—";
    const fieldId = "fld_" + code;

    let control;
    if (m.kind === "bool") {
      const opts = ["", "true", "false"]
        .map((v) => `<option value="${v}" ${v === value ? "selected" : ""}>${v === "" ? "—" : boolText(v)}</option>`)
        .join("");
      control = `<select id="${fieldId}" data-code="${code}" class="w-full bg-transparent text-[14px] font-medium text-moex-ink outline-none cursor-pointer">${opts}</select>`;
    } else if (m.kind === "reference" && m.searchable) {
      // Large registry (organisations, goods, RF subjects, country, port) → type-to-search
      // combobox: an <input list> filters a <datalist> as you type, and still accepts a
      // free value. The demo datalist is REFERENCE_OPTIONS; a real /lookup endpoint
      // replaces it later (swap how <datalist> is populated, control stays the same).
      const listId = fieldId + "_list";
      const datalist = `<datalist id="${listId}">${
        (resolveOptions(code) || []).map((o) => `<option value="${escapeAttr(o)}"></option>`).join("")
      }</datalist>`;
      control = `<input id="${fieldId}" data-code="${code}" type="text" list="${listId}" value="${escapeAttr(value)}" placeholder="${escapeAttr(ph)}"
        class="w-full bg-transparent text-[14px] font-medium text-moex-ink outline-none placeholder:text-moex-mute/55 placeholder:font-normal" />${datalist}`;
    } else if (m.kind === "reference" && resolveOptions(code)) {
      // Short dictionary wired → select. No dictionary yet → falls through to free-text.
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

    // Static helper: a rule/condition that must stay visible while typing
    // (placeholder disappears on input — these constraints must not).
    const helper = m.helper
      ? `<p class="f-help text-[11px] leading-snug text-moex-mute/90 mt-1.5">${m.helper}</p>`
      : "";

    // Explainer for the yellow "нет в справочнике" state: the value WAS recognised
    // from the document but didn't exactly match the exchange registry, so the user
    // should pick from the list / verify. Shown only for that state; cleared on edit.
    const refMsg = state === "warn"
      ? `<p class="f-refmsg flex items-start gap-1.5 text-[11px] leading-snug text-warn mt-1.5">
           <svg class="mt-px shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#B5820A" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>
           <span>Значение распознано, но не найдено в реестре биржи — выберите из списка или проверьте написание.</span>
         </p>`
      : "";

    // Optional image popover next to the label (e.g. Incoterms schema on the
    // "Условия поставки" field). Opens on hover/focus of the "?" trigger — the
    // image lives in the field's catalog meta (m.popover.image).
    const info = m.popover
      ? `<span class="info-pop ml-1 align-middle">
           <button type="button" class="info-btn" aria-label="Подсказка: ${escapeAttr(m.popover.alt || label)}" aria-haspopup="dialog">?</button>
           <span class="info-panel" role="dialog">
             <img src="${escapeAttr(m.popover.image)}" alt="${escapeAttr(m.popover.alt || "")}" loading="lazy" />
             ${m.popover.caption ? `<p>${escapeAttr(m.popover.caption)}</p>` : ""}
           </span>
         </span>`
      : "";

    return `
      <div class="f-field ${cls} rounded-xl border px-3.5 py-2.5 transition-shadow" data-field="${code}">
        <div class="flex items-center justify-between gap-2 mb-1">
          <label for="${fieldId}" class="text-[11.5px] font-medium text-moex-mute leading-tight">${label}${info}</label>
          <span class="f-tag text-[10px] font-semibold rounded px-1.5 py-0.5 whitespace-nowrap">${tag}</span>
        </div>
        ${control}
        ${helper}
        ${refMsg}
        <p class="f-warnmsg hidden items-start gap-1.5 text-[11px] leading-snug text-warn mt-1.5"></p>
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
    revalidate();
  }

  // Single source for re-running rules: updates BOTH the per-field paint and the
  // summary box from one computeErrors() pass so they can never disagree.
  function revalidate() {
    const errors = computeErrors();
    applyFieldRules(errors);
    renderValidation(errors);
    syncSubmitState();
  }

  // The user must explicitly confirm they reviewed the prefilled fields before
  // submitting (human-in-the-loop). The submit button is disabled until the
  // "Я проверил поля" checkbox is ticked; hard errors are still enforced in submit().
  function isReviewed() {
    const cb = $("reviewedCheck");
    return !!(cb && cb.checked);
  }
  function syncSubmitState() {
    const btn = $("submitForm");
    if (!btn) return;
    const blocked = !isReviewed();
    btn.disabled = blocked;
    btn.setAttribute("aria-disabled", String(blocked));
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
  // Mirrors proto/docs/validation-rules.md + сотрудники МБ «Типовые ошибки …».
  // Each rule names a primary `field` and `relatedFields`; both the summary box and
  // the per-field highlight read from this one list, so they never diverge.
  // severity: SEVERITY_ERROR (red, blocks submit) | SEVERITY_WARNING (yellow, «перепроверьте»).
  function computeErrors() {
    const errs = [];
    const exportFlag = currentValue("IS_EXPORT_DELIVERY_FLAG");
    const country = currentValue("DELIVERY_COUNTRY_NAME");
    const terms = currentValue("DELIVERY_TYPE_NAME");      // условия поставки (Incoterms)
    const basisType = currentValue("BASIS_TYPE_NAME");      // тип базиса поставки
    const method = currentValue("DELIVERY_METHOD_NAME");    // способ поставки
    const inn = currentValue("MANUFACTURER_INN");
    const nds = currentValue("IS_PRICE_NDS");
    const transInPrice = currentValue("IS_PRICE_TRANSPORTATION_COSTS");
    const amount = toNum(currentValue("AMOUNT"));
    const price = toNum(currentValue("PRICE"));
    const basisPrice = toNum(currentValue("PRODUCT_BASIS_PRICE"));
    const waterTerms = ["FAS", "FOB", "CFR", "CIF"]; // Incoterms 2020 «вода»: требуют водного транспорта

    // ── HARD ERRORS (red, block submission) ───────────────────────────────
    // Export=Да требует страну назначения.
    if (exportFlag === "true" && !country) {
      errs.push({
        field: "IS_EXPORT_DELIVERY_FLAG",
        message: "Признак экспорта «Да», но страна назначения не заполнена. Укажите страну назначения товара.",
        severity: "SEVERITY_ERROR", ruleCode: "RULE_EXPORT_COUNTRY_REQUIRED",
        relatedFields: ["DELIVERY_COUNTRY_NAME"],
      });
    }
    // Цена к базису не может превышать цену за тонну (комментарий, который у МБ «не работал»).
    if (basisPrice !== null && price !== null && basisPrice > price) {
      errs.push({
        field: "PRODUCT_BASIS_PRICE",
        message: "Цена, приведённая к базису, превышает цену товара за тонну. Она должна быть меньше или равна цене договора.",
        severity: "SEVERITY_ERROR", ruleCode: "RULE_BASIS_PRICE_LE_PRICE",
        relatedFields: ["PRICE"],
      });
    }

    // ── SOFT WARNINGS (yellow, «перепроверьте», не блокируют) ──────────────
    // Зарубежная страна указана, но экспорт = Нет (кейс «Египет + экспорт Нет»).
    if (exportFlag === "false" && country) {
      errs.push({
        field: "IS_EXPORT_DELIVERY_FLAG",
        message: `Указана страна назначения «${country}», но признак экспорта — «Нет». Перепроверьте.`,
        severity: "SEVERITY_WARNING", ruleCode: "RULE_EXPORT_COUNTRY_MISMATCH",
        relatedFields: ["DELIVERY_COUNTRY_NAME"],
      });
    }
    // Условия поставки FOB/CIF/CFR → способ поставки только водный.
    if (waterTerms.includes(terms) && method && method !== "Водный транспорт") {
      errs.push({
        field: "DELIVERY_TYPE_NAME",
        message: `При условиях поставки ${terms} способ поставки — только водный транспорт. Указан «${method}» — перепроверьте.`,
        severity: "SEVERITY_WARNING", ruleCode: "RULE_TERMS_WATER_ONLY",
        relatedFields: ["DELIVERY_METHOD_NAME"],
      });
    }
    // Тип базиса «Порт» → обычно водный транспорт.
    if (basisType === "Порт" && method && method !== "Водный транспорт") {
      errs.push({
        field: "BASIS_TYPE_NAME",
        message: `Для базиса «Порт» обычно используется водный транспорт. Указан «${method}» — перепроверьте.`,
        severity: "SEVERITY_WARNING", ruleCode: "RULE_PORT_BASIS_WATER",
        relatedFields: ["DELIVERY_METHOD_NAME"],
      });
    }
    // Аномальный объём — признак сомнительной сделки (< 1 т или > 100 000 т).
    if (amount !== null && (amount < 1 || amount > 100000)) {
      errs.push({
        field: "AMOUNT",
        message: "Нетипичное количество товара (менее 1 т или более 100 000 т) — перепроверьте значение.",
        severity: "SEVERITY_WARNING", ruleCode: "RULE_AMOUNT_RANGE",
        relatedFields: [],
      });
    }
    // При экспорте цена обычно без НДС.
    if (exportFlag === "true" && nds === "true") {
      errs.push({
        field: "IS_PRICE_NDS",
        message: "При поставке на экспорт цена обычно указывается без НДС. Перепроверьте.",
        severity: "SEVERITY_WARNING", ruleCode: "RULE_EXPORT_NDS",
        relatedFields: ["IS_EXPORT_DELIVERY_FLAG"],
      });
    }
    // CIF/CFR → цена обычно включает транспортировку (масличные).
    if (["CIF", "CFR"].includes(terms) && transInPrice === "false") {
      errs.push({
        field: "IS_PRICE_TRANSPORTATION_COSTS",
        message: `При условиях поставки ${terms} цена обычно включает затраты на транспортировку. Перепроверьте.`,
        severity: "SEVERITY_WARNING", ruleCode: "RULE_CIF_TRANSPORT_INCLUDED",
        relatedFields: ["DELIVERY_TYPE_NAME"],
      });
    }
    // ИНН производителя рекомендуется (исключает дубли).
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

  function toNum(v) {
    if (v === undefined || v === null || String(v).trim() === "") return null;
    const n = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }

  // Map the rule list onto each field: a field gets the first message that names it
  // (as primary `field`), preferring an ERROR over a WARNING. Drives per-field paint.
  function fieldRuleMap(errors) {
    const map = {};
    errors.forEach((e) => {
      const sev = e.severity === "SEVERITY_ERROR" ? "err" : "warn";
      const cur = map[e.field];
      if (!cur || (cur.sev === "warn" && sev === "err")) {
        map[e.field] = { sev, message: e.message };
      }
    });
    return map;
  }

  // Repaint every field's cross-field state (yellow warning border + message under
  // it, or red for a hard error) without re-rendering the whole form. The base
  // classes (set at render / on manual edit from справочник match + required state)
  // are preserved when a field has no active rule. Called after every recompute.
  function applyFieldRules(errors) {
    const map = fieldRuleMap(errors);
    document.querySelectorAll("#formGroups [data-field]").forEach((wrap) => {
      const code = wrap.getAttribute("data-field");
      const rule = map[code];
      const msgEl = wrap.querySelector(".f-warnmsg");
      // A required-empty field keeps its own red "обязательное" state — don't override.
      const isRequiredEmpty = wrap.classList.contains("f-err") && !rule;
      wrap.classList.remove("f-rule-warn", "f-rule-err");
      if (rule && !isRequiredEmpty) {
        wrap.classList.add(rule.sev === "err" ? "f-rule-err" : "f-rule-warn");
        if (msgEl) {
          // Icon + text: colour is never the sole signal (a11y).
          const stroke = rule.sev === "err" ? "#A80016" : "#B5820A";
          msgEl.innerHTML =
            `<svg class="mt-px shrink-0" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/></svg>` +
            `<span>${escapeAttr(rule.message)}</span>`;
          msgEl.classList.remove("hidden");
          msgEl.classList.add("flex");
          msgEl.classList.toggle("text-warn", rule.sev === "warn");
          msgEl.classList.toggle("text-moex-red-dark", rule.sev === "err");
        }
      } else if (msgEl) {
        msgEl.innerHTML = "";
        msgEl.classList.add("hidden");
        msgEl.classList.remove("flex");
      }
    });
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
    // Guard: button is disabled until reviewed, but enforce here too (defence in depth).
    if (!isReviewed()) {
      const row = $("reviewedRow");
      if (row) {
        row.scrollIntoView({ behavior: "smooth", block: "center" });
        row.animate(
          [{ transform: "translateX(0)" }, { transform: "translateX(-4px)" }, { transform: "translateX(4px)" }, { transform: "translateX(0)" }],
          { duration: 260 }
        );
      }
      return;
    }
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

  function reset() {
    const cb = $("reviewedCheck");
    if (cb) cb.checked = false;
    syncSubmitState();
    show("drop");
  }

  // Mark a field as filled-in by the form (autofill): set its base highlight + tag.
  // Used by the CIF/CFR → «цена включает транспортировку = Да» автозаполнение that
  // сотрудники МБ просили (избавляет от типовой ошибки на масличных).
  function paintAutofilled(code) {
    const wrap = document.querySelector(`[data-field="${code}"]`);
    if (!wrap) return;
    wrap.classList.remove("f-err", "f-muted", "f-warn");
    wrap.classList.add("f-ok");
    const tagEl = wrap.querySelector(".f-tag");
    if (tagEl) tagEl.textContent = "заполнено автоматически";
  }

  // Re-evaluate a field's highlight + live validation after manual edits.
  function onEdit(e) {
    const code = e.target.getAttribute && e.target.getAttribute("data-code");
    if (!code) return;
    const wrap = e.target.closest("[data-field]");
    const val = e.target.value;

    // Autofill: choosing CIF/CFR implies the price includes transport — preset it
    // to «Да» (user can still override afterwards). Only nudge if not already «Да».
    if (code === "DELIVERY_TYPE_NAME" && (val === "CIF" || val === "CFR")) {
      const tEl = document.getElementById("fld_IS_PRICE_TRANSPORTATION_COSTS");
      if (tEl && tEl.value !== "true") {
        tEl.value = "true";
        paintAutofilled("IS_PRICE_TRANSPORTATION_COSTS");
      }
    }

    wrap.classList.remove("f-ok", "f-warn", "f-err", "f-muted");
    const required = isRequired(code) || REQUIRED_OVERRIDES[code] || false;
    const cls = !val ? (required ? "f-err" : "f-muted") : "f-ok";
    wrap.classList.add(cls);
    const tagEl = wrap.querySelector(".f-tag");
    if (tagEl) tagEl.textContent = !val ? (required ? "обязательное" : "не найдено") : "изменено вручную";
    // The "нет в справочнике" explainer is no longer relevant once the user edits.
    const refMsgEl = wrap.querySelector(".f-refmsg");
    if (refMsgEl) refMsgEl.remove();
    // Recompute cross-field rules so per-field warnings + summary clear as the
    // user fixes inputs (single pass repaints fields and the summary box).
    revalidate();
  }

  function onToggleBlock(e) {
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
  }

  // Wire the form's interactive behaviour (edit→revalidate, autofill, block
  // toggle, submit, reviewed-gate). Page-agnostic: the same #formGroups /
  // #submitForm / #reviewedCheck IDs exist on both the mock page and the live
  // page, so both reuse this — no duplicated edit/validation logic.
  function wireFormInteractions() {
    const groups = $("formGroups");
    if (groups) {
      groups.addEventListener("input", onEdit);
      groups.addEventListener("change", onEdit);
      groups.addEventListener("click", onToggleBlock);
    }
    const submitBtn = $("submitForm");
    if (submitBtn) submitBtn.addEventListener("click", submit);
    const reviewed = $("reviewedCheck");
    if (reviewed) reviewed.addEventListener("change", syncSubmitState);
    const resetBtn = $("resetDemo");
    if (resetBtn) resetBtn.addEventListener("click", reset);
    const restartBtn = $("restartDemo");
    if (restartBtn) restartBtn.addEventListener("click", reset);
  }

  // Scroll-reveal for [data-io] sections (used on both pages). Gates the hiding
  // CSS on JS being ready so content is never stuck invisible if scripts fail.
  function wireScrollReveal() {
    document.documentElement.classList.add("js-io");
    const io = new IntersectionObserver(
      (entries) => entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } }),
      { threshold: 0.12 }
    );
    document.querySelectorAll("[data-io]").forEach((el) => io.observe(el));
  }

  // ── Live-mode hook ───────────────────────────────────
  // The mock demo above is self-contained. The live page (live.html + live.js)
  // reuses this exact machinery instead of duplicating it: renderForm builds the
  // form, wireFormInteractions gives identical edit/validation/autofill/submit,
  // wireScrollReveal animates the page. The mock path never depends on the hook.
  window.MOEX_DEMO = { renderForm, show, wireFormInteractions, wireScrollReveal, revalidate };

  // ── Wire up (mock page only) ─────────────────────────
  document.addEventListener("DOMContentLoaded", () => {
    // The mock wiring is keyed off the mock-only "Показать на примере" button,
    // which the live page doesn't have. On the live page live.js calls the
    // exposed wireFormInteractions/wireScrollReveal itself.
    const exampleBtn = $("useExample");
    if (!exampleBtn) return;
    const dz = $("dropzone");
    const fileInput = $("fileInput");

    exampleBtn.addEventListener("click", (e) => { e.stopPropagation(); startDemo(); });

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

    wireFormInteractions();
    wireScrollReveal();
  });
})();
