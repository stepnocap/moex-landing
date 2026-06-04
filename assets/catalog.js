/* MOEX OTC form catalog — single source of truth for the smart form.
   55 participant-facing fields across the 6 real Личный кабинет blocks, transcribed
   1-to-1 from "Поля формы.xlsx" (filled_by = participant). System fields are NOT here.

   Key principle (Концепция вывода полей формы.txt): the form layout is a property of
   the FIELDS, not of the ML response. ML only decides whether a value is filled in.

   Field shape:  { label, block, kind, required, searchable?, placeholder, helper? }
     kind: "text" | "date" | "bool" | "reference"
     searchable  — for reference fields backed by a LARGE registry (organisations,
                   goods, RF subjects, country, port). Renders a type-to-search combobox
                   (input + datalist), NOT a <select>: the registry has thousands of
                   entries, you find by typing, not by scrolling a dropdown. Short
                   dictionaries (currency, basis type, delivery method, Incoterms) stay
                   a plain <select>. The demo filters REFERENCE_OPTIONS; wire a real
                   /lookup endpoint later by replacing the datalist source.
     placeholder — short FORMAT/example shown inside the input; disappears on typing.
     helper      — short RULE/condition shown UNDER the field, ALWAYS visible. Holds the
                   constraints МБ сотрудники просили не терять при вводе («включая НДС»,
                   «≤ цены договора», «только для пшеницы»). Optional — omit if none.
   For bool fields the placeholder is not rendered (they become a Да/Нет <select>), so
   no placeholder text is kept for them by decision.
   FIELDS keep insertion order = order inside their block (stable, mirrors the catalog).

   REFERENCE_OPTIONS holds demo dictionaries for the reference fields that need them.
   Real справочники are wired in later — see resolveOptions() in demo.js: a reference
   field with no options here gracefully degrades to a free-text input. */

(() => {
  "use strict";

  // 6 real blocks of the ЛК form, in display order.
  const BLOCK_ORDER = [
    "1. Данные заявителя",
    "2. Основные условия поставки",
    "3. Договор и доп. соглашения",
    "4. Место производства товара",
    "5. Место отгрузки товара",
    "6. Дополнительные параметры",
  ];

  // 55 participant fields. Order here = order within each block (= catalog row order).
  const FIELDS = {
    // ── 1. Данные заявителя (7) ────────────────────────────────────────────────
    IS_EXPORT_DELIVERY_FLAG: { label: "Признак поставки на экспорт", block: "1. Данные заявителя", kind: "bool", required: true, placeholder: "" },
    MANUFACTURER_NAME:       { label: "Наименование производителя товара", block: "1. Данные заявителя", kind: "reference", required: true, searchable: true, placeholder: "Начните вводить — найдём в реестре", helper: "Поиск по реестру участников биржи" },
    MANUFACTURER_INN:        { label: "ИНН производителя товара", block: "1. Данные заявителя", kind: "text", required: false, placeholder: "Например: 1234567890", helper: "Рекомендуется заполнить — исключает дубли организаций" },
    PURCHASER_NAME:          { label: "Наименование приобретателя товара", block: "1. Данные заявителя", kind: "reference", required: true, searchable: true, placeholder: "Начните вводить — найдём в реестре", helper: "Поиск по реестру участников биржи" },
    PURCHASER_INN:           { label: "ИНН приобретателя товара", block: "1. Данные заявителя", kind: "text", required: true, placeholder: "Например: 1234567890" },
    ORGANIZATION_NAME:       { label: "Наименование лица, заключившего договор", block: "1. Данные заявителя", kind: "reference", required: true, searchable: true, placeholder: "Начните вводить — найдём в реестре", helper: "Поиск по реестру участников биржи" },
    ORGANIZATION_INN:        { label: "ИНН лица, заключившего договор", block: "1. Данные заявителя", kind: "text", required: false, placeholder: "Например: 1234567890" },

    // ── 2. Основные условия поставки (6) ───────────────────────────────────────
    DELIVERY_TYPE_NAME:       { label: "Условия поставки товара", block: "2. Основные условия поставки", kind: "reference", required: true, placeholder: "Выберите условия по Incoterms 2020", helper: "По Incoterms 2020. Связано со способом поставки" },
    BASIS_TYPE_NAME:          { label: "Тип базиса поставки", block: "2. Основные условия поставки", kind: "reference", required: true, placeholder: "Выберите из предложенного списка" },
    PORT_NAME:                { label: "Наименование порта", block: "2. Основные условия поставки", kind: "reference", required: false, searchable: true, placeholder: "Начните вводить название порта", helper: "Для базиса FOB / CPT / DAP. Поиск по справочнику портов" },
    DELIVERY_ZIP_CODE:        { label: "Индекс (базис поставки)", block: "2. Основные условия поставки", kind: "text", required: false, placeholder: "Например: 140923" },
    DELIVERY_RF_SUBJECT_NAME: { label: "Субъект РФ (базис поставки)", block: "2. Основные условия поставки", kind: "reference", required: false, searchable: true, placeholder: "Начните вводить субъект РФ" },
    DELIVERY_ADDRESS:         { label: "Наименование и адрес базиса поставки", block: "2. Основные условия поставки", kind: "text", required: false, placeholder: "Например: г. Ростов-на-Дону, ул. Селекционная, 7" },

    // ── 3. Договор и доп. соглашения (13) ──────────────────────────────────────
    CONTRACT_NUMBER:        { label: "Номер внебиржевого договора", block: "3. Договор и доп. соглашения", kind: "text", required: true, placeholder: "Например: К102234/23 11" },
    CONTRACT_DATE:          { label: "Дата заключения договора", block: "3. Договор и доп. соглашения", kind: "date", required: true, placeholder: "ДД.ММ.ГГГГ" },
    CONTRACT_START_DATE:    { label: "Дата начала действия договора", block: "3. Договор и доп. соглашения", kind: "date", required: false, placeholder: "ДД.ММ.ГГГГ" },
    DELIVERY_DATE:          { label: "Срок исполнения", block: "3. Договор и доп. соглашения", kind: "date", required: true, placeholder: "ДД.ММ.ГГГГ" },
    PRODUCT_TYPE_NAME:      { label: "Наименование товара", block: "3. Договор и доп. соглашения", kind: "reference", required: true, searchable: true, placeholder: "Начните вводить наименование товара", helper: "Поиск по справочнику товаров биржи" },
    AMOUNT:                 { label: "Количество товара", block: "3. Договор и доп. соглашения", kind: "text", required: true, placeholder: "Например: 67.325", helper: "В тоннах" },
    PRICE:                  { label: "Цена за тонну, включая налоги и сборы", block: "3. Договор и доп. соглашения", kind: "text", required: true, placeholder: "Например: 8300.50", helper: "В валюте договора, с учётом налогов и сборов" },
    CURRENCY_NAME:          { label: "Валюта цены договора", block: "3. Договор и доп. соглашения", kind: "reference", required: true, placeholder: "Выберите валюту договора (например: Российский рубль)" },
    PRICE_DETERMINING_DATE: { label: "Дата определения цены товара", block: "3. Договор и доп. соглашения", kind: "date", required: false, placeholder: "ДД.ММ.ГГГГ" },
    AGREEMENT_NUMBER:       { label: "Номер дополнительного соглашения", block: "3. Договор и доп. соглашения", kind: "text", required: false, placeholder: "Например: К102234/23 11" },
    AGREEMENT_DATE:         { label: "Дата заключения доп. соглашения", block: "3. Договор и доп. соглашения", kind: "date", required: false, placeholder: "ДД.ММ.ГГГГ" },
    AGREEMENT_START_DATE:   { label: "Дата начала действия доп. соглашения", block: "3. Договор и доп. соглашения", kind: "date", required: false, placeholder: "ДД.ММ.ГГГГ" },

    // ── 4. Место производства товара (4) ───────────────────────────────────────
    PRODUCTION_PLACE_TYPE:        { label: "Тип места производства товара", block: "4. Место производства товара", kind: "text", required: false, placeholder: "Например: завод, элеватор" },
    MANUFACTURER_ZIP_CODE:        { label: "Индекс (место производства)", block: "4. Место производства товара", kind: "text", required: false, placeholder: "Например: 140923" },
    MANUFACTURER_RF_SUBJECT_NAME: { label: "Субъект РФ (место производства)", block: "4. Место производства товара", kind: "reference", required: false, searchable: true, placeholder: "Начните вводить субъект РФ" },
    MANUFACTURER_ADDRESS:         { label: "Наименование и адрес места производства", block: "4. Место производства товара", kind: "text", required: false, placeholder: "Например: г. Ростов-на-Дону, ул. Селекционная, 7" },

    // ── 5. Место отгрузки товара (4) ───────────────────────────────────────────
    SHIPMENT_PLACE_TYPE:        { label: "Тип места отгрузки товара", block: "5. Место отгрузки товара", kind: "text", required: false, placeholder: "Например: склад, элеватор" },
    SHIPMENT_ZIP_CODE:          { label: "Индекс (место отгрузки)", block: "5. Место отгрузки товара", kind: "text", required: false, placeholder: "Например: 140923" },
    SHIPMENT_RF_SUBJECT_NAME:   { label: "Субъект РФ (место отгрузки)", block: "5. Место отгрузки товара", kind: "reference", required: false, searchable: true, placeholder: "Начните вводить субъект РФ" },
    SHIPMENT_ADDRESS:           { label: "Наименование и адрес места отгрузки", block: "5. Место отгрузки товара", kind: "text", required: false, placeholder: "Например: г. Ростов-на-Дону, ул. Селекционная, 7" },

    // ── 6. Дополнительные параметры (21) ───────────────────────────────────────
    IS_PRICE_NDS:                  { label: "Цена с НДС", block: "6. Дополнительные параметры", kind: "bool", required: true, placeholder: "" },
    IS_PRICE_TRANSPORTATION_COSTS: { label: "Цена включает затраты на транспортировку", block: "6. Дополнительные параметры", kind: "bool", required: true, placeholder: "" },
    PRODUCT_BASIS_PRICE:           { label: "Цена, приведённая к базису поставки", block: "6. Дополнительные параметры", kind: "text", required: true, placeholder: "Например: 8000.00", helper: "Укажите стоимость транспортировки и приведите цену к базису «экспортный порт» (FOB). Не должна превышать цену товара за тонну" },
    DELIVERY_METHOD_NAME:          { label: "Способ поставки с места отгрузки", block: "6. Дополнительные параметры", kind: "reference", required: true, placeholder: "Выберите из предложенного списка", helper: "Связан с условиями и типом базиса поставки" },
    DELIVERY_COUNTRY_NAME:         { label: "Страна назначения", block: "6. Дополнительные параметры", kind: "reference", required: false, searchable: true, placeholder: "Начните вводить страну", helper: "Заполняется при экспорте. Поиск по справочнику стран" },
    HARVEST_YEAR:                  { label: "Год урожая", block: "6. Дополнительные параметры", kind: "text", required: false, placeholder: "Например: 2019", helper: "Только для зерновых культур" },
    PROTEIN_PERCENTAGE:            { label: "Содержание протеина", block: "6. Дополнительные параметры", kind: "text", required: false, placeholder: "Например: 12.5", helper: "Только для пшеницы, %" },
    GLUTEN_PERCENTAGE:             { label: "Содержание клейковины", block: "6. Дополнительные параметры", kind: "text", required: false, placeholder: "Например: 23", helper: "Только для пшеницы, %" },
    ORIGIN_GOODS_NAME:             { label: "Сведения о происхождении товара", block: "6. Дополнительные параметры", kind: "text", required: false, placeholder: "Например: выращен в РФ" },
    OWNER_NAME:                    { label: "Собственник товара на момент передачи", block: "6. Дополнительные параметры", kind: "text", required: false, placeholder: "Например: ООО «…»" },
    OWNER_INN:                     { label: "ИНН собственника товара", block: "6. Дополнительные параметры", kind: "text", required: false, placeholder: "Например: 1234567890" },
    TRANS_COST_FROM_MFC:           { label: "Стоимость транспортировки: производство → отгрузка", block: "6. Дополнительные параметры", kind: "text", required: false, placeholder: "Например: 440.21", helper: "В рублях за тонну, включая НДС. Если не определена — 0" },
    TRANS_COST_FROM_SHIP:          { label: "Стоимость транспортировки: отгрузка → базис", block: "6. Дополнительные параметры", kind: "text", required: false, placeholder: "Например: 440.21", helper: "В рублях за тонну, включая НДС. Если не определена — 0" },
    TRANSPORT_INCLUDED_PLACE_NAME: { label: "Место, до которого включён транспорт", block: "6. Дополнительные параметры", kind: "text", required: false, placeholder: "Например: порт Новороссийск" },
    TRANSPORT_INCLUDED_PLACE_TYPE: { label: "Тип места, до которого включён транспорт", block: "6. Дополнительные параметры", kind: "text", required: false, placeholder: "Например: ж/д станция, порт" },
    SHIPMENT_FACT_DATE:            { label: "Дата фактической отгрузки", block: "6. Дополнительные параметры", kind: "date", required: false, placeholder: "ДД.ММ.ГГГГ" },
    IS_INTERDEPENDENCE_FLAG:       { label: "Взаимозависимость производителя и приобретателя", block: "6. Дополнительные параметры", kind: "bool", required: false, placeholder: "" },
    IS_AFFILIATION_FLAG:           { label: "Аффилированность производителя и приобретателя", block: "6. Дополнительные параметры", kind: "bool", required: false, placeholder: "" },
    IS_PREFERENTIAL_PRICING:       { label: "Основания для льготного ценообразования", block: "6. Дополнительные параметры", kind: "bool", required: false, placeholder: "" },
    NORMATIVE_ACT_REQUISITES:      { label: "Реквизиты НПА при льготном ценообразовании", block: "6. Дополнительные параметры", kind: "text", required: false, placeholder: "Например: Постановление №… от …", helper: "Заполняется при льготном ценообразовании" },
    CALCULATION_TYPE_NAME:         { label: "Порядок расчётов", block: "6. Дополнительные параметры", kind: "reference", required: false, placeholder: "Выберите из предложенного списка" },
    FAMILY_NAME:                   { label: "Владелец отчёта", block: "6. Дополнительные параметры", kind: "text", required: false, placeholder: "Подставляется из ЛК", helper: "Заполняется автоматически" },
  };

  // Demo dictionaries for reference fields. Real справочники замещают это позже:
  // a reference field with no entry here renders as free-text (see resolveOptions).
  const REFERENCE_OPTIONS = {
    PRODUCT_TYPE_NAME: ["Пшеница 3-го класса", "Пшеница 4-го класса", "Ячмень", "Кукуруза", "Подсолнечник", "Соя", "Рапс"],
    MANUFACTURER_NAME: ["ООО «Агрохолдинг Юг»", "АО «Кубань-Агро»", "ООО «Дон-Зерно»", "ООО «Второй элеватор»"],
    PURCHASER_NAME:    ["АО «Зерно Экспорт»", "ООО «Грейн Трейд»", "ПАО «АгроЭкспорт»", "ООО «Третий элеватор»"],
    ORGANIZATION_NAME: ["ООО «Первый элеватор»", "АО «Кубань-Агро»", "ООО «Грейн Трейд»"],
    // Incoterms 2020 — все 11 терминов. Сначала «любой вид транспорта», затем
    // морские/внутренневодные (FAS, FOB, CFR, CIF) — у них в правиле «только водный транспорт».
    DELIVERY_TYPE_NAME: ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"],
    BASIS_TYPE_NAME:    ["Порт", "Железнодорожная станция", "Склад", "Элеватор", "Франко-завод"],
    PORT_NAME:          ["Новороссийск", "Тамань", "Азов", "Ростов-на-Дону", "Кавказ"],
    DELIVERY_METHOD_NAME: ["Водный транспорт", "Автомобильный транспорт", "Железнодорожный транспорт"],
    DELIVERY_COUNTRY_NAME: ["Турция", "Египет", "Иран", "Саудовская Аравия", "Китай", "Бангладеш"],
    CURRENCY_NAME:      ["Российский рубль", "Доллар США", "Евро", "Китайский юань"],
    CALCULATION_TYPE_NAME: ["Предоплата", "Оплата по факту поставки", "Аккредитив", "Отсрочка платежа"],
    DELIVERY_RF_SUBJECT_NAME:     ["Краснодарский край", "Ростовская область", "Ставропольский край", "Воронежская область", "Волгоградская область"],
    MANUFACTURER_RF_SUBJECT_NAME: ["Краснодарский край", "Ростовская область", "Ставропольский край", "Воронежская область", "Волгоградская область"],
    SHIPMENT_RF_SUBJECT_NAME:     ["Краснодарский край", "Ростовская область", "Ставропольский край", "Воронежская область", "Волгоградская область"],
  };

  window.MOEX_CATALOG = { BLOCK_ORDER, FIELDS, REFERENCE_OPTIONS };
})();
