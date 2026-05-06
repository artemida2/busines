/**
 * Ядро расчётов юнит‑экономики WB / Ozon.
 * Чистые функции, без побочных эффектов — тот же код можно дёргать на сервере (build) и в браузере.
 */

import commissionsData from "../data/commissions.json";

export type MarketplaceSlug = "wb" | "ozon";
export type Scheme = "fbo" | "fbs";
export type SignalLevel = "green" | "yellow" | "red";

export interface CategoryRow {
  name: string;
  commission: number; // %
  fboLogistics: number; // ₽ за единицу
  fbsLogistics: number; // ₽ за единицу
  returnRate: number; // % возвратов в категории
  averagePrice: number; // ₽
  notes?: string;
}

export interface MarketplaceRow {
  name: string;
  slug: string;
  tagline: string;
  acquiringFee: number; // % дополнительный сбор за эквайринг (Ozon)
  categories: Record<string, CategoryRow>;
}

export interface Commissions {
  version: string;
  lastUpdated: string;
  disclaimer: string;
  marketplaces: Record<MarketplaceSlug, MarketplaceRow>;
}

export const commissions = commissionsData as Commissions;

export interface CalcInput {
  marketplace: MarketplaceSlug;
  category: string; // ключ внутри marketplace.categories
  scheme: Scheme;
  costPrice: number; // себестоимость единицы, ₽
  sellPrice: number; // розничная цена, ₽
  expectedReturnRate: number; // % возвратов, который продавец прогнозирует (override)
  taxRate: number; // % налога с оборота (НПД 4/6, УСН 6 и т.д.)
  monthlyVolume: number; // ожидаемое кол-во заказов в месяц
  promoDiscountPct: number; // % скидки в акции (для расчёта «безопасной» промо-цены)
}

export interface CalcResult {
  category: CategoryRow;
  marketplace: MarketplaceRow;

  // Деньги на единицу
  grossPerUnit: number; // что приходит после комиссии и эквайринга (без логистики и налогов)
  logisticsPerUnit: number; // расход логистики на единицу
  taxPerUnit: number; // налог на единицу
  netPerUnit: number; // чистая прибыль на единицу после всех вычетов с учётом возвратов
  marginPct: number; // маржа в % к розничной цене

  // Точки безопасности
  breakEvenPrice: number; // минимальная цена чтобы не уйти в минус
  safePromoPrice: number; // минимальная цена в акции при сохранении 70% от целевой маржи
  isPromoSafe: boolean; // безопасно ли участвовать в акции с указанным % скидки

  // Объём
  monthlyRevenue: number;
  monthlyNet: number;

  // Светофоры
  signals: {
    margin: Signal;
    logistics: Signal;
    returns: Signal;
    promo: Signal;
    turnover: Signal;
  };
  overallSignal: SignalLevel;
}

export interface Signal {
  level: SignalLevel;
  label: string;
  hint: string;
}

export function getCategory(mp: MarketplaceSlug, slug: string): CategoryRow | null {
  return commissions.marketplaces[mp]?.categories[slug] ?? null;
}

export function getCategoryOptions(mp: MarketplaceSlug): { slug: string; name: string }[] {
  const m = commissions.marketplaces[mp];
  if (!m) return [];
  return Object.entries(m.categories).map(([slug, c]) => ({ slug, name: c.name }));
}

export function listAllLandingPaths(): { mp: MarketplaceSlug; cat: string }[] {
  const out: { mp: MarketplaceSlug; cat: string }[] = [];
  (Object.keys(commissions.marketplaces) as MarketplaceSlug[]).forEach((mp) => {
    Object.keys(commissions.marketplaces[mp].categories).forEach((cat) => {
      out.push({ mp, cat });
    });
  });
  return out;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function toFixed2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Главная функция расчёта. Возвращает все производные показатели.
 * Считаем на «эффективную» проданную единицу: с учётом ретёрнов, логистика по факту платится за обе ноги.
 */
export function calculate(input: CalcInput): CalcResult | null {
  const mp = commissions.marketplaces[input.marketplace];
  if (!mp) return null;
  const cat = mp.categories[input.category];
  if (!cat) return null;

  const logisticsPerUnit =
    input.scheme === "fbo" ? cat.fboLogistics : cat.fbsLogistics;

  const returnRate = clamp(input.expectedReturnRate, 0, 90) / 100;
  // Возврат = двойная логистика (туда + обратно) и потеря брендовой ценности упаковки.
  const effectiveLogistics = logisticsPerUnit + logisticsPerUnit * returnRate * 0.7;

  const commissionRate = (cat.commission + mp.acquiringFee) / 100;
  const commissionPerUnit = input.sellPrice * commissionRate;

  const taxPerUnit = input.sellPrice * (input.taxRate / 100);

  const grossPerUnit = input.sellPrice - commissionPerUnit;
  const netPerUnit = toFixed2(
    grossPerUnit - effectiveLogistics - taxPerUnit - input.costPrice
  );

  const marginPct =
    input.sellPrice > 0 ? toFixed2((netPerUnit / input.sellPrice) * 100) : 0;

  // Брейкивен: цена при которой netPerUnit = 0
  // sellPrice * (1 - commissionRate - taxRate) = costPrice + effectiveLogistics
  const denom = 1 - commissionRate - input.taxRate / 100;
  const breakEvenPrice =
    denom > 0 ? toFixed2((input.costPrice + effectiveLogistics) / denom) : input.sellPrice * 2;

  // Безопасная цена в акции = брейкивен * 1.1 (минимум 10% сверху)
  // если хотим сохранить 70% маржи — тоже учитываем
  const targetMargin = (marginPct / 100) * 0.7;
  const safePromoPriceRaw =
    denom - targetMargin > 0
      ? (input.costPrice + effectiveLogistics) / (denom - targetMargin)
      : breakEvenPrice * 1.1;
  const safePromoPrice = toFixed2(Math.max(safePromoPriceRaw, breakEvenPrice * 1.05));

  const promoPrice = input.sellPrice * (1 - input.promoDiscountPct / 100);
  const isPromoSafe = promoPrice >= safePromoPrice;

  const monthlyRevenue = toFixed2(input.sellPrice * input.monthlyVolume);
  const monthlyNet = toFixed2(netPerUnit * input.monthlyVolume);

  // ---- Светофоры ----
  const marginSignal: Signal =
    marginPct >= 25
      ? { level: "green", label: "Здоровая маржа", hint: "Маржа ≥ 25% — комфортная зона." }
      : marginPct >= 15
      ? {
          level: "yellow",
          label: "Маржа в зоне риска",
          hint: "15–25% — выживаешь, но любой штраф или акция съедают всё.",
        }
      : marginPct >= 0
      ? {
          level: "red",
          label: "Маржа критически низкая",
          hint: "< 15% — продаёшь почти бесплатно. Акции и возвраты убьют SKU.",
        }
      : {
          level: "red",
          label: "Минусовая маржа",
          hint: "Каждая продажа в убыток. Поднимай цену или сокращай себестоимость.",
        };

  const logisticsSharePct = (effectiveLogistics / input.sellPrice) * 100;
  const logisticsSignal: Signal =
    logisticsSharePct < 8
      ? { level: "green", label: "Логистика в норме", hint: "Меньше 8% от цены." }
      : logisticsSharePct < 15
      ? { level: "yellow", label: "Логистика заметна", hint: "8–15% — терпимо, но не комфортно." }
      : { level: "red", label: "Логистика съедает прибыль", hint: ">15% от цены — категория «тяжёлая»." };

  const returnsSignal: Signal =
    returnRate * 100 < 15
      ? { level: "green", label: "Низкий процент возвратов", hint: "Меньше 15% — спокойная категория." }
      : returnRate * 100 < 30
      ? {
          level: "yellow",
          label: "Возвраты средние",
          hint: "15–30% — нужна точная карточка и видео.",
        }
      : {
          level: "red",
          label: "Высокие возвраты",
          hint: "≥ 30% — каждая третья продажа возвращается. Заложите в цену.",
        };

  const promoSignal: Signal = isPromoSafe
    ? {
        level: "green",
        label: "Акция безопасна",
        hint: "Скидка не уведёт SKU в минус.",
      }
    : promoPrice >= breakEvenPrice
    ? {
        level: "yellow",
        label: "Акция съедает маржу",
        hint: "В нуле, но не зарабатываешь. Лучше избегать.",
      }
    : {
        level: "red",
        label: "Акция в минус",
        hint: "Скидка пробивает брейкивен — каждая продажа в убыток.",
      };

  // Оборачиваемость как «дни на партию» — упрощённо: чем меньше Volume, тем медленнее.
  const turnoverDays = input.monthlyVolume > 0 ? Math.round(30 / Math.max(0.5, input.monthlyVolume / 30)) : 999;
  const turnoverSignal: Signal =
    turnoverDays <= 30
      ? { level: "green", label: "Быстрая оборачиваемость", hint: "Партия уходит за месяц." }
      : turnoverDays <= 60
      ? { level: "yellow", label: "Оборачиваемость средняя", hint: "Деньги «лежат» 1–2 месяца." }
      : { level: "red", label: "Медленная оборачиваемость", hint: "Деньги заморожены, риск кассового разрыва." };

  // Итоговый светофор: худший из 5
  const order: SignalLevel[] = ["red", "yellow", "green"];
  const overall = order.find((l) =>
    [marginSignal, logisticsSignal, returnsSignal, promoSignal, turnoverSignal].some(
      (s) => s.level === l
    )
  ) as SignalLevel;

  return {
    category: cat,
    marketplace: mp,
    grossPerUnit: toFixed2(grossPerUnit),
    logisticsPerUnit: toFixed2(effectiveLogistics),
    taxPerUnit: toFixed2(taxPerUnit),
    netPerUnit,
    marginPct,
    breakEvenPrice,
    safePromoPrice,
    isPromoSafe,
    monthlyRevenue,
    monthlyNet,
    signals: {
      margin: marginSignal,
      logistics: logisticsSignal,
      returns: returnsSignal,
      promo: promoSignal,
      turnover: turnoverSignal,
    },
    overallSignal: overall,
  };
}

/**
 * Сериализация состояния калькулятора в URL: ?p=base64
 * Чтобы можно было поделиться сценарием без авторизации.
 */
export function encodeState(input: CalcInput): string {
  const payload = JSON.stringify(input);
  if (typeof btoa !== "undefined") return btoa(unescape(encodeURIComponent(payload)));
  return Buffer.from(payload, "utf-8").toString("base64");
}

export function decodeState(encoded: string): CalcInput | null {
  try {
    const raw =
      typeof atob !== "undefined"
        ? decodeURIComponent(escape(atob(encoded)))
        : Buffer.from(encoded, "base64").toString("utf-8");
    return JSON.parse(raw) as CalcInput;
  } catch {
    return null;
  }
}

export function defaultInputForCategory(
  mp: MarketplaceSlug,
  catSlug: string
): CalcInput {
  const cat = getCategory(mp, catSlug);
  const sellPrice = cat?.averagePrice ?? 1500;
  return {
    marketplace: mp,
    category: catSlug,
    scheme: "fbo",
    costPrice: Math.round(sellPrice * 0.4),
    sellPrice,
    expectedReturnRate: cat?.returnRate ?? 15,
    taxRate: 6, // НПД услуги юрлицу или УСН 6%
    monthlyVolume: 60,
    promoDiscountPct: 25,
  };
}
