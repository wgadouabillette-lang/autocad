import type { AppLocale } from "./appLocale";

/** A request to make playback quieter. */
export type VolumeDownRequest =
  | { type: "delta"; amount: number }
  | { type: "scale"; factor: number }
  | { type: "set"; level: number };

const CAD_RE =
  /\b(pi[eè]ce|cube|solide|mesh|extrusion|mm3|mm³|mod[eè]le 3d|cylindre|sph[eè]re|per[cç]age|trou|cotation)\b/i;

const UP_RE =
  /\b(monte\w*|augmente\w*|plus fort|louder|turn(?:\s+\w+){0,3}\s+up|volume up|sound up|[aà] fond|au max|maximum|remonte\w*|raise|crank|sube\w*|m[aá]s alto|lauter|alza\w*|aumenta\w*|sobe\w*|mais alto|音量を上げ|大声)\b/i;

const SOUND_RE =
  /\b(volume|volumes|son|sons|sound|musique|music|audio|spotify|dj|enceinte|speaker|haut-?parleur|bruit|bruy\w*|loud|noisy|sourdine|leiser|volumen|laust|rumore|barulho|音量|声音|音樂|音乐)\b/i;

const DOWN_RE =
  /\b(baiss\w*|baise\w*|r[eé]dui\w*|redui\w*|diminu\w*|descend\w*|adouci\w*|lower\w*|decrease|reduc\w*|quieter|softer|soften\w*|turn(?:\s+\w+){0,3}\s+down|quiet(?:\s+\w+){0,2}\s+down|tone it down|dial it (?:back|down)|volume down|moins fort|plus bas|trop fort|trop bruy\w*|too loud|too noisy|mute|silence|coupe\w*|chut+|shhh*|hush|quiet down|keep it down|not so loud|pas si fort|pas trop fort|un peu moins|beaucoup moins|way down|en sourdine|sourdine|baja\w*|m[aá]s bajo|demasiado alto|leiser|zu laut|runter|abbassa\w*|troppo alto|abaixa\w*|mais baixo|baixo demais|音量を下げ|小さく|小声|小点声|调小|調小)\b/i;

const IDIOM_RE =
  /\b(moins fort|trop fort|trop bruy\w*|pas si fort|pas trop fort|too loud|too noisy|turn it down|turn the (?:volume|sound|music) down|quiet it down|tone it down|dial it (?:back|down)|volume down|quiet down|keep it down|en sourdine|j'entends trop|j entends trop|on entend trop|[cç]a gueule|c'est bruy\w*|ca gueule|mets?(?:-le)? moins fort|met(?:s|tez)? plus bas|un peu moins fort|way too loud|softer please|quieter please|baja el volumen|m[aá]s bajo|zu laut|troppo alto|mais baixo|baixo demais)\b/i;

const NEGATE_RE =
  /\b(?:ne|n['’])\s+(?:me\s+|le\s+|la\s+)?(?:baiss\w*|r[eé]dui\w*|diminu\w*|descend\w*)|\b(?:baiss\w*|lower|reduce|turn it down)\s+pas\b|\b(?:don't|do not)\s+(?:lower|reduce|turn)|不要降低|不要小声/i;

const MUTE_RE =
  /\b(mute|silence|en sourdine|sourdine|coupe\w* (?:le |la |l['’])?(?:son|musique|volume|sound|music)|[eé]teins?\w* (?:le |la |l['’])?(?:son|musique|volume|sound|music)|shut (?:it |the )?(?:up|off)|音を消|静音|静音)\b/i;

const HALF_RE = /\b(?:moiti[eé]|half|a mitad|zur h[aä]lfte|a meta|pela metade)\b/i;

const LITTLE_RE =
  /\b(un peu|un petit peu|un tout petit peu|l[eé]g[eè]rement|a bit|a little|slightly|just a tad|un poquito|ein bisschen|um pouco|少し|一点点|一點點)\b/i;

const LOT_RE =
  /\b(beaucoup|vraiment|fortement|a lot|way|much lower|bien plus bas|beaucoup moins|mucho|viel|muito|ずっと|很多|很多)\b/i;

const PERCENT_RE = /(\d{1,3})\s*(?:%|pour\s*cents?|percent)/i;

const SET_VERB_RE = /\b(met(?:s|tez|tre)?|regle\w*|passe\w*|place\w*|put|set)\b/i;

/** A later short message can retarget the level just set. */
const VOLUME_FOLLOW_MS = 120_000;

let lastVolumeAdjustedAt = 0;

const OTHER_SETTING_RE =
  /\b(prix|price|police|font|taille|brightness|luminosite|lumiere|temperature|vitesse|speed|qualite|fenetre|window)\b/i;

const SHORT_COMMAND_RE =
  /^(?:(?:tu peux|peux-tu|est-ce que tu peux|can you|please)\s+)?(?:baiss\w*|lower|quieter|softer|diminu\w*|redui\w*|chut+|shhh*|volume down|moins fort|trop fort|too loud|turn it down)(?:\s+(?:un peu|stp|svp|please|s'il te plait|le son|le volume|la musique|the volume|the music))*\s*$/i;

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function lastMatchIndex(pattern: RegExp, text: string): number {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const global = new RegExp(pattern.source, flags);
  let last = -1;
  for (const match of text.matchAll(global)) {
    last = match.index ?? last;
  }
  return last;
}

function clampLevel(value: number): number {
  const clamped = Math.min(1, Math.max(0, value));
  return Math.round(clamped * 100) / 100;
}

function percentValue(plain: string): { value: number; relative: boolean } | null {
  const match = plain.match(PERCENT_RE);
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  const relative = new RegExp(
    `(?:de|by)\\s*${match[1]}\\s*(?:%|pour\\s*cents?|percent)`,
    "i",
  ).test(plain);
  return { value, relative };
}

/** "mets le volume à 35", "volume 35%" — an absolute level, not a step down. */
function absoluteLevel(plain: string): number | null {
  const percent = percentValue(plain);
  if (percent && !percent.relative) return percent.value;
  if (percent?.relative) return null;
  const aimed =
    plain.match(/\b(?:a|au|vers)\s*(\d{1,3})\b/) ??
    plain.match(/\b(?:volume|son|musique)\s+(\d{1,3})\b/);
  if (!aimed) return null;
  const value = Number(aimed[1]);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

function recentVolumeFollowUp(plain: string): number | null {
  if (Date.now() - lastVolumeAdjustedAt > VOLUME_FOLLOW_MS) return null;
  if (plain.length > 42) return null;
  const match = plain.match(
    /^(?:non |plutot |a |au |vers |met |mets |volume |son )*(\d{1,3})\s*(?:%|pour cents?|percent)?$/,
  );
  if (!match) return null;
  const value = Number(match[1]);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return value;
}

/** Understand a request to lower playback volume, whatever the wording. */
export function parseVolumeDownRequest(text: string): VolumeDownRequest | null {
  const plain = normalize(text);
  if (!plain || CAD_RE.test(plain) || NEGATE_RE.test(plain) || OTHER_SETTING_RE.test(plain)) return null;

  const hasSound = SOUND_RE.test(plain);
  const hasDown = DOWN_RE.test(plain);
  const level = absoluteLevel(plain);
  const aimed =
    level != null &&
    hasSound &&
    (SET_VERB_RE.test(plain) ||
      /\b(?:a|au|vers)\s*\d/.test(plain) ||
      /\b(?:volume|son|musique)\s+\d/.test(plain) ||
      PERCENT_RE.test(plain));
  const followUp = recentVolumeFollowUp(plain);

  const downAt = Math.max(lastMatchIndex(DOWN_RE, plain), lastMatchIndex(IDIOM_RE, plain));
  const upAt = lastMatchIndex(UP_RE, plain);
  if (upAt >= 0 && upAt > downAt && !aimed && followUp == null) return null;

  const hasIdiom = IDIOM_RE.test(plain);
  const shortCommand = plain.length <= 48 && SHORT_COMMAND_RE.test(plain);
  const quantified = hasDown && (HALF_RE.test(plain) || PERCENT_RE.test(plain));
  if (!shortCommand && !hasIdiom && !quantified && !(hasSound && hasDown) && !aimed && followUp == null) {
    return null;
  }

  if (MUTE_RE.test(plain) && followUp == null && !aimed) return { type: "set", level: 0 };

  if ((aimed && level != null) || followUp != null) {
    return { type: "set", level: (followUp ?? level ?? 0) / 100 };
  }

  const percent = percentValue(plain);
  if (percent) {
    return percent.relative
      ? { type: "delta", amount: percent.value / 100 }
      : { type: "set", level: percent.value / 100 };
  }

  if (HALF_RE.test(plain)) return { type: "scale", factor: 0.5 };
  if (LITTLE_RE.test(plain)) return { type: "delta", amount: 0.08 };
  if (LOT_RE.test(plain)) return { type: "delta", amount: 0.3 };
  return { type: "delta", amount: 0.15 };
}

export function volumeRequestFromPlugin(fields: {
  step?: string;
  level?: string;
}): VolumeDownRequest {
  const level = Number(String(fields.level ?? "").replace("%", "").trim());
  if (Number.isFinite(level) && level >= 0 && level <= 100 && String(fields.level ?? "").trim()) {
    return { type: "set", level: level / 100 };
  }
  const step = (fields.step ?? "normal").trim().toLowerCase();
  if (step === "mute") return { type: "set", level: 0 };
  if (step === "half") return { type: "scale", factor: 0.5 };
  if (step === "little") return { type: "delta", amount: 0.08 };
  if (step === "lot") return { type: "delta", amount: 0.3 };
  return { type: "delta", amount: 0.15 };
}

export function nextHallDjVolume(current: number, request: VolumeDownRequest): number {
  lastVolumeAdjustedAt = Date.now();
  if (request.type === "set") return clampLevel(request.level);
  if (request.type === "scale") return clampLevel(current * request.factor);
  return clampLevel(current - request.amount);
}

const REPLIES: Record<AppLocale, { set: (percent: number) => string; min: string }> = {
  fr: {
    set: (percent) => `Volume à **${percent} %**.`,
    min: "Le volume est déjà au minimum.",
  },
  en: {
    set: (percent) => `Volume at **${percent}%**.`,
    min: "Volume is already at the minimum.",
  },
  es: {
    set: (percent) => `Volumen al **${percent} %**.`,
    min: "El volumen ya está al mínimo.",
  },
  de: {
    set: (percent) => `Lautstärke bei **${percent} %**.`,
    min: "Die Lautstärke ist schon auf dem Minimum.",
  },
  pt: {
    set: (percent) => `Volume a **${percent}%**.`,
    min: "O volume já está no mínimo.",
  },
  it: {
    set: (percent) => `Volume al **${percent}%**.`,
    min: "Il volume è già al minimo.",
  },
  ja: {
    set: (percent) => `音量は **${percent}%** です。`,
    min: "音量はすでに最小です。",
  },
  zh: {
    set: (percent) => `音量已调到 **${percent}%**。`,
    min: "音量已经是最低了。",
  },
};

export function volumeDownConfirmation(
  percent: number,
  locale: AppLocale,
  alreadyMin: boolean,
): string {
  const copy = REPLIES[locale] ?? REPLIES.en;
  return alreadyMin ? copy.min : copy.set(percent);
}
