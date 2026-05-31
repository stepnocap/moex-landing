/* MOEX OTC smart-form demo.
   Loads a mock ProcessResponse, animates "recognition", renders the prefilled
   form with confidence-based highlighting, and shows validation errors.
   Field highlight logic mirrors proto/README.md. */

(() => {
  "use strict";

  const CONFIDENCE_THRESHOLD = 0.7;

  // User-facing labels for the field codes we surface (служебные скрыты).
  const LABELS = {
    CONTRACT_NUMBER: "Номер договора",
    CONTRACT_DATE: "Дата договора",
    DELIVERY_DATE: "Срок поставки",
    AGREEMENT_NUMBER: "Номер доп. соглашения",
    PRODUCT_TYPE_NAME: "Наименование товара",
    AMOUNT: "Количество, т",
    PRICE: "Цена, ₽/т",
    HARVEST_YEAR: "Год урожая",
    IS_PRICE_NDS: "Цена включает НДС",
    MANUFACTURER_NAME: "Производитель",
    MANUFACTURER_INN: "ИНН производителя",
    PURCHASER_NAME: "Приобретатель",
    PURCHASER_INN: "ИНН приобретателя",
    DELIVERY_TYPE_NAME: "Тип базиса поставки",
    DELIVERY_METHOD_NAME: "Способ поставки",
    DELIVERY_RF_SUBJECT_NAME: "Субъект РФ (базис)",
    DELIVERY_ADDRESS: "Адрес базиса поставки",
    IS_EXPORT_DELIVERY_FLAG: "Поставка на экспорт",
    DELIVERY_COUNTRY_NAME: "Страна назначения",
  };

  // Reference-field options (for select rendering).
  const REFERENCE_OPTIONS = {
    PRODUCT_TYPE_NAME: ["Пшеница", "Ячмень", "Кукуруза", "Подсолнечник", "Соя"],
    MANUFACTURER_NAME: ["ООО «Агрохолдинг Юг»", "АО «Кубань-Агро»", "ООО «Дон-Зерно»"],
    PURCHASER_NAME: ["АО «Зерно Экспорт»", "ООО «Грейн Трейд»", "ПАО «АгроЭкспорт»"],
    DELIVERY_TYPE_NAME: ["FOB", "CIF", "CFR", "EXW", "DAP"],
    DELIVERY_METHOD_NAME: ["Водный транспорт", "Автомобильный транспорт", "Железнодорожный транспорт"],
    DELIVERY_RF_SUBJECT_NAME: ["Краснодарский край", "Ростовская область", "Ставропольский край", "Воронежская область"],
    DELIVERY_COUNTRY_NAME: ["Турция", "Египет", "Иран", "Саудовская Аравия", "Китай"],
  };

  const BOOL_FIELDS = new Set(["IS_PRICE_NDS", "IS_EXPORT_DELIVERY_FLAG"]);

  // Field groups (user-facing subset of the 92 fields).
  const GROUPS = [
    { title: "Договор", fields: ["CONTRACT_NUMBER", "CONTRACT_DATE", "DELIVERY_DATE", "AGREEMENT_NUMBER"] },
    { title: "Товар", fields: ["PRODUCT_TYPE_NAME", "AMOUNT", "PRICE", "HARVEST_YEAR", "IS_PRICE_NDS"] },
    { title: "Стороны", fields: ["MANUFACTURER_NAME", "MANUFACTURER_INN", "PURCHASER_NAME", "PURCHASER_INN"] },
    { title: "Поставка", fields: ["DELIVERY_TYPE_NAME", "DELIVERY_METHOD_NAME", "DELIVERY_RF_SUBJECT_NAME", "DELIVERY_ADDRESS"] },
    { title: "Экспорт", fields: ["IS_EXPORT_DELIVERY_FLAG", "DELIVERY_COUNTRY_NAME"] },
  ];

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
    const required = (fv && fv.required) || REQUIRED_OVERRIDES[code] || false;
    if (!fv || fv.value === undefined || fv.value === "") {
      return required ? "err" : "muted";
    }
    if (fv.kind === "FIELD_KIND_REFERENCE" && fv.referenceMatched === false) return "warn";
    return fv.confidence >= CONFIDENCE_THRESHOLD ? "ok" : "warn";
  }

  function tagFor(state, fv) {
    if (state === "ok") return { cls: "f-ok", tag: "распознано" };
    if (state === "warn") {
      const matched = fv && fv.kind === "FIELD_KIND_REFERENCE" && fv.referenceMatched === false;
      return { cls: "f-warn", tag: matched ? "нет в справочнике" : "проверьте" };
    }
    if (state === "err") return { cls: "f-err", tag: "обязательное" };
    return { cls: "f-muted", tag: "не найдено" };
  }

  function escapeAttr(s) {
    return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  }

  function renderField(code, fv) {
    const label = LABELS[code] || code;
    const state = fieldState(code, fv);
    const { cls, tag } = tagFor(state, fv);
    const value = fv && fv.value !== undefined ? fv.value : "";
    const isRef = REFERENCE_OPTIONS[code];
    const fieldId = "fld_" + code;

    let control;
    if (BOOL_FIELDS.has(code)) {
      const opts = ["", "true", "false"]
        .map((v) => `<option value="${v}" ${v === value ? "selected" : ""}>${v === "" ? "—" : boolText(v)}</option>`)
        .join("");
      control = `<select id="${fieldId}" data-code="${code}" class="w-full bg-transparent text-[14px] font-medium text-moex-ink outline-none cursor-pointer">${opts}</select>`;
    } else if (isRef) {
      const set = new Set(REFERENCE_OPTIONS[code]);
      if (value) set.add(value);
      const opts = ['<option value="">—</option>']
        .concat([...set].map((o) => `<option value="${escapeAttr(o)}" ${o === value ? "selected" : ""}>${escapeAttr(o)}</option>`))
        .join("");
      control = `<select id="${fieldId}" data-code="${code}" class="w-full bg-transparent text-[14px] font-medium text-moex-ink outline-none cursor-pointer">${opts}</select>`;
    } else {
      control = `<input id="${fieldId}" data-code="${code}" type="text" value="${escapeAttr(value)}" placeholder="—"
        class="w-full bg-transparent text-[14px] font-medium text-moex-ink outline-none placeholder:text-moex-mute/60" />`;
    }

    return `
      <div class="f-field ${cls} rounded-xl border px-3.5 py-2.5 transition-shadow" data-field="${code}">
        <div class="flex items-center justify-between gap-2 mb-1">
          <label for="${fieldId}" class="text-[11.5px] font-medium text-moex-mute">${label}</label>
          <span class="f-tag text-[10px] font-semibold rounded px-1.5 py-0.5 whitespace-nowrap">${tag}</span>
        </div>
        ${control}
      </div>`;
  }

  function renderForm(data) {
    const groupsEl = $("formGroups");
    groupsEl.innerHTML = GROUPS.map((g) => {
      const cells = g.fields.map((code) => renderField(code, data.fields[code])).join("");
      return `
        <fieldset>
          <legend class="font-display font-semibold text-[14px] text-moex-ink mb-3 flex items-center gap-2">
            <span class="h-3.5 w-1 rounded-full bg-moex-red"></span>${g.title}
          </legend>
          <div class="grid sm:grid-cols-2 gap-3">${cells}</div>
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
      const required = (mock.fields[code] && mock.fields[code].required) || REQUIRED_OVERRIDES[code] || false;
      const cls = !val ? (required ? "f-err" : "f-muted") : "f-ok";
      wrap.classList.add(cls);
      const tagEl = wrap.querySelector(".f-tag");
      if (tagEl) tagEl.textContent = !val ? (required ? "обязательное" : "не найдено") : "изменено вручную";
      // Recompute cross-field rules so errors clear as the user fixes inputs.
      renderValidation(computeErrors());
    };
    $("formGroups").addEventListener("input", onEdit);
    $("formGroups").addEventListener("change", onEdit);

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
