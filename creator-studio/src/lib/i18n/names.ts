/**
 * Display names for the tracks and clips the Template Engine creates.
 * The composition stores stable English names; the editor shows them in the
 * interface language. Names the user typed are shown unchanged.
 */
import type { Locale as UiLocale } from './config';

type Kind = 'background' | 'image' | 'video' | 'captions' | 'voice';
interface Names { scene: (n: string, kind: Kind) => string; parts: Record<string, string> }

const PARTS = ['Background', 'Media', 'Graphics', 'Text', 'Captions', 'Brand', 'Voiceover', 'Music', 'Logo',
  'Accent', 'Author', 'Badge', 'Bar', 'Benefit', 'Body', 'Button', 'Button text', 'Card', 'Chapter', 'Code', 'Code pill', 'Divider', 'Glow',
  'Handle', 'Headline', 'Headline bar', 'Kicker', 'Label', 'Name', 'Name tag', 'Number', 'Offer', 'Pill', 'Pill text', 'Product', 'Progress',
  'Quote', 'Quote mark', 'Review', 'Ring', 'Role', 'Rule', 'Stars', 'Stat', 'Statement', 'Step', 'Tag', 'Tag text', 'Ticker', 'Title', 'Topic',
  'Topic chip', 'Track'] as const;

const zip = (values: string[]): Record<string, string> => Object.fromEntries(PARTS.map((k, i) => [k, values[i] ?? k]));

const HE: Names = {
  scene: (n, k) => ({ background: `רקע סצנה ${n}`, image: `תמונה סצנה ${n}`, video: `וידאו סצנה ${n}`, captions: `כתוביות סצנה ${n}`, voice: `קריינות סצנה ${n}` })[k],
  parts: zip(['רקע', 'מדיה', 'גרפיקה', 'טקסט', 'כתוביות', 'מותג', 'קריינות', 'מוזיקה', 'לוגו',
    'הדגשה', 'מחבר', 'תג', 'פס', 'יתרון', 'גוף טקסט', 'כפתור', 'טקסט כפתור', 'כרטיס', 'פרק', 'קוד', 'תווית קוד', 'מפריד', 'זוהר',
    'שם משתמש', 'כותרת', 'פס כותרת', 'כותרת משנה', 'תווית', 'שם', 'תג שם', 'מספר', 'הצעה', 'תווית', 'טקסט תווית', 'מוצר', 'התקדמות',
    'ציטוט', 'סימן ציטוט', 'ביקורת', 'טבעת', 'תפקיד', 'קו', 'כוכבים', 'נתון', 'הצהרה', 'שלב', 'תגית', 'טקסט תגית', 'טיקר', 'כותרת', 'נושא',
    'תגית נושא', 'מסלול']),
};

const RU: Names = {
  scene: (n, k) => ({ background: `Фон сцены ${n}`, image: `Изображение сцены ${n}`, video: `Видео сцены ${n}`, captions: `Субтитры сцены ${n}`, voice: `Озвучка сцены ${n}` })[k],
  parts: zip(['Фон', 'Медиа', 'Графика', 'Текст', 'Субтитры', 'Бренд', 'Озвучка', 'Музыка', 'Логотип',
    'Акцент', 'Автор', 'Значок', 'Полоса', 'Преимущество', 'Текст', 'Кнопка', 'Текст кнопки', 'Карточка', 'Глава', 'Код', 'Плашка кода', 'Разделитель', 'Свечение',
    'Аккаунт', 'Заголовок', 'Полоса заголовка', 'Надзаголовок', 'Метка', 'Имя', 'Плашка имени', 'Номер', 'Предложение', 'Плашка', 'Текст плашки', 'Продукт', 'Прогресс',
    'Цитата', 'Кавычка', 'Отзыв', 'Кольцо', 'Должность', 'Линия', 'Звёзды', 'Показатель', 'Утверждение', 'Шаг', 'Тег', 'Текст тега', 'Бегущая строка', 'Название', 'Тема',
    'Плашка темы', 'Дорожка']),
};

const AR: Names = {
  scene: (n, k) => ({ background: `خلفية المشهد ${n}`, image: `صورة المشهد ${n}`, video: `فيديو المشهد ${n}`, captions: `ترجمة المشهد ${n}`, voice: `تعليق المشهد ${n}` })[k],
  parts: zip(['الخلفية', 'الوسائط', 'الرسومات', 'النص', 'الترجمة', 'العلامة', 'التعليق الصوتي', 'الموسيقى', 'الشعار',
    'تمييز', 'المؤلف', 'شارة', 'شريط', 'ميزة', 'نص', 'زر', 'نص الزر', 'بطاقة', 'فصل', 'رمز', 'بطاقة الرمز', 'فاصل', 'توهج',
    'الحساب', 'العنوان', 'شريط العنوان', 'عنوان تمهيدي', 'تسمية', 'الاسم', 'بطاقة الاسم', 'رقم', 'العرض', 'كبسولة', 'نص الكبسولة', 'المنتج', 'التقدم',
    'اقتباس', 'علامة اقتباس', 'مراجعة', 'حلقة', 'المنصب', 'خط', 'نجوم', 'إحصائية', 'عبارة', 'خطوة', 'وسم', 'نص الوسم', 'شريط متحرك', 'العنوان', 'الموضوع',
    'شارة الموضوع', 'مسار']),
};

const AM: Names = {
  scene: (n, k) => ({ background: `የትዕይንት ${n} ዳራ`, image: `የትዕይንት ${n} ምስል`, video: `የትዕይንት ${n} ቪዲዮ`, captions: `የትዕይንት ${n} ጽሑፍ`, voice: `የትዕይንት ${n} ትረካ` })[k],
  parts: zip(['ዳራ', 'ሚዲያ', 'ግራፊክስ', 'ጽሑፍ', 'የጽሑፍ ትርጉም', 'ብራንድ', 'ትረካ', 'ሙዚቃ', 'አርማ']),
};

const NAMES: Partial<Record<UiLocale, Names>> = { he: HE, ru: RU, ar: AR, am: AM };
const SCENE = /^Scene (\d+) (background|image|video|captions|voice)$/;

export function displayName(name: string | undefined, locale: UiLocale): string | undefined {
  const n = NAMES[locale];
  if (!name || !n) return name;
  const m = SCENE.exec(name);
  if (m) return n.scene(m[1], m[2] as Kind);
  return n.parts[name] ?? name;
}

// ───────── Scene roles and caption styles (shown in the production plan) ─────────

const ROLES = ['act', 'act-scene', 'agitate', 'analysis', 'answer', 'beat', 'benefits', 'challenge', 'chapter', 'close', 'compare', 'concept', 'conclusion',
  'cons', 'contrast', 'counter', 'craft', 'cta', 'disclaimer', 'entry', 'event', 'evidence', 'explain', 'fact', 'feature', 'footage', 'guest', 'hero',
  'highlight', 'hook', 'host', 'how', 'intro', 'item', 'legacy', 'lesson', 'line', 'look', 'moment', 'moral', 'next', 'offer', 'open', 'outro', 'point',
  'problem', 'product', 'proof', 'pros', 'question', 'quote', 'reason', 'recap', 'result', 'reveal', 'review', 'scene', 'score', 'section', 'signature',
  'solution', 'stat', 'step', 'stop', 'story', 'strategy', 'takeaway', 'thesis', 'tip', 'title', 'topic', 'twist', 'verdict', 'why'] as const;

const zipRoles = (values: string[]): Record<string, string> => Object.fromEntries(ROLES.map((k, i) => [k, values[i] ?? k]));

const ROLE_NAMES: Partial<Record<UiLocale, Record<string, string>>> = {
  he: zipRoles(['מערכה', 'סצנה', 'החרפה', 'ניתוח', 'תשובה', 'נקודה', 'יתרונות', 'אתגר', 'פרק', 'סיום', 'השוואה', 'קונספט', 'סיכום',
    'חסרונות', 'ניגוד', 'ספירה', 'אומנות', 'קריאה לפעולה', 'הבהרה', 'רשומה', 'אירוע', 'ראיות', 'הסבר', 'עובדה', 'פיצ׳ר', 'צילומים', 'אורח', 'גיבור',
    'הדגשה', 'פתיח', 'מנחה', 'איך', 'הקדמה', 'פריט', 'מורשת', 'לקח', 'שורה', 'לוק', 'רגע', 'מוסר השכל', 'הבא', 'הצעה', 'פתיחה', 'סגירה', 'נקודה',
    'בעיה', 'מוצר', 'הוכחה', 'יתרונות', 'שאלה', 'ציטוט', 'סיבה', 'סיכום ביניים', 'תוצאה', 'חשיפה', 'ביקורת', 'סצנה', 'ציון', 'מקטע', 'חתימה',
    'פתרון', 'נתון', 'שלב', 'עצירה', 'סיפור', 'אסטרטגיה', 'מסקנה', 'טענה', 'טיפ', 'כותרת', 'נושא', 'תפנית', 'שורה תחתונה', 'למה']),
  ru: zipRoles(['акт', 'сцена', 'усиление', 'анализ', 'ответ', 'тезис', 'преимущества', 'вызов', 'глава', 'финал', 'сравнение', 'концепция', 'вывод',
    'минусы', 'контраст', 'отсчёт', 'мастерство', 'призыв', 'оговорка', 'пункт', 'событие', 'доказательства', 'объяснение', 'факт', 'функция', 'съёмка', 'гость', 'герой',
    'акцент', 'хук', 'ведущий', 'как', 'вступление', 'элемент', 'наследие', 'урок', 'строка', 'образ', 'момент', 'мораль', 'далее', 'предложение', 'начало', 'концовка', 'тезис',
    'проблема', 'продукт', 'доказательство', 'плюсы', 'вопрос', 'цитата', 'причина', 'итоги', 'результат', 'раскрытие', 'отзыв', 'сцена', 'оценка', 'раздел', 'подпись',
    'решение', 'показатель', 'шаг', 'стоп', 'история', 'стратегия', 'главное', 'тезис', 'совет', 'название', 'тема', 'поворот', 'вердикт', 'почему']),
  ar: zipRoles(['فصل', 'مشهد', 'تصعيد', 'تحليل', 'إجابة', 'نقطة', 'الفوائد', 'تحدٍّ', 'فصل', 'ختام', 'مقارنة', 'الفكرة', 'الخلاصة',
    'السلبيات', 'تباين', 'عدّ', 'الحرفة', 'دعوة للتفاعل', 'تنويه', 'مدخل', 'حدث', 'الأدلة', 'شرح', 'حقيقة', 'ميزة', 'لقطات', 'ضيف', 'البطل',
    'إبراز', 'الافتتاحية', 'المقدّم', 'كيف', 'مقدمة', 'عنصر', 'الإرث', 'الدرس', 'سطر', 'إطلالة', 'لحظة', 'العبرة', 'التالي', 'العرض', 'البداية', 'الخاتمة', 'نقطة',
    'المشكلة', 'المنتج', 'إثبات', 'الإيجابيات', 'سؤال', 'اقتباس', 'سبب', 'ملخص', 'النتيجة', 'كشف', 'مراجعة', 'مشهد', 'التقييم', 'قسم', 'التوقيع',
    'الحل', 'إحصائية', 'خطوة', 'توقف', 'قصة', 'الاستراتيجية', 'الخلاصة', 'الأطروحة', 'نصيحة', 'العنوان', 'الموضوع', 'منعطف', 'الحكم', 'لماذا']),
};

const CAPTION_STYLES: Partial<Record<UiLocale, Record<string, string>>> = {
  he: { 'bold-pop': 'בולט', karaoke: 'קריוקי', minimal: 'מינימלי', boxed: 'במסגרת', neon: 'ניאון' },
  ru: { 'bold-pop': 'Яркий', karaoke: 'Караоке', minimal: 'Минимализм', boxed: 'В плашке', neon: 'Неон' },
  ar: { 'bold-pop': 'بارز', karaoke: 'كاريوكي', minimal: 'بسيط', boxed: 'داخل إطار', neon: 'نيون' },
  am: { 'bold-pop': 'ደማቅ', karaoke: 'ካራኦኬ', minimal: 'ቀላል', boxed: 'በሳጥን', neon: 'ኒዮን' },
};

export function roleName(role: string, locale: UiLocale): string {
  return ROLE_NAMES[locale]?.[role] ?? role;
}

export function captionStyleName(preset: string, locale: UiLocale): string {
  return CAPTION_STYLES[locale]?.[preset] ?? preset;
}
