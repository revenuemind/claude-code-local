/** Reusable template input fields with localized labels. */
import type { TemplateField } from './types';

type L = TemplateField['label'];
const l = (en: string, he: string, ru: string, ar: string, am: string): L => ({ en, he, ru, ar, am });

const text = (key: string, label: L, required = false, placeholder?: string): TemplateField => ({ key, type: 'text', label, required, placeholder });
const area = (key: string, label: L, required = false, placeholder?: string): TemplateField => ({ key, type: 'textarea', label, required, placeholder });
const list = (key: string, label: L, maxItems: number, required = true, placeholder?: string): TemplateField => ({ key, type: 'list', label, required, maxItems, placeholder });

export const F = {
  topic: text('topic', l('Topic', 'נושא', 'Тема', 'الموضوع', 'ርዕስ'), true),
  headline: text('headline', l('Headline', 'כותרת', 'Заголовок', 'العنوان', 'ዋና ርዕስ'), true),
  hook: text('hook', l('Opening hook', 'פתיח (הוק)', 'Цепляющее начало', 'الافتتاحية الجاذبة', 'መክፈቻ'), true),
  cta: text('cta', l('Call to action', 'קריאה לפעולה', 'Призыв к действию', 'دعوة لاتخاذ إجراء', 'የተግባር ጥሪ')),
  handle: text('handle', l('Handle / website', 'שם משתמש / אתר', 'Аккаунт / сайт', 'الحساب / الموقع', 'መለያ / ድረ-ገጽ')),
  points: (max = 6, label = l('Key points (one per line)', 'נקודות מפתח (אחת בכל שורה)', 'Ключевые пункты (по одному в строке)', 'النقاط الرئيسية (واحدة في كل سطر)', 'ዋና ነጥቦች (በመስመር አንድ)')) => list('items', label, max),
  steps: (max = 6) => list('items', l('Steps (one per line)', 'שלבים (אחד בכל שורה)', 'Шаги (по одному в строке)', 'الخطوات (واحدة في كل سطر)', 'ደረጃዎች (በመስመር አንድ)'), max),
  pairs: (max = 4) => list('items', l('Pairs: “Myth — Reality” per line', 'זוגות: “מיתוס — מציאות” בכל שורה', 'Пары: «Миф — Реальность» в строке', 'أزواج: «خرافة — حقيقة» في كل سطر', 'ጥንዶች: “አፈ ታሪክ — እውነታ” በመስመር'), max),
  chapters: (max = 8) => list('items', l('Chapters: “Title — summary” per line', 'פרקים: “כותרת — תקציר” בכל שורה', 'Главы: «Название — описание» в строке', 'الفصول: «العنوان — الملخص» في كل سطر', 'ምዕራፎች: “ርዕስ — ማጠቃለያ” በመስመር'), max),
  product: text('product', l('Product name', 'שם המוצר', 'Название продукта', 'اسم المنتج', 'የምርት ስም'), true),
  tagline: text('tagline', l('Tagline', 'סלוגן', 'Слоган', 'الشعار', 'መለያ ቃል')),
  benefit: text('benefit', l('Main benefit', 'יתרון מרכזי', 'Главное преимущество', 'الميزة الرئيسية', 'ዋና ጥቅም')),
  price: text('price', l('Price / offer label', 'מחיר / תווית מבצע', 'Цена / метка акции', 'السعر / وسم العرض', 'ዋጋ / የቅናሽ መለያ')),
  discount: text('discount', l('Discount %', 'אחוז הנחה', 'Скидка %', 'نسبة الخصم %', 'የቅናሽ %'), true, '50'),
  code: text('code', l('Promo code', 'קוד קופון', 'Промокод', 'رمز الخصم', 'የቅናሽ ኮድ')),
  deadline: text('deadline', l('Deadline', 'מועד אחרון', 'Срок', 'الموعد النهائي', 'የመጨረሻ ቀን')),
  problem: text('problem', l('Problem', 'הבעיה', 'Проблема', 'المشكلة', 'ችግሩ'), true),
  solution: text('solution', l('Solution', 'הפתרון', 'Решение', 'الحل', 'መፍትሔው'), true),
  before: text('before', l('Before', 'לפני', 'До', 'قبل', 'በፊት'), true),
  after: text('after', l('After', 'אחרי', 'После', 'بعد', 'በኋላ'), true),
  review: area('review', l('Customer review', 'ביקורת לקוח', 'Отзыв клиента', 'رأي العميل', 'የደንበኛ አስተያየት'), true),
  customer: text('customer', l('Customer name', 'שם הלקוח', 'Имя клиента', 'اسم العميل', 'የደንበኛ ስም'), true),
  role: text('role', l('Role / company', 'תפקיד / חברה', 'Должность / компания', 'المنصب / الشركة', 'ሚና / ድርጅት')),
  stat: text('stat', l('Key number', 'מספר מפתח', 'Ключевое число', 'الرقم الرئيسي', 'ቁልፍ ቁጥር'), false, '87'),
  statSuffix: text('statSuffix', l('Number suffix (%, x, k…)', 'סיומת למספר (%, x…)', 'Суффикс числа (%, x…)', 'لاحقة الرقم (%، x…)', 'የቁጥር ቅጥያ (%, x…)')),
  statLabel: text('statLabel', l('What the number means', 'משמעות המספר', 'Что означает число', 'معنى الرقم', 'ቁጥሩ ምን ማለት ነው')),
  lesson: text('lesson', l('Lesson / takeaway', 'לקח / שורה תחתונה', 'Вывод', 'الدرس / الخلاصة', 'ትምህርት')),
  conclusion: text('conclusion', l('Conclusion', 'סיכום', 'Заключение', 'الخاتمة', 'መደምደሚያ')),
  intro: area('intro', l('Introduction', 'פתיחה', 'Вступление', 'المقدمة', 'መግቢያ')),
  name: text('name', l('Presenter / character name', 'שם המגיש / הדמות', 'Имя ведущего / персонажа', 'اسم المقدم / الشخصية', 'የአቅራቢ / ገፀ-ባህሪ ስም')),
  brandName: text('brandName', l('Brand name', 'שם המותג', 'Название бренда', 'اسم العلامة', 'የምርት ስም (ብራንድ)'), true),
  quote: text('quote', l('Highlight quote', 'ציטוט מרכזי', 'Главная цитата', 'اقتباس بارز', 'ዋና ጥቅስ')),
  question: text('question', l('Central question', 'השאלה המרכזית', 'Главный вопрос', 'السؤال المحوري', 'ዋና ጥያቄ')),
  episode: text('episode', l('Episode number', 'מספר פרק', 'Номер эпизода', 'رقم الحلقة', 'የክፍል ቁጥር')),
  guest: text('guest', l('Guest name', 'שם האורח', 'Имя гостя', 'اسم الضيف', 'የእንግዳ ስም')),
  rating: text('rating', l('Rating (0–10)', 'דירוג (0–10)', 'Оценка (0–10)', 'التقييم (0–10)', 'ደረጃ (0–10)'), false, '9'),
  cons: text('cons', l('Main drawback', 'חיסרון מרכזי', 'Главный недостаток', 'العيب الرئيسي', 'ዋና ጉድለት')),
  destination: text('destination', l('Destination', 'יעד', 'Направление', 'الوجهة', 'መድረሻ'), true),
  disclaimer: text('disclaimer', l('Disclaimer', 'הבהרה', 'Дисклеймер', 'إخلاء مسؤولية', 'ማስተባበያ')),
};
