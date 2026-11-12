/**
 * Shows database text (doctor, hospital and city names, specialties) in the
 * patient's language by transliterating the English letters, e.g.
 * "Reddy" -> "రెడ్డి". It writes the sound, it does not translate meaning.
 *
 * One rule table is written in Devanagari and shifted into Telugu / Kannada:
 * the three Unicode blocks line up letter for letter (क=U+0915, క=U+0C15,
 * ಕ=U+0C95). Spellings the rules get wrong are fixed by WORDS below: a word is
 * respelled in a tiny phonetic ASCII form the same engine reads (capitals are
 * special: T D N L S are retroflex, O E are long o / e, R is the vowel ऋ).
 *
 * Anything that is not plain Latin letters (already local script, digits,
 * all-caps abbreviations like ENT or CBC) passes through untouched.
 */
export type DisplayLang = 'en' | 'hi' | 'te' | 'kn';

let current: DisplayLang = 'en';
export const setDisplayLang = (l: DisplayLang) => { current = l; };
export const getDisplayLang = (): DisplayLang => current;

const SHIFT: Record<'te' | 'kn', number> = { te: 0xC00 - 0x900, kn: 0xC80 - 0x900 };
const VIRAMA = '्';
const ANUSVARA = 'ं';

// Devanagari consonants by Latin spelling.
const CONS: Record<string, string> = {
  k: 'क', kh: 'ख', g: 'ग', gh: 'घ', ch: 'च', j: 'ज', jh: 'झ', z: 'ज', th: 'थ', t: 'त', dh: 'ध', d: 'द',
  n: 'न', p: 'प', ph: 'फ', f: 'फ', b: 'ब', bh: 'भ', m: 'म', y: 'य', r: 'र', l: 'ल', v: 'व', w: 'व',
  s: 'स', sh: 'श', h: 'ह', q: 'क',
  T: 'ट', D: 'ड', N: 'ण', L: 'ळ', S: 'ष',
};
// Vowel spelling -> [independent letter, matra ('' = the inherent a)].
// Short e/o use U+0946/U+094A, which Telugu/Kannada have and Hindi maps to े/ो.
const VOW: Record<string, [string, string]> = {
  a: ['अ', ''], aa: ['आ', 'ा'], i: ['इ', 'ि'], ee: ['ई', 'ी'], ii: ['ई', 'ी'], u: ['उ', 'ु'], oo: ['ऊ', 'ू'],
  e: ['ऎ', 'ॆ'], E: ['ए', 'े'], o: ['ऒ', 'ॊ'], O: ['ओ', 'ो'],
  ai: ['ऐ', 'ै'], au: ['औ', 'ौ'], ou: ['औ', 'ौ'], R: ['ऋ', 'ृ'],
};
const GRAPHS = ['chh', 'sh', 'ch', 'kh', 'gh', 'jh', 'th', 'dh', 'ph', 'bh', 'aa', 'ai', 'au', 'ee', 'ii', 'oo', 'ou'];

type Tok = { c: string } | { v: string } | { raw: string };

function tokenize(w: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < w.length) {
    const rest = w.slice(i);
    // Hard doubles of t / d in names (Reddy, Setty) are retroflex.
    if (/^tt/.test(rest)) { out.push({ c: 'T' }, { c: 'T' }); i += 2; continue; }
    if (/^dd/.test(rest)) { out.push({ c: 'D' }, { c: 'D' }); i += 2; continue; }
    const g = GRAPHS.find(x => rest.startsWith(x));
    if (g) {
      if (g === 'chh') out.push({ c: 'छ' });
      else if (CONS[g]) out.push({ c: CONS[g] });
      else out.push({ v: g });
      i += g.length; continue;
    }
    const ch = w[i];
    if (ch === 'c') { out.push({ c: /^c[eiy]/.test(rest) ? CONS.s : CONS.k }); i++; continue; }
    if (ch === 'x') { out.push({ c: CONS.k }, { c: CONS.s }); i++; continue; }
    if (ch === 'y' && out.length && 'c' in out[out.length - 1] && (i === w.length - 1)) { out.push({ v: 'i' }); i++; continue; }
    if (CONS[ch]) { out.push({ c: CONS[ch] }); i++; continue; }
    if (VOW[ch]) { out.push({ v: ch }); i++; continue; }
    out.push({ raw: ch }); i++;
  }
  return out;
}

const isC = (t?: Tok): t is { c: string } => !!t && 'c' in t;
const isV = (t?: Tok): t is { v: string } => !!t && 'v' in t;

function render(w: string, lang: 'hi' | 'te' | 'kn'): string {
  const toks = tokenize(w);
  let s = '';
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i], n = toks[i + 1], prev = toks[i - 1];
    if (isC(t)) {
      const isNasal = t.c === 'न' || t.c === 'म';
      if (isNasal && isV(prev) && isC(n) && n.c !== t.c) { s += ANUSVARA; continue; }   // "Anand", "Venkata"
      if (t.c === 'म' && !n && isV(prev) && lang !== 'hi') { s += ANUSVARA; continue; }   // Telugu/Kannada "…ం" (Hindupuram)
      s += t.c;
      if (isV(n)) continue;                                  // the vowel follows
      if (isC(n)) s += VIRAMA;                               // cluster
      else if (!n && lang !== 'hi') s += VIRAMA;             // Telugu/Kannada end on a pure consonant
    } else if (isV(t)) {
      const [indep, matra] = VOW[t.v];
      const longA = lang === 'hi' && t.v === 'a' && isC(prev) && i === toks.length - 1 && toks.length > 2;
      s += isC(prev) ? (longA ? 'ा' : matra) : indep;
    } else s += t.raw;
  }
  if (lang === 'hi') return s.replace(/ॆ/g, 'े').replace(/ॊ/g, 'ो').replace(/ऎ/g, 'ए').replace(/ऒ/g, 'ओ');
  const d = SHIFT[lang];
  return Array.from(s).map(c => { const cp = c.codePointAt(0)!; return cp >= 0x900 && cp < 0x980 ? String.fromCodePoint(cp + d) : c; }).join('');
}

type Spell = string | Partial<Record<'hi' | 'te' | 'kn', string>>;
// Respellings for words the letter rules would get wrong (long vowels, retroflex T/D, "sh" as ष...).
const V = (other: string, hi: string): Spell => ({ hi, te: other, kn: other });   // Telugu/Kannada ష vs Hindi श
const WORDS: Record<string, Spell> = {
  hospital: 'haaspiTal', clinic: 'klinik', centre: 'sentar', center: 'sentar', diagnostic: 'dayagnasTik',
  diagnostics: 'dayagnasTiks', scan: 'skyaan', scans: 'skyaans', nursing: 'narsing', home: 'hOm', care: 'ker',
  general: 'janaral', physician: 'phijishan', orthopedic: 'aarthOpeDik', orthopaedic: 'aarthOpeDik', surgeon: 'sarjan',
  cardiologist: 'kaarDiyOlajisT', dermatologist: 'DermaTOlajisT', pediatrician: 'peeDiyaTrishan',
  paediatrician: 'peeDiyaTrishan', gynecologist: 'gainakOlajisT', gynaecologist: 'gainakOlajisT',
  neurologist: 'nyoorOlajisT', urologist: 'yoorOlajisT', dentist: 'denTisT', dental: 'denTal',
  ophthalmologist: 'aaphthalmOlajisT', psychiatrist: 'saaykayaTrisT', oncologist: 'onkOlajisT',
  nephrologist: 'nephrOlajisT', gastroenterologist: 'gaasTrOenTarOlajisT', endocrinologist: 'enDOkrinOlajisT',
  diabetologist: 'daayabeTOlajisT', radiologist: 'reeDiyOlajisT', pulmonologist: 'palmanOlajisT',
  consultant: 'kansalTenT', specialist: 'speshalisT', interventional: 'inTarvenshanal',
  physiotherapist: 'phijiyOtherapisT', medicine: 'medisin', family: 'phaamili', child: 'chaild', skin: 'skin',
  my: 'mai', test: 'TesT', demo: 'DemO', local: 'lOkal',
  reddy: 'reDDi', naidu: 'naayuDu', rao: { hi: 'raav', te: 'raavu', kn: 'raavu' }, kumar: 'kumaar',
  krishna: 'kRSNa', prasad: 'prasaad', lakshmi: 'lakSmi', venkata: 'venkaTa', suresh: V('surES', 'suresh'), ramesh: V('ramES', 'ramesh'),
  mahesh: V('mahES', 'mahesh'), rajesh: V('raajES', 'raajesh'), ganesh: V('gaNES', 'ganesh'), naresh: V('narES', 'naresh'),
  patel: 'paTEl', singh: { hi: 'sinh', te: 'sing', kn: 'sing' }, sharma: { hi: 'sharma', te: 'sharma', kn: 'sharma' }, srinivas: 'shreenivaas',
  srinivasa: 'shreenivaasa', ramana: 'ramaNa', hindupur: { hi: 'hindoopur', te: 'hindoopuram', kn: 'hindoopura' },
  anantapur: 'anantapuram', hyderabad: 'haidaraabaad', bangalore: 'bengaLooru', bengaluru: 'bengaLooru',
  kurnool: 'karnool', tirupati: 'tirupati', nellore: 'nelloor', kadapa: 'kaDapa', vijayawada: 'vijayavaaDa',
  visakhapatnam: 'vishaakhapaTnam', guntur: 'gunTooru',
};

const cache = new Map<string, string>();

/** One word. Only plain Latin letters (with ASCII apostrophes) are converted. */
function word(w: string, lang: 'hi' | 'te' | 'kn'): string {
  if (!/^[A-Za-z]+$/.test(w)) return w;
  if (w.length > 1 && w === w.toUpperCase()) return w;                      // ENT, CBC, MRI
  const key = `${lang}:${w}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const o = WORDS[w.toLowerCase()];
  const spell = typeof o === 'string' ? o : o?.[lang];
  const r = render(spell ?? w.toLowerCase(), lang);
  cache.set(key, r);
  return r;
}

export function localName(text?: string | null, lang: DisplayLang = current): string {
  const s = text ?? '';
  if (lang === 'en' || !s) return s;
  return s.replace(/[A-Za-z]+/g, m => word(m, lang));
}

const DR: Record<'hi' | 'te' | 'kn', string> = { hi: 'डॉ.', te: 'డా.', kn: 'ಡಾ.' };
/** The "Dr." title in the current language ("Dr." in English). */
export const doctorTitle = (lang: DisplayLang = current): string => (lang === 'en' ? 'Dr.' : DR[lang]);

const WEEKDAYS: Record<'hi' | 'te' | 'kn', Record<string, string>> = {
  hi: { Mon: 'सोम', Tue: 'मंगल', Wed: 'बुध', Thu: 'गुरु', Fri: 'शुक्र', Sat: 'शनि', Sun: 'रवि' },
  te: { Mon: 'సోమ', Tue: 'మంగళ', Wed: 'బుధ', Thu: 'గురు', Fri: 'శుక్ర', Sat: 'శని', Sun: 'ఆది' },
  kn: { Mon: 'ಸೋಮ', Tue: 'ಮಂಗಳ', Wed: 'ಬುಧ', Thu: 'ಗುರು', Fri: 'ಶುಕ್ರ', Sat: 'ಶನಿ', Sun: 'ಭಾನು' },
};
/** "Mon" -> "సోమ" in the current language; anything else is returned as is. */
export const localWeekday = (d: string, lang: DisplayLang = current): string =>
  (lang === 'en' ? d : WEEKDAYS[lang]?.[d]) ?? d;

const MONTHS: Record<'hi' | 'te' | 'kn', string[]> = {
  hi: ['जन', 'फ़र', 'मार्च', 'अप्रै', 'मई', 'जून', 'जुल', 'अग', 'सित', 'अक्टू', 'नव', 'दिस'],
  te: ['జన', 'ఫిబ్ర', 'మార్చి', 'ఏప్రి', 'మే', 'జూన్', 'జూలై', 'ఆగ', 'సెప్టె', 'అక్టో', 'నవం', 'డిసెం'],
  kn: ['ಜನ', 'ಫೆಬ್ರ', 'ಮಾರ್ಚ್', 'ಏಪ್ರಿ', 'ಮೇ', 'ಜೂನ್', 'ಜುಲೈ', 'ಆಗ', 'ಸೆಪ್ಟೆ', 'ಅಕ್ಟೋ', 'ನವೆಂ', 'ಡಿಸೆಂ'],
};
const MONTH_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Nov" -> the short month name in the current language; anything else is returned as is. */
export const localMonth = (m: string, lang: DisplayLang = current): string => {
  const i = MONTH_EN.indexOf(m);
  return lang === 'en' || i < 0 ? m : MONTHS[lang]?.[i] ?? m;
};
